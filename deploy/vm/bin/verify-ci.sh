#!/usr/bin/env bash
set -Eeuo pipefail

commit_sha="${1:-}"
repository="${GITHUB_REPOSITORY:-camka14/mvp-site}"
workflow_file="${CI_WORKFLOW_FILE:-ci.yml}"
api_base="${GITHUB_API_URL:-https://api.github.com}"

if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <full-commit-sha>" >&2
  exit 64
fi

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Cannot verify CI because $command_name is not installed." >&2
    exit 69
  fi
done

workflow_runs_url="${CI_WORKFLOW_RUNS_URL:-${api_base%/}/repos/${repository}/actions/workflows/${workflow_file}/runs?head_sha=${commit_sha}&event=push&status=completed&per_page=100}"
curl_headers=(
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_headers+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

workflow_runs_json="$(
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --connect-timeout 10 \
    --max-time 30 \
    "${curl_headers[@]}" \
    "$workflow_runs_url"
)"

if ! run_result="$(
  jq -er \
    --arg commit_sha "$commit_sha" \
    '
      [
        .workflow_runs[]?
        | select(
            .head_sha == $commit_sha
            and .head_branch == "main"
            and .event == "push"
            and .status == "completed"
          )
      ]
      | sort_by(.run_number, .run_attempt)
      | last
      | if . == null
        then ["missing", ""]
        else [(.conclusion // "missing"), (.html_url // "")]
        end
      | @tsv
    ' <<<"$workflow_runs_json"
)"; then
  echo "GitHub returned an invalid CI workflow response." >&2
  exit 65
fi

IFS=$'\t' read -r conclusion run_url <<<"$run_result"
if [[ "$conclusion" != "success" ]]; then
  echo "Refusing production deployment: CI did not pass for $commit_sha (conclusion: $conclusion)." >&2
  if [[ -n "$run_url" ]]; then
    echo "CI run: $run_url" >&2
  fi
  exit 1
fi

echo "Verified successful CI for $commit_sha."
