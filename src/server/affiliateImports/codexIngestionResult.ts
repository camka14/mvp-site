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

const directoryExpansionSchema = z.object({
  submitted: z.number().int().positive(),
  created: z.number().int().nonnegative(),
  reused: z.number().int().nonnegative(),
  captureQueued: z.number().int().nonnegative(),
  reviewRequired: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
}).strict();

export const codexAffiliateIngestionResultSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyString,
  intakeId: nonEmptyString,
  sourceKey: nonEmptyString,
  workerId: nonEmptyString,
  status: z.enum(['REVIEW_REQUIRED', 'EXPANDED', 'FAILED']),
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
  directoryExpansion: directoryExpansionSchema.nullable().optional(),
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
  if (result.status === 'EXPANDED') {
    const expansion = result.directoryExpansion;
    if (!expansion) {
      context.addIssue({
        code: 'custom',
        path: ['directoryExpansion'],
        message: 'EXPANDED ingestion results require a directory expansion summary.',
      });
      return;
    }
    if (expansion.created + expansion.reused + expansion.duplicate + expansion.rejected !== expansion.submitted) {
      context.addIssue({
        code: 'custom',
        path: ['directoryExpansion'],
        message: 'Directory expansion outcomes must account for every submitted URL.',
      });
    }
    if (expansion.created + expansion.reused + expansion.duplicate === 0) {
      context.addIssue({
        code: 'custom',
        path: ['directoryExpansion'],
        message: 'EXPANDED ingestion results require at least one accepted, reused, or duplicate URL.',
      });
    }
    if (
      result.branch
      || result.commit
      || result.generatedPaths.length
      || result.candidateCount !== 0
      || result.reviewScrapes.length
      || result.errorMessage
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'EXPANDED ingestion results cannot claim mapping artifacts, candidates, scrapes, commits, or errors.',
      });
    }
    return;
  }
  if (result.directoryExpansion) {
    context.addIssue({
      code: 'custom',
      path: ['directoryExpansion'],
      message: 'Directory expansion summaries are only valid for EXPANDED results.',
    });
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

export const buildCodexAffiliateDirectoryExpansionResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  directoryExpansion: z.infer<typeof directoryExpansionSchema>;
  warnings?: string[];
}): CodexAffiliateIngestionResult => codexAffiliateIngestionResultSchema.parse({
  schemaVersion: 1,
  jobId: input.jobId,
  intakeId: input.intakeId,
  sourceKey: input.sourceKey,
  workerId: input.workerId,
  status: 'EXPANDED',
  branch: null,
  commit: null,
  generatedPaths: [],
  logoDisposition: 'MANUAL_REVIEW',
  candidateCount: 0,
  reviewScrapes: [],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: input.warnings ?? [],
  },
  directoryExpansion: input.directoryExpansion,
  errorMessage: null,
});
