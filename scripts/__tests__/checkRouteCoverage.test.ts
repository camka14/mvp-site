import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = path.join(process.cwd(), 'scripts', 'check-route-coverage.mjs');

function metric(total: number, covered: number) {
  return { total, covered, skipped: 0, pct: (covered / total) * 100 };
}

function runGate(routeCovered: number, includeRoute = true) {
  const directory = mkdtempSync(path.join(tmpdir(), 'route-coverage-'));
  const summaryPath = path.join(directory, 'coverage-summary.json');
  const fileCoverage = {
    statements: metric(100, routeCovered),
    branches: metric(100, routeCovered),
    functions: metric(100, routeCovered),
    lines: metric(100, routeCovered),
  };
  const summary = {
    total: fileCoverage,
    ...(includeRoute
      ? {
          '/workspace/src/app/api/events/route.ts': fileCoverage,
          '/workspace/src/app/api/teams/[id]/route.ts': fileCoverage,
        }
      : { '/workspace/src/lib/example.ts': fileCoverage }),
  };
  writeFileSync(summaryPath, JSON.stringify(summary));

  const result = spawnSync(process.execPath, [scriptPath, summaryPath], {
    encoding: 'utf8',
  });
  rmSync(directory, { recursive: true, force: true });
  return result;
}

describe('aggregate API route coverage gate', () => {
  it('passes when aggregate route coverage clears every floor', () => {
    const result = runGate(80);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('API route coverage passed for 2 files');
  });

  it('fails when aggregate route coverage falls below a floor', () => {
    const result = runGate(50);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('API route coverage failed');
    expect(result.stderr).toContain('branches 50.00% (floor 52%)');
  });

  it('fails closed when route files are absent from the summary', () => {
    const result = runGate(80, false);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Coverage summary contains no API route files');
  });
});
