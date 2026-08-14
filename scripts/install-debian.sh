#!/usr/bin/env bash
# =============================================================================
#  Portfolio Insights - Installer for Debian Linux
# =============================================================================
#  This script installs all dependencies and sets up the application as a
#  systemd service on a fresh Debian system.
#
#  What it does:
#    1. Installs sysSecuritytem prerequisites (curl, git, build-essential)
#    2. Adds the NodeSource APT repository for Node.js 22.x
#    3. Installs Node.js 22 LTS system-wide via apt
#    4. Clones the repository from GitHub
#    5. Installs npm dependencies (backend + frontend)
#    6. Builds the React frontend (compiles to public/)
#    7. Creates a dedicated systemd service
#    8. Starts the service and enables auto-start on boot
#
#  Usage:
#    sudo bash scripts/install-debian.sh
#
#  The application will be available at: http://<SERVER_IP>:3000
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
REPO_URL="https://github.com/massimobottelli/Portfolio-Insights.git"
INSTALL_DIR="/opt/portfolio-insights"
SERVICE_USER="portfolio"
SERVICE_NAME="portfolio-insights"
APP_PORT="3000"
NODE_VERSION="22"

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

# -----------------------------------------------------------------------------
# Phase 1: System prerequisites
# -----------------------------------------------------------------------------
install_system_deps() {
    log_info "Updating package lists..."
    apt-get update -qq

    log_info "Installing system prerequisites (curl, git, build-essential)..."
    apt-get install -y -qq \
        curl \
        git \
        build-essential \
        python3 \
        ca-certificates \
        gnupg
}

# -----------------------------------------------------------------------------
# Phase 2: Create dedicated system user
# -----------------------------------------------------------------------------
create_service_user() {
    if id "$SERVICE_USER" &>/dev/null 2>&1; then
        log_warn "User '$SERVICE_USER' already exists. Skipping creation."
    else
        log_info "Creating system user '$SERVICE_USER'..."
        useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
        log_info "User '$SERVICE_USER' created."
    fi
}

# -----------------------------------------------------------------------------
# Phase 3: Install Node.js 22 LTS via NodeSource
# -----------------------------------------------------------------------------
install_node_via_nodesource() {
    log_info "Adding NodeSource APT repository for Node.js ${NODE_VERSION}.x..."

    # Download and run the NodeSource setup script
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -

    log_info "Installing Node.js ${NODE_VERSION}.x via apt..."
    apt-get install -y -qq nodejs

    log_info "Verifying installation..."
    node -v
    npm -v

    log_info "Node.js $(node -v) and npm $(npm -v) installed successfully."
}

# -----------------------------------------------------------------------------
# Phase 4: Clone repository and set up the application
# -----------------------------------------------------------------------------
setup_application() {
    log_info "Cloning repository into '$INSTALL_DIR'..."

    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "Directory '$INSTALL_DIR' already exists."
        read -rp "Do you want to remove it and re-clone? [y/N] " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "Using existing directory. Skipping clone."
            return
        fi
    fi

    git clone "$REPO_URL" "$INSTALL_DIR"
    git config --global --add safe.directory "$INSTALL_DIR"
    log_info "Repository cloned."
}

# -----------------------------------------------------------------------------
# Phase 5: Install npm dependencies and build frontend
# -----------------------------------------------------------------------------
install_dependencies() {
    log_info "Installing backend npm dependencies..."
    cd "$INSTALL_DIR"
    npm install

    log_info "Installing frontend npm dependencies..."
    cd "$INSTALL_DIR/client"
    npm install

    log_info "Building React frontend..."
    npm run build

    log_info "Dependencies installed and frontend built."
}

# -----------------------------------------------------------------------------
# Phase 6: Create data directory and set permissions
# -----------------------------------------------------------------------------
setup_data_directory() {
    log_info "Creating data directory for SQLite database..."
    mkdir -p "$INSTALL_DIR/db"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR/db"

    log_info "Data directory ready at '$INSTALL_DIR/db'."
}

# -----------------------------------------------------------------------------
# Phase 6b: Generate API token and create .env file
# -----------------------------------------------------------------------------
setup_api_token() {
    local env_file="$INSTALL_DIR/.env"

    # Se il file .env esiste già (re-install), preserva il token esistente
    if [[ -f "$env_file" ]] && grep -q "API_TOKEN=" "$env_file"; then
        log_info "Existing API token found in '$env_file'. Preserving it."
        return
    fi

    log_info "Generating a new API token..."
    local token
    token=$(openssl rand -hex 32)

    cat > "$env_file" <<EOF
# Portfolio Insights - Environment configuration
# This file contains the API token used to authenticate API requests.
# Keep this file secret! It grants full access to the application data.
API_TOKEN=${token}
EOF

    chown "$SERVICE_USER:$SERVICE_USER" "$env_file"
    chmod 600 "$env_file"

    log_info "API token generated and saved to '$env_file' (permissions 600)."
    log_info "IMPORTANT: Save this token in a safe place. You will need it to access the application."
    echo ""
    echo "  🔐 API Token: ${token}"
    echo ""
}

# -----------------------------------------------------------------------------
# Phase 7: Create systemd service
# -----------------------------------------------------------------------------
create_systemd_service() {
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    log_info "Creating systemd service at '$service_file'..."

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
Environment=PORT=${APP_PORT}
# Carica il token API dal file .env (generato in setup_api_token)
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

    log_info "Reloading systemd daemon..."
    systemctl daemon-reload

    log_info "Enabling service to start on boot..."
    systemctl enable "$SERVICE_NAME"

    log_info "Starting service..."
    systemctl start "$SERVICE_NAME"

    log_info "Service '$SERVICE_NAME' created and started."
}

# -----------------------------------------------------------------------------
# Phase 8: Verify installation
# -----------------------------------------------------------------------------
verify_installation() {
    log_info "Verifying installation..."

    # Wait a moment for the service to start
    sleep 2

    # Check service status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "Service '$SERVICE_NAME' is running."
    else
        log_error "Service '$SERVICE_NAME' is NOT running."
        log_error "Check logs with: sudo journalctl -u $SERVICE_NAME -n 50 --no-pager"
        exit 1
    fi

    # Check that the HTTP endpoint responds
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}" 2>/dev/null || echo "000")

    if [[ "$http_code" != "000" ]]; then
        log_info "Application is responding on port ${APP_PORT} (HTTP ${http_code})."
    else
        log_warn "Could not verify HTTP response on port ${APP_PORT}."
        log_warn "The service may still be starting. Check with: sudo journalctl -u $SERVICE_NAME -n 20 --no-pager"
    fi
}

# -----------------------------------------------------------------------------
# Phase 9: Print summary
# -----------------------------------------------------------------------------
print_summary() {
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')

    echo ""
    echo "============================================================================="
    echo -e "  ${GREEN}Portfolio Insights - Installation Complete${NC}"
    echo "============================================================================="
    echo ""
    echo -e "  ${YELLOW}Access the application:${NC}"
    echo "    http://${server_ip}:${APP_PORT}"
    echo "    http://localhost:${APP_PORT}"
    echo ""
    echo -e "  ${YELLOW}Manage the service:${NC}"
    echo "    Status:  sudo systemctl status ${SERVICE_NAME}"
    echo "    Start:   sudo systemctl start ${SERVICE_NAME}"
    echo "    Stop:    sudo systemctl stop ${SERVICE_NAME}"
    echo "    Restart: sudo systemctl restart ${SERVICE_NAME}"
    echo "    Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
    echo ""
    echo -e "  ${YELLOW}Installation directory:${NC}"
    echo "    ${INSTALL_DIR}"
    echo ""
    echo -e "  ${YELLOW}Database location:${NC}"
    echo "    ${INSTALL_DIR}/db/portfolio.db"
    echo ""
    echo -e "  ${YELLOW}Recommended next steps:${NC}"
    echo "    1. Configure a firewall: sudo ufw allow ${APP_PORT}/tcp"
    echo "    2. Set up automatic backups of the database file"
    echo "    3. (Optional) Set up a reverse proxy with nginx for SSL/HTTPS"
    echo ""
    echo "============================================================================="
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo ""
    echo "============================================================================="
    echo "  Portfolio Insights - Debian Installer"
    echo "============================================================================="
    echo ""

    check_root

    install_system_deps
    create_service_user
    install_node_via_nodesource
    setup_application
    install_dependencies
    setup_data_directory
    setup_api_token
    create_systemd_service
    verify_installation
    print_summary
}

main "$@"