import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

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

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const safeTimestamp = (date: Date): string => date.toISOString().replace(/[:.]/g, '-');

const main = async () => {
  const capturedAt = new Date();
  const environment = useLive ? 'live' : 'local';
  const outputRoot = path.resolve(
    readOption('--output-dir')
      ?? path.join('output', 'affiliate-mapping-agent', 'baselines'),
  );
  const outputDirectory = path.join(outputRoot, safeTimestamp(capturedAt));
  const { prisma } = await import('../src/lib/prisma');
  const {
    collectAffiliateMappingAgentBaseline,
  } = await import('../src/server/affiliateImports/agentBaseline');

  try {
    const baseline = await collectAffiliateMappingAgentBaseline({
      prisma: prisma as any,
      environment,
      capturedAt,
    });
    await fs.mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, 'baseline.json');
    await fs.writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      environment,
      readOnly: true,
      outputPath,
      sources: baseline.sources,
      mappings: baseline.mappings,
      intakes: baseline.intakes,
      candidates: baseline.candidates,
      mappingJobs: baseline.mappingJobs,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:baseline] failed', error);
  process.exitCode = 1;
});
