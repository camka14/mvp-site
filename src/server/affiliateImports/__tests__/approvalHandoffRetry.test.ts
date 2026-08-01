/** @jest-environment node */

import { affiliateMappingHandoffRetryEligibility } from '../approvalHandoffRetry';

const resultSummary = (logoDisposition: 'OFFICIAL_ASSET' | 'MANUAL_REVIEW') => ({
  result: {
    schemaVersion: 1,
    jobId: 'job-1',
    intakeId: 'intake-1',
    sourceKey: 'source-1',
    workerId: 'producer-1',
    status: 'REVIEW_REQUIRED',
    branch: 'codex/affiliate-ingestion-live',
    commit: 'a'.repeat(40),
    generatedPaths: ['scripts/setup-example-affiliate-source.ts'],
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

const decision = {
  rationale: 'The producer commit and package files cannot be resolved.',
  blockingIssues: ['The review scrape IDs and candidate output are absent from live.'],
};

describe('affiliate mapping handoff retry eligibility', () => {
  it('selects official-logo rejection and deferral states caused by the old handoff', () => {
    expect(affiliateMappingHandoffRetryEligibility({
      approvalStatus: 'REJECTED',
      approvalDecision: decision,
      mappingStatus: 'FAILED',
      resultSummary: resultSummary('OFFICIAL_ASSET'),
    })).toEqual(expect.objectContaining({ eligible: true }));
    expect(affiliateMappingHandoffRetryEligibility({
      approvalStatus: 'DEFERRED',
      approvalDecision: decision,
      mappingStatus: 'REVIEW_REQUIRED',
      resultSummary: resultSummary('OFFICIAL_ASSET'),
    })).toEqual(expect.objectContaining({ eligible: true }));
  });

  it('does not retry manual-logo packages or genuine producer defects', () => {
    expect(affiliateMappingHandoffRetryEligibility({
      approvalStatus: 'REJECTED',
      approvalDecision: decision,
      mappingStatus: 'FAILED',
      resultSummary: resultSummary('MANUAL_REVIEW'),
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'manual-logo-review-still-required',
    }));
    expect(affiliateMappingHandoffRetryEligibility({
      approvalStatus: 'REJECTED',
      approvalDecision: { blockingIssues: ['Parser emitted an incorrect date.'] },
      mappingStatus: 'FAILED',
      resultSummary: resultSummary('OFFICIAL_ASSET'),
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'decision-does-not-match-handoff-failure',
    }));
  });

  it('requires the mapping status produced by the terminal approval decision', () => {
    expect(affiliateMappingHandoffRetryEligibility({
      approvalStatus: 'REJECTED',
      approvalDecision: decision,
      mappingStatus: 'REVIEW_REQUIRED',
      resultSummary: resultSummary('OFFICIAL_ASSET'),
    })).toEqual(expect.objectContaining({
      eligible: false,
      reason: 'mapping-status-does-not-match-decision',
    }));
  });
});
