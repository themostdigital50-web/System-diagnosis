#!/usr/bin/env bash
# Installs the SystemScope device agent on a Linux computer.
# Run this on the computer you want to monitor, from the project folder.
set -euo pipefail

usage() {
  echo "Usage: $0 --server-url <url> --device-id <id> --device-token <token> [--label <name>] [--interval-ms <ms>] [--repo-path <path>]" >&2
  exit 1
}

SERVER_URL=""
DEVICE_ID=""
DEVICE_TOKEN=""
LABEL="$(hostname)"
INTERVAL_MS=30000
REPO_PATH="$(pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url) SERVER_URL="${2:-}"; shift 2 ;;
    --device-id) DEVICE_ID="${2:-}"; shift 2 ;;
    --device-token) DEVICE_TOKEN="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --interval-ms) INTERVAL_MS="${2:-}"; shift 2 ;;
    --repo-path) REPO_PATH="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -n "$SERVER_URL" && -n "$DEVICE_ID" && -n "$DEVICE_TOKEN" ]] || usage

if ! command -v node >/dev/null 2>&1; then
  echo "[SystemScope] Node.js 20+ is required. Install it from https://nodejs.org" >&2
  exit 1
fi

NODE_BIN="$(command -v node)"
REPO_PATH="$(cd "$REPO_PATH" && pwd)"
AGENT="$REPO_PATH/server/dist/agent/index.js"

echo "[SystemScope] Installing dependencies and building the agent..."
(
  cd "$REPO_PATH"
  npm install --no-audit --no-fund
  npm run build
)

echo "[SystemScope] Saving device configuration..."
"$NODE_BIN" "$AGENT" setup "$SERVER_URL" "$DEVICE_ID" "$DEVICE_TOKEN" "$LABEL" "$INTERVAL_MS"

SERVICE_NAME="systemscope-agent.service"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/$SERVICE_NAME" <<EOF
[Unit]
Description=SystemScope device agent for $LABEL
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO_PATH
ExecStart=$NODE_BIN $AGENT run
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

echo "[SystemScope] Enabling the user service..."
systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo "[SystemScope] Installed. The agent is running and will start at login."
echo "[SystemScope] Config: ${XDG_CONFIG_HOME:-$HOME/.config}/systemscope-agent/config.json"
echo "[SystemScope] Check status with: systemctl --user status $SERVICE_NAME"
