import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const identifier = nonEmptyString.max(2_000);
const reviewerId = nonEmptyString.max(80).regex(
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
  'Reviewer id contains unsupported characters.',
);

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
