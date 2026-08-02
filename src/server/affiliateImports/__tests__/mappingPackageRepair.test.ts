/** @jest-environment node */

import { affiliateMappingProducerRepairEligibility } from '../mappingPackageRepair';

describe('affiliate mapping producer repair eligibility', () => {
  const reviewResult = (logoDisposition: 'OFFICIAL_ASSET' | 'MANUAL_REVIEW') => ({
    result: {
      schemaVersion: 1,
      jobId: 'job-1',
      intakeId: 'intake-1',
      sourceKey: 'source-1',
      workerId: 'producer-1',
      status: 'REVIEW_REQUIRED',
      branch: 'codex/affiliate-ingestion-live',
      commit: 'a'.repeat(40),
      generatedPaths: ['scripts/setup-source-1-affiliate-source.ts'],
      logoDisposition,
      candidateCount: 1,
      reviewScrapes: [
        { runId: 'run-1', candidateCount: 1, normalizedCandidateSha256: 'b'.repeat(64), passed: true },
        { runId: 'run-2', candidateCount: 1, normalizedCandidateSha256: 'b'.repeat(64), passed: true },
      ],
      validation: {
        testsPassed: true,
        diffCheckPassed: true,
        duplicateSafe: true,
        warnings: [],
      },
      errorMessage: null,
    },
  });

  const base = {
    approvalStatus: 'REJECTED',
    mappingStatus: 'FAILED',
    resultSummary: {},
  };

  it('requeues packages whose setup scripts refuse guarded live application', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['The setup script explicitly refuses --live and cannot be applied by the guarded reviewer.'],
      },
    })).toEqual(expect.objectContaining({
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'LIVE_SETUP_UNSUPPORTED',
      disposition: 'PRODUCER_REPAIR',
    }));
  });

  it('does not let stale approval evidence override a newer terminal mapping failure', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      mappingErrorMessage: 'Already-finished intake cannot be claimed again.',
      approvalDecision: {
        blockingIssues: ['The old setup script refused --live.'],
      },
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'unclassified-terminal-failure',
      repairReason: null,
      disposition: 'HUMAN_REVIEW_REQUIRED',
    }));
  });

  it('requeues packages rejected because event location failures were treated as package failures', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        rationale: 'Candidate event coordinates were missing for two extracted events.',
      },
    }).repairReason).toBe('EVENT_LOCATION_PACKAGE_REJECTION');
  });

  it('requeues unresolved official logos for a producer evidence pass', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['Official logo verification failed: logoDisposition remains MANUAL_REVIEW.'],
      },
      resultSummary: reviewResult('MANUAL_REVIEW'),
    })).toEqual(expect.objectContaining({
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'MANUAL_LOGO_REVIEW',
      disposition: 'PRODUCER_REPAIR',
    }));
  });

  it('does not label an official-logo package as a manual-logo repair', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['Official logo verification failed: logoDisposition remains MANUAL_REVIEW.'],
      },
      resultSummary: reviewResult('OFFICIAL_ASSET'),
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'unclassified-terminal-failure',
      repairReason: null,
      disposition: 'HUMAN_REVIEW_REQUIRED',
    }));
  });

  it('does not recycle unrelated package defects', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: { blockingIssues: ['The official logo is not supported by stored evidence.'] },
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'unclassified-terminal-failure',
      repairReason: null,
      disposition: 'HUMAN_REVIEW_REQUIRED',
    }));
  });

  it('requeues a historical guarded-live deferral', () => {
    expect(affiliateMappingProducerRepairEligibility({
      approvalStatus: 'DEFERRED',
      mappingStatus: 'REVIEW_REQUIRED',
      approvalDecision: {
        blockingIssues: ['The setup script refuses --live and cannot pass guarded application.'],
      },
    })).toEqual(expect.objectContaining({
      eligible: true,
      repairReason: 'LIVE_SETUP_UNSUPPORTED',
      disposition: 'PRODUCER_REPAIR',
    }));
  });

  it('marks an ordinary historical deferral for human review instead of retrying it', () => {
    expect(affiliateMappingProducerRepairEligibility({
      approvalStatus: 'DEFERRED',
      mappingStatus: 'REVIEW_REQUIRED',
      approvalDecision: {
        blockingIssues: ['No stored official logo can be verified.'],
      },
      resultSummary: reviewResult('MANUAL_REVIEW'),
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'historical-deferred-evidence-review',
      disposition: 'HUMAN_REVIEW_REQUIRED',
    }));
  });

  it('honors a structured producer repair disposition without heuristic text matching', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        mappingDisposition: {
          nextAction: 'PRODUCER_REPAIR',
          reasonCodes: ['EVENT_PRICING_INVALID'],
        },
      },
    })).toEqual(expect.objectContaining({
      eligible: true,
      repairReason: 'EVENT_PRICING_INVALID',
      disposition: 'PRODUCER_REPAIR',
      reasonCodes: ['EVENT_PRICING_INVALID'],
    }));
  });

  it('preserves reason codes for jobs already marked for human review', () => {
    expect(affiliateMappingProducerRepairEligibility({
      approvalStatus: 'DEFERRED',
      mappingStatus: 'HUMAN_REVIEW_REQUIRED',
      approvalDecision: {},
      resultSummary: {
        humanReviewRequired: {
          reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
        },
      },
    })).toEqual(expect.objectContaining({
      disposition: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
    }));
  });

  it('leaves old producer-handoff failures for the evidence-verified reviewer retry', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['The producer commit cannot be resolved in the reviewer checkout.'],
      },
    })).toEqual(expect.objectContaining({
      disposition: null,
      reason: 'reviewer-handoff-retry-required',
    }));
  });

  it('stops a historical package when the review proved no official logo exists', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['No verifiable official logo or organization mark exists in stored evidence.'],
      },
      resultSummary: reviewResult('MANUAL_REVIEW'),
    })).toEqual(expect.objectContaining({
      disposition: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
    }));
  });

  it('recognizes a terminal producer logo-evidence exhaustion message', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      mappingErrorMessage: 'MANUAL_LOGO_REVIEW repair cannot be resolved from the stored intake: the official header has no stored image asset. This repair is terminally failed to prevent looping.',
      approvalDecision: {},
      resultSummary: reviewResult('MANUAL_REVIEW'),
    })).toEqual(expect.objectContaining({
      disposition: 'HUMAN_REVIEW_REQUIRED',
      reason: 'no-verifiable-official-logo',
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
    }));
  });
});
