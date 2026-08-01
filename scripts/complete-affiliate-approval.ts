import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

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
  process.env.STORAGE_PROVIDER = 'spaces';
}

const main = async () => {
  const approvalJobId = readOption('--job');
  const resultPath = readOption('--result');
  if (!approvalJobId || !resultPath) throw new Error('--job and --result are required.');
  const absoluteResultPath = path.resolve(resultPath);
  const file = await fs.readFile(absoluteResultPath, 'utf8');
  if (Buffer.byteLength(file, 'utf8') > 1024 * 1024) {
    throw new Error('Affiliate approval result JSON must be 1 MiB or smaller.');
  }
  const { affiliateApprovalResultSchema } = await import(
    '../src/server/affiliateImports/approvalResult'
  );
  const result = affiliateApprovalResultSchema.parse(JSON.parse(file));
  if (result.approvalJobId !== approvalJobId) {
    throw new Error('Approval result job id does not match --job.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const { completeAffiliateApproval } = await import(
    '../src/server/affiliateImports/approvalQueue'
  );
  try {
    const updated = await completeAffiliateApproval(result, {
      applyMappingPackage: async (mappingJobId, reviewerId, approvalResult) => {
        if (!useLive) {
          throw new Error('Mapping package approval requires --live.');
        }
        execFileSync(path.resolve('node_modules/.bin/tsx'), [
          path.resolve('scripts/apply-approved-affiliate-mapping-jobs.ts'),
          '--live',
          '--apply',
          `--job=${mappingJobId}`,
          `--approved-by=${reviewerId}`,
          `--approval-job=${approvalResult.approvalJobId}`,
        ], {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'inherit',
        });
      },
    });
    console.log(JSON.stringify({
      approvalJobId: updated.id,
      subjectType: updated.subjectType,
      subjectKey: updated.subjectKey,
      status: updated.status,
      resultPath: absoluteResultPath,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:complete] failed', error);
  process.exitCode = 1;
});
