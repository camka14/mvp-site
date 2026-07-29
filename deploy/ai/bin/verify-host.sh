#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ai_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$ai_dir/compose.yml}"
deployment_env="${COMPOSE_ENV_FILE:-$ai_dir/deployment.env}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Host verification must run on the target Linux VM." >&2
  exit 1
fi
if [[ ! -r "$deployment_env" ]]; then
  echo "Deployment environment is missing: $deployment_env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$deployment_env"
set +a

require_digest_image() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "$name must end in an immutable @sha256 digest." >&2
    exit 1
  fi
}

require_digest_image "LLAMA_CPP_IMAGE" "${LLAMA_CPP_IMAGE:-}"
require_digest_image "CONTROLLER_IMAGE" "${CONTROLLER_IMAGE:-}"

cores="$(getconf _NPROCESSORS_ONLN)"
memory_kib="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
swap_kib="$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)"
disk_free_kib="$(df --output=avail -k "${MODEL_DIRECTORY:-/var/lib/bracketiq-ai/models}" | tail -n 1 | tr -d ' ')"

if (( cores < 8 )); then
  echo "At least 8 online CPU cores are required; found $cores." >&2
  exit 1
fi
if (( memory_kib < 23000000 )); then
  echo "At least 23,000,000 KiB physical memory is required; found $memory_kib." >&2
  exit 1
fi
if (( swap_kib < 8388608 )); then
  echo "At least 8 GiB swap is required as crash protection; found ${swap_kib} KiB." >&2
  exit 1
fi
if (( disk_free_kib < 41943040 )); then
  echo "At least 40 GiB free space is required; found ${disk_free_kib} KiB." >&2
  exit 1
fi

command -v docker >/dev/null
command -v python3 >/dev/null
docker compose version >/dev/null
timedatectl show -p NTPSynchronized --value | grep -qx yes

model_path="${MODEL_DIRECTORY:?}/${MODEL_FILE:?}"
if [[ ! -r "$model_path" ]]; then
  echo "Model file is missing or unreadable: $model_path" >&2
  exit 1
fi
if [[ ! "${MODEL_FILE_SHA256:-}" =~ ^[a-f0-9]{64}$ ]]; then
  echo "MODEL_FILE_SHA256 must be a lowercase SHA-256 value." >&2
  exit 1
fi
printf '%s  %s\n' "$MODEL_FILE_SHA256" "$model_path" | sha256sum --check --status

for secret_file in "${MODEL_API_KEY_FILE:?}" "${MODEL_MANIFEST_FILE:?}"; do
  if [[ ! -r "$secret_file" ]]; then
    echo "Required configuration file is unreadable: $secret_file" >&2
    exit 1
  fi
done

python3 - "$MODEL_MANIFEST_FILE" "$MODEL_FILE" "$MODEL_FILE_SHA256" <<'PYTHON'
import json
import sys

manifest_path, model_file, model_sha256 = sys.argv[1:]
with open(manifest_path, encoding="utf-8") as manifest_file:
    manifest = json.load(manifest_file)
license_review = manifest.get("license") or {}
required_approvals = (
    license_review.get("commercialUseApproved"),
    license_review.get("modificationApproved"),
    license_review.get("derivativeDeploymentApproved"),
)
if not all(value is True for value in required_approvals):
    raise SystemExit("Model license permissions have not all been approved.")
if manifest.get("requiresVendorApi") is not False:
    raise SystemExit("The worker manifest must state requiresVendorApi=false.")
if not manifest.get("offlineColdStartVerifiedAt"):
    raise SystemExit("The manifest has no verified offline cold start.")
if (manifest.get("quantization") or {}).get("artifactSha256") != model_sha256:
    raise SystemExit("Manifest quantization hash does not match MODEL_FILE_SHA256.")
artifacts = manifest.get("weightArtifacts") or []
if not any(
    item.get("filename") == model_file and item.get("sha256") == model_sha256
    for item in artifacts
):
    raise SystemExit("Manifest weight artifacts do not include the configured model file and hash.")
PYTHON

secret_mode="$(stat -c '%a' "$MODEL_API_KEY_FILE")"
if [[ "$secret_mode" != "600" && "$secret_mode" != "400" ]]; then
  echo "Model API-key file must have mode 0600 or 0400; found $secret_mode." >&2
  exit 1
fi

compose=(docker compose --env-file "$deployment_env" -f "$compose_file")
"${compose[@]}" config --quiet

container_id="$("${compose[@]}" ps -q model)"
if [[ -n "$container_id" ]]; then
  if docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" \
    | grep -Eiq 'DATABASE_URL|DO_SPACES|GITHUB|CODEX|SMTP|SCRAPINGDOG|FIRECRAWL'; then
    echo "Forbidden operational credentials are present in the model container." >&2
    exit 1
  fi
  published_address="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostIp}}' "$container_id")"
  if [[ "$published_address" != "127.0.0.1" ]]; then
    echo "Model port must bind only to 127.0.0.1; found $published_address." >&2
    exit 1
  fi
fi

printf 'Host verification passed: cores=%s memory_kib=%s swap_kib=%s disk_free_kib=%s\n' \
  "$cores" "$memory_kib" "$swap_kib" "$disk_free_kib"
