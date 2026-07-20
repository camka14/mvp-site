#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (for example, sudo $0)." >&2
  exit 77
fi

failures=0

check_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" == "$expected" ]]; then
    printf 'PASS %-28s %s\n' "$label" "$actual"
  else
    printf 'FAIL %-28s expected %s, found %s\n' "$label" "$expected" "$actual" >&2
    failures=$((failures + 1))
  fi
}

check_active() {
  local unit="$1"
  local state

  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  check_equal "$unit" "$state" "active"
}

ssh_configuration="$(sshd -T)"
while read -r keyword value _; do
  case "$keyword" in
    permitrootlogin) check_equal "SSH root login" "$value" "no" ;;
    passwordauthentication) check_equal "SSH password auth" "$value" "no" ;;
    kbdinteractiveauthentication) check_equal "SSH keyboard auth" "$value" "no" ;;
    pubkeyauthentication) check_equal "SSH public key auth" "$value" "yes" ;;
    x11forwarding) check_equal "SSH X11 forwarding" "$value" "no" ;;
    allowagentforwarding) check_equal "SSH agent forwarding" "$value" "no" ;;
    permittunnel) check_equal "SSH tunnels" "$value" "no" ;;
    maxauthtries) check_equal "SSH max auth tries" "$value" "3" ;;
    logingracetime) check_equal "SSH login grace" "$value" "30" ;;
  esac
done <<< "$ssh_configuration"

check_active docker.service
check_active containerd.service
check_active fail2ban.service
check_active unattended-upgrades.service

check_equal "UFW" "$(ufw status | head -n 1)" "Status: active"
check_equal "Swap GiB" "$(awk '$1 == "SwapTotal:" { printf "%.0f", $2 / 1024 / 1024 }' /proc/meminfo)" "2"
check_equal "/opt/bracketiq owner" "$(stat -c '%U:%G' /opt/bracketiq)" "bracketiq:bracketiq"
check_equal "/etc/bracketiq mode" "$(stat -c '%a:%U:%G' /etc/bracketiq)" "750:root:bracketiq"
check_equal "/var/lib/bracketiq mode" "$(stat -c '%a:%U:%G' /var/lib/bracketiq)" "700:root:root"

if [[ -s /var/lib/bracketiq/bootstrap-completed ]]; then
  printf 'PASS %-28s %s\n' "Bootstrap marker" "present"
else
  printf 'FAIL %-28s %s\n' "Bootstrap marker" "missing" >&2
  failures=$((failures + 1))
fi

printf '\nVersions\n'
printf '  OS:       %s\n' "$(. /etc/os-release; printf '%s' "$PRETTY_NAME")"
printf '  Kernel:   %s\n' "$(uname -r)"
printf '  Docker:   %s\n' "$(docker version --format '{{.Server.Version}}')"
printf '  Compose:  %s\n' "$(docker compose version --short)"
printf '  psql:     %s\n' "$(psql --version)"
printf '  Restic:   %s\n' "$(restic version | awk '{ print $2 }')"

printf '\nFirewall\n'
ufw status

printf '\nFail2ban\n'
fail2ban-client status sshd

printf '\nListening sockets\n'
ss -lntup

if (( failures > 0 )); then
  printf '\nBootstrap verification failed with %d issue(s).\n' "$failures" >&2
  exit 1
fi

printf '\nBootstrap verification passed.\n'
