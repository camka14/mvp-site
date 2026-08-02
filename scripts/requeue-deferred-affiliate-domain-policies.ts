import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const argumentValue = (name: string): string | undefined => (
  process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
);

if (!useLive) throw new Error('Affiliate domain-policy requeue requires --live.');
configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const cutoffText = argumentValue('cutoff');
if (!cutoffText) throw new Error('Affiliate domain-policy requeue requires --cutoff=<ISO timestamp>.');
const cutoff = new Date(cutoffText);
if (Number.isNaN(cutoff.getTime())) throw new Error('--cutoff must be a valid ISO timestamp.');

const expectedText = argumentValue('expected-count');
const expectedCount = expectedText === undefined ? undefined : Number(expectedText);
if (apply && expectedCount === undefined) {
  throw new Error('Affiliate domain-policy requeue --apply requires --expected-count=<count>.');
}

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const { requeueDeferredAffiliateDomainPolicies } = await import(
    '../src/server/affiliateImports/domainPolicyRequeue'
  );
  try {
    const result = await requeueDeferredAffiliateDomainPolicies({
      apply,
      cutoff,
      expectedCount,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:requeue-deferred-policies] failed', error);
  process.exitCode = 1;
});
