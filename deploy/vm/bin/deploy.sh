#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vm_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$vm_dir/compose.production.yml}"
deployment_env="${COMPOSE_ENV_FILE:-$vm_dir/deployment.env}"
new_image="${1:-}"

if [[ -z "$new_image" ]]; then
  echo "Usage: $0 ghcr.io/camka14/mvp-site:<full-commit-sha>" >&2
  exit 64
fi

if [[ ! "$new_image" =~ ^ghcr\.io/camka14/mvp-site:[0-9a-f]{40}$ \
  && ! "$new_image" =~ ^ghcr\.io/camka14/mvp-site@sha256:[0-9a-f]{64}$ ]]; then
  echo "Refusing a mutable or unexpected image reference: $new_image" >&2
  exit 64
fi

if [[ ! -f "$deployment_env" ]]; then
  echo "Missing deployment environment file: $deployment_env" >&2
  exit 66
fi

compose=(docker compose --env-file "$deployment_env" -f "$compose_file")
previous_image="$(awk -F= '$1 == "APP_IMAGE" { sub(/^[^=]*=/, ""); print; exit }' "$deployment_env")"
env_tmp="$(mktemp "${deployment_env}.XXXXXX")"
trap 'rm -f "$env_tmp"' EXIT

update_image() {
  local image="$1"
  awk -v image="$image" '
    BEGIN { replaced = 0 }
    /^APP_IMAGE=/ { print "APP_IMAGE=" image; replaced = 1; next }
    { print }
    END { if (!replaced) print "APP_IMAGE=" image }
  ' "$deployment_env" > "$env_tmp"
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$deployment_env"
  env_tmp="$(mktemp "${deployment_env}.XXXXXX")"
}

wait_for_app() {
  local container_id status
  for _ in {1..40}; do
    container_id="$("${compose[@]}" ps -q app)"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
      if [[ "$status" == "healthy" ]]; then
        return 0
      fi
      if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
        return 1
      fi
    fi
    sleep 3
  done
  return 1
}

rollback() {
  if [[ -z "$previous_image" || "$previous_image" == "$new_image" ]]; then
    echo "No previous immutable image is available for automatic rollback." >&2
    return 1
  fi

  echo "Readiness failed; restoring the previous application image." >&2
  update_image "$previous_image"
  "${compose[@]}" up -d --no-deps app
  wait_for_app
}

APP_IMAGE="$new_image" "${compose[@]}" pull app migrate
update_image "$new_image"
"${compose[@]}" up -d postgres redis

if [[ "${RUN_MIGRATIONS:-false}" == "true" ]]; then
  "${compose[@]}" --profile tools run --rm migrate
fi

"${compose[@]}" up -d --no-deps app
if ! wait_for_app; then
  "${compose[@]}" logs --tail 100 app >&2 || true
  rollback
  exit 1
fi

"${compose[@]}" up -d caddy
"${compose[@]}" ps
echo "Deployed $new_image"
