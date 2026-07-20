import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
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

const applyTimeoutOption = (option: string, envName: string): void => {
  const value = readOption(option);
  if (value) process.env[envName] = value;
};

applyTimeoutOption('--firecrawl-timeout', 'FIRECRAWL_TIMEOUT_MS');
applyTimeoutOption('--robots-timeout', 'AFFILIATE_INTAKE_ROBOTS_TIMEOUT_MS');

const parseLimit = (): number => {
  const raw = readOption('--limit');
  if (!raw) return process.argv.includes('--once') ? 1 : 25;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('--limit must be an integer from 1 to 100.');
  }
  return value;
};

const main = async () => {
  const { processNextAffiliateSourceIntakeRun } = await import(
    '../src/server/affiliateImports/sourceIntake'
  );
  const limit = parseLimit();
  const requestedRunId = readOption('--run-id');
  const results: unknown[] = [];

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextAffiliateSourceIntakeRun({
      runId: index === 0 ? requestedRunId : undefined,
      workerId: `affiliate-intake-cli-${process.pid}`,
    });
    if (!result) break;
    results.push(result);
    if (requestedRunId || process.argv.includes('--once')) break;
  }

  const output = process.argv.includes('--summary')
    ? {
        processed: results.length,
        results: results.map((result: any) => ({
          runId: result?.run?.id ?? result?.runId ?? null,
          status: result?.run?.status ?? result?.status ?? null,
          capturedPages: result?.summary?.capturedPages?.length ?? 0,
          blockedPages: result?.summary?.blockedPages?.length ?? 0,
          failedPages: result?.summary?.failedPages?.length ?? 0,
          warnings: result?.summary?.warnings?.length ?? 0,
          classification: result?.summary?.classification?.type ?? null,
          errorMessage: result?.run?.errorMessage ?? result?.errorMessage ?? null,
        })),
      }
    : { processed: results.length, results };
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:intakes:process] worker failure', error);
  process.exitCode = 1;
});
