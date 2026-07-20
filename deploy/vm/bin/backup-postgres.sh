#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vm_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$vm_dir/compose.production.yml}"
deployment_env="${COMPOSE_ENV_FILE:-$vm_dir/deployment.env}"
restic_env="${RESTIC_ENV_FILE:-/etc/bracketiq/restic.env}"
status_file="${BACKUP_STATUS_FILE:-/var/lib/bracketiq/last-postgres-backup}"

for command_name in docker restic; do
  command -v "$command_name" >/dev/null || {
    echo "Required command is missing: $command_name" >&2
    exit 69
  }
done

if [[ ! -r "$restic_env" ]]; then
  echo "Restic environment file is not readable: $restic_env" >&2
  exit 66
fi

set -a
# shellcheck disable=SC1090
source "$restic_env"
set +a

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

compose=(docker compose --env-file "$deployment_env" -f "$compose_file")
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_path="/bracketiq/postgres/${timestamp}.dump"

mkdir -p "$(dirname -- "$status_file")"

"${compose[@]}" exec -T postgres sh -eu -c \
  'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  | restic backup --stdin --stdin-filename "$snapshot_path" --tag bracketiq-postgres

restic forget \
  --tag bracketiq-postgres \
  --keep-hourly 48 \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 12 \
  --prune

restic snapshots --tag bracketiq-postgres --latest 1 >/dev/null
printf 'completed_at=%s\npath=%s\n' "$timestamp" "$snapshot_path" > "$status_file"
echo "PostgreSQL backup completed at $timestamp"
