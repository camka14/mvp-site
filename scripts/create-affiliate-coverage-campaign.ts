import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import path from 'path';
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
if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const main = async () => {
  const inputPath = readOption('--input');
  if (!inputPath) throw new Error('--input=<campaign-proposal-json> is required.');
  const input = JSON.parse(await readFile(path.resolve(inputPath), 'utf8'));
  const { prisma } = await import('../src/lib/prisma');
  const { createAffiliateCoverageCampaign } = await import('../src/server/affiliateImports/coverageAgentQueue');
  try {
    console.log(JSON.stringify(await createAffiliateCoverageCampaign(input), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:create-campaign] failed', error);
  process.exitCode = 1;
});
