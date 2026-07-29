#!/usr/bin/env bash
set -Eeuo pipefail

key_file="/run/secrets/model_api_key"
endpoint="${AFFILIATE_MAPPING_MODEL_ENDPOINT:-http://model:8080}"
model_id="${AFFILIATE_MAPPING_MODEL_ID:-}"
manifest="${AFFILIATE_MAPPING_MODEL_MANIFEST:-/run/config/model-manifest.json}"
timeout_ms="${AFFILIATE_MAPPING_MODEL_TIMEOUT_MS:-5400000}"

if [[ -z "$model_id" || ! -r "$manifest" || ! -r "$key_file" ]]; then
  echo "Model id, manifest, and readable API-key secret are required." >&2
  exit 64
fi
if [[ ! "$timeout_ms" =~ ^[0-9]+$ ]] || (( timeout_ms < 1000 || timeout_ms > 5400000 )); then
  echo "AFFILIATE_MAPPING_MODEL_TIMEOUT_MS must be between 1000 and 5400000." >&2
  exit 64
fi
if [[ "$*" != *"--suite="* || "$*" != *"--output="* ]]; then
  echo "Evaluation requires explicit --suite= and --output= paths." >&2
  exit 64
fi

api_key="$(awk 'NF && $1 !~ /^#/ { print; exit }' "$key_file")"
if [[ -z "$api_key" ]]; then
  echo "The model API-key secret contains no key." >&2
  exit 64
fi
export AFFILIATE_MAPPING_MODEL_TOKEN="$api_key"

exec npm run affiliate:mapping:evaluate -- \
  --worker=llama \
  "--model-endpoint=$endpoint" \
  "--model-id=$model_id" \
  "--model-manifest=$manifest" \
  "--model-timeout-ms=$timeout_ms" \
  "$@"
