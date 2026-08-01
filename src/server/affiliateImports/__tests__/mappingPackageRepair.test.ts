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
    })).toEqual({
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'LIVE_SETUP_UNSUPPORTED',
    });
  });

  it('does not let stale approval evidence override a newer terminal mapping failure', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      mappingErrorMessage: 'Already-finished intake cannot be claimed again.',
      approvalDecision: {
        blockingIssues: ['The old setup script refused --live.'],
      },
    })).toEqual({
      eligible: false,
      reason: 'unrelated-producer-defect',
      repairReason: null,
    });
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
    })).toEqual({
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'MANUAL_LOGO_REVIEW',
    });
  });

  it('does not label an official-logo package as a manual-logo repair', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: {
        blockingIssues: ['Official logo verification failed: logoDisposition remains MANUAL_REVIEW.'],
      },
      resultSummary: reviewResult('OFFICIAL_ASSET'),
    })).toEqual({
      eligible: false,
      reason: 'unrelated-producer-defect',
      repairReason: null,
    });
  });

  it('does not recycle unrelated package defects', () => {
    expect(affiliateMappingProducerRepairEligibility({
      ...base,
      approvalDecision: { blockingIssues: ['The official logo is not supported by stored evidence.'] },
    })).toEqual({
      eligible: false,
      reason: 'unrelated-producer-defect',
      repairReason: null,
    });
  });
});
