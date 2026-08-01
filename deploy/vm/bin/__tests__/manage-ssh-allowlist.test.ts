import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve(__dirname, '..', 'manage-ssh-allowlist.sh');

function runAllowlist(directory: string, args: string[]) {
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAIL2BAN_ALLOW_NON_ROOT: 'true',
      FAIL2BAN_SKIP_RELOAD: 'true',
      FAIL2BAN_SSH_ALLOWLIST_FILE: path.join(directory, 'bracketiq-sshd-allowlist.local'),
    },
  });
}

describe('SSH management allowlist helper', () => {
  let fixtureDirectory: string;

  beforeEach(() => {
    fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'bracketiq-ssh-allowlist-'));
  });

  afterEach(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  test('adds a validated address without duplicating it', () => {
    const first = runAllowlist(fixtureDirectory, ['add', '198.51.100.10']);
    const second = runAllowlist(fixtureDirectory, ['add', '198.51.100.10']);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(readFileSync(path.join(fixtureDirectory, 'bracketiq-sshd-allowlist.local'), 'utf8')).toBe(
      '[sshd]\nignoreip = 127.0.0.0/8 ::1 198.51.100.10\n',
    );
  });

  test('rejects invalid addresses without creating a configuration', () => {
    const result = runAllowlist(fixtureDirectory, ['add', 'not-an-ip']);

    expect(result.status).toBe(64);
    expect(result.stderr).toContain('Invalid IP address or CIDR');
  });

  test('removes an approved address but preserves loopback entries', () => {
    expect(runAllowlist(fixtureDirectory, ['add', '2001:db8::8']).status).toBe(0);
    expect(runAllowlist(fixtureDirectory, ['remove', '2001:db8::8']).status).toBe(0);

    const listed = runAllowlist(fixtureDirectory, ['list']);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe('127.0.0.0/8\n::1\n');
  });
});
