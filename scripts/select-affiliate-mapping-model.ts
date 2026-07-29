import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateMappingBakeoffReportSchema,
  selectAffiliateMappingBakeoffWinner,
} from '../src/server/affiliateImports/agentBakeoff';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const main = async () => {
  const reportPaths = process.argv
    .filter((argument) => argument.startsWith('--report='))
    .map((argument) => argument.slice('--report='.length))
    .concat(readOption('--reports')?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (reportPaths.length < 2) throw new Error('At least two --report paths are required.');
  const reports = await Promise.all(reportPaths.map(async (reportPath) => (
    affiliateMappingBakeoffReportSchema.parse(
      JSON.parse(await fs.readFile(path.resolve(reportPath), 'utf8')),
    )
  )));
  const selection = selectAffiliateMappingBakeoffWinner(reports);
  console.log(JSON.stringify(selection, null, 2));
  if (!selection.selectedReportId) process.exitCode = 2;
};

main().catch((error) => {
  console.error('[affiliate:mapping:bakeoff:select] failed', error);
  process.exitCode = 1;
});
