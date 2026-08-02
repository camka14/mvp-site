import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const identifier = nonEmptyString.max(2_000);
const reviewerId = nonEmptyString.max(80).regex(
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
  'Reviewer id contains unsupported characters.',
);

export const affiliateMappingReviewDispositionSchema = z.object({
  nextAction: z.enum(['PRODUCER_REPAIR', 'HUMAN_REVIEW_REQUIRED']),
  reasonCodes: z.array(z.enum([
    'LIVE_SETUP_UNSUPPORTED',
    'EVENT_LOCATION_INVALID',
    'EVENT_DIVISION_GROUPING_INVALID',
    'EVENT_DIVISION_CLASSIFICATION_INVALID',
    'EVENT_PRICING_INVALID',
    'EVENT_CAPACITY_INVALID',
    'OFFICIAL_LOGO_REPAIR_REQUIRED',
    'NO_VERIFIABLE_OFFICIAL_LOGO',
    'PACKAGE_VALIDATION_FAILED',
    'DUPLICATE_SAFETY_INVALID',
    'INSUFFICIENT_STORED_EVIDENCE',
    'CONFLICTING_LIVE_RECORD',
    'OTHER_PRODUCER_DEFECT',
    'UNCLASSIFIED_TERMINAL_FAILURE',
    'RETRY_LIMIT_EXCEEDED',
  ])).min(1).max(20),
}).strict();

export const affiliateApprovalResultSchema = z.object({
  schemaVersion: z.literal(1),
  approvalJobId: identifier,
  subjectType: z.enum(['DOMAIN_POLICY', 'MAPPING_PACKAGE']),
  subjectKey: identifier,
  reviewerId,
  decision: z.enum(['ALLOW', 'BLOCK', 'APPROVE', 'REJECT', 'DEFER']),
  confidence: z.number().min(0).max(1),
  rationale: nonEmptyString.max(10_000),
  evidenceReferences: z.array(z.object({
    kind: nonEmptyString.max(100),
    identifier,
    finding: nonEmptyString.max(5_000),
  }).strict()).min(1).max(50),
  checks: z.object({
    robotsReviewed: z.boolean(),
    termsReviewed: z.boolean(),
    storedEvidenceSufficient: z.boolean(),
    identityIndependent: z.boolean(),
    packageValidationPassed: z.boolean(),
    officialLogoVerified: z.boolean(),
    duplicateSafetyVerified: z.boolean(),
  }).strict(),
  blockingIssues: z.array(nonEmptyString.max(5_000)).max(30).default([]),
  mappingDisposition: affiliateMappingReviewDispositionSchema.optional(),
}).strict().superRefine((result, context) => {
  const domainDecisions = new Set(['ALLOW', 'BLOCK', 'DEFER']);
  const mappingDecisions = new Set(['APPROVE', 'REJECT', 'DEFER']);
  if (result.subjectType === 'DOMAIN_POLICY' && !domainDecisions.has(result.decision)) {
    context.addIssue({
      code: 'custom',
      path: ['decision'],
      message: 'Domain policy reviews may only ALLOW, BLOCK, or DEFER.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && !mappingDecisions.has(result.decision)) {
    context.addIssue({
      code: 'custom',
      path: ['decision'],
      message: 'Mapping package reviews may only APPROVE, REJECT, or DEFER.',
    });
  }
  if (result.subjectType === 'DOMAIN_POLICY' && result.decision !== 'DEFER') {
    if (!result.checks.robotsReviewed || !result.checks.termsReviewed || !result.checks.storedEvidenceSufficient) {
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'A terminal domain decision requires reviewed robots, terms, and sufficient stored evidence.',
      });
    }
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision === 'APPROVE') {
    if (
      !result.checks.identityIndependent
      || !result.checks.packageValidationPassed
      || !result.checks.officialLogoVerified
      || !result.checks.duplicateSafetyVerified
      || !result.checks.storedEvidenceSufficient
    ) {
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'Mapping approval requires independent identity, evidence, validation, official logo, and duplicate-safety checks.',
      });
    }
  }
  if (result.subjectType === 'DOMAIN_POLICY' && result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Domain policy reviews cannot contain a mapping disposition.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision === 'APPROVE' && result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Approved mapping packages cannot contain a follow-up disposition.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision !== 'APPROVE' && !result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Rejected or deferred mapping packages require a producer-repair or human-review disposition.',
    });
  }
  if (
    result.subjectType === 'MAPPING_PACKAGE'
    && result.decision === 'DEFER'
    && result.mappingDisposition?.nextAction !== 'HUMAN_REVIEW_REQUIRED'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'nextAction'],
      message: 'Deferred mapping packages must stop for human review.',
    });
  }
  const producerReasonCodes = new Set([
    'LIVE_SETUP_UNSUPPORTED',
    'EVENT_LOCATION_INVALID',
    'EVENT_DIVISION_GROUPING_INVALID',
    'EVENT_DIVISION_CLASSIFICATION_INVALID',
    'EVENT_PRICING_INVALID',
    'EVENT_CAPACITY_INVALID',
    'OFFICIAL_LOGO_REPAIR_REQUIRED',
    'PACKAGE_VALIDATION_FAILED',
    'DUPLICATE_SAFETY_INVALID',
    'OTHER_PRODUCER_DEFECT',
  ]);
  const disposition = result.mappingDisposition;
  if (
    disposition?.nextAction === 'PRODUCER_REPAIR'
    && disposition.reasonCodes.some((reasonCode) => !producerReasonCodes.has(reasonCode))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'reasonCodes'],
      message: 'Producer repair may contain only concrete producer-defect reason codes.',
    });
  }
  if (
    disposition?.nextAction === 'HUMAN_REVIEW_REQUIRED'
    && disposition.reasonCodes.some((reasonCode) => producerReasonCodes.has(reasonCode))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'reasonCodes'],
      message: 'Human review may contain only evidence, conflict, retry-limit, or unclassified reason codes.',
    });
  }
  if (['ALLOW', 'APPROVE'].includes(result.decision) && result.blockingIssues.length) {
    context.addIssue({
      code: 'custom',
      path: ['blockingIssues'],
      message: 'Positive approvals cannot contain blocking issues.',
    });
  }
  if (['BLOCK', 'REJECT', 'DEFER'].includes(result.decision) && !result.blockingIssues.length) {
    context.addIssue({
      code: 'custom',
      path: ['blockingIssues'],
      message: 'Blocked, rejected, or deferred reviews require at least one concrete issue.',
    });
  }
});

export type AffiliateApprovalResult = z.infer<typeof affiliateApprovalResultSchema>;
export type AffiliateMappingReviewDisposition = z.infer<typeof affiliateMappingReviewDispositionSchema>;
