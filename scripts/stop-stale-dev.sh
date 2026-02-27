#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/.next/dev/lock"

find_repo_dev_pids() {
  ps ax -o pid=,command= | awk -v root="$ROOT_DIR" '
    index($0, root) && (index($0, "scripts/dev-with-ngrok.mjs") || index($0, "node_modules/.bin/next dev") || index($0, "next/dist/bin/next dev") || index($0, "next-server (v")) {
      print $1
    }
  '
}

find_lock_holder_pids() {
  if [ ! -e "$LOCK_FILE" ]; then
    return 0
  fi
  lsof -t "$LOCK_FILE" 2>/dev/null || true
}

parent_pid() {
  ps -p "$1" -o ppid= 2>/dev/null | tr -d '[:space:]'
}

collect_with_ancestors() {
  for pid in $1; do
    current="$pid"
    hops=0
    while [ -n "$current" ] && [ "$current" -gt 1 ] 2>/dev/null && [ "$hops" -lt 10 ]; do
      echo "$current"
      current="$(parent_pid "$current")"
      hops=$((hops + 1))
    done
  done
}

is_relevant_pid() {
  command="$(ps -p "$1" -o command= 2>/dev/null || true)"
  case "$command" in
    *"$ROOT_DIR"*|*"npm run dev"*|*"next-server (v"*|*"next/dist/bin/next dev"*|*"node_modules/.bin/next dev"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

filter_relevant_pids() {
  for pid in $1; do
    if is_relevant_pid "$pid"; then
      echo "$pid"
    fi
  done
}

collect_targets() {
  initial_pids="$(
    {
      find_lock_holder_pids
      find_repo_dev_pids
    } | awk 'NF' | sort -u
  )"

  if [ -z "$initial_pids" ]; then
    return 0
  fi

  expanded_pids="$(collect_with_ancestors "$initial_pids" | awk 'NF' | sort -u)"
  if [ -z "$expanded_pids" ]; then
    return 0
  fi

  filter_relevant_pids "$expanded_pids" | awk 'NF' | sort -u
}

kill_pids() {
  signal="$1"
  pids="$2"
  if [ -z "$pids" ]; then
    return 0
  fi
  # shellcheck disable=SC2086
  kill "-$signal" $pids 2>/dev/null || true
}

find_still_running() {
  for pid in $1; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
    fi
  done
}

TARGET_PIDS="$(collect_targets)"
if [ -n "$TARGET_PIDS" ]; then
  kill_pids TERM "$TARGET_PIDS"
  sleep 1
  STILL_RUNNING="$(find_still_running "$TARGET_PIDS" | awk 'NF' | sort -u)"
  if [ -n "$STILL_RUNNING" ]; then
    kill_pids KILL "$STILL_RUNNING"
  fi
fi
