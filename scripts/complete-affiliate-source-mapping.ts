import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { codexAffiliateIngestionResultSchema } from '../src/server/affiliateImports/codexIngestionResult';

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
      branch: result.branch,
      commit: result.commit,
      resultSummary: {
        schemaVersion: 1,
        agentProvider: 'codex-cli',
        model: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        resultPath: path.relative(process.cwd(), absoluteResultPath),
        result,
        authority: result.status === 'REVIEW_REQUIRED'
          ? 'review-required'
          : 'terminal-failure',
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
