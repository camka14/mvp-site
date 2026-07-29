#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ai_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
deployment_env="${COMPOSE_ENV_FILE:-$ai_dir/deployment.env}"
report_directory="${MODEL_REPORT_DIRECTORY:-/var/lib/bracketiq-ai/output/model-verification}"

set -a
# shellcheck disable=SC1090
. "$deployment_env"
set +a

api_key="$(awk 'NF && $1 !~ /^#/ { print; exit }' "${MODEL_API_KEY_FILE:?}")"
endpoint="http://127.0.0.1:${MODEL_HOST_PORT:-8080}"
mkdir -p "$report_directory"
captured_at="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
report_path="$report_directory/${captured_at}.json"
response_path="$(mktemp)"
trap 'rm -f "$response_path"' EXIT

for _ in $(seq 1 120); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --header "Authorization: Bearer $api_key" "$endpoint/health" || true)"
  if [[ "$status" == "200" ]]; then
    break
  fi
  sleep 2
done
if [[ "${status:-}" != "200" ]]; then
  echo "Model health did not become ready." >&2
  exit 1
fi

started_ns="$(date +%s%N)"
curl --fail --silent --show-error \
  --header "Authorization: Bearer $api_key" \
  --header 'Content-Type: application/json' \
  --data-binary @- \
  "$endpoint/v1/chat/completions" >"$response_path" <<JSON
{
  "model": "${MODEL_ALIAS:?}",
  "temperature": 0,
  "max_tokens": 128,
  "messages": [
    {
      "role": "system",
      "content": "Return only JSON matching the supplied schema."
    },
    {
      "role": "user",
      "content": "Classify this policy: robots.txt says Disallow: /. No scraper may be generated."
    }
  ],
  "response_format": {
    "type": "json_schema",
    "schema": {
      "type": "object",
      "properties": {
        "policyDisposition": {"const": "BLOCKED"},
        "generateScraper": {"const": false}
      },
      "required": ["policyDisposition", "generateScraper"],
      "additionalProperties": false
    }
  }
}
JSON
finished_ns="$(date +%s%N)"

container_id="$(docker compose --env-file "$deployment_env" -f "$ai_dir/compose.yml" ps -q model)"
observed_memory="$(docker stats --no-stream --format '{{.MemUsage}}' "$container_id" | cut -d/ -f1 | xargs)"
swap_used_kib="$(awk '/^SwapTotal:/ { total=$2 } /^SwapFree:/ { free=$2 } END { print total-free }' /proc/meminfo)"
wall_ms="$(( (finished_ns - started_ns) / 1000000 ))"

python3 - "$response_path" "$report_path" "$captured_at" "$wall_ms" "$observed_memory" \
  "$swap_used_kib" "$MODEL_ALIAS" "$MODEL_FILE_SHA256" "$LLAMA_CPP_IMAGE" <<'PYTHON'
import json
import sys

(
    response_path,
    report_path,
    captured_at,
    wall_ms,
    observed_memory,
    swap_used_kib,
    model,
    artifact_sha256,
    runtime_image,
) = sys.argv[1:]

with open(response_path, encoding="utf-8") as response_file:
    response = json.load(response_file)
content = response.get("choices", [{}])[0].get("message", {}).get("content")
parsed = json.loads(content)
if parsed != {"policyDisposition": "BLOCKED", "generateScraper": False}:
    raise SystemExit("Model did not return the required blocked-policy response.")

timings = response.get("timings") or {}
report = {
    "schemaVersion": 1,
    "capturedAt": captured_at,
    "model": model,
    "artifactSha256": artifact_sha256,
    "runtimeImage": runtime_image,
    "deterministicPolicyPromptPassed": True,
    "wallMs": int(wall_ms),
    "observedContainerMemory": observed_memory,
    "hostSwapUsedKiB": int(swap_used_kib),
    "promptTokens": timings.get("prompt_n"),
    "promptTokensPerSecond": timings.get("prompt_per_second"),
    "outputTokens": timings.get("predicted_n"),
    "outputTokensPerSecond": timings.get("predicted_per_second"),
    "note": "Run the full representative mapping evaluation to record peak memory and job time.",
}
with open(report_path, "w", encoding="utf-8") as report_file:
    json.dump(report, report_file, indent=2)
    report_file.write("\n")
PYTHON

echo "Model verification passed; report: $report_path"
