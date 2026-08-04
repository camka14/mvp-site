import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const { reconcileAffiliateCoverageJobs } = await import('../src/server/affiliateImports/coverageAgentQueue');
  try {
    console.log(JSON.stringify(await reconcileAffiliateCoverageJobs(), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:reconcile] failed', error);
  process.exitCode = 1;
});
