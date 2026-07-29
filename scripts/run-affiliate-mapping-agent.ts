import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  assertOpenWeightModelEligible,
  stableAgentArtifactSha256,
  type ModelRevision,
  type OpenWeightModelManifest,
} from '../src/server/affiliateImports/agentContracts';
import {
  buildAffiliateMappingJobContextFromExport,
} from '../src/server/affiliateImports/agentJobContext';
import {
  FixtureAffiliateMappingModelClient,
  OpenAICompatibleAffiliateMappingModelClient,
  type AffiliateMappingJobContext,
  type AffiliateMappingModelClient,
} from '../src/server/affiliateImports/agentModelClient';
import {
  createIsolatedAffiliateAgentWorktree,
  runAffiliateMappingDraftJob,
  validateAffiliateAgentWorktreeDiff,
} from '../src/server/affiliateImports/agentRunner';
import { AffiliateAgentValidationExecutor } from '../src/server/affiliateImports/agentValidation';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

type RunnerFixture = {
  schemaVersion: 1;
  context: AffiliateMappingJobContext;
  model: ModelRevision;
  modelManifestSha256: string;
  draft: unknown;
};

type ClaimedMappingJob = {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
};

const repositoryRoot = process.cwd();

const readJson = async (filePath: string) => JSON.parse(
  await fs.readFile(path.resolve(filePath), 'utf8'),
);

const createValidation = (input: {
  worktreePath: string;
  sourceKey: string;
}) => {
  const runTests = !process.argv.includes('--no-tests');
  const runReviewScrape = process.argv.includes('--review-scrape');
  const validationExecutor = new AffiliateAgentValidationExecutor({
    worktreeRoot: input.worktreePath,
    toolchainRoot: repositoryRoot,
    allowReviewScrape: runReviewScrape,
  });
  return async ({ generatedPaths }: { generatedPaths: string[] }) => {
    const warnings: string[] = [];
    let testsPassed = false;
    let scrapePassed = false;
    if (runTests && generatedPaths.length) {
      await validationExecutor.runFocusedTest('agent-contracts');
      await validationExecutor.runFocusedTest(`generated-source:${input.sourceKey}`);
      testsPassed = true;
    } else if (!generatedPaths) {
      testsPassed = true;
      scrapePassed = true;
    } else {
      warnings.push('Focused tests were skipped by --no-tests.');
    }
    await validationExecutor.runDiffCheck();
    if (runReviewScrape && generatedPaths.length) {
      await validationExecutor.runReviewScrape(input.sourceKey);
      scrapePassed = true;
    } else if (generatedPaths.length) {
      warnings.push(
        'Review scrape was not executed; use --review-scrape only with a local disposable database.',
      );
    }
    return { testsPassed, scrapePassed, warnings };
  };
};

const runInWorktree = async (input: {
  context: AffiliateMappingJobContext;
  modelClient: AffiliateMappingModelClient;
  workerId: string;
  modelManifestSha256: string;
}) => {
  const repositoryRoot = process.cwd();
  const baseCommit = readOption('--base')
    ?? execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
  const worktree = await createIsolatedAffiliateAgentWorktree({
    repositoryRoot,
    baseCommit,
    parentDirectory: readOption('--worktree-parent'),
  });
  const result = await runAffiliateMappingDraftJob({
    context: input.context,
    workerId: input.workerId,
    modelClient: input.modelClient,
    modelManifestSha256: input.modelManifestSha256,
    promptContractVersion: 1,
    worktreeRoot: worktree.path,
    validate: createValidation({
      worktreePath: worktree.path,
      sourceKey: input.context.sourceKey,
    }),
  });
  await validateAffiliateAgentWorktreeDiff(worktree.path);
  const artifactDirectory = path.dirname(worktree.path);
  const resultPath = path.join(artifactDirectory, `${path.basename(worktree.path)}-result.json`);
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const summary = {
    jobId: result.jobId,
    status: result.status,
    worktree: worktree.path,
    baseCommit: worktree.baseCommit,
    resultPath,
    generatedFiles: result.generatedFiles,
    validation: result.validation,
    retainedForReview: true,
  };
  return { result, summary };
};

const runFixture = async (fixturePath: string) => {
  if (process.argv.includes('--live')) {
    throw new Error('The fixture runner never accepts --live.');
  }
  const fixture = await readJson(fixturePath) as RunnerFixture;
  if (fixture.schemaVersion !== 1) throw new Error('Unsupported runner fixture version.');
  return runInWorktree({
    context: fixture.context,
    workerId: readOption('--worker') ?? `fixture-worker-${process.pid}`,
    modelClient: new FixtureAffiliateMappingModelClient(
      fixture.model,
      new Map([[fixture.context.jobId, fixture.draft]]),
    ),
    modelManifestSha256: fixture.modelManifestSha256,
  });
};

const configureDatabaseEnvironment = (useLive: boolean) => {
  if (!useLive) return;
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
};

const exportEvidence = (input: {
  sourceKey: string;
  useLive: boolean;
}): { outputDir: string; runId: string } => {
  const stdout = execFileSync(
    path.join(repositoryRoot, 'node_modules/.bin/tsx'),
    [
      path.join(repositoryRoot, 'scripts/export-affiliate-source-intake.ts'),
      '--source-key',
      input.sourceKey,
      ...(input.useLive ? ['--live'] : []),
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const result = JSON.parse(stdout) as { outputDir?: string; runId?: string };
  if (!result.outputDir || !result.runId) throw new Error('Intake export returned no output directory.');
  return { outputDir: result.outputDir, runId: result.runId };
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

const runModelWorker = async () => {
  const useLive = process.argv.includes('--live');
  const dryRun = process.argv.includes('--dry-run');
  configureDatabaseEnvironment(useLive);
  const modelEndpoint = readOption('--model-endpoint');
  const modelId = readOption('--model-id');
  const modelManifestPath = readOption('--model-manifest');
  if (!modelEndpoint || !modelId || !modelManifestPath) {
    throw new Error(
      '--model-endpoint, --model-id, and --model-manifest are required without --fixture.',
    );
  }
  const manifest = assertOpenWeightModelEligible(await readJson(modelManifestPath), {
    requireOfflineColdStart: true,
  });
  const modelManifestSha256 = stableAgentArtifactSha256(manifest);
  const workerId = readOption('--worker') ?? `affiliate-open-weight-${process.pid}`;
  let claim: ClaimedMappingJob | null = null;
  let prisma: any = null;
  let finishClaim: null | ((input: {
    jobId: string;
    status: 'REVIEW_REQUIRED' | 'APPROVED' | 'FAILED';
    resultSummary?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }) => Promise<unknown>) = null;
  try {
    let sourceKey: string;
    let jobId: string;
    if (dryRun) {
      sourceKey = readOption('--source-key') ?? '';
      if (!sourceKey) throw new Error('--source-key is required with --dry-run.');
      jobId = `dry-run-${sourceKey}`;
    } else {
      ({ prisma } = await import('../src/lib/prisma'));
      const queue = await import('../src/server/affiliateImports/sourceMappingQueue');
      finishClaim = queue.finishAffiliateSourceMappingClaim;
      claim = await queue.claimNextAffiliateSourceIntakeForMapping({
        workerId,
        intakeId: readOption('--intake'),
      });
      if (!claim) {
        return { result: null, summary: { claimed: false, workerId } };
      }
      sourceKey = claim.sourceKey;
      jobId = claim.jobId;
    }
    const exported = exportEvidence({ sourceKey, useLive });
    const { context } = await buildAffiliateMappingJobContextFromExport({
      jobId,
      evidenceDirectory: exported.outputDir,
      repositoryRoot,
      instructionsRevision: 'affiliate-source-mapping-contract-v1',
    });
    if (claim && context.intakeId !== claim.intakeId) {
      throw new Error('Exported intake does not match the claimed queue job.');
    }
    const modelClient = new OpenAICompatibleAffiliateMappingModelClient({
      endpoint: modelEndpoint,
      bearerToken: process.env.AFFILIATE_MAPPING_MODEL_TOKEN ?? '',
      model: modelId,
      revision: modelRevisionFromManifest(manifest, modelId),
    });
    const run = await runInWorktree({
      context,
      modelClient,
      workerId,
      modelManifestSha256,
    });
    if (claim && finishClaim) {
      await finishClaim({
        jobId: claim.jobId,
        status: 'REVIEW_REQUIRED',
        resultSummary: {
          schemaVersion: 1,
          workerId,
          model: await modelClient.modelRevision(),
          modelManifestSha256,
          evidenceRunId: context.runId,
          workerResultSha256: stableAgentArtifactSha256(run.result),
          generatedFiles: run.result.generatedFiles,
          validation: run.result.validation,
          worktree: run.summary.worktree,
          resultPath: run.summary.resultPath,
          authority: 'review-required',
        },
      });
    }
    return run;
  } catch (error) {
    if (claim && finishClaim) {
      await finishClaim({
        jobId: claim.jobId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const main = async () => {
  const fixturePath = readOption('--fixture');
  const run = fixturePath ? await runFixture(fixturePath) : await runModelWorker();
  console.log(JSON.stringify(run.summary, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:agent] failed', error);
  process.exitCode = 1;
});
