#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vm_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"

required_files=(
  Caddyfile
  app.env.example
  compose.production.yml
  deployment.env.example
  migration.env.example
  postgres.env.example
  redis.env.example
  restic.env.example
)

for relative_path in "${required_files[@]}"; do
  if [[ ! -f "$vm_dir/$relative_path" ]]; then
    echo "Required deployment file is missing: $relative_path" >&2
    exit 1
  fi
done

APP_ENV_FILE="$vm_dir/app.env.example" \
MIGRATION_ENV_FILE="$vm_dir/migration.env.example" \
POSTGRES_ENV_FILE="$vm_dir/postgres.env.example" \
REDIS_ENV_FILE="$vm_dir/redis.env.example" \
  docker compose \
    --env-file "$vm_dir/deployment.env.example" \
    -f "$vm_dir/compose.production.yml" \
    config --quiet

echo "Deployment bundle verification passed."
