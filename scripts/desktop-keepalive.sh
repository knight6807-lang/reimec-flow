#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/tmp/reimec-desktop-keepalive.log"

cd "$ROOT_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] desktop keepalive started" >>"$LOG_FILE"

while true; do
  if ! pgrep -f "node scripts/run-desktop-dev.cjs" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] launching desktop supervisor" >>"$LOG_FILE"
    npm run dev:desktop:app >>"$LOG_FILE" 2>&1 &
    sleep 3
  fi
  sleep 2
done
