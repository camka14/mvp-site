import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertOpenWeightModelEligible,
  affiliateSourceDraftSchema,
  stableAgentArtifactSha256,
  type ModelRevision,
  type OpenWeightModelManifest,
} from '../src/server/affiliateImports/agentContracts';
import {
  evaluateAffiliateMappingModel,
  type AffiliateMappingEvaluationExample,
} from '../src/server/affiliateImports/agentEvaluation';
import {
  FixtureAffiliateMappingModelClient,
  OpenAICompatibleAffiliateMappingModelClient,
  type AffiliateMappingModelClient,
} from '../src/server/affiliateImports/agentModelClient';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

type FixtureSuite = {
  schemaVersion: 1;
  model?: ModelRevision;
  examples: Array<AffiliateMappingEvaluationExample & { workerDraft?: unknown }>;
};

const modelRevisionFromManifest = (
  manifest: OpenWeightModelManifest,
  modelId: string,
): ModelRevision => ({
  family: manifest.modelFamily,
  upstreamRepository: manifest.upstreamRepository,
  upstreamRevision: manifest.upstreamRevision,
  artifactSha256: manifest.quantization.artifactSha256,
  adapterRevision: modelId === manifest.modelFamily ? null : modelId,
  promptTemplateRevision: manifest.promptTemplateRevision,
});

const boundedIntegerOption = (
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = readOption(name);
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
};

const main = async () => {
  const suitePath = readOption('--suite');
  if (!suitePath) throw new Error('--suite=<fixture-suite.json> is required.');
  const workerName = readOption('--worker') ?? 'fixture';
  const suite = JSON.parse(await fs.readFile(path.resolve(suitePath), 'utf8')) as FixtureSuite;
  if (suite.schemaVersion !== 1 || !Array.isArray(suite.examples)) {
    throw new Error('Unsupported affiliate mapping evaluation suite.');
  }
  const examples = suite.examples.map((example) => ({
    exampleId: example.exampleId,
    context: example.context,
    expectedDraft: affiliateSourceDraftSchema.parse(example.expectedDraft),
  }));
  let worker: AffiliateMappingModelClient;
  let modelManifestSha256: string | null = null;
  if (workerName === 'fixture') {
    if (!suite.model || suite.examples.some((example) => example.workerDraft === undefined)) {
      throw new Error('Fixture evaluation requires suite.model and every workerDraft.');
    }
    worker = new FixtureAffiliateMappingModelClient(
      suite.model,
      new Map(suite.examples.map((example) => [example.context.jobId, example.workerDraft])),
    );
  } else if (workerName === 'llama') {
    const endpoint = readOption('--model-endpoint');
    const modelId = readOption('--model-id');
    const manifestPath = readOption('--model-manifest');
    const outputPath = readOption('--output');
    if (!endpoint || !modelId || !manifestPath || !outputPath) {
      throw new Error(
        'llama evaluation requires --model-endpoint, --model-id, --model-manifest, and --output.',
      );
    }
    const manifest = assertOpenWeightModelEligible(
      JSON.parse(await fs.readFile(path.resolve(manifestPath), 'utf8')),
      { requireOfflineColdStart: true },
    );
    modelManifestSha256 = stableAgentArtifactSha256(manifest);
    worker = new OpenAICompatibleAffiliateMappingModelClient({
      endpoint,
      bearerToken: process.env.AFFILIATE_MAPPING_MODEL_TOKEN ?? '',
      model: modelId,
      revision: modelRevisionFromManifest(manifest, modelId),
      timeoutMs: boundedIntegerOption(
        '--model-timeout-ms',
        90 * 60 * 1000,
        1_000,
        90 * 60 * 1000,
      ),
    });
  } else {
    throw new Error('--worker must be fixture or llama.');
  }
  const report = await evaluateAffiliateMappingModel({ examples, worker });
  const outputPath = readOption('--output');
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    model: report.model,
    modelManifestSha256,
    summary: report.summary,
    outputPath: outputPath ? path.resolve(outputPath) : null,
  }, null, 2));
  if (!report.summary.assistedPilotEligible) process.exitCode = 2;
};

main().catch((error) => {
  console.error('[affiliate:mapping:evaluate] failed', error);
  process.exitCode = 1;
});
