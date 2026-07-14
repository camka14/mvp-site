import fs from 'node:fs';
import path from 'node:path';
import jestConfig from '../jest.config';

type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines';
type CoverageFloor = Partial<Record<CoverageMetric, number>>;

describe('CI quality gates', () => {
  it('collects API route coverage and enforces a nonzero global floor', () => {
    const collected = jestConfig.collectCoverageFrom ?? [];
    expect(collected).toContain('src/**/*.{ts,tsx}');
    expect(collected).not.toContain('!src/app/**/route.ts');
    expect(jestConfig.coverageReporters).toContain('json-summary');

    const thresholds = jestConfig.coverageThreshold as Record<string, CoverageFloor>;
    expect(thresholds.global).toBeDefined();
    for (const metric of ['statements', 'branches', 'functions', 'lines'] as const) {
      expect(thresholds.global[metric]).toEqual(expect.any(Number));
      expect(thresholds.global[metric]).toBeGreaterThan(0);
    }
  });

  it('runs route-inclusive Jest coverage and TypeScript checks for pushes and pull requests', () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), '.github', 'workflows', 'ci.yml'),
      'utf8',
    );

    expect(workflow).toMatch(/^on:\n  pull_request:\n  push:/m);
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('run: npm run test:ci');
    expect(workflow).toContain('run: npx tsc --noEmit');

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['test:ci']).toContain('coverage:check-routes');
  });
});
