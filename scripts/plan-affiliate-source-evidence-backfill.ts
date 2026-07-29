import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const writeReport = process.argv.includes('--write-report');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const main = async () => {
  const capturedAt = new Date();
  const environment = useLive ? 'live' : 'local';
  const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
  const { prisma } = await import('../src/lib/prisma');
  const {
    collectAffiliateHistoricalDatasetInput,
    planAffiliateSourceEvidenceBackfill,
  } = await import('../src/server/affiliateImports/agentDataset');

  try {
    const datasetInput = await collectAffiliateHistoricalDatasetInput({
      prisma: prisma as any,
      environment,
      repositoryCommit,
      capturedAt,
    });
    const rows = planAffiliateSourceEvidenceBackfill(
      datasetInput.sources,
      datasetInput.intakes,
      datasetInput.mappings,
    );
    const byAction = Object.fromEntries(
      Array.from(new Set(rows.map((row) => row.action))).sort().map((action) => [
        action,
        rows.filter((row) => row.action === action).length,
      ]),
    );
    const report = {
      schemaVersion: 1,
      capturedAt: capturedAt.toISOString(),
      environment,
      repositoryCommit,
      dryRun: true,
      publicRequests: 0,
      databaseWrites: 0,
      byAction,
      rows,
    };
    let outputPath: string | null = null;
    if (writeReport) {
      const outputDirectory = path.resolve(
        readOption('--output-dir')
          ?? path.join('output', 'affiliate-mapping-agent', 'backfill-plans'),
      );
      await fs.mkdir(outputDirectory, { recursive: true });
      outputPath = path.join(
        outputDirectory,
        `backfill-plan-${capturedAt.toISOString().replace(/[:.]/g, '-')}.json`,
      );
      await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify({
      capturedAt: report.capturedAt,
      environment,
      dryRun: true,
      publicRequests: 0,
      databaseWrites: 0,
      total: rows.length,
      byAction,
      outputPath,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:backfill-plan] failed', error);
  process.exitCode = 1;
});
