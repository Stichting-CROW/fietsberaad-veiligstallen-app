#!/bin/bash

REMOTE_USER="veiligstallen"
REMOTE_HOST="veiligstallen.work"
LOCAL_PORT=5555
REMOTE_PORT=3306
LOCAL_BIND="0.0.0.0"

TUNNEL_CMD="-N -L ${LOCAL_BIND}:${LOCAL_PORT}:localhost:${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST}"
SSH_OPTS="-o ServerAliveInterval=30 -o ServerAliveCountMax=3"

if command -v autossh >/dev/null 2>&1; then
  echo "[INFO] autossh found, starting persistent tunnel..."
  autossh -M 0 -f $SSH_OPTS $TUNNEL_CMD
else
  echo "[WARN] autossh not found, using plain ssh (no auto-reconnect)..."
  echo "NOTE: install autossh to enable auto-reconnect"
  echo "sudo apt install autossh"
  ssh -f $SSH_OPTS $TUNNEL_CMD
fi
