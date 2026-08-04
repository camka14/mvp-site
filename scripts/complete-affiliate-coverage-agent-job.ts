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
  const resultPath = readOption('--result');
  if (!resultPath) throw new Error('--result=<coverage-result-json> is required.');
  const result = JSON.parse(await readFile(path.resolve(resultPath), 'utf8'));
  const { prisma } = await import('../src/lib/prisma');
  const { completeAffiliateCoverageJob } = await import('../src/server/affiliateImports/coverageAgentQueue');
  try {
    console.log(JSON.stringify(await completeAffiliateCoverageJob(result), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:complete] failed', error);
  process.exitCode = 1;
});
