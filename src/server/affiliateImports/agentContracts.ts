import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  affiliateScrapeMappingSchema,
  type AffiliateScrapeMapping,
} from './types';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const nonEmptyStringSchema = z.string().trim().min(1);
const nullableNonEmptyStringSchema = nonEmptyStringSchema.nullable();
const isoDateTimeSchema = z.string().datetime({ offset: true });
export const AFFILIATE_AGENT_TARGET_KINDS = ['EVENT', 'RENTAL', 'CLUB'] as const;
export type AffiliateAgentTargetKind = typeof AFFILIATE_AGENT_TARGET_KINDS[number];
export const affiliateAgentTargetKindSchema = z.enum(AFFILIATE_AGENT_TARGET_KINDS);

const affiliateAgentTargetKindSet = new Set<string>(AFFILIATE_AGENT_TARGET_KINDS);

export const isAffiliateAgentTargetKind = (
  value: unknown,
): value is AffiliateAgentTargetKind => (
  typeof value === 'string' && affiliateAgentTargetKindSet.has(value)
);

const listingKindSchema = affiliateAgentTargetKindSchema;

const internalActionHosts = new Set([
  'bracket-iq.com',
  'www.bracket-iq.com',
  'localhost',
  '127.0.0.1',
  '::1',
]);

const isOfficialExternalUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !internalActionHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const artifactEvidenceSchema = z.object({
  artifactKind: nonEmptyStringSchema,
  artifactSha256: sha256Schema,
  pageUrl: z.string().url(),
  supports: z.array(nonEmptyStringSchema).min(1),
}).strict();

const affiliateCandidateAssertionSchema = z.object({
  listingKind: listingKindSchema,
  title: nonEmptyStringSchema,
  officialActionUrl: z.string().url(),
  sourceUrl: z.string().url().nullable().optional(),
  sportName: nullableNonEmptyStringSchema.optional(),
  tags: z.array(nonEmptyStringSchema).default([]),
  venueName: nullableNonEmptyStringSchema.optional(),
  address: nullableNonEmptyStringSchema.optional(),
  city: nullableNonEmptyStringSchema.optional(),
  startsAt: isoDateTimeSchema.nullable().optional(),
  endsAt: isoDateTimeSchema.nullable().optional(),
  dateDisplayMode: z.enum(['SCHEDULED', 'NO_FIXED_DATE', 'ONGOING']).optional(),
  dateDisplayText: nullableNonEmptyStringSchema.optional(),
  priceText: nullableNonEmptyStringSchema.optional(),
  divisions: z.array(nonEmptyStringSchema).default([]),
}).strict().superRefine((candidate, context) => {
  if (!isOfficialExternalUrl(candidate.officialActionUrl)) {
    context.addIssue({
      code: 'custom',
      path: ['officialActionUrl'],
      message: 'Official action URLs must point to an external source, not BracketIQ or localhost.',
    });
  }
  if (candidate.dateDisplayMode === 'SCHEDULED' && !candidate.startsAt) {
    context.addIssue({
      code: 'custom',
      path: ['startsAt'],
      message: 'Scheduled candidates require a source-provided startsAt value.',
    });
  }
  if (
    candidate.startsAt
    && candidate.endsAt
    && new Date(candidate.endsAt).getTime() < new Date(candidate.startsAt).getTime()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'Candidate endsAt cannot be before startsAt.',
    });
  }
});

const organizationDraftSchema = z.object({
  name: nullableNonEmptyStringSchema,
  website: z.string().url().nullable(),
  description: nullableNonEmptyStringSchema,
  city: nullableNonEmptyStringSchema,
  address: nullableNonEmptyStringSchema,
}).strict();

const logoDraftSchema = z.object({
  disposition: z.enum([
    'OFFICIAL_ASSET',
    'OFFICIAL_SCREENSHOT_CROP',
    'MISSING',
    'MANUAL_REVIEW',
  ]),
  artifactSha256: sha256Schema.nullable(),
  sourceUrl: z.string().url().nullable(),
}).strict().superRefine((logo, context) => {
  if (
    (logo.disposition === 'OFFICIAL_ASSET' || logo.disposition === 'OFFICIAL_SCREENSHOT_CROP')
    && (!logo.artifactSha256 || !logo.sourceUrl)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Official logo selections require an artifact hash and source URL.',
    });
  }
  if (logo.disposition === 'MISSING' && (logo.artifactSha256 || logo.sourceUrl)) {
    context.addIssue({
      code: 'custom',
      message: 'A missing logo cannot reference an artifact or source URL.',
    });
  }
});

const evidenceSupports = (
  evidence: z.infer<typeof artifactEvidenceSchema>[],
  supportedPaths: string[],
): boolean => evidence.some((item) => item.supports.some((support) => (
  supportedPaths.includes(support)
)));

const validateScheduledEvidence = (
  draft: {
    evidence: z.infer<typeof artifactEvidenceSchema>[];
    expectedCandidates: z.infer<typeof affiliateCandidateAssertionSchema>[];
    mapping: AffiliateScrapeMapping | null;
  },
  context: z.RefinementCtx,
) => {
  draft.expectedCandidates.forEach((candidate, index) => {
    if (!candidate.startsAt) return;
    const supported = evidenceSupports(draft.evidence, [
      'startsAt',
      'scheduledDate',
      `expectedCandidates.${index}.startsAt`,
    ]);
    if (!supported) {
      context.addIssue({
        code: 'custom',
        path: ['expectedCandidates', index, 'startsAt'],
        message: 'Scheduled candidate dates require a cited intake artifact.',
      });
    }
  });

  draft.mapping?.manualCandidates?.forEach((candidate, index) => {
    if (!candidate.startsAt) return;
    const supported = evidenceSupports(draft.evidence, [
      'startsAt',
      'scheduledDate',
      `manualCandidates.${index}.startsAt`,
      `mapping.manualCandidates.${index}.startsAt`,
    ]);
    if (!supported) {
      context.addIssue({
        code: 'custom',
        path: ['mapping', 'manualCandidates', index, 'startsAt'],
        message: 'Manual candidate dates require a cited intake artifact.',
      });
    }
  });
};

export const affiliateSourceDraftSchema = z.object({
  schemaVersion: z.literal(1),
  intakeId: nonEmptyStringSchema,
  sourceKey: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  policyDisposition: z.enum(['ALLOWED', 'BLOCKED', 'NEEDS_REVIEW']),
  implementationMode: z.enum([
    'GENERIC_MAPPING',
    'MANUAL_CANDIDATES',
    'CUSTOM_EXTRACTOR_REQUIRED',
    'BLOCKED',
    'INSUFFICIENT_EVIDENCE',
  ]),
  listingKind: listingKindSchema.nullable(),
  evidence: z.array(artifactEvidenceSchema),
  organization: organizationDraftSchema,
  mapping: affiliateScrapeMappingSchema.nullable(),
  expectedCandidates: z.array(affiliateCandidateAssertionSchema).default([]),
  logo: logoDraftSchema,
  warnings: z.array(nonEmptyStringSchema).default([]),
  unresolvedQuestions: z.array(nonEmptyStringSchema).default([]),
}).strict().superRefine((draft, context) => {
  const executableMode = (
    draft.implementationMode === 'GENERIC_MAPPING'
    || draft.implementationMode === 'MANUAL_CANDIDATES'
  );
  const refusalMode = (
    draft.implementationMode === 'BLOCKED'
    || draft.implementationMode === 'INSUFFICIENT_EVIDENCE'
  );

  if (draft.policyDisposition !== 'ALLOWED' && draft.mapping) {
    context.addIssue({
      code: 'custom',
      path: ['mapping'],
      message: 'Blocked or review-required sources cannot contain an executable mapping.',
    });
  }
  if (draft.policyDisposition === 'BLOCKED' && draft.implementationMode !== 'BLOCKED') {
    context.addIssue({
      code: 'custom',
      path: ['implementationMode'],
      message: 'A blocked policy requires BLOCKED implementation mode.',
    });
  }
  if (draft.policyDisposition !== 'ALLOWED' && !refusalMode) {
    context.addIssue({
      code: 'custom',
      path: ['implementationMode'],
      message: 'A non-allowed policy must stop as BLOCKED or INSUFFICIENT_EVIDENCE.',
    });
  }
  if (executableMode && draft.policyDisposition !== 'ALLOWED') {
    context.addIssue({
      code: 'custom',
      path: ['policyDisposition'],
      message: 'Executable mappings require an ALLOWED policy.',
    });
  }
  if (executableMode && !draft.mapping) {
    context.addIssue({
      code: 'custom',
      path: ['mapping'],
      message: 'Executable implementation modes require a mapping.',
    });
  }
  if (executableMode && !draft.listingKind) {
    context.addIssue({
      code: 'custom',
      path: ['listingKind'],
      message: 'Executable implementation modes require an EVENT, RENTAL, or CLUB listing kind.',
    });
  }
  if (draft.mapping?.kind === 'TEAM') {
    context.addIssue({
      code: 'custom',
      path: ['mapping', 'kind'],
      message: 'Affiliate mapping agents cannot create TEAM mappings; represent clubs as CLUB.',
    });
  }
  if (executableMode && draft.evidence.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['evidence'],
      message: 'Executable mappings require cited intake evidence.',
    });
  }
  if (
    (refusalMode || draft.implementationMode === 'CUSTOM_EXTRACTOR_REQUIRED')
    && draft.mapping
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mapping'],
      message: 'Refusal and custom-extractor proposals cannot include executable mappings.',
    });
  }
  if (
    draft.mapping
    && draft.listingKind
    && draft.mapping.kind !== draft.listingKind
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mapping', 'kind'],
      message: 'Mapping kind must match the draft listing kind.',
    });
  }
  if (
    draft.implementationMode === 'MANUAL_CANDIDATES'
    && !draft.mapping?.manualCandidates?.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mapping', 'manualCandidates'],
      message: 'MANUAL_CANDIDATES mode requires at least one manual candidate.',
    });
  }
  if (
    draft.implementationMode === 'GENERIC_MAPPING'
    && draft.mapping?.manualCandidates?.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mapping', 'manualCandidates'],
      message: 'GENERIC_MAPPING mode cannot contain manual candidates.',
    });
  }
  if (executableMode && draft.expectedCandidates.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['expectedCandidates'],
      message: 'Executable drafts require at least one expected candidate assertion.',
    });
  }
  if (draft.listingKind) {
    draft.expectedCandidates.forEach((candidate, index) => {
      if (candidate.listingKind !== draft.listingKind) {
        context.addIssue({
          code: 'custom',
          path: ['expectedCandidates', index, 'listingKind'],
          message: 'Expected candidate kind must match the draft listing kind.',
        });
      }
    });
  }
  validateScheduledEvidence(draft, context);
});

const modelRevisionSchema = z.object({
  family: nonEmptyStringSchema,
  upstreamRepository: nonEmptyStringSchema,
  upstreamRevision: nonEmptyStringSchema,
  artifactSha256: sha256Schema,
  adapterRevision: nonEmptyStringSchema.nullable().default(null),
  promptTemplateRevision: nonEmptyStringSchema,
}).strict();

const generatedFileSchema = z.object({
  path: nonEmptyStringSchema,
  sha256: sha256Schema,
}).strict();

export const affiliateMappingWorkerResultSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyStringSchema,
  intakeId: nonEmptyStringSchema,
  status: z.enum(['DRAFT_READY', 'REFUSED', 'FAILED']),
  workerId: nonEmptyStringSchema,
  model: modelRevisionSchema,
  modelManifestSha256: sha256Schema,
  promptContractVersion: z.number().int().positive(),
  evidenceRunId: nonEmptyStringSchema,
  evidenceArtifactSha256s: z.array(sha256Schema),
  draft: affiliateSourceDraftSchema.nullable(),
  draftSha256: sha256Schema.nullable(),
  generatedFiles: z.array(generatedFileSchema).default([]),
  validation: z.object({
    schemaPassed: z.boolean(),
    testsPassed: z.boolean(),
    scrapePassed: z.boolean(),
    warnings: z.array(nonEmptyStringSchema).default([]),
  }).strict(),
  timingsMs: z.record(nonEmptyStringSchema, z.number().nonnegative()),
  errorMessage: nullableNonEmptyStringSchema,
}).strict().superRefine((result, context) => {
  if (result.status === 'DRAFT_READY' && (!result.draft || !result.draftSha256)) {
    context.addIssue({
      code: 'custom',
      path: ['draft'],
      message: 'DRAFT_READY results require a draft and draft hash.',
    });
  }
  if (result.status === 'FAILED' && !result.errorMessage) {
    context.addIssue({
      code: 'custom',
      path: ['errorMessage'],
      message: 'FAILED results require an error message.',
    });
  }
  if (result.status === 'REFUSED' && result.draft?.mapping) {
    context.addIssue({
      code: 'custom',
      path: ['draft', 'mapping'],
      message: 'Refused results cannot include an executable mapping.',
    });
  }
});

const reviewIssueSchema = z.object({
  code: nonEmptyStringSchema,
  severity: z.enum(['BLOCKING', 'WARNING', 'SUGGESTION']),
  message: nonEmptyStringSchema,
  artifactSha256: sha256Schema.nullable(),
  evidencePath: nullableNonEmptyStringSchema,
}).strict();

export const affiliateMappingReviewSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyStringSchema,
  workerResultSha256: sha256Schema,
  reviewer: z.object({
    provider: nonEmptyStringSchema,
    model: nonEmptyStringSchema,
    configurationSha256: sha256Schema,
  }).strict(),
  outcome: z.enum(['APPROVE_RECOMMENDATION', 'REQUEST_CHANGES', 'REJECT']),
  issues: z.array(reviewIssueSchema),
  correctedDraft: affiliateSourceDraftSchema.nullable(),
  suggestedPatch: nullableNonEmptyStringSchema,
  testAdditions: z.array(nonEmptyStringSchema).default([]),
  confidence: z.number().min(0).max(1),
  trainingEligibility: z.enum(['ELIGIBLE_AFTER_HUMAN_APPROVAL', 'EVALUATION_ONLY', 'INELIGIBLE']),
  reviewedAt: isoDateTimeSchema,
}).strict().superRefine((review, context) => {
  const blockingIssues = review.issues.filter((issue) => issue.severity === 'BLOCKING');
  if (review.outcome === 'APPROVE_RECOMMENDATION' && blockingIssues.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['issues'],
      message: 'An approval recommendation cannot contain blocking issues.',
    });
  }
  if (review.outcome === 'REQUEST_CHANGES' && !review.correctedDraft && !review.suggestedPatch) {
    context.addIssue({
      code: 'custom',
      path: ['correctedDraft'],
      message: 'Requested changes require a corrected draft or suggested patch.',
    });
  }
});

const trainingArtifactSchema = z.object({
  kind: nonEmptyStringSchema,
  sha256: sha256Schema,
}).strict();

export const affiliateMappingTrainingExampleSchema = z.object({
  schemaVersion: z.literal(1),
  exampleId: nonEmptyStringSchema,
  evidenceLabel: z.enum(['FAITHFUL', 'LEGACY_PARTIAL', 'STALE', 'BLOCKED']),
  input: z.object({
    intakeSourceKey: nonEmptyStringSchema,
    runId: nonEmptyStringSchema,
    artifacts: z.array(trainingArtifactSchema).min(1),
    contextContractVersion: z.number().int().positive(),
  }).strict(),
  output: z.object({
    draftHash: sha256Schema,
    approvedMappingHash: sha256Schema.nullable(),
    approvedCandidateFixtureHash: sha256Schema.nullable(),
  }).strict().nullable(),
  correction: z.object({
    workerDraftHash: sha256Schema,
    reviewHash: sha256Schema,
    approvedCorrectedDraftHash: sha256Schema,
  }).strict().nullable().default(null),
  split: z.enum(['train', 'validation', 'test']),
  registrableDomain: nonEmptyStringSchema,
  platformFamily: nullableNonEmptyStringSchema,
  humanApproval: z.object({
    approvedByUserId: nonEmptyStringSchema,
    approvedAt: isoDateTimeSchema,
  }).strict().nullable(),
}).strict().superRefine((example, context) => {
  if (example.evidenceLabel === 'FAITHFUL' && (!example.output || !example.humanApproval)) {
    context.addIssue({
      code: 'custom',
      message: 'FAITHFUL examples require approved output and human approval.',
    });
  }
  if (example.evidenceLabel === 'BLOCKED' && example.output?.approvedMappingHash) {
    context.addIssue({
      code: 'custom',
      path: ['output', 'approvedMappingHash'],
      message: 'BLOCKED examples cannot contain an approved mapping.',
    });
  }
  if (
    (example.evidenceLabel === 'LEGACY_PARTIAL' || example.evidenceLabel === 'STALE')
    && example.split === 'train'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['split'],
      message: 'LEGACY_PARTIAL and STALE examples cannot enter the training split.',
    });
  }
});

export const openWeightModelManifestSchema = z.object({
  schemaVersion: z.literal(1),
  upstreamRepository: nonEmptyStringSchema,
  upstreamRevision: nonEmptyStringSchema,
  modelFamily: nonEmptyStringSchema,
  weightArtifacts: z.array(z.object({
    filename: nonEmptyStringSchema,
    sha256: sha256Schema,
  }).strict()).min(1),
  tokenizerRevision: nonEmptyStringSchema,
  promptTemplateRevision: nonEmptyStringSchema,
  license: z.object({
    spdxId: nonEmptyStringSchema,
    textSha256: sha256Schema,
    notices: z.array(nonEmptyStringSchema),
    commercialUseApproved: z.boolean(),
    modificationApproved: z.boolean(),
    derivativeDeploymentApproved: z.boolean(),
  }).strict(),
  runtimeSourceRepository: nonEmptyStringSchema,
  runtimeRevision: nonEmptyStringSchema,
  trainingSourceRepository: nonEmptyStringSchema,
  trainingStackRevision: nonEmptyStringSchema,
  quantization: z.object({
    format: nonEmptyStringSchema,
    sourceCheckpointSha256: sha256Schema,
    artifactSha256: sha256Schema,
  }).strict(),
  offlineColdStartVerifiedAt: isoDateTimeSchema.nullable(),
  requiresVendorApi: z.literal(false),
}).strict();

export type AffiliateCandidateAssertion = z.infer<typeof affiliateCandidateAssertionSchema>;
export type AffiliateSourceDraft = z.infer<typeof affiliateSourceDraftSchema>;
export type AffiliateMappingWorkerResult = z.infer<typeof affiliateMappingWorkerResultSchema>;
export type AffiliateMappingReview = z.infer<typeof affiliateMappingReviewSchema>;
export type AffiliateMappingTrainingExample = z.infer<typeof affiliateMappingTrainingExampleSchema>;
export type OpenWeightModelManifest = z.infer<typeof openWeightModelManifestSchema>;
export type ModelRevision = z.infer<typeof modelRevisionSchema>;

export const openWeightModelEligibilityIssues = (
  manifest: OpenWeightModelManifest,
  options: { requireOfflineColdStart?: boolean } = {},
): string[] => {
  const issues: string[] = [];
  if (!manifest.license.commercialUseApproved) issues.push('Commercial use is not approved.');
  if (!manifest.license.modificationApproved) issues.push('Weight modification is not approved.');
  if (!manifest.license.derivativeDeploymentApproved) {
    issues.push('Derivative checkpoint deployment is not approved.');
  }
  if (manifest.requiresVendorApi) issues.push('The model requires a vendor API.');
  if (options.requireOfflineColdStart && !manifest.offlineColdStartVerifiedAt) {
    issues.push('Offline cold start has not been verified.');
  }
  return issues;
};

export const assertOpenWeightModelEligible = (
  value: unknown,
  options: { requireOfflineColdStart?: boolean } = {},
): OpenWeightModelManifest => {
  const manifest = openWeightModelManifestSchema.parse(value);
  const issues = openWeightModelEligibilityIssues(manifest, options);
  if (issues.length) throw new Error(`Open-weight model is ineligible: ${issues.join(' ')}`);
  return manifest;
};

const stableAgentArtifactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableAgentArtifactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableAgentArtifactValue(nested)]),
    );
  }
  return value;
};

export const stableAgentArtifactSha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(stableAgentArtifactValue(value)))
  .digest('hex');
