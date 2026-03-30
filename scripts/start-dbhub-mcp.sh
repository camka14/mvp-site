#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_LOCAL_FILE="${ROOT_DIR}/.env.local"

read_env_key() {
  local key="$1"
  shift
  local file line value result=""

  for file in "$@"; do
    [[ -f "${file}" ]] || continue
    while IFS= read -r line || [[ -n "${line}" ]]; do
      # Ignore blank lines/comments and optional "export " prefix.
      line="${line%$'\r'}"
      line="${line#"${line%%[![:space:]]*}"}"
      [[ -z "${line}" || "${line:0:1}" == "#" ]] && continue
      [[ "${line}" =~ ^export[[:space:]]+ ]] && line="${line#export }"
      [[ "${line}" == "${key}="* ]] || continue

      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "${value}" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      result="${value}"
    done < "${file}"
  done

  printf '%s' "${result}"
}

DATABASE_URL="${DATABASE_URL:-$(read_env_key "DATABASE_URL" "${ENV_FILE}" "${ENV_LOCAL_FILE}")}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Add it to ${ENV_FILE} or ${ENV_LOCAL_FILE}, or export it before starting DBHub." >&2
  exit 1
fi

DBHUB_VERSION="${DBHUB_VERSION:-0.17.0}"
DBHUB_PACKAGE="@bytebase/dbhub@${DBHUB_VERSION}"

# Avoid native postinstall builds (not needed for Postgres/MySQL/etc.) to keep
# MCP startup fast and compatible with newer Node versions.
case "${DATABASE_URL}" in
  sqlite:*|sqlite://*)
    NPM_IGNORE_SCRIPTS="false"
    ;;
  *)
    NPM_IGNORE_SCRIPTS="true"
    ;;
esac

exec env npm_config_ignore_scripts="${NPM_IGNORE_SCRIPTS}" npx -y "${DBHUB_PACKAGE}" --transport stdio --dsn "${DATABASE_URL}"
