import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildAffiliateMappingSftRelease,
  renderAffiliateMappingSftJsonLines,
} from '../src/server/affiliateImports/agentTrainingRelease';
import {
  assertAffiliateMappingGoldReleaseIntegrity,
  affiliateMappingGoldExampleSchema,
  affiliateMappingTeachingEnvelopeFromGoldExample,
} from '../src/server/affiliateImports/agentGoldDataset';
import {
  stableAgentArtifactSha256,
} from '../src/server/affiliateImports/agentContracts';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readJsonLines = async (filePath: string): Promise<unknown[]> => (
  (await fs.readFile(filePath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on input line ${index + 1}.`);
      }
    })
);

const releaseDirectoryFor = (inputPath: string): string => {
  const resolved = path.resolve(inputPath);
  return path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
};

const readGoldReleaseExamples = async (inputPath: string): Promise<unknown[]> => {
  const directory = releaseDirectoryFor(inputPath);
  const examples = (
    await Promise.all((['train', 'validation', 'test'] as const).map(
      (split) => readJsonLines(path.join(directory, `${split}.jsonl`)),
    ))
  ).flat().sort((left, right) => (
    String((left as { exampleId?: unknown }).exampleId)
      .localeCompare(String((right as { exampleId?: unknown }).exampleId))
  ));
  const release = assertAffiliateMappingGoldReleaseIntegrity({
    manifest: JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')),
    examples,
  });
  const releaseSha256 = stableAgentArtifactSha256(release);
  const recordedReleaseSha256 = (
    await fs.readFile(path.join(directory, 'release.sha256'), 'utf8')
  ).trim();
  if (recordedReleaseSha256 !== releaseSha256) {
    throw new Error(`Gold release hash mismatch for ${release.manifest.releaseId}.`);
  }
  return release.examples;
};

const main = async () => {
  const inputOption = readOption('--input');
  const goldReleaseOption = readOption('--gold-release');
  const outputRoot = path.resolve(
    readOption('--output-dir')
      ?? path.join('output', 'affiliate-mapping-agent', 'training-releases'),
  );
  const releaseId = readOption('--release') ?? '';
  if ((!inputOption && !goldReleaseOption) || (inputOption && goldReleaseOption) || !releaseId) {
    throw new Error('Exactly one of --input or --gold-release, plus --release, is required.');
  }
  const inputRows = goldReleaseOption
    ? await readGoldReleaseExamples(goldReleaseOption)
    : await readJsonLines(path.resolve(inputOption as string));
  const envelopes = inputRows.map((row) => (
    affiliateMappingGoldExampleSchema.safeParse(row).success
      ? affiliateMappingTeachingEnvelopeFromGoldExample(row)
      : row
  ));
  const release = buildAffiliateMappingSftRelease(envelopes, {
    releaseId,
    createdAt: new Date(),
  });
  const releaseDirectory = path.join(outputRoot, releaseId);
  await fs.mkdir(outputRoot, { recursive: true });
  try {
    await fs.access(releaseDirectory);
    throw new Error(`Training release already exists: ${releaseDirectory}.`);
  } catch (error) {
    if (
      error instanceof Error
      && 'code' in error
      && (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      // Expected for an immutable new release.
    } else {
      throw error;
    }
  }
  await fs.mkdir(releaseDirectory, { recursive: false });
  await Promise.all([
    fs.writeFile(
      path.join(releaseDirectory, 'manifest.json'),
      `${JSON.stringify(release.manifest, null, 2)}\n`,
      'utf8',
    ),
    ...(['train', 'validation', 'test'] as const).map((split) => fs.writeFile(
      path.join(releaseDirectory, `${split}.jsonl`),
      renderAffiliateMappingSftJsonLines(release.rows.filter((row) => row.split === split)),
      'utf8',
    )),
  ]);
  console.log(JSON.stringify({
    releaseDirectory,
    manifest: release.manifest,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:sft-release] failed', error);
  process.exitCode = 1;
});
