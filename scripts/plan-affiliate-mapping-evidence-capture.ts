import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  resolveAffiliateDatasetEnvironment,
  resolveAffiliateRepositoryCommit,
} from '../src/server/affiliateImports/agentRepository';
import { assertLockedGoldCaptureCohort } from '../src/server/affiliateImports/agentGoldCaptureCohort';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const writeOutput = process.argv.includes('--write');
const approvePlan = process.argv.includes('--approve');
if (approvePlan && !writeOutput) throw new Error('--approve requires --write.');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const writeImmutableJson = async (filePath: string, value: unknown, label: string) => {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== serialized) {
      throw new Error(`${label} already exists with different content: ${filePath}`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, serialized, { encoding: 'utf8', flag: 'wx' });
};

const main = async () => {
  const heldOutProposalPath = path.resolve(
    readOption('--held-out-proposal')
      ?? 'output/affiliate-mapping-agent/gold-cohorts/affiliate-mapping-test-aa6aa626e3f2367c/proposal.json',
  );
  const heldOutLockPath = path.resolve(
    readOption('--held-out-lock')
      ?? path.join(path.dirname(heldOutProposalPath), 'lock.json'),
  );
  const { proposal: heldOutProposal } = assertLockedGoldCaptureCohort(
    JSON.parse(await fs.readFile(heldOutProposalPath, 'utf8')),
    JSON.parse(await fs.readFile(heldOutLockPath, 'utf8')),
  );
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
  } = await import('../src/server/affiliateImports/agentDataset');
  const {
    buildAffiliateGoldCohortCandidates,
  } = await import('../src/server/affiliateImports/agentGoldCohort');
  const {
    buildAffiliateEvidenceCapturePlan,
  } = await import('../src/server/affiliateImports/agentEvidenceCapturePlan');
  const {
    stableAgentArtifactSha256,
  } = await import('../src/server/affiliateImports/agentContracts');

  try {
    const datasetInput = await collectAffiliateHistoricalDatasetInput({
      prisma: prisma as any,
      environment,
      repositoryCommit,
    });
    const inventory = buildAffiliateHistoricalDatasetInventory(datasetInput);
    const candidates = buildAffiliateGoldCohortCandidates(datasetInput);
    const plan = buildAffiliateEvidenceCapturePlan({
      candidates,
      heldOutProposal: heldOutProposal as any,
      repositoryCommit,
      inventorySha256: stableAgentArtifactSha256(inventory.rows),
    });
    const outputRoot = path.resolve(
      readOption('--output-dir')
        ?? path.join('output', 'affiliate-mapping-agent', 'evidence-capture-plans'),
    );
    const outputDirectory = path.join(outputRoot, plan.capturePlanId);
    let planPath: string | null = null;
    let approvalPath: string | null = null;
    if (writeOutput) {
      await fs.mkdir(outputDirectory, { recursive: true });
      planPath = path.join(outputDirectory, 'plan.json');
      await writeImmutableJson(planPath, plan, 'Evidence capture plan');
      if (approvePlan) {
        const approvedByUserId = readOption('--approved-by');
        if (!approvedByUserId) throw new Error('--approved-by is required with --approve.');
        if (approvedByUserId.includes('@')) {
          throw new Error('--approved-by must be a stable user id, not a direct email address.');
        }
        approvalPath = path.join(outputDirectory, 'approval.json');
        await writeImmutableJson(approvalPath, {
          schemaVersion: 1,
          capturePlanId: plan.capturePlanId,
          planSha256: plan.planSha256,
          repositoryCommit: plan.repositoryCommit,
          approvedByUserId,
          approvedAt: new Date().toISOString(),
        }, 'Evidence capture approval');
      }
    }
    console.log(JSON.stringify({
      schemaVersion: 1,
      capturePlanId: plan.capturePlanId,
      planSha256: plan.planSha256,
      repositoryCommit,
      environment,
      summary: plan.summary,
      deficits: plan.deficits,
      readyToCapture: plan.readyToCapture,
      readyForMinimumCorpus: plan.readyForMinimumCorpus,
      excludedCount: plan.excluded.length,
      dryRun: !writeOutput,
      approved: Boolean(approvalPath),
      planPath,
      approvalPath,
      databaseWrites: 0,
      publicRequests: 0,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:evidence-capture-plan] failed', error);
  process.exitCode = 1;
});
