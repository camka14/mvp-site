import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import {
  CODEX_AFFILIATE_INGESTION_FAST_MODE,
  CODEX_AFFILIATE_INGESTION_MODEL,
  CODEX_AFFILIATE_INGESTION_REASONING_EFFORT,
  CODEX_AFFILIATE_INGESTION_SERVICE_TIER,
} from '../src/server/affiliateImports/codexCliGoal';
import { codexAffiliateIngestionResultSchema } from '../src/server/affiliateImports/codexIngestionResult';
import {
  inspectAffiliateDisposableReviewScrapes,
  preserveAffiliateDisposableDatabaseUrl,
  resolveAffiliateDisposableDatabaseUrl,
} from '../src/server/affiliateImports/producerPackageEvidence';
import { inspectAffiliateEventDivisionQuality } from '../src/server/affiliateImports/eventDivisionQuality';
import { inspectAffiliateSportQuality } from '../src/server/affiliateImports/sportQuality';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const useLive = process.argv.includes('--live');
if (useLive) {
  preserveAffiliateDisposableDatabaseUrl();
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const jobId = readOption('--job');
  const resultPath = readOption('--result');
  if (!jobId || !resultPath) {
    throw new Error('--job and --result are required.');
  }
  const absoluteResultPath = path.resolve(resultPath);
  const file = await fs.readFile(absoluteResultPath, 'utf8');
  if (Buffer.byteLength(file, 'utf8') > 1024 * 1024) {
    throw new Error('Ingestion result JSON must be 1 MiB or smaller.');
  }
  const result = codexAffiliateIngestionResultSchema.parse(JSON.parse(file));
  if (result.jobId !== jobId) {
    throw new Error('Result job id does not match --job.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const { finishAffiliateSourceMappingClaim } = await import(
    '../src/server/affiliateImports/sourceMappingQueue'
  );
  let packageIdentity: { sourceId: string; mappingId: string } | null = null;
  try {
    const job = await (prisma as any).affiliateSourceMappingJobs.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new Error('Affiliate source mapping job not found.');
    if (job.status !== 'CLAIMED') {
      throw new Error(`Mapping job must be CLAIMED, received ${job.status}.`);
    }
    if (job.intakeId !== result.intakeId) {
      throw new Error('Result intake id does not match the claimed mapping job.');
    }
    if (job.workerId !== result.workerId) {
      throw new Error('Result worker id does not own the claimed mapping job.');
    }
    const intake = await (prisma as any).affiliateSourceIntakes.findUnique({
      where: { id: result.intakeId },
      select: { sourceKey: true },
    });
    if (!intake) {
      throw new Error('Claimed affiliate source intake not found.');
    }
    if (intake.sourceKey !== result.sourceKey) {
      throw new Error('Result source key does not match the claimed intake.');
    }
    if (result.status === 'REVIEW_REQUIRED') {
      const disposable = new Client({ connectionString: resolveAffiliateDisposableDatabaseUrl() });
      try {
        await disposable.connect();
        const reviewEvidence = await inspectAffiliateDisposableReviewScrapes({
          queryable: disposable,
          result,
        });
        if (!reviewEvidence.mappingId) {
          throw new Error('REVIEW_REQUIRED mapping results must identify one exact mapping.');
        }
        packageIdentity = {
          sourceId: reviewEvidence.sourceId,
          mappingId: reviewEvidence.mappingId,
        };
        const divisionQuality = await inspectAffiliateEventDivisionQuality({
          queryable: disposable,
          sourceId: reviewEvidence.sourceId,
        });
        if (!divisionQuality.passed) {
          const issueSummary = divisionQuality.issues
            .slice(0, 10)
            .map((issue) => `${issue.code}:${issue.candidateId}`)
            .join(', ');
          throw new Error(
            `REVIEW_REQUIRED mapping results require valid divisions for every event. ${issueSummary}`,
          );
        }
        const sportQuality = await inspectAffiliateSportQuality({
          queryable: disposable,
          sourceId: reviewEvidence.sourceId,
        });
        if (!sportQuality.passed) {
          const issueSummary = sportQuality.issues
            .slice(0, 10)
            .map((issue) => `${issue.code}:${issue.subjectType}:${issue.subjectId}`)
            .join(', ');
          throw new Error(
            `REVIEW_REQUIRED mapping results require exact current catalog sports for every candidate and source organization. ${issueSummary}`,
          );
        }
      } finally {
        await disposable.end().catch(() => undefined);
      }
    }
    if (result.commit) {
      execFileSync('git', ['rev-parse', '--verify', `${result.commit}^{commit}`], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (head !== result.commit) {
        throw new Error('Result commit must be the current source-scoped HEAD.');
      }
    }
    if (result.branch) {
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (branch !== result.branch) {
        throw new Error('Result branch does not match the current Git branch.');
      }
    }
    const updated = await finishAffiliateSourceMappingClaim({
      jobId,
      status: result.status,
      sourceId: packageIdentity?.sourceId,
      mappingId: packageIdentity?.mappingId,
      branch: result.branch,
      commit: result.commit,
      resultSummary: {
        schemaVersion: 1,
        agentProvider: 'codex-cli',
        model: CODEX_AFFILIATE_INGESTION_MODEL,
        reasoningEffort: CODEX_AFFILIATE_INGESTION_REASONING_EFFORT,
        serviceTier: CODEX_AFFILIATE_INGESTION_SERVICE_TIER,
        fastMode: CODEX_AFFILIATE_INGESTION_FAST_MODE,
        resultPath: path.relative(process.cwd(), absoluteResultPath),
        result,
        authority: result.status === 'REVIEW_REQUIRED'
          ? 'review-required'
          : result.status === 'EXPANDED'
            ? 'directory-expanded'
            : result.status === 'HUMAN_REVIEW_REQUIRED'
              ? 'human-review-required'
              : 'terminal-failure',
        ...(result.status === 'HUMAN_REVIEW_REQUIRED' && result.humanReviewRequired
          ? { humanReviewRequired: result.humanReviewRequired }
          : {}),
      },
      errorMessage: result.errorMessage,
    });
    console.log(JSON.stringify({
      jobId: updated.id,
      intakeId: updated.intakeId,
      status: updated.status,
      resultPath: absoluteResultPath,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:complete] failed', error);
  process.exitCode = 1;
});
