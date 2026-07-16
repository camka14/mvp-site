import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const main = async () => {
  const { cleanupAffiliateSourceIntakeArtifacts } = await import(
    '../src/server/affiliateImports/sourceIntakeRetention'
  );
  const apply = process.argv.includes('--apply');
  const result = await cleanupAffiliateSourceIntakeArtifacts({ dryRun: !apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply to delete these artifacts.');
};

main().catch((error) => {
  console.error('[affiliate:intakes:cleanup] failed', error);
  process.exitCode = 1;
});
