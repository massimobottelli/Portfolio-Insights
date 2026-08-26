#!/usr/bin/env bash
# =============================================================================
# Portfolio Insights - Update Script
# =============================================================================
#
# Aggiorna Portfolio Insights su Debian/Ubuntu.
#
# Uso:
#   sudo bash update-new.sh
#
# Il deploy:
#   1. verifica root e ambiente
#   2. aggiorna il repository da origin/main
#   3. protegge temporaneamente il database SQLite
#   4. reinstalla le dipendenze backend con npm ci
#   5. reinstalla le dipendenze frontend con npm ci
#   6. ricostruisce il frontend
#   7. rigenera il servizio systemd
#   8. corregge i permessi
#   9. riavvia il servizio
#  10. verifica HTTP e systemd
#
# IMPORTANTE:
#   - NON usa "npm audit fix --force"
#   - node_modules viene eliminato come root prima di npm ci
#   - npm viene eseguito come utente "portfolio"
# =============================================================================

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

INSTALL_DIR="/opt/portfolio-insights"
BACKEND_DIR="${INSTALL_DIR}"
CLIENT_DIR="${INSTALL_DIR}/client"

SERVICE_NAME="portfolio-insights"
SERVICE_USER="portfolio"
SERVICE_GROUP="portfolio"

REPO_URL="https://github.com/massimobottelli/Portfolio-Insights.git"
BRANCH="main"

PORT="3000"

DB_DIR="${INSTALL_DIR}/db"
PUBLIC_DIR="${INSTALL_DIR}/public"

# -----------------------------------------------------------------------------
# Colors
# -----------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

die() {
    log_error "$*"
    exit 1
}

section() {
    echo ""
    echo "============================================================================="
    echo "  $*"
    echo "============================================================================="
    echo ""
}

# -----------------------------------------------------------------------------
# Error handler
# -----------------------------------------------------------------------------

on_error() {
    local exit_code=$?
    local line_no=$1

    echo ""
    log_error "Update failed."
    log_error "Line: ${line_no}"
    log_error "Exit code: ${exit_code}"
    echo ""

    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        log_info "The service is still running."
    else
        log_warn "The service is not currently running."
    fi

    log_info "Useful commands:"
    echo "  sudo systemctl status ${SERVICE_NAME} --no-pager"
    echo "  sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"

    exit "${exit_code}"
}

trap 'on_error ${LINENO}' ERR

# -----------------------------------------------------------------------------
# Phase 0 - Checks
# -----------------------------------------------------------------------------

check_environment() {
    section "Environment checks"

    if [[ "${EUID}" -ne 0 ]]; then
        die "This script must be run as root.
Use: sudo bash update-new.sh"
    fi

    if [[ ! -d "${INSTALL_DIR}" ]]; then
        die "Installation directory does not exist: ${INSTALL_DIR}"
    fi

    if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
        die "Service user does not exist: ${SERVICE_USER}"
    fi

    if ! command -v git >/dev/null 2>&1; then
        die "git is not installed."
    fi

    if ! command -v node >/dev/null 2>&1; then
        die "node is not installed."
    fi

    if ! command -v npm >/dev/null 2>&1; then
        die "npm is not installed."
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        die "systemctl is not available."
    fi

    log_info "Node version: $(node --version)"
    log_info "npm version:  $(npm --version)"
    log_info "Install dir:  ${INSTALL_DIR}"
    log_info "Service user: ${SERVICE_USER}"

    if [[ ! -f "${BACKEND_DIR}/package.json" ]]; then
        die "Backend package.json not found."
    fi

    if [[ ! -f "${CLIENT_DIR}/package.json" ]]; then
        die "Frontend package.json not found."
    fi

    if [[ ! -f "${BACKEND_DIR}/package-lock.json" ]]; then
        die "Backend package-lock.json not found."
    fi

    if [[ ! -f "${CLIENT_DIR}/package-lock.json" ]]; then
        die "Frontend package-lock.json not found."
    fi

    log_ok "Environment checks passed."
}

# -----------------------------------------------------------------------------
# Database backup
# -----------------------------------------------------------------------------

DB_BACKUP=""

backup_database() {
    section "Protecting SQLite database"

    mkdir -p "${DB_DIR}"

    local db_files=()

    while IFS= read -r -d '' file; do
        db_files+=("$file")
    done < <(
        find "${DB_DIR}" \
            -maxdepth 1 \
            -type f \
            \( \
                -name "*.db" \
                -o -name "*.sqlite" \
                -o -name "*.sqlite3" \
            \) \
            -print0
    )

    if [[ "${#db_files[@]}" -eq 0 ]]; then
        log_info "No SQLite database file found."
        return 0
    fi

    DB_BACKUP="$(mktemp -d /tmp/portfolio-insights-db.XXXXXX)"

    for db_file in "${db_files[@]}"; do
        cp -a "${db_file}" "${DB_BACKUP}/"
        log_info "Backed up: $(basename "${db_file}")"
    done

    log_ok "SQLite database backed up temporarily."
}

restore_database() {
    if [[ -z "${DB_BACKUP}" || ! -d "${DB_BACKUP}" ]]; then
        return 0
    fi

    log_info "Restoring SQLite database..."

    shopt -s nullglob

    local backup_file
    for backup_file in "${DB_BACKUP}"/*; do
        cp -a "${backup_file}" "${DB_DIR}/"
        log_info "Restored: $(basename "${backup_file}")"
    done

    shopt -u nullglob

    rm -rf "${DB_BACKUP}"
    DB_BACKUP=""

    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${DB_DIR}"

    log_ok "SQLite database restored."
}

cleanup_backup() {
    if [[ -n "${DB_BACKUP}" && -d "${DB_BACKUP}" ]]; then
        rm -rf "${DB_BACKUP}"
        DB_BACKUP=""
    fi
}

trap cleanup_backup EXIT

# -----------------------------------------------------------------------------
# Phase 1 - Source code
# -----------------------------------------------------------------------------

update_source() {
    section "Phase 1/8 - Updating source code"

    cd "${INSTALL_DIR}"

    log_info "Checking git repository..."

    if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
        die "${INSTALL_DIR} is not a git repository."
    fi

    log_info "Fetching origin/${BRANCH}..."
    git fetch origin "${BRANCH}"

    local current_commit
    local remote_commit

    current_commit="$(git rev-parse HEAD)"
    remote_commit="$(git rev-parse "origin/${BRANCH}")"

    if [[ "${current_commit}" == "${remote_commit}" ]]; then
        log_info "No source-code changes detected."
        return 0
    fi

    log_info "Current commit: ${current_commit}"
    log_info "New commit:     ${remote_commit}"

    backup_database

    log_info "Resetting working tree to origin/${BRANCH}..."

    git reset --hard "origin/${BRANCH}"
    git clean -fd

    restore_database

    log_ok "Source code updated."
}

# -----------------------------------------------------------------------------
# Fix npm ownership BEFORE npm operations
# -----------------------------------------------------------------------------

prepare_npm_permissions() {
    section "Preparing npm permissions"

    log_info "Fixing ownership of application files..."

    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"

    # Ensure the service user can traverse the whole installation.
    chmod u+rwx "${INSTALL_DIR}"
    chmod u+rwx "${CLIENT_DIR}"

    log_ok "Application ownership restored."
}

# -----------------------------------------------------------------------------
# Remove node_modules safely
# -----------------------------------------------------------------------------

clean_node_modules() {
    local dir="$1"
    local label="$2"

    log_info "Removing ${label} node_modules..."

    if [[ -d "${dir}/node_modules" ]]; then
        # node_modules can contain files created by root.
        # Therefore deletion MUST happen as root.
        rm -rf --one-file-system "${dir}/node_modules"
    fi

    mkdir -p "${dir}/node_modules"

    chown "${SERVICE_USER}:${SERVICE_GROUP}" "${dir}/node_modules"
    chmod 755 "${dir}/node_modules"

    log_ok "${label} node_modules cleaned."
}

# -----------------------------------------------------------------------------
# Phase 2 - Backend dependencies
# -----------------------------------------------------------------------------

install_backend_dependencies() {
    section "Phase 2/8 - Installing backend dependencies"

    cd "${BACKEND_DIR}"

    if [[ ! -f package-lock.json ]]; then
        die "Backend package-lock.json is missing."
    fi

    clean_node_modules "${BACKEND_DIR}" "backend"

    log_info "Running npm ci as user '${SERVICE_USER}'..."

    sudo -u "${SERVICE_USER}" \
        env HOME="/home/${SERVICE_USER}" \
        npm ci --omit=dev

    log_ok "Backend dependencies installed."
}

# -----------------------------------------------------------------------------
# Phase 3 - Frontend dependencies
# -----------------------------------------------------------------------------

install_frontend_dependencies() {
    section "Phase 3/8 - Installing frontend dependencies"

    cd "${CLIENT_DIR}"

    if [[ ! -f package-lock.json ]]; then
        die "Frontend package-lock.json is missing."
    fi

    clean_node_modules "${CLIENT_DIR}" "frontend"

    log_info "Running npm ci as user '${SERVICE_USER}'..."

    sudo -u "${SERVICE_USER}" \
        env HOME="/home/${SERVICE_USER}" \
        npm ci

    log_ok "Frontend dependencies installed."
}

# -----------------------------------------------------------------------------
# Phase 4 - Build frontend
# -----------------------------------------------------------------------------

build_frontend() {
    section "Phase 4/8 - Building React frontend"

    cd "${CLIENT_DIR}"

    log_info "Running production build as user '${SERVICE_USER}'..."

    sudo -u "${SERVICE_USER}" \
        env HOME="/home/${SERVICE_USER}" \
        NODE_ENV=production \
        npm run build

    if [[ ! -f "${PUBLIC_DIR}/index.html" ]]; then
        die "Frontend build completed but ${PUBLIC_DIR}/index.html was not created."
    fi

    log_ok "Frontend build completed."
}

# -----------------------------------------------------------------------------
# Phase 5 - Systemd service
# -----------------------------------------------------------------------------

regenerate_systemd_service() {
    section "Phase 5/8 - Configuring systemd service"

    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    log_info "Writing ${service_file}..."

    cat > "${service_file}" <<EOF
[Unit]
Description=Portfolio Insights - Personal Finance Portfolio Manager
Documentation=${REPO_URL}
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}

WorkingDirectory=${INSTALL_DIR}

ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js

Restart=on-failure
RestartSec=5

StandardOutput=journal
StandardError=journal

Environment=NODE_ENV=production
Environment=PORT=${PORT}

EnvironmentFile=-${INSTALL_DIR}/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

# Allow the application to write its database.
ReadWritePaths=${DB_DIR}

# Do not expose root's home.
InaccessiblePaths=/root

[Install]
WantedBy=multi-user.target
EOF

    chmod 644 "${service_file}"

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" >/dev/null

    log_ok "Systemd service configured."
}

# -----------------------------------------------------------------------------
# Phase 6 - Permissions
# -----------------------------------------------------------------------------

fix_permissions() {
    section "Phase 6/8 - Fixing permissions"

    log_info "Setting ownership to ${SERVICE_USER}:${SERVICE_GROUP}..."

    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"

    # Directories need execute permission.
    find "${INSTALL_DIR}" \
        -type d \
        -exec chmod u+rwx {} \;

    # Normal files need to be readable.
    find "${INSTALL_DIR}" \
        -type f \
        -exec chmod u+rw {} \;

    # Shell scripts executable.
    find "${INSTALL_DIR}" \
        -type f \
        -name "*.sh" \
        -exec chmod u+rwx {} \;

    # server.js must be readable/executable by Node's user.
    if [[ -f "${INSTALL_DIR}/server.js" ]]; then
        chmod u+rw "${INSTALL_DIR}/server.js"
    fi

    # Keep .env private.
    if [[ -f "${INSTALL_DIR}/.env" ]]; then
        chown "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}/.env"
        chmod 600 "${INSTALL_DIR}/.env"
    fi

    # Ensure database directory is writable.
    mkdir -p "${DB_DIR}"
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${DB_DIR}"
    chmod 755 "${DB_DIR}"

    log_ok "Permissions fixed."
}

# -----------------------------------------------------------------------------
# Phase 7 - Restart service
# -----------------------------------------------------------------------------

restart_service() {
    section "Phase 7/8 - Restarting service"

    log_info "Restarting ${SERVICE_NAME}..."

    systemctl restart "${SERVICE_NAME}"

    log_info "Waiting for service to start..."

    local attempts=0
    local max_attempts=20

    while [[ "${attempts}" -lt "${max_attempts}" ]]; do
        if systemctl is-active --quiet "${SERVICE_NAME}"; then
            log_ok "Service '${SERVICE_NAME}' is running."
            return 0
        fi

        attempts=$((attempts + 1))
        sleep 1
    done

    log_error "Service '${SERVICE_NAME}' failed to start."

    systemctl status "${SERVICE_NAME}" --no-pager || true

    echo ""
    log_error "Last 100 journal lines:"
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true

    exit 1
}

# -----------------------------------------------------------------------------
# Phase 8 - Verify application
# -----------------------------------------------------------------------------

verify_application() {
    section "Phase 8/8 - Verifying application"

    local http_code="000"

    log_info "Checking http://127.0.0.1:${PORT} ..."

    if command -v curl >/dev/null 2>&1; then
        http_code="$(
            curl \
                --silent \
                --show-error \
                --output /dev/null \
                --write-out "%{http_code}" \
                --max-time 10 \
                "http://127.0.0.1:${PORT}" \
                2>/dev/null || true
        )"
    else
        log_warn "curl is not installed; skipping HTTP check."
    fi

    if [[ "${http_code}" =~ ^[2345][0-9][0-9]$ ]]; then
        log_ok "Application is responding with HTTP ${http_code}."
    elif [[ "${http_code}" == "000" ]]; then
        log_warn "Could not connect to application on port ${PORT}."
        log_warn "Check: sudo journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    else
        log_warn "Application returned HTTP ${http_code}."
    fi

    echo ""

    if systemctl is-enabled --quiet "${SERVICE_NAME}"; then
        log_ok "Service is enabled at boot."
    else
        log_warn "Service is not enabled at boot."
    fi

    if systemctl is-active --quiet "${SERVICE_NAME}"; then
        log_ok "Service is active."
    else
        die "Service is not active."
    fi
}

# -----------------------------------------------------------------------------
# Show versions
# -----------------------------------------------------------------------------

show_versions() {
    section "Installed frontend versions"

    cd "${CLIENT_DIR}"

    sudo -u "${SERVICE_USER}" \
        env HOME="/home/${SERVICE_USER}" \
        npm list \
            vite \
            @vitejs/plugin-react \
            react-router \
            react-router-dom \
            esbuild \
            nanoid \
        --depth=0 \
        2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    echo ""
    echo "============================================================================="
    echo "  Portfolio Insights - Update"
    echo "============================================================================="
    echo ""

    check_environment

    update_source

    prepare_npm_permissions

    install_backend_dependencies

    install_frontend_dependencies

    build_frontend

    regenerate_systemd_service

    fix_permissions

    restart_service

    verify_application

    show_versions

    echo ""
    echo "============================================================================="
    echo -e "  ${GREEN}Update complete!${NC}"
    echo "============================================================================="
    echo ""

    log_ok "Portfolio Insights has been updated successfully."

    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status ${SERVICE_NAME} --no-pager"
    echo "  sudo journalctl -u ${SERVICE_NAME} -f"
    echo "  sudo systemctl restart ${SERVICE_NAME}"
    echo ""
}

main "$@"
