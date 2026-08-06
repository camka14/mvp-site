/** @jest-environment node */

import { affiliateApprovalResultSchema } from '../approvalResult';

const checks = {
  robotsReviewed: true,
  termsReviewed: true,
  storedEvidenceSufficient: true,
  identityIndependent: true,
  packageValidationPassed: false,
  sportQualityVerified: false,
  descriptionQualityVerified: false,
  dateTimeQualityVerified: false,
  officialLogoVerified: false,
  logoAbsenceAccepted: false,
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

  it('accepts an otherwise-valid mapping when the completed review establishes no official logo is present', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'APPROVE',
      checks: {
        ...checks,
        packageValidationPassed: true,
        sportQualityVerified: true,
        descriptionQualityVerified: true,
        dateTimeQualityVerified: true,
        logoAbsenceAccepted: true,
        duplicateSafetyVerified: true,
      },
    }).checks.logoAbsenceAccepted).toBe(true);
  });

  it('does not allow a review to verify a logo and accept its absence simultaneously', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'APPROVE',
      checks: {
        ...checks,
        packageValidationPassed: true,
        sportQualityVerified: true,
        dateTimeQualityVerified: true,
        descriptionQualityVerified: true,
        officialLogoVerified: true,
        logoAbsenceAccepted: true,
        duplicateSafetyVerified: true,
      },
    })).toThrow('cannot both verify an official logo and accept');
  });

  it('requires a concrete issue for deferred reviews', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      decision: 'DEFER',
      blockingIssues: [],
    })).toThrow('require at least one concrete issue');
  });

  it('requires an explicit independent description-quality check for approval', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'APPROVE',
      checks: {
        ...checks,
        packageValidationPassed: true,
        sportQualityVerified: true,
        officialLogoVerified: true,
        dateTimeQualityVerified: true,
        duplicateSafetyVerified: true,
      },
    })).toThrow('description validation');
  });

  it('requires independent datetime verification for mapping approval', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'APPROVE',
      checks: {
        ...checks,
        packageValidationPassed: true,
        sportQualityVerified: true,
        descriptionQualityVerified: true,
        officialLogoVerified: true,
        duplicateSafetyVerified: true,
      },
    })).toThrow('datetime validation');
  });

  it('requires an explicit follow-up disposition for a rejected mapping package', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['An accepted event has no usable location.'],
    })).toThrow('require a producer-repair or human-review disposition');
  });

  it('accepts a machine-readable producer repair disposition', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['An accepted event has no usable location.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['EVENT_LOCATION_INVALID'],
      },
    }).mappingDisposition).toEqual({
      nextAction: 'PRODUCER_REPAIR',
      reasonCodes: ['EVENT_LOCATION_INVALID'],
    });
  });

  it('accepts a missing organization locality as a producer repair', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['The organization omitted an evidenced city and coordinates.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['ORGANIZATION_LOCATION_INVALID'],
      },
    }).mappingDisposition?.reasonCodes).toEqual(['ORGANIZATION_LOCATION_INVALID']);
  });

  it('accepts description defects as producer repairs', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['The event description narrates where it was listed.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['EVENT_DESCRIPTION_INVALID', 'ORGANIZATION_DESCRIPTION_INVALID'],
      },
    }).mappingDisposition?.reasonCodes).toEqual([
      'EVENT_DESCRIPTION_INVALID',
      'ORGANIZATION_DESCRIPTION_INVALID',
    ]);
  });

  it('accepts a noncanonical catalog name as a producer repair', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['Use the exact catalog name Indoor Volleyball.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['SPORT_NAME_INVALID'],
      },
    }).mappingDisposition?.reasonCodes).toEqual(['SPORT_NAME_INVALID']);
  });

  it('routes a sport absent from the catalog only to human review', () => {
    expect(affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['Badminton is not in the BracketIQ sports catalog.'],
      mappingDisposition: {
        nextAction: 'HUMAN_REVIEW_REQUIRED',
        reasonCodes: ['SPORT_NOT_IN_CATALOG'],
      },
    }).mappingDisposition?.reasonCodes).toEqual(['SPORT_NOT_IN_CATALOG']);

    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['Badminton is not in the BracketIQ sports catalog.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['SPORT_NOT_IN_CATALOG'],
      },
    })).toThrow('concrete producer-defect reason codes');
  });

  it('reserves mapping deferral for terminal human review', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'DEFER',
      blockingIssues: ['Stored identity evidence is contradictory.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['OTHER_PRODUCER_DEFECT'],
      },
    })).toThrow('must stop for human review');
  });

  it('does not allow mapping dispositions on domain reviews', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      mappingDisposition: {
        nextAction: 'HUMAN_REVIEW_REQUIRED',
        reasonCodes: ['INSUFFICIENT_STORED_EVIDENCE'],
      },
    })).toThrow('Domain policy reviews cannot contain');
  });

  it('does not disguise an evidence gap as an automatic producer repair', () => {
    expect(() => affiliateApprovalResultSchema.parse({
      ...domainResult,
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      decision: 'REJECT',
      blockingIssues: ['No official logo exists in stored evidence.'],
      mappingDisposition: {
        nextAction: 'PRODUCER_REPAIR',
        reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
      },
    })).toThrow('concrete producer-defect reason codes');
  });
});
