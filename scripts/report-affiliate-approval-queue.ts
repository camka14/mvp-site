import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const { getAffiliateApprovalQueueStatus } = await import(
    '../src/server/affiliateImports/approvalQueue'
  );
  try {
    console.log(JSON.stringify(await getAffiliateApprovalQueueStatus(), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:queue-status] failed', error);
  process.exitCode = 1;
});
