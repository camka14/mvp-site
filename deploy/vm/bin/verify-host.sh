#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vm_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$vm_dir/compose.production.yml}"
deployment_env="${COMPOSE_ENV_FILE:-$vm_dir/deployment.env}"
status_file="${BACKUP_STATUS_FILE:-/var/lib/bracketiq/last-postgres-backup}"
public_url="${PUBLIC_HEALTH_URL:-https://bracket-iq.com/api/health/ready}"
maximum_backup_age_seconds="${MAXIMUM_BACKUP_AGE_SECONDS:-5400}"

compose=(docker compose --env-file "$deployment_env" -f "$compose_file")

"${compose[@]}" ps
"${compose[@]}" exec -T app curl --fail --silent --show-error \
  http://127.0.0.1:8080/api/health/ready >/dev/null
"${compose[@]}" exec -T postgres sh -eu -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "SELECT 1"' \
  | grep -qx '1'
"${compose[@]}" exec -T redis sh -eu -c \
  'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping' \
  | grep -qx 'PONG'
"${compose[@]}" exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null

if [[ -n "$public_url" ]]; then
  curl --fail --silent --show-error "$public_url" >/dev/null
fi

if [[ -f "$status_file" ]]; then
  completed_at="$(awk -F= '$1 == "completed_at" { print $2; exit }' "$status_file")"
  if [[ "$completed_at" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$ ]]; then
    completed_at="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}T${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}Z"
  fi
  completed_epoch="$(date -u -d "$completed_at" +%s)"
  now_epoch="$(date -u +%s)"
  backup_age="$((now_epoch - completed_epoch))"
  if (( backup_age > maximum_backup_age_seconds )); then
    echo "Latest PostgreSQL backup is stale: ${backup_age}s old" >&2
    exit 1
  fi
else
  echo "Backup status file is missing: $status_file" >&2
  exit 1
fi

disk_use="$(df --output=pcent / | tail -n 1 | tr -dc '0-9')"
if (( disk_use >= 80 )); then
  echo "Root filesystem usage is too high: ${disk_use}%" >&2
  exit 1
fi

echo "Host verification passed."
