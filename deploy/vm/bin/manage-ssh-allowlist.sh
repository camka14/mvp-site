#!/usr/bin/env bash
set -Eeuo pipefail

allowlist_file="${FAIL2BAN_SSH_ALLOWLIST_FILE:-/etc/fail2ban/jail.d/bracketiq-sshd-allowlist.local}"
skip_reload="${FAIL2BAN_SKIP_RELOAD:-false}"
action="${1:-list}"
requested_target="${2:-}"

usage() {
  echo "Usage: $0 list | add <ip-or-cidr> | remove <ip-or-cidr>" >&2
}

normalize_target() {
  python3 - "$1" <<'PY'
import ipaddress
import sys

value = sys.argv[1]
try:
    parsed = ipaddress.ip_network(value, strict=False) if "/" in value else ipaddress.ip_address(value)
except ValueError as error:
    print(f"Invalid IP address or CIDR: {value} ({error})", file=sys.stderr)
    raise SystemExit(64)
print(parsed)
PY
}

declare -a targets=("127.0.0.0/8" "::1")
if [[ -f "$allowlist_file" ]]; then
  configured_targets="$(sed -n -E 's/^[[:space:]]*ignoreip[[:space:]]*=[[:space:]]*(.*)$/\1/p' "$allowlist_file" | tail -n 1)"
  if [[ -n "$configured_targets" ]]; then
    read -r -a targets <<< "$configured_targets"
  fi
fi

contains_target() {
  local expected="$1"
  local target
  for target in "${targets[@]}"; do
    if [[ "$target" == "$expected" ]]; then
      return 0
    fi
  done
  return 1
}

write_allowlist() {
  local directory temporary_file target
  directory="$(dirname "$allowlist_file")"
  install -d -m 0755 "$directory"
  temporary_file="$(mktemp "${allowlist_file}.XXXXXX")"
  trap 'rm -f "$temporary_file"' EXIT
  {
    printf '[sshd]\n'
    printf 'ignoreip ='
    for target in "${targets[@]}"; do
      printf ' %s' "$target"
    done
    printf '\n'
  } > "$temporary_file"
  chmod 0644 "$temporary_file"
  mv "$temporary_file" "$allowlist_file"
  trap - EXIT

  if [[ "$skip_reload" != "true" ]]; then
    systemctl restart fail2ban.service
    fail2ban-client status sshd >/dev/null
  fi
}

case "$action" in
  list)
    printf '%s\n' "${targets[@]}"
    ;;
  add)
    if [[ "${EUID}" -ne 0 && "${FAIL2BAN_ALLOW_NON_ROOT:-false}" != "true" ]]; then
      echo "Run this command as root (for example, sudo $0 add <ip-or-cidr>)." >&2
      exit 77
    fi
    if [[ -z "$requested_target" || "$#" -ne 2 ]]; then
      usage
      exit 64
    fi
    normalized_target="$(normalize_target "$requested_target")"
    if ! contains_target "$normalized_target"; then
      targets+=("$normalized_target")
      write_allowlist
    fi
    printf 'Approved SSH management source: %s\n' "$normalized_target"
    ;;
  remove)
    if [[ "${EUID}" -ne 0 && "${FAIL2BAN_ALLOW_NON_ROOT:-false}" != "true" ]]; then
      echo "Run this command as root (for example, sudo $0 remove <ip-or-cidr>)." >&2
      exit 77
    fi
    if [[ -z "$requested_target" || "$#" -ne 2 ]]; then
      usage
      exit 64
    fi
    normalized_target="$(normalize_target "$requested_target")"
    if [[ "$normalized_target" == "127.0.0.0/8" || "$normalized_target" == "::1" ]]; then
      echo "Refusing to remove the loopback allowlist entry." >&2
      exit 64
    fi
    declare -a remaining_targets=()
    for target in "${targets[@]}"; do
      if [[ "$target" != "$normalized_target" ]]; then
        remaining_targets+=("$target")
      fi
    done
    targets=("${remaining_targets[@]}")
    write_allowlist
    printf 'Removed SSH management source: %s\n' "$normalized_target"
    ;;
  *)
    usage
    exit 64
    ;;
esac
