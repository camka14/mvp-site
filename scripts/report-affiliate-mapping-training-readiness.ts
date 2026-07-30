import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateMappingGoldFixtureManifest,
  assertAffiliateMappingGoldReleaseIntegrity,
  buildAffiliateMappingGoldRelease,
  buildAffiliateMappingTrainingReadinessReport,
  type AffiliateMappingGoldExample,
  type AffiliateMappingGoldRelease,
} from '../src/server/affiliateImports/agentGoldDataset';
import {
  affiliateMappingEvaluationReportSchema,
  affiliateModelRuntimeObservationSchema,
} from '../src/server/affiliateImports/agentBakeoff';
import {
  stableAgentArtifactSha256,
} from '../src/server/affiliateImports/agentContracts';
import {
  assertAffiliateMappingSftReleaseIntegrity,
  type AffiliateMappingSftRelease,
} from '../src/server/affiliateImports/agentTrainingRelease';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const readJson = async (filePath: string): Promise<unknown> => (
  JSON.parse(await fs.readFile(filePath, 'utf8'))
);

const readJsonLines = async (filePath: string): Promise<unknown[]> => (
  (await fs.readFile(filePath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON in ${filePath} on line ${index + 1}.`);
      }
    })
);

const releaseDirectoryFor = (inputPath: string): string => {
  const resolved = path.resolve(inputPath);
  return path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
};

const readGoldRelease = async (inputPath: string): Promise<{
  directory: string;
  release: AffiliateMappingGoldRelease;
  releaseSha256: string;
}> => {
  const directory = releaseDirectoryFor(inputPath);
  const examples: unknown[] = [];
  for (const split of ['train', 'validation', 'test'] as const) {
    const rows = await readJsonLines(path.join(directory, `${split}.jsonl`));
    for (const row of rows) {
      if ((row as { split?: unknown }).split !== split) {
        throw new Error(`${directory}/${split}.jsonl contains a row from another split.`);
      }
    }
    examples.push(...rows);
  }
  examples.sort((left, right) => (
    String((left as { exampleId?: unknown }).exampleId)
      .localeCompare(String((right as { exampleId?: unknown }).exampleId))
  ));
  const release = assertAffiliateMappingGoldReleaseIntegrity({
    manifest: await readJson(path.join(directory, 'manifest.json')),
    examples,
  });
  const releaseSha256 = stableAgentArtifactSha256(release);
  const recordedReleaseSha256 = (
    await fs.readFile(path.join(directory, 'release.sha256'), 'utf8')
  ).trim();
  if (recordedReleaseSha256 !== releaseSha256) {
    throw new Error(`Gold release hash mismatch for ${release.manifest.releaseId}.`);
  }
  await Promise.all(release.examples.map(async (example, index) => {
    const fixturePath = path.join(
      directory,
      release.manifest.fixtureManifestFiles[index],
    );
    const fixtureManifest = await readJson(fixturePath);
    const expected = affiliateMappingGoldFixtureManifest(example);
    if (
      stableAgentArtifactSha256(fixtureManifest)
      !== release.manifest.fixtureManifestSha256s[index]
      || stableAgentArtifactSha256(fixtureManifest) !== stableAgentArtifactSha256(expected)
    ) {
      throw new Error(`Fixture manifest mismatch for ${example.exampleId}.`);
    }
  }));
  return { directory, release, releaseSha256 };
};

const readSftRelease = async (inputPath: string): Promise<{
  directory: string;
  release: AffiliateMappingSftRelease;
}> => {
  const directory = releaseDirectoryFor(inputPath);
  const rows: unknown[] = [];
  for (const split of ['train', 'validation', 'test'] as const) {
    const splitRows = await readJsonLines(path.join(directory, `${split}.jsonl`));
    for (const row of splitRows) {
      if ((row as { split?: unknown }).split !== split) {
        throw new Error(`${directory}/${split}.jsonl contains a row from another split.`);
      }
    }
    rows.push(...splitRows);
  }
  rows.sort((left, right) => (
    String((left as { exampleId?: unknown }).exampleId)
      .localeCompare(String((right as { exampleId?: unknown }).exampleId))
  ));
  return {
    directory,
    release: assertAffiliateMappingSftReleaseIntegrity({
      manifest: await readJson(path.join(directory, 'manifest.json')),
      rows,
    }),
  };
};

const assertSameTrainingRows = (
  goldExamples: AffiliateMappingGoldExample[],
  sftRelease: AffiliateMappingSftRelease,
) => {
  const goldRows = goldExamples
    .map((example) => ({
      exampleId: example.exampleId,
      split: example.split,
      registrableDomain: example.registrableDomain,
    }))
    .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  const sftRows = sftRelease.rows
    .map((row) => ({
      exampleId: row.exampleId,
      split: row.split,
      registrableDomain: row.registrableDomain,
    }))
    .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  if (JSON.stringify(goldRows) !== JSON.stringify(sftRows)) {
    throw new Error('SFT rows do not exactly match the train/validation gold release.');
  }
};

const main = async () => {
  const trainValidationOption = readOption('--train-validation-gold');
  const testOption = readOption('--test-gold');
  const sftOption = readOption('--sft');
  const outputOption = readOption('--output');
  if (!trainValidationOption || !testOption || !sftOption || !outputOption) {
    throw new Error(
      '--train-validation-gold, --test-gold, --sft, and --output are required.',
    );
  }

  const [trainValidationGold, testGold, sft] = await Promise.all([
    readGoldRelease(trainValidationOption),
    readGoldRelease(testOption),
    readSftRelease(sftOption),
  ]);
  if (trainValidationGold.release.examples.some((example) => example.split === 'test')) {
    throw new Error('The train/validation gold release must not contain test examples.');
  }
  if (testGold.release.examples.some((example) => example.split !== 'test')) {
    throw new Error('The held-out gold release must contain only test examples.');
  }
  if (sft.release.rows.some((row) => row.split === 'test')) {
    throw new Error('The SFT release must not contain held-out test examples.');
  }
  assertSameTrainingRows(trainValidationGold.release.examples, sft.release);
  const promptHashes = new Set([
    trainValidationGold.release.manifest.systemPromptSha256,
    testGold.release.manifest.systemPromptSha256,
    sft.release.manifest.systemPromptSha256,
  ]);
  if (promptHashes.size !== 1) {
    throw new Error('Gold and SFT releases do not share the same frozen system prompt.');
  }

  const createdAtValues = [
    trainValidationGold.release.manifest.createdAt,
    testGold.release.manifest.createdAt,
  ].sort();
  const latestCreatedAt = createdAtValues[createdAtValues.length - 1];
  const combinedGold = buildAffiliateMappingGoldRelease([
    ...trainValidationGold.release.examples,
    ...testGold.release.examples,
  ], {
    releaseId: 'affiliate-mapping-readiness-combined-v1',
    createdAt: new Date(latestCreatedAt),
    repositoryCommit: [
      trainValidationGold.release.manifest.repositoryCommit,
      testGold.release.manifest.repositoryCommit,
    ].join('+'),
  });

  const baseReportOption = readOption('--base-report');
  const runtimeOption = readOption('--runtime');
  const solOption = readOption('--sol-corrections');
  const learnableErrorCategories = (readOption('--learnable-errors') ?? '')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);
  const baseEvaluation = baseReportOption
    ? affiliateMappingEvaluationReportSchema.parse(await readJson(path.resolve(baseReportOption)))
    : null;
  const runtimeObservation = runtimeOption
    ? affiliateModelRuntimeObservationSchema.parse(await readJson(path.resolve(runtimeOption)))
    : null;
  const solCorrectionSummary = solOption
    ? await readJson(path.resolve(solOption)) as {
      reviewed: number;
      materialCorrections: number;
    }
    : undefined;
  const report = buildAffiliateMappingTrainingReadinessReport({
    goldRelease: combinedGold,
    sftManifest: sft.release.manifest,
    baseEvaluation,
    runtimeObservation,
    solCorrectionSummary,
    learnableErrorCategories,
    sourceGoldReleaseSha256s: [
      trainValidationGold.releaseSha256,
      testGold.releaseSha256,
    ],
  });

  const outputPath = path.resolve(outputOption);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (!hasFlag('--force')) {
    try {
      await fs.access(outputPath);
      throw new Error(`Readiness report already exists: ${outputPath}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    reportSha256: stableAgentArtifactSha256(report),
    decision: report.decision,
    counts: report.counts,
    realApprovedCounts: report.realApprovedCounts,
    coverage: report.coverage,
    blockingReasons: report.blockingReasons,
    sourceGoldReleaseSha256s: report.sourceGoldReleaseSha256s,
    sftReleaseSha256: report.sftReleaseSha256,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:training-readiness] failed', error);
  process.exitCode = 1;
});
