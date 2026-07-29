#!/usr/bin/env bash
set -Eeuo pipefail

mode="${AFFILIATE_MAPPING_MODE:-disabled}"
endpoint="${AFFILIATE_MAPPING_MODEL_ENDPOINT:-http://model:8080}"
model_id="${AFFILIATE_MAPPING_MODEL_ID:-}"
manifest="${AFFILIATE_MAPPING_MODEL_MANIFEST:-/run/config/model-manifest.json}"
worktree_parent="${AFFILIATE_MAPPING_WORKTREE_PARENT:-/worktrees}"
base_commit="${AFFILIATE_MAPPING_BASE_COMMIT:-}"
worker_id="${AFFILIATE_MAPPING_WORKER_ID:-ovh-affiliate-open-weight}"
model_timeout_ms="${AFFILIATE_MAPPING_MODEL_TIMEOUT_MS:-5400000}"
key_file="/run/secrets/model_api_key"

if [[ "$mode" == "disabled" ]]; then
  echo "Controller mode is disabled; set CONTROLLER_MODE=dry-run or queue explicitly." >&2
  exit 64
fi
if [[ ! "$base_commit" =~ ^[a-f0-9]{40}$ ]]; then
  echo "AFFILIATE_MAPPING_BASE_COMMIT must be an exact 40-character Git commit." >&2
  exit 64
fi
if [[ -z "$model_id" || ! -r "$manifest" || ! -r "$key_file" ]]; then
  echo "Model id, manifest, and readable API-key secret are required." >&2
  exit 64
fi
if [[ ! "$model_timeout_ms" =~ ^[0-9]+$ ]] || (( model_timeout_ms < 1000 || model_timeout_ms > 5400000 )); then
  echo "AFFILIATE_MAPPING_MODEL_TIMEOUT_MS must be between 1000 and 5400000." >&2
  exit 64
fi

api_key="$(awk 'NF && $1 !~ /^#/ { print; exit }' "$key_file")"
if [[ -z "$api_key" ]]; then
  echo "The model API-key secret contains no key." >&2
  exit 64
fi
export AFFILIATE_MAPPING_MODEL_TOKEN="$api_key"

arguments=(
  "--model-endpoint=$endpoint"
  "--model-id=$model_id"
  "--model-manifest=$manifest"
  "--base=$base_commit"
  "--worker=$worker_id"
  "--worktree-parent=$worktree_parent"
  "--model-timeout-ms=$model_timeout_ms"
)

case "$mode" in
  dry-run)
    source_key="${AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY:-}"
    if [[ -z "$source_key" ]]; then
      echo "AFFILIATE_MAPPING_DRY_RUN_SOURCE_KEY is required in dry-run mode." >&2
      exit 64
    fi
    arguments+=("--dry-run" "--source-key=$source_key")
    ;;
  queue)
    arguments+=("--live")
    ;;
  *)
    echo "Unknown AFFILIATE_MAPPING_MODE: $mode" >&2
    exit 64
    ;;
esac

if [[ "${AFFILIATE_MAPPING_REVIEW_SCRAPE:-false}" == "true" ]]; then
  if [[ "$mode" != "dry-run" ]]; then
    echo "Review scraping is allowed only in dry-run mode with a disposable local database." >&2
    exit 64
  fi
  arguments+=("--review-scrape")
fi

exec npm run affiliate:mapping:agent -- "${arguments[@]}"
