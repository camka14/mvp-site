import dotenv from 'dotenv';
import { summarizeAffiliateMappingQueue } from '../src/server/affiliateImports/sourceMappingQueueStatus';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  try {
    const [intakes, jobs] = await Promise.all([
      (prisma as any).affiliateSourceIntakes.findMany({
        select: { id: true, status: true },
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
    ]);
    console.log(JSON.stringify(summarizeAffiliateMappingQueue({
      intakes,
      jobs,
    }), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:queue-status] failed', error);
  process.exitCode = 1;
});
