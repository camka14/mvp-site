import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

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

  console.log(JSON.stringify({ processed: results.length, results }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:intakes:process] worker failure', error);
  process.exitCode = 1;
});
