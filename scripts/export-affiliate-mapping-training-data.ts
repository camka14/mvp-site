import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  resolveAffiliateDatasetEnvironment,
  resolveAffiliateRepositoryCommit,
} from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const writeOutput = process.argv.includes('--write');
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

const safeTimestamp = (date: Date) => date.toISOString().replace(/[:.]/g, '-');

const main = async () => {
  const capturedAt = new Date();
  const environment = resolveAffiliateDatasetEnvironment({
    explicitEnvironment: readOption('--environment'),
    useLiveDatabase: useLive,
  });
  const repositoryCommit = resolveAffiliateRepositoryCommit({
    explicitCommit: readOption('--repository-commit'),
    repositoryRoot: process.cwd(),
  });
  const { prisma } = await import('../src/lib/prisma');
  const {
    buildAffiliateHistoricalDatasetInventory,
    collectAffiliateHistoricalDatasetInput,
    renderJsonLines,
  } = await import('../src/server/affiliateImports/agentDataset');
  const {
    buildAffiliateGoldCohortCandidates,
  } = await import('../src/server/affiliateImports/agentGoldCohort');

  try {
    const datasetInput = await collectAffiliateHistoricalDatasetInput({
      prisma: prisma as any,
      environment,
      repositoryCommit,
      capturedAt,
    });
    const dataset = buildAffiliateHistoricalDatasetInventory(datasetInput);
    const captureCandidates = buildAffiliateGoldCohortCandidates(datasetInput);
    const datasetId = `dataset-${safeTimestamp(capturedAt)}-${repositoryCommit.slice(0, 12)}`;
    const outputRoot = path.resolve(
      readOption('--output-dir')
        ?? path.join('output', 'affiliate-mapping-agent', 'datasets'),
    );
    const outputDirectory = path.join(outputRoot, datasetId);
    const manifest = {
      schemaVersion: 1,
      datasetId,
      capturedAt: dataset.capturedAt,
      environment,
      repositoryCommit,
      dryRun: !writeOutput,
      summary: dataset.summary,
      inventorySha256: (
        await import('../src/server/affiliateImports/agentContracts')
      ).stableAgentArtifactSha256(dataset.rows),
      trainingExamplesSha256: (
        await import('../src/server/affiliateImports/agentContracts')
      ).stableAgentArtifactSha256(dataset.trainingExamples),
      captureCandidateCount: captureCandidates.length,
      captureCandidatesSha256: (
        await import('../src/server/affiliateImports/agentContracts')
      ).stableAgentArtifactSha256(captureCandidates),
      databaseWrites: 0,
      publicRequests: 0,
    };

    if (writeOutput) {
      await fs.mkdir(outputDirectory, { recursive: true });
      await Promise.all([
        fs.writeFile(
          path.join(outputDirectory, 'manifest.json'),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8',
        ),
        fs.writeFile(
          path.join(outputDirectory, 'inventory.jsonl'),
          renderJsonLines(dataset.rows.map((row) => ({
            ...row,
            trainingExample: undefined,
          }))),
          'utf8',
        ),
        fs.writeFile(
          path.join(outputDirectory, 'training.jsonl'),
          renderJsonLines(dataset.trainingExamples),
          'utf8',
        ),
        fs.writeFile(
          path.join(outputDirectory, 'capture-candidates.jsonl'),
          renderJsonLines(captureCandidates),
          'utf8',
        ),
      ]);
    }

    console.log(JSON.stringify({
      ...manifest,
      outputDirectory: writeOutput ? outputDirectory : null,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:dataset] failed', error);
  process.exitCode = 1;
});
