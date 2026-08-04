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
  const agentId = readOption('--worker') ?? `coverage-agent-${process.pid}`;
  const { prisma } = await import('../src/lib/prisma');
  const { claimNextAffiliateCoverageJob } = await import('../src/server/affiliateImports/coverageAgentQueue');
  try {
    const claim = await claimNextAffiliateCoverageJob({ agentId });
    console.log(JSON.stringify(claim ? { claimed: true, ...claim } : { claimed: false }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:claim] failed', error);
  process.exitCode = 1;
});
