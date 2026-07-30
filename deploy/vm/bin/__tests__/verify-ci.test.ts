import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve(__dirname, '..', 'verify-ci.sh');
const commitSha = 'a'.repeat(40);

function runVerifier(workflowRuns: unknown) {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'bracketiq-ci-gate-'));
  const fixturePath = path.join(fixtureDirectory, 'workflow-runs.json');
  writeFileSync(fixturePath, JSON.stringify(workflowRuns));

  try {
    return spawnSync('bash', [scriptPath, commitSha], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_WORKFLOW_RUNS_URL: `file://${fixturePath}`,
        GITHUB_TOKEN: '',
      },
    });
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

function workflowRun(overrides: Record<string, unknown> = {}) {
  return {
    head_sha: commitSha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_number: 42,
    run_attempt: 1,
    html_url: 'https://github.com/camka14/mvp-site/actions/runs/42',
    ...overrides,
  };
}

describe('production CI gate', () => {
  test('accepts an exact successful main push CI run', () => {
    const result = runVerifier({ workflow_runs: [workflowRun()] });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Verified successful CI for ${commitSha}.`);
  });

  test('rejects a failed CI run', () => {
    const result = runVerifier({
      workflow_runs: [workflowRun({ conclusion: 'failure' })],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Refusing production deployment: CI did not pass for ${commitSha} (conclusion: failure).`,
    );
  });

  test('rejects successful checks from another commit or event', () => {
    const result = runVerifier({
      workflow_runs: [
        workflowRun({ head_sha: 'b'.repeat(40) }),
        workflowRun({ event: 'pull_request' }),
      ],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('(conclusion: missing).');
  });
});
