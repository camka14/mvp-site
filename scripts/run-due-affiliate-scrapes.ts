import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const parseLimit = (): number | undefined => {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  if (!limitArg) return undefined;
  const parsed = Number.parseInt(limitArg.slice('--limit='.length), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const main = async () => {
  const { runDueAffiliateScrapes } = await import('../src/server/affiliateImports/scheduledScrapes');
  const dryRun = process.argv.includes('--dry-run');
  const result = await runDueAffiliateScrapes({
    dryRun,
    limit: parseLimit(),
    sendSummary: !process.argv.includes('--no-email'),
  });
  console.log(JSON.stringify({
    startedAt: result.startedAt.toISOString(),
    finishedAt: result.finishedAt.toISOString(),
    lockAcquired: result.lockAcquired,
    dryRun: result.dryRun,
    dueSourceCount: result.dueSourceCount,
    lightweightSourceCount: result.lightweightSourceCount,
    emailSent: result.emailSent,
    results: result.results,
    lightweightResults: result.lightweightResults,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:scrape:due] failed', error);
  process.exitCode = 1;
});
