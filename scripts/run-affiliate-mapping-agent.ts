import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type ModelRevision,
} from '../src/server/affiliateImports/agentContracts';
import {
  FixtureAffiliateMappingModelClient,
  type AffiliateMappingJobContext,
} from '../src/server/affiliateImports/agentModelClient';
import {
  createIsolatedAffiliateAgentWorktree,
  runAffiliateMappingDraftJob,
  validateAffiliateAgentWorktreeDiff,
} from '../src/server/affiliateImports/agentRunner';
import { AffiliateAgentValidationExecutor } from '../src/server/affiliateImports/agentValidation';

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

const main = async () => {
  const fixturePath = readOption('--fixture');
  if (!fixturePath) {
    throw new Error(
      '--fixture=<job-fixture.json> is required until the queue/model-server integration milestone.',
    );
  }
  if (process.argv.includes('--live')) {
    throw new Error('The fixture runner never accepts --live.');
  }
  const fixture = JSON.parse(await fs.readFile(path.resolve(fixturePath), 'utf8')) as RunnerFixture;
  if (fixture.schemaVersion !== 1) throw new Error('Unsupported runner fixture version.');
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
  const runTests = !process.argv.includes('--no-tests');
  const runReviewScrape = process.argv.includes('--review-scrape');
  const validationExecutor = new AffiliateAgentValidationExecutor({
    worktreeRoot: worktree.path,
    toolchainRoot: repositoryRoot,
    allowReviewScrape: runReviewScrape,
  });
  const modelClient = new FixtureAffiliateMappingModelClient(
    fixture.model,
    new Map([[fixture.context.jobId, fixture.draft]]),
  );
  const result = await runAffiliateMappingDraftJob({
    context: fixture.context,
    workerId: readOption('--worker') ?? `fixture-worker-${process.pid}`,
    modelClient,
    modelManifestSha256: fixture.modelManifestSha256,
    promptContractVersion: 1,
    worktreeRoot: worktree.path,
    validate: async ({ generatedPaths }) => {
      const warnings: string[] = [];
      let testsPassed = false;
      let scrapePassed = false;
      if (runTests && generatedPaths.length) {
        await validationExecutor.runFocusedTest('agent-contracts');
        await validationExecutor.runFocusedTest(
          `generated-source:${fixture.context.sourceKey}`,
        );
        testsPassed = true;
      } else if (!generatedPaths) {
        testsPassed = true;
        scrapePassed = true;
      } else {
        warnings.push('Focused tests were skipped by --no-tests.');
      }
      await validationExecutor.runDiffCheck();
      if (runReviewScrape && generatedPaths.length) {
        await validationExecutor.runReviewScrape(fixture.context.sourceKey);
        scrapePassed = true;
      } else if (generatedPaths.length) {
        warnings.push('Review scrape was not executed; use --review-scrape only with a local disposable database.');
      }
      return { testsPassed, scrapePassed, warnings };
    },
  });
  await validateAffiliateAgentWorktreeDiff(worktree.path);
  const artifactDirectory = path.dirname(worktree.path);
  const resultPath = path.join(artifactDirectory, `${path.basename(worktree.path)}-result.json`);
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    jobId: result.jobId,
    status: result.status,
    worktree: worktree.path,
    baseCommit: worktree.baseCommit,
    resultPath,
    generatedFiles: result.generatedFiles,
    validation: result.validation,
    retainedForReview: true,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:agent] failed', error);
  process.exitCode = 1;
});
