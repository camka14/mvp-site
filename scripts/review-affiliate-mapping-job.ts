import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildAffiliateReviewerInput,
  FixtureAffiliateMappingReviewer,
  reviewAffiliateMappingWorkerResult,
  StdioAffiliateMappingReviewer,
} from '../src/server/affiliateImports/agentReview';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const repeatedOptions = (name: string): string[] => process.argv.flatMap((argument, index) => {
  if (argument.startsWith(`${name}=`)) return [argument.slice(name.length + 1)];
  if (argument === name && process.argv[index + 1]) return [process.argv[index + 1]];
  return [];
});

const readJson = async (filePath: string) => JSON.parse(
  await fs.readFile(path.resolve(filePath), 'utf8'),
);

const main = async () => {
  const workerResultPath = readOption('--worker-result');
  const bundlePath = readOption('--review-bundle');
  if (!workerResultPath || !bundlePath) {
    throw new Error('--worker-result=<json> and --review-bundle=<json> are required.');
  }
  const workerResult = await readJson(workerResultPath);
  const bundle = await readJson(bundlePath) as {
    scopedDiff?: string;
    validationTranscripts?: [];
    evidenceExcerpts?: [];
    normalizedCandidateSamples?: [];
  };
  const reviewerInput = buildAffiliateReviewerInput({
    workerResult,
    scopedDiff: bundle.scopedDiff ?? '',
    validationTranscripts: bundle.validationTranscripts ?? [],
    evidenceExcerpts: bundle.evidenceExcerpts ?? [],
    normalizedCandidateSamples: bundle.normalizedCandidateSamples ?? [],
  });
  const fixtureReviewPath = readOption('--fixture-review');
  const reviewCommand = readOption('--review-command');
  if (!fixtureReviewPath && !reviewCommand) {
    throw new Error(
      'Provide --fixture-review=<json> or a pinned --review-command=<stdin-json-wrapper>.',
    );
  }
  const reviewer = fixtureReviewPath
    ? new FixtureAffiliateMappingReviewer(await readJson(fixtureReviewPath))
    : new StdioAffiliateMappingReviewer({
        executable: path.resolve(reviewCommand as string),
        args: repeatedOptions('--review-arg'),
        cwd: process.cwd(),
      });
  const review = await reviewAffiliateMappingWorkerResult({ reviewer, reviewerInput });
  const outputPath = readOption('--output');
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    jobId: review.jobId,
    outcome: review.outcome,
    blockingIssues: review.issues.filter((issue) => issue.severity === 'BLOCKING').length,
    trainingEligibility: review.trainingEligibility,
    outputPath: outputPath ? path.resolve(outputPath) : null,
    authority: 'recommendation-only',
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:review] failed', error);
  process.exitCode = 1;
});
