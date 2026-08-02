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
  const approvalJobId = readOption('--approval');
  const mappingJobId = readOption('--job');
  const reviewerId = readOption('--reviewer');
  const pageUrl = readOption('--page-url');
  const logoUrl = readOption('--logo-url');
  if (!approvalJobId || !mappingJobId || !reviewerId || !pageUrl || !logoUrl) {
    throw new Error('--approval, --job, --reviewer, --page-url, and --logo-url are required.');
  }
  const { prisma } = await import('../src/lib/prisma');
  const { captureAffiliateApprovalLogoEvidence } = await import(
    '../src/server/affiliateImports/approvalLogoEvidence'
  );
  try {
    const result = await captureAffiliateApprovalLogoEvidence({
      approvalJobId,
      mappingJobId,
      reviewerId,
      pageUrl,
      logoUrl,
    });
    console.log(JSON.stringify({
      schemaVersion: 1,
      environment: useLive ? 'live' : 'local',
      ...result,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:logo-evidence] failed', error);
  process.exitCode = 1;
});
