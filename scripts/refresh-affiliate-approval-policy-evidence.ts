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

if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
}

const main = async () => {
  const policyKey = readOption('--policy');
  if (!policyKey) throw new Error('--policy=<policy-key> is required.');
  const { prisma } = await import('../src/lib/prisma');
  const { refreshAffiliateApprovalPolicyEvidence } = await import(
    '../src/server/affiliateImports/approvalPolicyEvidence'
  );
  try {
    const result = await refreshAffiliateApprovalPolicyEvidence(policyKey);
    console.log(JSON.stringify(result.approvalEvidence, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:policy-evidence] failed', error);
  process.exitCode = 1;
});
