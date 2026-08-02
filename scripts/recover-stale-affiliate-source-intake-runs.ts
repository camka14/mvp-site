import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const readOptions = (name: string): string[] => process.argv.flatMap((argument, index) => {
  if (argument.startsWith(`${name}=`)) return [argument.slice(name.length + 1).trim()].filter(Boolean);
  if (argument === name) return [process.argv[index + 1]?.trim()].filter(Boolean) as string[];
  return [];
});

const main = async () => {
  if (apply && !useLive) {
    throw new Error('Stale intake recovery writes require both --live and --apply.');
  }
  const runIds = readOptions('--run').flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const maxAgeMinutesOption = readOptions('--max-age-minutes')[0];
  const maxAgeMinutes = maxAgeMinutesOption
    ? Number.parseInt(maxAgeMinutesOption, 10)
    : undefined;
  if (maxAgeMinutes !== undefined && (!Number.isInteger(maxAgeMinutes) || maxAgeMinutes < 20)) {
    throw new Error('--max-age-minutes must be an integer of at least 20.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const {
    findStaleAffiliateSourceIntakeRuns,
    recoverStaleAffiliateSourceIntakeRuns,
  } = await import('../src/server/affiliateImports/sourceIntake');
  try {
    const options = {
      ...(runIds.length ? { runIds } : {}),
      ...(maxAgeMinutes !== undefined ? { maxAgeMs: maxAgeMinutes * 60 * 1000 } : {}),
    };
    const staleRuns = await findStaleAffiliateSourceIntakeRuns(options);
    const recovered = apply
      ? await recoverStaleAffiliateSourceIntakeRuns(options)
      : [];
    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'PREVIEW',
      useLive,
      staleRuns: staleRuns.map((run) => ({
        id: run.id,
        intakeId: run.intakeId,
        workerId: run.workerId,
        startedAt: run.startedAt,
        claimedAt: run.claimedAt,
        attemptCount: run.attemptCount,
      })),
      recovered,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:intakes:recover-stale] failed', error);
  process.exitCode = 1;
});
