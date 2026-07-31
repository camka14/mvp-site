import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateMappingGoldFixtureManifest,
  assertAffiliateMappingGoldReleaseIntegrity,
  buildAffiliateMappingGoldRelease,
  renderAffiliateMappingGoldJsonLines,
  type AffiliateMappingGoldRelease,
} from '../src/server/affiliateImports/agentGoldDataset';
import { stableAgentArtifactSha256 } from '../src/server/affiliateImports/agentContracts';

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

const readGoldRelease = async (inputPath: string): Promise<{
  release: AffiliateMappingGoldRelease;
  releaseSha256: string;
}> => {
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
  return { release, releaseSha256 };
};

const main = async () => {
  const inputOption = readOption('--input');
  const releaseId = readOption('--release') ?? '';
  if (!inputOption || !releaseId) {
    throw new Error('--input and --release are required.');
  }
  const inputPath = path.resolve(inputOption);
  const outputRoot = path.resolve(
    readOption('--output-dir')
      ?? path.join('output', 'affiliate-mapping-agent', 'gold-releases'),
  );
  const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
  const baseGoldOption = readOption('--base-gold-release');
  const baseGold = baseGoldOption ? await readGoldRelease(baseGoldOption) : null;
  const release = buildAffiliateMappingGoldRelease([
    ...(baseGold?.release.examples ?? []),
    ...await readJsonLines(inputPath),
  ], {
    releaseId,
    createdAt: new Date(),
    repositoryCommit,
  });
  const releaseDirectory = path.join(outputRoot, release.manifest.releaseId);
  await fs.mkdir(outputRoot, { recursive: true });
  try {
    await fs.access(releaseDirectory);
    throw new Error(`Gold release already exists: ${releaseDirectory}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(releaseDirectory, { recursive: false });
  await fs.mkdir(path.join(releaseDirectory, 'fixture-manifests'), { recursive: false });

  const releaseSha256 = stableAgentArtifactSha256(release);
  await Promise.all([
    fs.writeFile(
      path.join(releaseDirectory, 'manifest.json'),
      `${JSON.stringify(release.manifest, null, 2)}\n`,
      'utf8',
    ),
    fs.writeFile(
      path.join(releaseDirectory, 'release.sha256'),
      `${releaseSha256}\n`,
      'utf8',
    ),
    ...(['train', 'validation', 'test'] as const).map((split) => fs.writeFile(
      path.join(releaseDirectory, `${split}.jsonl`),
      renderAffiliateMappingGoldJsonLines(
        release.examples.filter((example) => example.split === split),
      ),
      'utf8',
    )),
    ...release.examples.map((example, index) => fs.writeFile(
      path.join(releaseDirectory, release.manifest.fixtureManifestFiles[index]),
      `${JSON.stringify(affiliateMappingGoldFixtureManifest(example), null, 2)}\n`,
      'utf8',
    )),
  ]);

  console.log(JSON.stringify({
    releaseDirectory,
    releaseSha256,
    baseGoldReleaseId: baseGold?.release.manifest.releaseId ?? null,
    baseGoldReleaseSha256: baseGold?.releaseSha256 ?? null,
    manifest: release.manifest,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-release] failed', error);
  process.exitCode = 1;
});
