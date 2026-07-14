#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const METRICS = ['statements', 'branches', 'functions', 'lines'];
const ROUTE_FLOORS = {
  statements: 64,
  branches: 52,
  functions: 63,
  lines: 65,
};

const summaryPath = path.resolve(
  process.argv[2] ?? path.join('coverage', 'coverage-summary.json'),
);

function isApiRoute(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  return normalized.includes('/src/app/') && normalized.endsWith('/route.ts');
}

function loadCoverageSummary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Coverage summary was not generated: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function aggregateRouteCoverage(summary) {
  const routeEntries = Object.entries(summary).filter(
    ([filePath]) => filePath !== 'total' && isApiRoute(filePath),
  );
  if (routeEntries.length === 0) {
    throw new Error('Coverage summary contains no API route files');
  }

  const totals = Object.fromEntries(
    METRICS.map((metric) => [metric, { total: 0, covered: 0, pct: 100 }]),
  );

  for (const [, fileSummary] of routeEntries) {
    for (const metric of METRICS) {
      const value = fileSummary?.[metric];
      if (!value || !Number.isFinite(value.total) || !Number.isFinite(value.covered)) {
        throw new Error(`Coverage summary is missing a valid ${metric} metric`);
      }
      totals[metric].total += value.total;
      totals[metric].covered += value.covered;
    }
  }

  for (const metric of METRICS) {
    const value = totals[metric];
    value.pct = value.total === 0 ? 100 : (value.covered / value.total) * 100;
  }

  return { routeFileCount: routeEntries.length, totals };
}

try {
  const summary = loadCoverageSummary(summaryPath);
  const { routeFileCount, totals } = aggregateRouteCoverage(summary);
  const failures = METRICS.filter(
    (metric) => totals[metric].pct + Number.EPSILON < ROUTE_FLOORS[metric],
  );
  const rendered = METRICS.map(
    (metric) => `${metric} ${totals[metric].pct.toFixed(2)}% (floor ${ROUTE_FLOORS[metric]}%)`,
  ).join(', ');

  if (failures.length > 0) {
    throw new Error(`API route coverage failed: ${rendered}`);
  }

  process.stdout.write(`API route coverage passed for ${routeFileCount} files: ${rendered}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
