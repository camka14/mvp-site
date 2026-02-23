#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_pids() {
  ps ax -o pid=,command= | awk -v root="$ROOT_DIR" '
    index($0, root) &&
    (index($0, "scripts/dev-with-ngrok.mjs") || index($0, "node_modules/.bin/next dev")) {
      print $1
    }
  '
}

PIDS="$(find_pids)"
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -TERM || true
  sleep 1
  STILL_RUNNING="$(find_pids)"
  if [ -n "$STILL_RUNNING" ]; then
    echo "$STILL_RUNNING" | xargs kill -KILL || true
  fi
fi
