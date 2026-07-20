#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (for example, sudo $0)." >&2
  exit 77
fi

public_key_file="${1:-}"
if [[ -z "$public_key_file" || ! -s "$public_key_file" ]]; then
  echo "Usage: $0 /path/to/bracketiq-operator.pub" >&2
  exit 64
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" || ! "${VERSION_ID:-}" =~ ^(24\.04|26\.04)$ ]]; then
  echo "Supported hosts are Ubuntu 24.04 LTS and 26.04 LTS; found ${PRETTY_NAME:-unknown}." >&2
  exit 65
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

apt-get update
apt-get dist-upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  fail2ban \
  git \
  gnupg \
  jq \
  restic \
  rsync \
  ufw \
  unattended-upgrades

install -m 0755 -d /etc/apt/keyrings

curl --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg \
  --output /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

curl --fail --silent --show-error --location \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  --output /etc/apt/keyrings/postgresql.asc
chmod a+r /etc/apt/keyrings/postgresql.asc

cat > /etc/apt/sources.list.d/pgdg.list <<EOF
deb [signed-by=/etc/apt/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main
EOF

apt-get update
apt-get install -y --no-install-recommends \
  containerd.io \
  docker-buildx-plugin \
  docker-ce \
  docker-ce-cli \
  docker-compose-plugin \
  postgresql-client-17

install -m 0755 -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-file": "5",
    "max-size": "10m"
  }
}
EOF
systemctl enable docker.service containerd.service
systemctl restart docker.service

if ! id bracketiq >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash bracketiq
fi
usermod --append --groups docker bracketiq

install -d -m 0700 -o bracketiq -g bracketiq /home/bracketiq/.ssh
install -m 0600 -o bracketiq -g bracketiq "$public_key_file" /home/bracketiq/.ssh/authorized_keys
install -d -m 0755 -o bracketiq -g bracketiq /opt/bracketiq
install -d -m 0750 -o root -g bracketiq /etc/bracketiq
install -d -m 0700 -o root -g root /var/lib/bracketiq

if ! swapon --show --noheadings | grep -q .; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
if ! grep -Eq '^/swapfile\s' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

cat > /etc/sysctl.d/99-bracketiq.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null

install -d -m 0755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-bracketiq.conf <<'EOF'
[Journal]
SystemMaxUse=500M
RuntimeMaxUse=100M
MaxRetentionSec=14day
Compress=yes
EOF
systemctl restart systemd-journald.service

cat > /etc/fail2ban/jail.d/bracketiq-sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
mode = aggressive
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban.service
systemctl restart fail2ban.service

ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP3'
ufw --force enable

# OpenSSH uses the first value it reads for each global option. The OVH image
# ships a cloud-init drop-in, so this file must sort before provider defaults.
rm -f /etc/ssh/sshd_config.d/99-bracketiq-hardening.conf
cat > /etc/ssh/sshd_config.d/00-bracketiq-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowAgentForwarding no
PermitTunnel no
MaxAuthTries 3
LoginGraceTime 30
EOF
install -d -m 0755 /run/sshd
sshd -t
systemctl reload ssh.service

systemctl enable unattended-upgrades.service
systemctl start unattended-upgrades.service

install -m 0600 /dev/null /var/lib/bracketiq/bootstrap-completed
printf 'completed_at=%s\nos=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PRETTY_NAME" \
  > /var/lib/bracketiq/bootstrap-completed

echo "BracketIQ host bootstrap completed."
if [[ -f /var/run/reboot-required ]]; then
  echo "A reboot is required before deployment."
fi
