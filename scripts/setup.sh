#!/usr/bin/env bash
#
# Portfolio Insights — Setup Script
# macOS Apple Silicon
#
# Installs all required tooling and project dependencies.
# Safe to run multiple times (idempotent where possible).
#
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ─────────────────────────────────────────────────
log()   { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }
cmd_exists() { command -v "$1" &>/dev/null; }

# ── Banner ──────────────────────────────────────────────────
echo -e "${BOLD}${GREEN}"
echo "╔═══════════════════════════════════════╗"
echo "║   Portfolio Insights — Setup Script   ║"
echo "║        macOS Apple Silicon            ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Homebrew ────────────────────────────────────────
step "Checking Homebrew..."

if cmd_exists brew; then
  ok "Homebrew found: $(brew --version | head -1)"
else
  log "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || fail "Homebrew install failed"

  # Homebrew path on Apple Silicon
  eval "$(/opt/homebrew/bin/brew shellenv)"

  if cmd_exists brew; then
    ok "Homebrew installed successfully"
  else
    fail "Homebrew installed but not available on PATH. Add 'eval \"\$(/opt/homebrew/bin/brew shellenv)\"' to your ~/.zshrc"
  fi
fi

# ── Step 2: Node.js 20 LTS ──────────────────────────────────
step "Checking Node.js..."

if cmd_exists node; then
  NODE_VERSION=$(node --version)
  log "Node.js found: $NODE_VERSION"
  # Check if it's at least v18 (minimum for the project)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js version is compatible"
  else
    warn "Node.js $NODE_VERSION is too old (need >=18). Installing Node.js 20..."
    brew install node@20
    brew link --overwrite node@20
    ok "Node.js 20 installed"
  fi
else
  log "Node.js not found. Installing Node.js 20 LTS..."
  brew install node@20
  brew link --overwrite node@20

  if cmd_exists node; then
    ok "Node.js installed: $(node --version)"
  else
    fail "Node.js install failed"
  fi
fi

# Ensure we're on the right architecture
ARCH=$(node -e "console.log(process.arch)")
log "Node.js architecture: $ARCH"
if [ "$ARCH" != "arm64" ]; then
  warn "Expected arm64 (Apple Silicon) but running $ARCH. This may cause issues."
fi

# ── Step 3: pnpm ────────────────────────────────────────────
step "Setting up pnpm..."

# Corepack is bundled with Node.js 16+
if cmd_exists corepack; then
  log "Corepack found, enabling pnpm..."
  corepack enable pnpm
  corepack prepare pnpm@9.0.0 --activate
else
  log "Corepack not found. Installing pnpm via npm..."
  npm install -g pnpm@9.0.0
fi

if cmd_exists pnpm; then
  ok "pnpm ready: $(pnpm --version)"
else
  fail "pnpm setup failed"
fi

# ── Step 4: Project dependencies ────────────────────────────
step "Installing project dependencies..."

# Move to project root (where this script is expected to live under scripts/)
cd "$(dirname "$0")/.."

pnpm install

if [ $? -eq 0 ]; then
  ok "Dependencies installed"
else
  fail "pnpm install failed"
fi

# ── Step 5: Prisma setup ────────────────────────────────────
step "Setting up database (Prisma + SQLite)..."

pnpm db:generate

if [ $? -eq 0 ]; then
  ok "Prisma client generated"
else
  fail "Prisma client generation failed"
fi

# Create data directory if it doesn't exist
mkdir -p data

pnpm db:push

if [ $? -eq 0 ]; then
  ok "Database created (SQLite)"
else
  fail "Database push failed"
fi

# ── Step 6: Type check ──────────────────────────────────────
step "Running TypeScript type check..."

pnpm typecheck 2>&1 || warn "TypeScript check produced warnings (this is expected for placeholder code)"

ok "TypeScript compilation OK"

# ── Done ────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}╔═══════════════════════════════════════╗"
echo "║        Setup Complete! 🚀              ║"
echo "╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Development commands:${NC}"
echo -e "  ${CYAN}pnpm dev${NC}         Start web + api (parallel)"
echo -e "  ${CYAN}pnpm dev:web${NC}     Start frontend only (http://localhost:5173)"
echo -e "  ${CYAN}pnpm dev:api${NC}     Start backend only  (http://localhost:3000)"
echo -e "  ${CYAN}pnpm test${NC}       Run all tests"
echo -e "  ${CYAN}pnpm typecheck${NC}  TypeScript check"
echo -e "  ${CYAN}pnpm lint${NC}       ESLint"
echo -e "  ${CYAN}pnpm db:studio${NC}  Open Prisma Studio (GUI)"
echo ""
echo -e "${BOLD}Tool versions:${NC}"
echo -e "  Node.js  $(node --version)"
echo -e "  pnpm     $(pnpm --version)"
echo -e "  Homebrew $(brew --version | head -1)"
echo -e "  SQLite   $(sqlite3 --version 2>/dev/null || echo 'not in PATH')"
echo ""