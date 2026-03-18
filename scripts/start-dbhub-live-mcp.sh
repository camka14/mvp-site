#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_LOCAL_FILE="${ROOT_DIR}/.env.local"

set -a
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi
if [[ -f "${ENV_LOCAL_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_LOCAL_FILE}"
fi
set +a

if [[ -z "${DATABASE_URL_LIVE:-}" ]]; then
  echo "DATABASE_URL_LIVE is not set. Add it to ${ENV_FILE} or ${ENV_LOCAL_FILE}, or export it before starting DBHub live." >&2
  exit 1
fi

DBHUB_VERSION="${DBHUB_VERSION:-0.17.0}"
DBHUB_PACKAGE="@bytebase/dbhub@${DBHUB_VERSION}"

# Avoid native postinstall builds (not needed for Postgres/MySQL/etc.) to keep
# MCP startup fast and compatible with newer Node versions.
case "${DATABASE_URL_LIVE}" in
  sqlite:*|sqlite://*)
    NPM_IGNORE_SCRIPTS="false"
    ;;
  *)
    NPM_IGNORE_SCRIPTS="true"
    ;;
esac

exec env npm_config_ignore_scripts="${NPM_IGNORE_SCRIPTS}" npx -y "${DBHUB_PACKAGE}" --transport stdio --dsn "${DATABASE_URL_LIVE}"
