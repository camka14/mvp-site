#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Add it to ${ENV_FILE} or export it before starting DBHub." >&2
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
