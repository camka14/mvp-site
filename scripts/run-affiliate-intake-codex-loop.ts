import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import {
  parseAffiliateMappingClaimOutput,
  parseAffiliateMapperLoopIntervalSeconds,
  runAffiliateIntakeCodexLoop,
  type AffiliateMappingClaim,
} from '../src/server/affiliateImports/affiliateIntakeCodexLoop';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const execFileAsync = promisify(execFile);

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const workerId = readOption('--worker') ?? `codex-luna-${process.pid}`;
const useLive = process.argv.includes('--live');
const containerIsolated = process.argv.includes('--container-isolated');
const codexBin = readOption('--codex-bin');
const intervalSeconds = parseAffiliateMapperLoopIntervalSeconds(
  readOption('--interval-seconds') ?? process.env.AFFILIATE_MAPPING_LOOP_INTERVAL_SECONDS,
);
const tsxExecutable = path.resolve('node_modules/.bin/tsx');
const claimScript = path.resolve('scripts/claim-affiliate-source-mapping.ts');
const queueStatusScript = path.resolve('scripts/report-affiliate-mapping-queue.ts');
const intakeProcessScript = path.resolve('scripts/process-affiliate-source-intakes.ts');
const goalScript = path.resolve('scripts/run-affiliate-intake-codex-goal.ts');

const runClaim = async (intakeId?: string): Promise<ReturnType<typeof parseAffiliateMappingClaimOutput>> => {
  const args = [
    claimScript,
    '--no-export',
    ...(useLive ? ['--live'] : []),
    `--worker=${workerId}`,
    ...(intakeId ? [`--intake=${intakeId}`] : []),
  ];
  const result = await execFileAsync(tsxExecutable, args, {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 256 * 1024,
  });
  return parseAffiliateMappingClaimOutput(result.stdout);
};

type QueueStatusForReconciliation = {
  claimableJobs: number;
  eligibleReadyIntakesWithoutJob: number;
  readyIntakeIdsWithoutJob: string[];
  queuedCaptureRuns: number;
  runningCaptureRuns: number;
};

const parseQueueStatus = (output: string): QueueStatusForReconciliation => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Affiliate mapping queue-status command returned invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Affiliate mapping queue-status command returned an invalid result.');
  }
  const result = parsed as Record<string, unknown>;
  const numericFields = [
    'claimableJobs',
    'eligibleReadyIntakesWithoutJob',
    'queuedCaptureRuns',
    'runningCaptureRuns',
  ];
  for (const field of numericFields) {
    if (typeof result[field] !== 'number' || !Number.isInteger(result[field]) || result[field] < 0) {
      throw new Error(`Affiliate mapping queue-status result is missing ${field}.`);
    }
  }
  if (!Array.isArray(result.readyIntakeIdsWithoutJob)
    || result.readyIntakeIdsWithoutJob.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Affiliate mapping queue-status result has invalid ready intake IDs.');
  }
  return {
    claimableJobs: result.claimableJobs as number,
    eligibleReadyIntakesWithoutJob: result.eligibleReadyIntakesWithoutJob as number,
    readyIntakeIdsWithoutJob: result.readyIntakeIdsWithoutJob as string[],
    queuedCaptureRuns: result.queuedCaptureRuns as number,
    runningCaptureRuns: result.runningCaptureRuns as number,
  };
};

const runQueueStatus = async (): Promise<QueueStatusForReconciliation> => {
  const result = await execFileAsync(tsxExecutable, [
    queueStatusScript,
    ...(useLive ? ['--live'] : []),
  ], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 256 * 1024,
  });
  return parseQueueStatus(result.stdout);
};

const reconcilePendingWork = async () => {
  let status = await runQueueStatus();
  if (status.queuedCaptureRuns > 0 || status.runningCaptureRuns > 0) {
    await execFileAsync(tsxExecutable, [
      intakeProcessScript,
      ...(useLive ? ['--live'] : []),
      '--limit=25',
      '--summary',
    ], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 256 * 1024,
    });
    status = await runQueueStatus();
  }

  const orphanIntakeId = status.readyIntakeIdsWithoutJob[0];
  if (orphanIntakeId) {
    const claim = await runClaim(orphanIntakeId);
    if (claim.claimed) return { claim, hasPendingWork: false };
    status = await runQueueStatus();
  }

  if (status.claimableJobs > 0) {
    const claim = await runClaim();
    if (claim.claimed) return { claim, hasPendingWork: false };
    status = await runQueueStatus();
  }

  return {
    claim: null,
    hasPendingWork: (
      status.eligibleReadyIntakesWithoutJob > 0
      || status.queuedCaptureRuns > 0
      || status.runningCaptureRuns > 0
    ),
  };
};

const waitForGoal = (claim: AffiliateMappingClaim): Promise<void> => new Promise((resolve, reject) => {
  const args = [
    goalScript,
    ...(useLive ? ['--live'] : []),
    ...(containerIsolated ? ['--container-isolated'] : []),
    `--worker=${workerId}`,
    ...(codexBin ? [`--codex-bin=${codexBin}`] : []),
  ];
  console.log(JSON.stringify({
    event: 'affiliate-mapping-goal-start',
    jobId: claim.jobId,
    intakeId: claim.intakeId,
    sourceKey: claim.sourceKey,
    resumed: claim.resumed === true,
  }));
  const child = spawn(tsxExecutable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Affiliate mapping goal exited from signal ${signal}.`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`Affiliate mapping goal exited with code ${code ?? 1}.`));
      return;
    }
    resolve();
  });
});

const main = async () => {
  console.log(JSON.stringify({
    event: 'affiliate-mapping-loop-start',
    workerId,
    useLive,
    containerIsolated,
    intervalSeconds,
  }));
  await runAffiliateIntakeCodexLoop(
    { intervalSeconds },
    {
      claim: runClaim,
      reconcile: reconcilePendingWork,
      runGoal: waitForGoal,
      onIdle: (idleIntervalSeconds) => {
        console.log(JSON.stringify({
          event: 'affiliate-mapping-loop-idle',
          workerId,
          retryInSeconds: idleIntervalSeconds,
        }));
      },
      onPendingWork: (retryIntervalSeconds) => {
        console.log(JSON.stringify({
          event: 'affiliate-mapping-loop-pending-work',
          workerId,
          retryInSeconds: retryIntervalSeconds,
        }));
      },
    },
  );
};

main().catch((error) => {
  console.error('[affiliate:intakes:codex-loop] failed', error);
  process.exitCode = 1;
});
