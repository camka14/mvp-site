import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const MAX_INPUT_BYTES = 1024 * 1024;

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const useLive = process.argv.includes('--live');
if (useLive) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const inputPath = readOption('--input');
  const resultPath = readOption('--result');
  const jobId = readOption('--job');
  const workerId = readOption('--worker');
  if (!inputPath || !resultPath || !jobId || !workerId) {
    throw new Error('--input, --result, --job, and --worker are required.');
  }

  const absoluteInputPath = path.resolve(inputPath);
  const file = await fs.readFile(absoluteInputPath, 'utf8');
  if (Buffer.byteLength(file, 'utf8') > MAX_INPUT_BYTES) {
    throw new Error('Affiliate URL proposal JSON must be 1 MiB or smaller.');
  }
  const { affiliateSourceUrlProposalBatchSchema } = await import(
    '../src/server/affiliateImports/sourceUrlIntake'
  );
  const batch = affiliateSourceUrlProposalBatchSchema.parse(JSON.parse(file));
  if (batch.parentJobId !== jobId) {
    throw new Error('Proposal parent job id does not match --job.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const { enqueueAffiliateSourceUrlProposals } = await import(
    '../src/server/affiliateImports/sourceUrlIntake'
  );
  try {
    const job = await (prisma as any).affiliateSourceMappingJobs.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        intakeId: true,
        status: true,
        workerId: true,
        leaseExpiresAt: true,
      },
    });
    if (!job) throw new Error('Affiliate source mapping job not found.');
    if (job.status !== 'CLAIMED') {
      throw new Error(`Mapping job must be CLAIMED, received ${job.status}.`);
    }
    if (job.workerId !== workerId) {
      throw new Error('The supplied worker does not own the claimed mapping job.');
    }
    if (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= Date.now()) {
      throw new Error('The mapping job lease has expired.');
    }
    if (job.intakeId !== batch.parentIntakeId) {
      throw new Error('Proposal parent intake id does not match the claimed mapping job.');
    }

    const parentIntake = await (prisma as any).affiliateSourceIntakes.findUnique({
      where: { id: job.intakeId },
      select: {
        sourceKey: true,
        createdByUserId: true,
        complianceReviewedByUserId: true,
      },
    });
    if (!parentIntake) throw new Error('Claimed parent intake not found.');
    const userId = parentIntake.createdByUserId
      ?? parentIntake.complianceReviewedByUserId
      ?? 'affiliate-directory-expansion';
    const summary = await enqueueAffiliateSourceUrlProposals(batch, userId);
    const absoluteResultPath = path.resolve(resultPath);
    const { buildCodexAffiliateDirectoryExpansionResult } = await import(
      '../src/server/affiliateImports/codexIngestionResult'
    );
    const completionResult = buildCodexAffiliateDirectoryExpansionResult({
      jobId,
      intakeId: batch.parentIntakeId,
      sourceKey: parentIntake.sourceKey,
      workerId,
      directoryExpansion: {
        submitted: summary.submitted,
        created: summary.created,
        reused: summary.reused,
        captureQueued: summary.captureQueued,
        reviewRequired: summary.reviewRequired,
        blocked: summary.blocked,
        duplicate: summary.duplicate,
        rejected: summary.rejected,
      },
      warnings: summary.outcomes
        .filter((outcome) => outcome.action === 'REJECTED' && outcome.reason)
        .map((outcome) => `${outcome.inputUrl ?? 'unknown URL'}: ${outcome.reason}`),
    });
    await fs.mkdir(path.dirname(absoluteResultPath), { recursive: true });
    await fs.writeFile(absoluteResultPath, `${JSON.stringify(completionResult, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ...summary,
      inputPath: absoluteInputPath,
      resultPath: absoluteResultPath,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:intakes:enqueue-urls] failed', error);
  process.exitCode = 1;
});
