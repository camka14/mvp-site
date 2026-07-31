import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const gitCommit = z.string().regex(/^[a-f0-9]{40}$/i);

const reviewScrapeSchema = z.object({
  runId: nonEmptyString,
  candidateCount: z.number().int().nonnegative(),
  normalizedCandidateSha256: sha256,
  passed: z.boolean(),
}).strict();

export const codexAffiliateIngestionResultSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyString,
  intakeId: nonEmptyString,
  sourceKey: nonEmptyString,
  workerId: nonEmptyString,
  status: z.enum(['REVIEW_REQUIRED', 'FAILED']),
  branch: nonEmptyString.nullable(),
  commit: gitCommit.nullable(),
  generatedPaths: z.array(nonEmptyString).default([]),
  logoDisposition: z.enum([
    'OFFICIAL_ASSET',
    'OFFICIAL_SCREENSHOT_CROP',
    'MANUAL_REVIEW',
  ]),
  candidateCount: z.number().int().nonnegative(),
  reviewScrapes: z.array(reviewScrapeSchema).max(2).default([]),
  validation: z.object({
    testsPassed: z.boolean(),
    diffCheckPassed: z.boolean(),
    duplicateSafe: z.boolean(),
    warnings: z.array(nonEmptyString).default([]),
  }).strict(),
  errorMessage: nonEmptyString.nullable(),
}).strict().superRefine((result, context) => {
  if (result.status === 'FAILED') {
    if (!result.errorMessage) {
      context.addIssue({
        code: 'custom',
        path: ['errorMessage'],
        message: 'FAILED ingestion results require an error message.',
      });
    }
    return;
  }
  if (!result.commit) {
    context.addIssue({
      code: 'custom',
      path: ['commit'],
      message: 'REVIEW_REQUIRED ingestion results require a source-scoped commit.',
    });
  }
  if (!result.branch) {
    context.addIssue({
      code: 'custom',
      path: ['branch'],
      message: 'REVIEW_REQUIRED ingestion results require the source branch.',
    });
  }
  if (!result.generatedPaths.length) {
    context.addIssue({
      code: 'custom',
      path: ['generatedPaths'],
      message: 'REVIEW_REQUIRED ingestion results require generated source package paths.',
    });
  }
  if (
    !result.validation.testsPassed
    || !result.validation.diffCheckPassed
    || !result.validation.duplicateSafe
  ) {
    context.addIssue({
      code: 'custom',
      path: ['validation'],
      message: 'REVIEW_REQUIRED ingestion results require passing tests, diff, and duplicate checks.',
    });
  }
  if (result.reviewScrapes.length !== 2 || result.reviewScrapes.some((scrape) => !scrape.passed)) {
    context.addIssue({
      code: 'custom',
      path: ['reviewScrapes'],
      message: 'REVIEW_REQUIRED ingestion results require exactly two passing review scrapes.',
    });
  }
  if (
    result.reviewScrapes.length === 2
    && (
      result.reviewScrapes[0].candidateCount !== result.reviewScrapes[1].candidateCount
      || result.reviewScrapes[0].normalizedCandidateSha256
        !== result.reviewScrapes[1].normalizedCandidateSha256
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['reviewScrapes'],
      message: 'Review scrapes must have stable counts and normalized candidate hashes.',
    });
  }
  if (
    result.reviewScrapes.length === 2
    && result.reviewScrapes.some(
      (scrape) => scrape.candidateCount !== result.candidateCount,
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['candidateCount'],
      message: 'Result candidate count must match both review scrapes.',
    });
  }
  if (result.errorMessage) {
    context.addIssue({
      code: 'custom',
      path: ['errorMessage'],
      message: 'REVIEW_REQUIRED ingestion results cannot include an error message.',
    });
  }
});

export type CodexAffiliateIngestionResult = z.infer<
  typeof codexAffiliateIngestionResultSchema
>;
