import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildAffiliateMappingBakeoffReport,
} from '../src/server/affiliateImports/agentBakeoff';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readJson = async (value: string) => JSON.parse(
  await fs.readFile(path.resolve(value), 'utf8'),
);

const main = async () => {
  const reportId = readOption('--report-id');
  const manifestPath = readOption('--model-manifest');
  const runtimePath = readOption('--runtime');
  const evaluationPath = readOption('--evaluation');
  const outputPath = readOption('--output');
  if (!reportId || !manifestPath || !runtimePath || !evaluationPath || !outputPath) {
    throw new Error(
      '--report-id, --model-manifest, --runtime, --evaluation, and --output are required.',
    );
  }
  const correctionRateRaw = readOption('--sol-material-correction-rate');
  const report = buildAffiliateMappingBakeoffReport({
    reportId,
    capturedAt: new Date(),
    modelManifest: await readJson(manifestPath),
    runtime: await readJson(runtimePath),
    evaluation: await readJson(evaluationPath),
    solMaterialCorrectionRate: correctionRateRaw === undefined ? null : Number(correctionRateRaw),
  });
  const resolvedOutput = path.resolve(outputPath);
  try {
    await fs.access(resolvedOutput);
    throw new Error(`Bakeoff report already exists: ${resolvedOutput}.`);
  } catch (error) {
    if (
      !(
        error instanceof Error
        && 'code' in error
        && (error as NodeJS.ErrnoException).code === 'ENOENT'
      )
    ) {
      throw error;
    }
  }
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: resolvedOutput,
    reportId: report.reportId,
    eligible: report.eligible,
    compositeScore: report.compositeScore,
    eligibilityViolations: report.eligibilityViolations,
  }, null, 2));
  if (!report.eligible) process.exitCode = 2;
};

main().catch((error) => {
  console.error('[affiliate:mapping:bakeoff:record] failed', error);
  process.exitCode = 1;
});
