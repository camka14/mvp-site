/** @jest-environment node */

import { affiliateApprovalResultSchema } from '../approvalResult';

const checks = {
  robotsReviewed: true,
  termsReviewed: true,
  storedEvidenceSufficient: true,
  identityIndependent: true,
  packageValidationPassed: false,
  officialLogoVerified: false,
  duplicateSafetyVerified: false,
};

const domainResult = {
  schemaVersion: 1 as const,
  approvalJobId: 'approval_1',
  subjectType: 'DOMAIN_POLICY' as const,
  subjectKey: 'example.test',
  reviewerId: 'codex-luna-approval-vm-1',
  decision: 'ALLOW' as const,
  confidence: 0.9,
  rationale: 'Stored public policy evidence permits the bounded capture.',
  evidenceReferences: [{
    kind: 'DOMAIN_POLICY_RESOURCE',
    identifier: 'https://example.test/terms',
    finding: 'No restriction applies to the bounded public listing capture.',
  }],
  checks,
  blockingIssues: [],
};

describe('affiliate approval result', () => {
  it('accepts an evidence-backed domain allowance', () => {
    expect(affiliateApprovalResultSchema.parse(domainResult)).toEqual(domainResult);
  });

  it('requires policy evidence for a terminal domain decision', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      checks: { ...checks, termsReviewed: false },
    })).toThrow('terminal domain decision');
  });

  it('requires all independent validation checks for mapping approval', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'APPROVE',
    })).toThrow('Mapping approval requires');
  });

  it('requires a concrete issue for deferred reviews', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      decision: 'DEFER',
      blockingIssues: [],
    })).toThrow('require at least one concrete issue');
  });
});
