import dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import path from 'path';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) throw new Error('DATABASE_URL_LIVE is required with --live.');
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const main = async () => {
  const workerId = readOption('--worker') ?? `affiliate-mapping-cli-${process.pid}`;
  const intakeId = readOption('--intake');
  const { prisma } = await import('../src/lib/prisma');
  const {
    claimNextAffiliateSourceIntakeForMapping,
    releaseAffiliateSourceMappingClaim,
  } = await import('../src/server/affiliateImports/sourceMappingQueue');
  try {
    if (process.argv.includes('--release')) {
      if (!intakeId) throw new Error('--intake is required with --release.');
      console.log(JSON.stringify(await releaseAffiliateSourceMappingClaim(intakeId, workerId), null, 2));
      return;
    }
    const claim = await claimNextAffiliateSourceIntakeForMapping({ workerId, intakeId });
    if (!claim) {
      console.log(JSON.stringify({ claimed: false }, null, 2));
      return;
    }
    const args = [
      path.resolve('scripts/export-affiliate-source-intake.ts'),
      '--source-key',
      claim.sourceKey,
      ...(useLive ? ['--live'] : []),
    ];
    const exported = execFileSync(path.resolve('node_modules/.bin/tsx'), args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    });
    console.log(JSON.stringify({
      claimed: true,
      ...claim,
      export: JSON.parse(exported),
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:claim] failed', error);
  process.exitCode = 1;
});
