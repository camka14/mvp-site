import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { preserveAffiliateDisposableDatabaseUrl } from '../src/server/affiliateImports/producerPackageEvidence';
import { resolvePrismaPgPoolConfig } from '../src/lib/prismaConfig';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const COVERAGE_LOOP_LOCK_ID = 4201072132;
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_AGENT_ID = 'codex-luna-coverage-vm-1';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const boundedIntervalSeconds = (): number => {
  const parsed = Number(readOption('--interval-seconds') ?? DEFAULT_INTERVAL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_SECONDS;
  return Math.max(60, Math.min(3_600, Math.floor(parsed)));
};

const useLive = process.argv.includes('--live');
if (useLive) {
  preserveAffiliateDisposableDatabaseUrl();
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

const runChildGoal = async (options: {
  agentId: string;
  codexBin?: string;
  containerIsolated: boolean;
}) => {
  const executable = path.resolve('node_modules/.bin/tsx');
  const args = [
    path.resolve('scripts/run-affiliate-coverage-codex-goal.ts'),
    ...(useLive ? ['--live'] : []),
    `--worker=${options.agentId}`,
    ...(options.codexBin ? [`--codex-bin=${options.codexBin}`] : []),
    ...(options.containerIsolated ? ['--container-isolated'] : []),
  ];
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Affiliate coverage goal exited from signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`Affiliate coverage goal exited with code ${exitCode}.`);
};

const main = async () => {
  const agentId = readOption('--worker')
    ?? process.env.AFFILIATE_COVERAGE_AGENT_ID?.trim()
    ?? DEFAULT_AGENT_ID;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(agentId)) {
    throw new Error('Coverage loop agent id is invalid.');
  }
  const intervalMs = boundedIntervalSeconds() * 1_000;
  const runOnce = process.argv.includes('--once');
  const codexBin = readOption('--codex-bin') ?? process.env.CODEX_CLI_BIN?.trim();
  const containerIsolated = process.argv.includes('--container-isolated');
  const { max: _poolMax, ...clientConfig } = resolvePrismaPgPoolConfig();
  const lockClient = new Client(clientConfig);
  await lockClient.connect();
  const lockResult = await lockClient.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [COVERAGE_LOOP_LOCK_ID],
  );
  if (!lockResult.rows.some((row) => row.locked === true)) {
    console.log(JSON.stringify({ lockAcquired: false, launchedGoal: false }, null, 2));
    await lockClient.end();
    return;
  }

  const { prisma } = await import('../src/lib/prisma');
  const {
    reconcileAffiliateCoverageJobs,
    summarizeAffiliateCoverageQueue,
  } = await import('../src/server/affiliateImports/coverageAgentQueue');
  const { runAffiliateCoverageLoopCycle } = await import(
    '../src/server/affiliateImports/coverageAgentLoop'
  );
  try {
    do {
      const cycle = await runAffiliateCoverageLoopCycle({
        reconcile: reconcileAffiliateCoverageJobs,
        getStatus: summarizeAffiliateCoverageQueue,
        launchGoal: () => runChildGoal({ agentId, codexBin, containerIsolated }),
      });
      console.log(JSON.stringify({
        lockAcquired: true,
        agentId,
        launchedGoal: cycle.launchedGoal,
        claimableBefore: cycle.queueBeforeLaunch.claimableJobs,
        claimableAfter: cycle.queueAfterLaunch.claimableJobs,
        statusCounts: cycle.queueAfterLaunch.statusCounts,
      }, null, 2));
      if (runOnce) break;
      if (cycle.queueAfterLaunch.claimableJobs > 0) continue;
      await sleep(intervalMs);
    } while (true);
  } finally {
    await (prisma as any).$disconnect();
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [COVERAGE_LOOP_LOCK_ID]);
    } finally {
      await lockClient.end();
    }
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:loop] failed', error);
  process.exitCode = 1;
});
