#!/usr/bin/env bash
# =============================================================================
#  Portfolio Insights - Update Script for Debian Linux
# =============================================================================
#  This script pulls the latest changes from GitHub and updates the running
#  application on a Debian system where the app was installed via
#  scripts/install-debian.sh.
#
#  Usage:
#    sudo bash scripts/update-debian.sh
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
INSTALL_DIR="/opt/portfolio-insights"
SERVICE_USER="portfolio"
SERVICE_NAME="portfolio-insights"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_root() {
    if [[ "$EUID" -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)."
        exit 1
    fi
}

check_directory() {
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_error "Installation directory '$INSTALL_DIR' not found."
        log_error "Has the application been installed? Run scripts/install-debian.sh first."
        exit 1
    fi

    if [[ ! -d "$INSTALL_DIR/.git" ]]; then
        log_error "No Git repository found in '$INSTALL_DIR'."
        log_error "The application must be installed via git clone."
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Phase 1: Pull latest code from GitHub
# -----------------------------------------------------------------------------
pull_latest_code() {
    log_info "Checking for updates from GitHub..."

    cd "$INSTALL_DIR"

    # Mark the directory as safe for Git (avoids "dubious ownership" error
    # when running as root on a repo owned by the portfolio user)
    git config --global --add safe.directory "$INSTALL_DIR"

    # Fetch remote changes (do not merge yet — we'll reset explicitly below)
    git fetch origin main

    # -------------------------------------------------------------------------
    # Transitional safety: if the SQLite database or TypeScript build info are
    # still tracked from an older install (they were committed in the past),
    # untrack them WITHOUT deleting the files from disk. This preserves the
    # user's financial data and prevents "local changes would be overwritten"
    # errors during the pull.
    # -------------------------------------------------------------------------
    if git ls-files --error-unmatch db/portfolio.db >/dev/null 2>&1; then
        log_warn "Updating git tracking: db/portfolio.db will no longer be tracked (data kept on disk)..."
        git rm --cached -q db/portfolio.db
    fi
    if git ls-files --error-unmatch client/tsconfig.tsbuildinfo >/dev/null 2>&1; then
        log_warn "Updating git tracking: client/tsconfig.tsbuildinfo will no longer be tracked..."
        git rm --cached -q client/tsconfig.tsbuildinfo
    fi

    # If we staged any untracking, commit it so that HEAD no longer contains
    # these runtime files. This is REQUIRED before reset --hard, otherwise
    # reset would delete the (now untracked) db file from disk.
    if ! git diff --cached --quiet; then
        git commit -q -m "chore: untrack runtime-only files (db, tsbuildinfo)" || true
    fi

    # Save the current HEAD commit hash before updating
    local before
    before=$(git rev-parse HEAD)

    # Reset the checkout to the latest remote commit. This discards any local
    # modifications to tracked files (the code should be identical to the
    # deployed version). Untracked runtime files like db/portfolio.db are
    # preserved on disk.
    git reset --hard FETCH_HEAD

    # Check if anything actually changed
    local after
    after=$(git rev-parse HEAD)

    if [[ "$before" == "$after" ]]; then
        log_info "No changes found. The application is already up to date."
        return 0
    fi

    log_info "Changes detected. Updating application..."
    return 1
}

# -----------------------------------------------------------------------------
# Phase 2: Update npm dependencies
# -----------------------------------------------------------------------------
update_dependencies() {
    log_info "Updating backend npm dependencies..."
    cd "$INSTALL_DIR"
    runuser -u "$SERVICE_USER" -- npm install

    log_info "Updating frontend npm dependencies..."
    cd "$INSTALL_DIR/client"
    runuser -u "$SERVICE_USER" -- npm install
}

# -----------------------------------------------------------------------------
# Phase 3: Rebuild frontend
# -----------------------------------------------------------------------------
build_frontend() {
    log_info "Rebuilding React frontend..."
    cd "$INSTALL_DIR/client"
    npm run build
}

# -----------------------------------------------------------------------------
# Phase 4: Regenerate systemd service configuration
# -----------------------------------------------------------------------------
regenerate_systemd_service() {
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    log_info "Regenerating systemd service file at '$service_file'..."

    cat > "$service_file" <<EOF
[Unit]
Description=Portfolio Insights - Personal Finance Portfolio Manager
Documentation=https://github.com/massimobottelli/Portfolio-Insights
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=PORT=3000
# Carica il token API dal file .env (generato in install-debian.sh)
EnvironmentFile=${INSTALL_DIR}/.env

# Security hardening
NoNewPrivileges=true
# ProtectSystem=full rende /usr, /etc e /opt in sola lettura. Dobbiamo
# permettere la scrittura esplicita nella directory del database.
ProtectSystem=full
ReadWritePaths=${INSTALL_DIR}/db
ProtectHome=true
PrivateTmp=true
InaccessiblePaths=/root

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    log_info "Systemd service configuration updated."
}

# -----------------------------------------------------------------------------
# Phase 5: Fix permissions
# -----------------------------------------------------------------------------
fix_permissions() {
    log_info "Restoring permissions for user '$SERVICE_USER'..."
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    log_info "Permissions set."
}

# -----------------------------------------------------------------------------
# Phase 7: Restart the service
# -----------------------------------------------------------------------------
restart_service() {
    log_info "Restarting '$SERVICE_NAME' service..."
    systemctl restart "$SERVICE_NAME"

    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "Service '$SERVICE_NAME' is running."
    else
        log_error "Service '$SERVICE_NAME' failed to restart."
        log_error "Check logs with: sudo journalctl -u $SERVICE_NAME -n 50 --no-pager"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Phase 8: Verify
# -----------------------------------------------------------------------------
verify_application() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" 2>/dev/null || echo "000")

    if [[ "$http_code" != "000" ]]; then
        log_info "Application is responding (HTTP ${http_code})."
    else
        log_warn "Could not verify HTTP response. Check the service logs."
    fi
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

    check_root
    check_directory

    local changes_detected=false

    if pull_latest_code; then
        # No code changes found — skip npm install/build but still
        # regenerate the systemd service and restart to apply any
        # configuration fixes (e.g. ReadWritePaths for the database).
        echo ""
        log_info "No code changes detected."
        echo ""
    else
        changes_detected=true
        update_dependencies
        build_frontend
    fi

    # Regenerate the systemd service on every update. This ensures that
    # infrastructure fixes (like ReadWritePaths needed for SQLite writes)
    # are applied even when the running code is already up to date.
    regenerate_systemd_service
    if [[ "$changes_detected" == "true" ]]; then
        fix_permissions
    fi
    restart_service
    verify_application

    echo ""
    echo "============================================================================="
    echo -e "  ${GREEN}Update complete!${NC}"
    echo "============================================================================="
    echo ""
    log_info "The application has been updated successfully."
    echo ""
}

main "$@"
