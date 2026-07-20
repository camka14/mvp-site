#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vm_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$vm_dir/compose.production.yml}"
deployment_env="${COMPOSE_ENV_FILE:-$vm_dir/deployment.env}"
restic_env="${RESTIC_ENV_FILE:-/etc/bracketiq/restic.env}"
snapshot="${RESTIC_SNAPSHOT:-}"
dump_path="${RESTIC_DUMP_PATH:-}"
target_database="${TARGET_DATABASE:-}"

if [[ -z "$snapshot" || -z "$dump_path" || -z "$target_database" ]]; then
  echo "Set RESTIC_SNAPSHOT, RESTIC_DUMP_PATH, and TARGET_DATABASE." >&2
  exit 64
fi

if [[ ! "$target_database" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "TARGET_DATABASE must be a plain PostgreSQL identifier." >&2
  exit 64
fi

if [[ ! -r "$restic_env" ]]; then
  echo "Restic environment file is not readable: $restic_env" >&2
  exit 66
fi

set -a
# shellcheck disable=SC1090
source "$restic_env"
set +a

compose=(docker compose --env-file "$deployment_env" -f "$compose_file")
live_database="$("${compose[@]}" exec -T postgres printenv POSTGRES_DB | tr -d '\r\n')"

if [[ "$target_database" == "$live_database" && "${ALLOW_LIVE_DATABASE_RESTORE:-}" != "$live_database" ]]; then
  echo "Refusing to restore into the live database without ALLOW_LIVE_DATABASE_RESTORE=$live_database." >&2
  exit 77
fi

database_exists="$("${compose[@]}" exec -T postgres sh -eu -c \
  "psql --username \"\$POSTGRES_USER\" --dbname postgres --tuples-only --no-align --command \"SELECT 1 FROM pg_database WHERE datname = '$target_database'\"")"
if [[ "$database_exists" != "1" ]]; then
  echo "Target database does not exist: $target_database" >&2
  exit 65
fi

table_count="$("${compose[@]}" exec -T postgres sh -eu -c \
  "psql --username \"\$POSTGRES_USER\" --dbname '$target_database' --tuples-only --no-align --command \"SELECT count(*) FROM pg_tables WHERE schemaname = 'public'\"")"
if [[ "$table_count" != "0" ]]; then
  echo "Target database is not empty: $target_database ($table_count public tables)" >&2
  exit 77
fi

restic dump "$snapshot" "$dump_path" \
  | "${compose[@]}" exec -T postgres sh -eu -c \
    "exec pg_restore --exit-on-error --no-owner --no-acl --username \"\$POSTGRES_USER\" --dbname '$target_database'"

"${compose[@]}" exec -T -e TARGET_DATABASE="$target_database" postgres \
  /docker-entrypoint-initdb.d/10-runtime-role.sh

echo "Restored $dump_path from $snapshot into $target_database"
