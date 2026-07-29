import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateSourceDraftSchema,
  type ModelRevision,
} from '../src/server/affiliateImports/agentContracts';
import {
  evaluateAffiliateMappingModel,
  type AffiliateMappingEvaluationExample,
} from '../src/server/affiliateImports/agentEvaluation';
import {
  FixtureAffiliateMappingModelClient,
} from '../src/server/affiliateImports/agentModelClient';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

type FixtureSuite = {
  schemaVersion: 1;
  model: ModelRevision;
  examples: Array<AffiliateMappingEvaluationExample & { workerDraft: unknown }>;
};

const main = async () => {
  const suitePath = readOption('--suite');
  if (!suitePath) throw new Error('--suite=<fixture-suite.json> is required.');
  const workerName = readOption('--worker') ?? 'fixture';
  if (workerName !== 'fixture') {
    throw new Error('Only --worker=fixture is implemented before the model-server milestone.');
  }
  const suite = JSON.parse(await fs.readFile(path.resolve(suitePath), 'utf8')) as FixtureSuite;
  if (suite.schemaVersion !== 1 || !Array.isArray(suite.examples)) {
    throw new Error('Unsupported affiliate mapping evaluation suite.');
  }
  const examples = suite.examples.map((example) => ({
    exampleId: example.exampleId,
    context: example.context,
    expectedDraft: affiliateSourceDraftSchema.parse(example.expectedDraft),
  }));
  const worker = new FixtureAffiliateMappingModelClient(
    suite.model,
    new Map(suite.examples.map((example) => [example.context.jobId, example.workerDraft])),
  );
  const report = await evaluateAffiliateMappingModel({ examples, worker });
  const outputPath = readOption('--output');
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    model: report.model,
    summary: report.summary,
    outputPath: outputPath ? path.resolve(outputPath) : null,
  }, null, 2));
  if (!report.summary.assistedPilotEligible) process.exitCode = 2;
};

main().catch((error) => {
  console.error('[affiliate:mapping:evaluate] failed', error);
  process.exitCode = 1;
});
