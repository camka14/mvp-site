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

const humanReviewRequiredSchema = z.object({
  reasonCodes: z.array(nonEmptyString).min(1),
  sourceSportLabels: z.array(nonEmptyString).min(1),
  rationale: nonEmptyString.optional(),
  blockingIssues: z.array(nonEmptyString).default([]),
  requestedNextAction: z.literal('HUMAN_REVIEW_REQUIRED').default('HUMAN_REVIEW_REQUIRED'),
}).strict();

const nonnegativeCount = z.number().int().nonnegative();
const dateTimeDisplayModeSchema = z.enum([
  'SCHEDULED',
  'DATE_ONLY',
  'NO_FIXED_DATE',
  'ONGOING',
]);

export const AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT = 'event-datetime-v1' as const;

export const affiliateEventDateTimeRepairReasonCodeSchema = z.enum([
  'EVENT_DATETIME_START_INVALID',
  'EVENT_DATETIME_TIMEZONE_INVALID',
  'EVENT_DATETIME_END_INVALID',
  'EVENT_DATETIME_DURATION_INVALID',
  'EVENT_DATETIME_DATE_ONLY_INVALID',
  'EVENT_DATETIME_HOST_TIMEZONE_DEPENDENT',
  'EVENT_DATETIME_EVERGREEN_OCCURRENCE',
  'EVENT_DATETIME_TRYOUT_EVERGREEN',
]);

const countByTimeZoneEvidenceSchema = z.object({
  SOURCE_FIELD: nonnegativeCount,
  COORDINATES: nonnegativeCount,
  EXPLICIT_OFFSET: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByStartPrecisionSchema = z.object({
  DATE_TIME: nonnegativeCount,
  DATE_ONLY: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByEndDerivationSchema = z.object({
  EXPLICIT_END: nonnegativeCount,
  EXPLICIT_DURATION: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByDisplayModeSchema = z.object({
  SCHEDULED: nonnegativeCount,
  DATE_ONLY: nonnegativeCount,
  NO_FIXED_DATE: nonnegativeCount,
  ONGOING: nonnegativeCount,
}).strict();

export const affiliateEventDateTimeReviewSchema = z.object({
  contractRevision: z.literal(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT),
  candidateCount: nonnegativeCount,
  timeZoneEvidence: countByTimeZoneEvidenceSchema,
  startPrecision: countByStartPrecisionSchema,
  endDerivation: countByEndDerivationSchema,
  durationWarnings: nonnegativeCount,
  utcHostRegression: z.object({
    passed: z.boolean(),
    comparedCandidateCount: nonnegativeCount,
    hostTimeZones: z.array(nonEmptyString).min(2).max(4),
  }).strict(),
  displayModeCounts: countByDisplayModeSchema,
  evergreenTransitions: z.array(z.object({
    from: dateTimeDisplayModeSchema,
    to: dateTimeDisplayModeSchema,
    count: z.number().int().positive(),
  }).strict()).max(20),
  evergreenEvidence: z.object({
    scheduleTextBacked: nonnegativeCount,
    datedSessionsMappedSeparately: nonnegativeCount,
    hiddenDatedOccurrences: nonnegativeCount,
    tryoutOrEvaluationMarkedEvergreen: nonnegativeCount,
  }).strict(),
  repairReasonCodes: z.array(affiliateEventDateTimeRepairReasonCodeSchema).max(20).default([]),
}).strict().superRefine((review, context) => {
  const countTotal = (counts: Record<string, number>) => Object.values(counts)
    .reduce((total, count) => total + count, 0);
  if (countTotal(review.displayModeCounts) !== review.candidateCount) {
    context.addIssue({
      code: 'custom',
      path: ['displayModeCounts'],
      message: 'Datetime display-mode counts must account for every candidate.',
    });
  }
  if (countTotal(review.timeZoneEvidence) !== review.candidateCount) {
    context.addIssue({
      code: 'custom',
      path: ['timeZoneEvidence'],
      message: 'Datetime timezone-evidence counts must account for every candidate.',
    });
  }
  if (countTotal(review.startPrecision) !== review.candidateCount) {
    context.addIssue({
      code: 'custom',
      path: ['startPrecision'],
      message: 'Datetime start-precision counts must account for every candidate.',
    });
  }
  if (countTotal(review.endDerivation) !== review.candidateCount) {
    context.addIssue({
      code: 'custom',
      path: ['endDerivation'],
      message: 'Datetime end-derivation counts must account for every candidate.',
    });
  }
  const evergreenCount = review.displayModeCounts.NO_FIXED_DATE + review.displayModeCounts.ONGOING;
  if (review.evergreenEvidence.scheduleTextBacked < evergreenCount) {
    context.addIssue({
      code: 'custom',
      path: ['evergreenEvidence', 'scheduleTextBacked'],
      message: 'Every evergreen candidate requires source-backed schedule evidence.',
    });
  }
  if (review.evergreenEvidence.hiddenDatedOccurrences > 0) {
    context.addIssue({
      code: 'custom',
      path: ['evergreenEvidence', 'hiddenDatedOccurrences'],
      message: 'Evergreen review cannot hide dated occurrences.',
    });
  }
  if (review.evergreenEvidence.tryoutOrEvaluationMarkedEvergreen > 0) {
    context.addIssue({
      code: 'custom',
      path: ['evergreenEvidence', 'tryoutOrEvaluationMarkedEvergreen'],
      message: 'Tryouts and evaluations cannot be marked evergreen.',
    });
  }
  if (!review.utcHostRegression.passed) {
    context.addIssue({
      code: 'custom',
      path: ['utcHostRegression'],
      message: 'The UTC-host regression must pass before a review-ready package can complete.',
    });
  }
  if (review.utcHostRegression.comparedCandidateCount !== review.candidateCount) {
    context.addIssue({
      code: 'custom',
      path: ['utcHostRegression', 'comparedCandidateCount'],
      message: 'The UTC-host regression must cover every candidate.',
    });
  }
  if (!review.utcHostRegression.hostTimeZones.includes('UTC')) {
    context.addIssue({
      code: 'custom',
      path: ['utcHostRegression', 'hostTimeZones'],
      message: 'The UTC-host regression must include a TZ=UTC run.',
    });
  }
  if (review.utcHostRegression.hostTimeZones.every((timeZone) => timeZone === 'UTC')) {
    context.addIssue({
      code: 'custom',
      path: ['utcHostRegression', 'hostTimeZones'],
      message: 'The UTC-host regression must compare UTC with a non-UTC host.',
    });
  }
  review.evergreenTransitions.forEach((transition, index) => {
    if (transition.from === transition.to) {
      context.addIssue({
        code: 'custom',
        path: ['evergreenTransitions', index],
        message: 'Evergreen transitions must change display mode.',
      });
    }
  });
});

export const codexAffiliateIngestionResultSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyString,
  intakeId: nonEmptyString,
  sourceKey: nonEmptyString,
  workerId: nonEmptyString,
  status: z.enum(['REVIEW_REQUIRED', 'EXPANDED', 'FAILED', 'HUMAN_REVIEW_REQUIRED']),
  branch: nonEmptyString.nullable(),
  commit: gitCommit.nullable(),
  generatedPaths: z.array(nonEmptyString).default([]),
  logoDisposition: z.enum([
    'OFFICIAL_ASSET',
    'OFFICIAL_SCREENSHOT_CROP',
    'MANUAL_REVIEW',
  ]),
  candidateCount: z.number().int().nonnegative(),
  dateTimeReview: affiliateEventDateTimeReviewSchema.optional(),
  reviewScrapes: z.array(reviewScrapeSchema).max(2).default([]),
  validation: z.object({
    testsPassed: z.boolean(),
    diffCheckPassed: z.boolean(),
    duplicateSafe: z.boolean(),
    warnings: z.array(nonEmptyString).default([]),
  }).strict(),
  directoryExpansion: directoryExpansionSchema.nullable().optional(),
  humanReviewRequired: humanReviewRequiredSchema.nullable().optional(),
  errorMessage: nonEmptyString.nullable(),
}).strict().superRefine((result, context) => {
  if (result.status === 'HUMAN_REVIEW_REQUIRED') {
    const humanReview = result.humanReviewRequired;
    if (!humanReview) {
      context.addIssue({
        code: 'custom',
        path: ['humanReviewRequired'],
        message: 'HUMAN_REVIEW_REQUIRED results require a structured human-review reason.',
      });
      return;
    }
    if (!humanReview.reasonCodes.includes('SPORT_NOT_IN_CATALOG')) {
      context.addIssue({
        code: 'custom',
        path: ['humanReviewRequired', 'reasonCodes'],
        message: 'Unsupported-sport human review results require SPORT_NOT_IN_CATALOG.',
      });
    }
    if (
      result.branch
      || result.commit
      || result.generatedPaths.length
      || result.candidateCount !== 0
      || result.reviewScrapes.length
      || result.directoryExpansion
      || result.errorMessage
    ) {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'HUMAN_REVIEW_REQUIRED results cannot claim mapping artifacts, candidates, scrapes, expansion, commits, or errors.',
      });
    }
    return;
  }
  if (result.humanReviewRequired) {
    context.addIssue({
      code: 'custom',
      path: ['humanReviewRequired'],
      message: 'Structured human-review reasons are only valid for HUMAN_REVIEW_REQUIRED results.',
    });
  }
  if (
    result.dateTimeReview
    && result.dateTimeReview.candidateCount !== result.candidateCount
  ) {
    context.addIssue({
      code: 'custom',
      path: ['dateTimeReview', 'candidateCount'],
      message: 'Datetime review candidateCount must match the ingestion result.',
    });
  }
  if (result.status !== 'REVIEW_REQUIRED' && result.dateTimeReview) {
    context.addIssue({
      code: 'custom',
      path: ['dateTimeReview'],
      message: 'Datetime review evidence is only valid for REVIEW_REQUIRED mapping results.',
    });
  }
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

export const buildCodexAffiliateUnsupportedSportHumanReviewResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  sourceSportLabels: string[];
  rationale?: string;
  blockingIssues?: string[];
}): CodexAffiliateIngestionResult => codexAffiliateIngestionResultSchema.parse({
  schemaVersion: 1,
  jobId: input.jobId,
  intakeId: input.intakeId,
  sourceKey: input.sourceKey,
  workerId: input.workerId,
  status: 'HUMAN_REVIEW_REQUIRED',
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
    warnings: ['Unsupported source sports were preserved as evidence only.'],
  },
  humanReviewRequired: {
    reasonCodes: ['SPORT_NOT_IN_CATALOG'],
    sourceSportLabels: Array.from(new Set(input.sourceSportLabels.map((label) => label.trim()).filter(Boolean))),
    rationale: input.rationale
      ?? 'The source sport is not an exact current BracketIQ Sports catalog name.',
    blockingIssues: input.blockingIssues ?? [],
    requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
  },
  errorMessage: null,
});
