import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import {
  affiliateSourceMatchesIntakeEvidence,
  resolveApprovedAffiliateSetupScript,
  selectAffiliateMappingLiveApprovalCandidates,
} from '../src/server/affiliateImports/codexIngestionApproval';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
if (apply && !useLive) {
  throw new Error('--apply requires --live; local approval writes are not supported.');
}
if (useLive) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const approvedBy = readOption('--approved-by');
if (apply && !approvedBy) {
  throw new Error('--approved-by=<operator> is required with --apply.');
}

const requestedJobId = readOption('--job');
const parsedLimit = Number.parseInt(readOption('--limit') ?? '', 10);
const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const jobs = await db.affiliateSourceMappingJobs.findMany({
      where: {
        status: 'REVIEW_REQUIRED',
        ...(requestedJobId ? { id: requestedJobId } : {}),
      },
      select: {
        id: true,
        intakeId: true,
        status: true,
        resultSummary: true,
        finishedAt: true,
      },
      orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
    });
    const selected = selectAffiliateMappingLiveApprovalCandidates(jobs);
    const candidates = limit ? selected.approvable.slice(0, limit) : selected.approvable;
    const preview = {
      environment: useLive ? 'live' : 'local',
      apply,
      approvable: selected.approvable.length,
      manualReview: selected.manualReview.length,
      selected: candidates.length,
      jobs: candidates.map((candidate) => ({
        jobId: candidate.jobId,
        intakeId: candidate.intakeId,
        sourceKey: candidate.result.sourceKey,
        setupScript: candidate.setupScript,
        logoDisposition: candidate.result.logoDisposition,
        candidateCount: candidate.result.candidateCount,
      })),
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const repositoryRoot = process.cwd();
    const tsxExecutable = path.join(repositoryRoot, 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsxExecutable)) {
      throw new Error(`tsx executable was not found at ${tsxExecutable}`);
    }
    const applied: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      const setupScript = resolveApprovedAffiliateSetupScript(
        repositoryRoot,
        candidate.setupScript,
      );
      if (!fs.existsSync(setupScript)) {
        throw new Error(`Approved setup script is missing: ${candidate.setupScript}`);
      }
      const child = spawnSync(tsxExecutable, [setupScript, '--live', '--scrape'], {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'inherit',
      });
      if (child.error) throw child.error;
      if (child.status !== 0) {
        throw new Error(
          `Approved setup failed for ${candidate.result.sourceKey} with exit ${String(child.status)}.`,
        );
      }

      const sources = await db.affiliateScrapeSources.findMany({
        select: {
          id: true,
          sourceKey: true,
          organizationId: true,
          activeMappingId: true,
          autoScrapeEnabled: true,
          metadata: true,
        },
      });
      const matchedSources = sources.filter((source: any) => (
        affiliateSourceMatchesIntakeEvidence(
          source.metadata,
          { intakeId: candidate.intakeId, intakeSourceKey: candidate.result.sourceKey },
        )
      ));
      if (matchedSources.length !== 1) {
        throw new Error(
          `Expected one evidence-matched live source for ${candidate.result.sourceKey}; found ${matchedSources.length}.`,
        );
      }
      const source = matchedSources[0];
      if (!source.organizationId || !source.activeMappingId) {
        throw new Error(`Live source ${source.id} is missing its organization or active mapping.`);
      }
      if (source.autoScrapeEnabled) {
        throw new Error(`Live source ${source.id} unexpectedly enabled automatic scraping.`);
      }
      const [organization, mapping, latestRun] = await Promise.all([
        db.organizations.findUnique({
          where: { id: source.organizationId },
          select: { id: true, logoId: true, status: true, publicPageEnabled: true },
        }),
        db.affiliateScrapeMappings.findUnique({
          where: { id: source.activeMappingId },
          select: { id: true, sourceId: true, isActive: true, validatedAt: true },
        }),
        db.affiliateScrapeRuns.findFirst({
          where: { sourceId: source.id },
          orderBy: { startedAt: 'desc' },
          select: { id: true, status: true },
        }),
      ]);
      if (!organization?.logoId) {
        throw new Error(`Approved live organization ${source.organizationId} has no official logo.`);
      }
      if (organization.status !== 'UNLISTED' || organization.publicPageEnabled) {
        throw new Error(`Approved live organization ${source.organizationId} was published unexpectedly.`);
      }
      if (!mapping || mapping.sourceId !== source.id || !mapping.isActive || mapping.validatedAt) {
        throw new Error(`Live mapping ${source.activeMappingId} failed its disabled-review checks.`);
      }
      if (!latestRun || latestRun.status !== 'SUCCEEDED') {
        throw new Error(`Live review scrape did not succeed for source ${source.id}.`);
      }
      const candidateCount = await db.affiliateImportCandidates.count({
        where: { runId: latestRun.id },
      });
      if (candidateCount !== candidate.result.candidateCount) {
        throw new Error(
          `Live candidate count for ${source.id} was ${candidateCount}; expected ${candidate.result.candidateCount}.`,
        );
      }

      const approvedAt = new Date();
      const updated = await db.$transaction(async (tx: any) => {
        const jobUpdate = await tx.affiliateSourceMappingJobs.updateMany({
          where: { id: candidate.jobId, status: 'REVIEW_REQUIRED' },
          data: {
            status: 'APPROVED',
            finishedAt: approvedAt,
            resultSummary: {
              ...candidate.resultEnvelope,
              liveApproval: {
                approvedAt: approvedAt.toISOString(),
                approvedBy,
                sourceId: source.id,
                organizationId: organization.id,
                mappingId: mapping.id,
                reviewRunId: latestRun.id,
                candidateCount,
                autoScrapeEnabled: false,
                mappingValidatedAt: null,
                publicationStatus: 'UNPUBLISHED',
              },
            },
          },
        });
        if (jobUpdate.count !== 1) {
          throw new Error(`Mapping job ${candidate.jobId} was no longer review-required.`);
        }
        await tx.affiliateSourceIntakes.update({
          where: { id: candidate.intakeId },
          data: { status: 'PROMOTED' },
        });
        return jobUpdate.count;
      });
      applied.push({
        jobId: candidate.jobId,
        sourceKey: candidate.result.sourceKey,
        sourceId: source.id,
        organizationId: organization.id,
        mappingId: mapping.id,
        reviewRunId: latestRun.id,
        candidateCount,
        updated,
      });
    }

    console.log(JSON.stringify({ ...preview, appliedCount: applied.length, applied }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:apply-approved-live] failed', error);
  process.exitCode = 1;
});
