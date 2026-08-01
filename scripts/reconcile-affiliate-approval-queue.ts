import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const { reconcileAffiliateApprovalQueue, getAffiliateApprovalQueueStatus } = await import(
    '../src/server/affiliateImports/approvalQueue'
  );
  try {
    const reconciliation = await reconcileAffiliateApprovalQueue();
    const queue = await getAffiliateApprovalQueueStatus();
    console.log(JSON.stringify({ reconciliation, queue }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:reconcile] failed', error);
  process.exitCode = 1;
});
