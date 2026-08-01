import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { summarizeAffiliateMappingQueue } from '../src/server/affiliateImports/sourceMappingQueueStatus';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  try {
    const [intakes, jobs, captureRuns] = await Promise.all([
      (prisma as any).affiliateSourceIntakes.findMany({
        select: { id: true, status: true, complianceStatus: true },
        orderBy: { id: 'asc' },
      }),
      (prisma as any).affiliateSourceMappingJobs.findMany({
        select: {
          id: true,
          intakeId: true,
          status: true,
          leaseExpiresAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      (prisma as any).affiliateSourceIntakeRuns.findMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true, intakeId: true, status: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    console.log(JSON.stringify(summarizeAffiliateMappingQueue({
      intakes,
      jobs,
      captureRuns,
    }), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:queue-status] failed', error);
  process.exitCode = 1;
});
