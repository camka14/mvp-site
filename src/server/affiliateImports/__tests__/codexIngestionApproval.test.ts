import {
  affiliateSourceMatchesIntakeEvidence,
  resolveApprovedAffiliateSetupScript,
  selectAffiliateMappingLiveApprovalCandidates,
} from '../codexIngestionApproval';

const HASH = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

const job = (logoDisposition: 'OFFICIAL_ASSET' | 'OFFICIAL_SCREENSHOT_CROP' | 'MANUAL_REVIEW') => ({
  id: `job-${logoDisposition}`,
  intakeId: `intake-${logoDisposition}`,
  status: 'REVIEW_REQUIRED',
  resultSummary: {
    schemaVersion: 1,
    result: {
      schemaVersion: 1,
      jobId: `job-${logoDisposition}`,
      intakeId: `intake-${logoDisposition}`,
      sourceKey: `source-${logoDisposition}`,
      workerId: 'worker-1',
      status: 'REVIEW_REQUIRED',
      branch: 'codex/affiliate-ingestion-live',
      commit: COMMIT,
      generatedPaths: [
        `scripts/setup-source-${logoDisposition.toLowerCase().replaceAll('_', '-')}-affiliate-source.ts`,
      ],
      logoDisposition,
      candidateCount: 1,
      reviewScrapes: [
        { runId: 'run-1', candidateCount: 1, normalizedCandidateSha256: HASH, passed: true },
        { runId: 'run-2', candidateCount: 1, normalizedCandidateSha256: HASH, passed: true },
      ],
      validation: {
        testsPassed: true,
        diffCheckPassed: true,
        duplicateSafe: true,
        warnings: [],
      },
      errorMessage: null,
    },
  },
});

describe('Codex ingestion live approval', () => {
  it('approves only packages with reviewed official logo evidence', () => {
    const selected = selectAffiliateMappingLiveApprovalCandidates([
      job('OFFICIAL_ASSET'),
      job('OFFICIAL_SCREENSHOT_CROP'),
      job('MANUAL_REVIEW'),
    ]);

    expect(selected.approvable.map((candidate) => candidate.result.logoDisposition)).toEqual([
      'OFFICIAL_ASSET',
      'OFFICIAL_SCREENSHOT_CROP',
    ]);
    expect(selected.manualReview).toHaveLength(1);
  });

  it('rejects mismatched job identity and unsafe generated paths', () => {
    const mismatched = job('OFFICIAL_ASSET');
    mismatched.intakeId = 'different-intake';
    expect(() => selectAffiliateMappingLiveApprovalCandidates([mismatched])).toThrow(
      'result identity does not match',
    );

    expect(() => resolveApprovedAffiliateSetupScript('/repo', '../outside.ts')).toThrow(
      'escapes the repository',
    );
  });

  it('matches a generated source by intake evidence when its operational key differs', () => {
    expect(affiliateSourceMatchesIntakeEvidence(
      {
        sourceEvidence: {
          intakeId: 'intake-1',
          intakeSourceKey: 'new-york-long-intake-key',
        },
      },
      {
        intakeId: 'intake-1',
        intakeSourceKey: 'new-york-long-intake-key',
      },
    )).toBe(true);

    expect(affiliateSourceMatchesIntakeEvidence(
      { sourceEvidence: { intakeSourceKey: 'new-york-long-intake-key' } },
      { intakeId: 'intake-1', intakeSourceKey: 'different-key' },
    )).toBe(false);
  });
});
