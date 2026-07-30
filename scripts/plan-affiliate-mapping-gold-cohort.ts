import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import type { AffiliateGoldCohortProposal } from '../src/server/affiliateImports/agentGoldCohort';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const writeOutput = process.argv.includes('--write');
const lockProposal = process.argv.includes('--lock');
const summaryOnly = process.argv.includes('--summary');
if (lockProposal && !writeOutput) {
  throw new Error('--lock requires --write.');
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const savedProposalPath = readOption('--proposal');
const reviseFromProposalPath = readOption('--revise-from');
const removeSourceKey = readOption('--remove-source');
const replacementSourceKey = readOption('--replacement-source');
if (savedProposalPath && !lockProposal) {
  throw new Error('--proposal is only supported with --lock.');
}
if (
  [reviseFromProposalPath, removeSourceKey, replacementSourceKey].some(Boolean)
  && ![reviseFromProposalPath, removeSourceKey, replacementSourceKey].every(Boolean)
) {
  throw new Error(
    '--revise-from, --remove-source, and --replacement-source must be supplied together.',
  );
}
if (savedProposalPath && reviseFromProposalPath) {
  throw new Error('--proposal cannot be combined with --revise-from.');
}
if (useLive && !savedProposalPath) {
  const liveDatabaseUrl = process.env.DATABASE_URL_LIVE?.trim();
  if (!liveDatabaseUrl) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = liveDatabaseUrl;
  try {
    const sslMode = new URL(liveDatabaseUrl).searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable') {
      delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
    } else {
      process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
    }
  } catch {
    process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  }
}

const writeImmutableJson = async (
  filePath: string,
  value: unknown,
  identityField: string,
) => {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== serialized) {
      throw new Error(
        `${identityField} already exists with different content: ${filePath}`,
      );
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, serialized, { encoding: 'utf8', flag: 'wx' });
};

const writeCohortLock = async (input: {
  filePath: string;
  cohortId: string;
  proposalSha256: string;
  repositoryCommit: string;
  approvedByUserId: string;
  domainAssignments: unknown;
  platformFamilies: unknown;
}) => {
  try {
    const existing = JSON.parse(await fs.readFile(input.filePath, 'utf8')) as {
      cohortId?: string;
      proposalSha256?: string;
      approvedByUserId?: string;
    };
    if (
      existing.cohortId !== input.cohortId
      || existing.proposalSha256 !== input.proposalSha256
      || existing.approvedByUserId !== input.approvedByUserId
    ) {
      throw new Error(`Cohort lock already exists with different content: ${input.filePath}`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(input.filePath, `${JSON.stringify({
    schemaVersion: 1,
    cohortId: input.cohortId,
    proposalSha256: input.proposalSha256,
    repositoryCommit: input.repositoryCommit,
    approvedByUserId: input.approvedByUserId,
    lockedAt: new Date().toISOString(),
    domainAssignments: input.domainAssignments,
    platformFamilies: input.platformFamilies,
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

const main = async () => {
  if (savedProposalPath) {
    const goldCohortModule = await import('../src/server/affiliateImports/agentGoldCohort');
    const assertProposalIntegrity: (
      value: unknown,
    ) => asserts value is AffiliateGoldCohortProposal = (
      goldCohortModule.assertAffiliateGoldCohortProposalIntegrity
    );
    const proposalPath = path.resolve(savedProposalPath);
    const proposal = JSON.parse(await fs.readFile(proposalPath, 'utf8'));
    assertProposalIntegrity(proposal);
    if (!proposal.readyToLock) {
      throw new Error(`Cannot lock a cohort with deficits: ${proposal.deficits.join(' ')}`);
    }
    const approvedByUserId = readOption('--approved-by');
    if (!approvedByUserId) throw new Error('--approved-by is required with --lock.');
    if (approvedByUserId.includes('@')) {
      throw new Error('--approved-by must be a stable user id, not a direct email address.');
    }
    const lockPath = path.join(path.dirname(proposalPath), 'lock.json');
    await writeCohortLock({
      filePath: lockPath,
      cohortId: proposal.cohortId,
      proposalSha256: proposal.proposalSha256,
      repositoryCommit: proposal.repositoryCommit,
      approvedByUserId,
      domainAssignments: proposal.lockedDomainAssignments,
      platformFamilies: proposal.lockedPlatformFamilies,
    });
    console.log(JSON.stringify({
      cohortId: proposal.cohortId,
      proposalSha256: proposal.proposalSha256,
      repositoryCommit: proposal.repositoryCommit,
      environment: 'saved-proposal',
      dryRun: false,
      locked: true,
      proposalPath,
      lockPath,
      databaseWrites: 0,
      publicRequests: 0,
    }, null, 2));
    return;
  }

  const environment = useLive ? 'live' : 'local';
  const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
  const { prisma } = await import('../src/lib/prisma');
  const {
    buildAffiliateHistoricalDatasetInventory,
    collectAffiliateHistoricalDatasetInput,
  } = await import('../src/server/affiliateImports/agentDataset');
  const {
    buildAffiliateGoldCohortCandidates,
    buildAffiliateGoldCohortRevisionCandidates,
    planAffiliateGoldTestCohort,
    assertAffiliateGoldCohortProposalIntegrity,
  } = await import('../src/server/affiliateImports/agentGoldCohort');
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
    let proposalCandidates = candidates;
    let revision: {
      priorProposalPath: string;
      priorCohortId: string;
      removedSourceKey: string;
      replacementSourceKey: string;
    } | null = null;
    if (reviseFromProposalPath && removeSourceKey && replacementSourceKey) {
      const priorProposalPath = path.resolve(reviseFromProposalPath);
      const priorProposal = JSON.parse(
        await fs.readFile(priorProposalPath, 'utf8'),
      ) as unknown;
      const assertProposalIntegrity: (
        value: unknown,
      ) => asserts value is AffiliateGoldCohortProposal = (
        assertAffiliateGoldCohortProposalIntegrity
      );
      assertProposalIntegrity(priorProposal);
      proposalCandidates = buildAffiliateGoldCohortRevisionCandidates({
        proposal: priorProposal,
        currentCandidates: candidates,
        removeSourceKeys: [removeSourceKey],
        replacementSourceKeys: [replacementSourceKey],
      });
      revision = {
        priorProposalPath,
        priorCohortId: priorProposal.cohortId,
        removedSourceKey: removeSourceKey,
        replacementSourceKey,
      };
    }
    const proposal = planAffiliateGoldTestCohort({
      candidates: proposalCandidates,
      repositoryCommit,
      inventorySha256: stableAgentArtifactSha256(inventory.rows),
    });
    const outputRoot = path.resolve(
      readOption('--output-dir')
        ?? path.join('output', 'affiliate-mapping-agent', 'gold-cohorts'),
    );
    const outputDirectory = path.join(outputRoot, proposal.cohortId);
    let proposalPath: string | null = null;
    let lockPath: string | null = null;
    if (writeOutput) {
      await fs.mkdir(outputDirectory, { recursive: true });
      proposalPath = path.join(outputDirectory, 'proposal.json');
      await writeImmutableJson(proposalPath, proposal, 'Cohort proposal');
      if (lockProposal) {
        if (!proposal.readyToLock) {
          throw new Error(`Cannot lock a cohort with deficits: ${proposal.deficits.join(' ')}`);
        }
        const approvedByUserId = readOption('--approved-by');
        if (!approvedByUserId) throw new Error('--approved-by is required with --lock.');
        if (approvedByUserId.includes('@')) {
          throw new Error('--approved-by must be a stable user id, not a direct email address.');
        }
        lockPath = path.join(outputDirectory, 'lock.json');
        await writeCohortLock({
          filePath: lockPath,
          cohortId: proposal.cohortId,
          proposalSha256: proposal.proposalSha256,
          repositoryCommit,
          approvedByUserId,
          domainAssignments: proposal.lockedDomainAssignments,
          platformFamilies: proposal.lockedPlatformFamilies,
        });
      }
    }

    const commandResult = {
      ...proposal,
      revision,
      environment,
      dryRun: !writeOutput,
      locked: Boolean(lockPath),
      proposalPath,
      lockPath,
      databaseWrites: 0,
      publicRequests: 0,
    };
    console.log(JSON.stringify(summaryOnly ? {
      cohortId: proposal.cohortId,
      proposalSha256: proposal.proposalSha256,
      repositoryCommit,
      inventorySha256: proposal.inventorySha256,
      summary: proposal.summary,
      deficits: proposal.deficits,
      readyToLock: proposal.readyToLock,
      reservedForLater: proposal.reservedForLater,
      lockedDomainCount: proposal.lockedDomainAssignments.length,
      revision,
      environment,
      dryRun: !writeOutput,
      locked: Boolean(lockPath),
      proposalPath,
      lockPath,
      databaseWrites: 0,
      publicRequests: 0,
    } : commandResult, null, 2));
    if (!proposal.readyToLock) process.exitCode = 2;
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-plan] failed', error);
  process.exitCode = 1;
});
