#!/bin/bash

# Match the SSH command used to create the tunnel
PATTERN='[s]sh.*-L 0.0.0.0:5555:localhost:3306'

# Find matching process IDs
PIDS=$(pgrep -f "$PATTERN")

if [[ -z "$PIDS" ]]; then
  echo "[INFO] No matching SSH tunnel processes found."
else
  echo "[INFO] Stopping SSH tunnel(s): $PIDS"
  kill $PIDS
fi
