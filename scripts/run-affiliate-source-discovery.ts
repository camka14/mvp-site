import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) throw new Error('DATABASE_URL_LIVE is required with --live.');
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readLimit = (): number => {
  const parsed = Number.parseInt(readOption('--limit') ?? '10', 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new Error('--limit must be from 1 to 100.');
  return process.argv.includes('--once') ? 1 : parsed;
};

const readBoundedOption = (name: string, max: number): number | undefined => {
  const raw = readOption(name);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be from 1 to ${max}.`);
  }
  return parsed;
};

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const {
    dryRunAffiliateSourceDiscoveryCampaign,
    processNextAffiliateSourceDiscoveryRun,
    queueAffiliateSourceDiscoveryRun,
    } = await import('../src/server/affiliateImports/sourceDiscovery');
  try {
    const campaignId = readOption('--campaign');
    const maxQueries = readBoundedOption('--max-queries', 50);
    const maxResultsPerQuery = readBoundedOption('--max-results', 20);
    if (process.argv.includes('--dry-run')) {
      if (!campaignId) throw new Error('--campaign is required with --dry-run.');
      console.log(JSON.stringify(await dryRunAffiliateSourceDiscoveryCampaign(campaignId, { maxQueries }), null, 2));
      return;
    }
    let requestedRunId: string | undefined;
    if (campaignId) {
      const queued = await queueAffiliateSourceDiscoveryRun(campaignId, null);
      requestedRunId = queued.id;
    }
    const results = [];
    for (let index = 0; index < readLimit(); index += 1) {
      const result = await processNextAffiliateSourceDiscoveryRun({
        runId: index === 0 ? requestedRunId : undefined,
        workerId: `affiliate-discovery-cli-${process.pid}`,
        maxQueries,
        maxResultsPerQuery,
      });
      if (!result) break;
      results.push(result);
      if (requestedRunId || process.argv.includes('--once')) break;
    }
    console.log(JSON.stringify({
      processed: results.length,
      results: process.argv.includes('--summary')
        ? results.map((entry: any) => ({
          runId: entry.run?.id,
          status: entry.run?.status,
          queries: entry.run?.generatedQueryCount,
          returned: entry.run?.returnedResultCount,
          new: entry.run?.newResultCount,
          duplicates: entry.run?.duplicateCount,
          rejected: entry.run?.rejectedCount,
          intakes: entry.run?.createdIntakeCount,
          error: entry.run?.errorMessage,
        }))
        : results,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:discovery:run] failed', error);
  process.exitCode = 1;
});
