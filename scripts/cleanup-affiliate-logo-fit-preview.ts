import {
  removeAffiliateLogoFitPreview,
} from '../src/server/affiliateImports/logoFitPreview';

const readPaths = (): string[] => process.argv.flatMap((argument, index) => {
  if (argument.startsWith('--path=')) return [argument.slice('--path='.length).trim()];
  if (argument === '--path') return [process.argv[index + 1]?.trim() ?? ''];
  return [];
}).filter(Boolean);

const main = async () => {
  const paths = readPaths();
  if (paths.length === 0) {
    throw new Error('Supply at least one exact --path=<affiliate-logo-preview-directory>.');
  }
  const apply = process.argv.includes('--apply');
  const results = [];
  for (const previewPath of paths) {
    results.push(await removeAffiliateLogoFitPreview(previewPath, { apply }));
  }
  console.log(JSON.stringify({
    schemaVersion: 1,
    mode: apply ? 'APPLY' : 'DRY_RUN',
    generatedCopiesOnly: true,
    results,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:logo-fit:cleanup] failed', error);
  process.exitCode = 1;
});
