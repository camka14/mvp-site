/** @jest-environment node */

import {
  buildCodexAffiliateDirectoryExpansionResult,
  buildCodexAffiliateUnsupportedSportHumanReviewResult,
  codexAffiliateIngestionResultSchema,
} from '../codexIngestionResult';

const HASH = 'a'.repeat(64);
const successfulResult = {
  schemaVersion: 1,
  jobId: 'job_1',
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  workerId: 'codex-luna-vm-1',
  status: 'REVIEW_REQUIRED',
  branch: 'codex/affiliate-river-city',
  commit: 'b'.repeat(40),
  generatedPaths: [
    'scripts/setup-river-city-affiliate-source.ts',
    'src/server/affiliateImports/__tests__/riverCitySource.test.ts',
  ],
  logoDisposition: 'OFFICIAL_ASSET',
  candidateCount: 3,
  reviewScrapes: [
    {
      runId: 'scrape_1',
      candidateCount: 3,
      normalizedCandidateSha256: HASH,
      passed: true,
    },
    {
      runId: 'scrape_2',
      candidateCount: 3,
      normalizedCandidateSha256: HASH,
      passed: true,
    },
  ],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: [],
  },
  errorMessage: null,
};

describe('Codex affiliate ingestion result', () => {
  it('accepts a fully validated review-ready package', () => {
    expect(codexAffiliateIngestionResultSchema.parse(successfulResult)).toEqual(
      successfulResult,
    );
  });

  it('rejects review-ready claims without stable duplicate-safe scrapes', () => {
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      reviewScrapes: [
        successfulResult.reviewScrapes[0],
        {
          ...successfulResult.reviewScrapes[1],
          normalizedCandidateSha256: 'c'.repeat(64),
        },
      ],
    })).toThrow('stable counts and normalized candidate hashes');

    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      validation: {
        ...successfulResult.validation,
        duplicateSafe: false,
      },
    })).toThrow('passing tests, diff, and duplicate checks');

    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      candidateCount: 4,
    })).toThrow('must match both review scrapes');

    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      branch: null,
    })).toThrow('require the source branch');
  });

  it('accepts a failed terminal result only with an exact reason', () => {
    expect(codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      status: 'FAILED',
      branch: null,
      commit: null,
      generatedPaths: [],
      logoDisposition: 'MANUAL_REVIEW',
      candidateCount: 0,
      reviewScrapes: [],
      validation: {
        testsPassed: false,
        diffCheckPassed: false,
        duplicateSafe: false,
        warnings: ['Stored intake is missing the listing page.'],
      },
      errorMessage: 'Stored intake is missing the listing page.',
    })).toEqual(expect.objectContaining({
      status: 'FAILED',
      errorMessage: 'Stored intake is missing the listing page.',
    }));

    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...successfulResult,
      status: 'FAILED',
      errorMessage: null,
    })).toThrow('require an error message');
  });

  it('accepts an unsupported-sport human-review result without package artifacts', () => {
    const humanReview = buildCodexAffiliateUnsupportedSportHumanReviewResult({
      jobId: 'job_1',
      intakeId: 'intake_1',
      sourceKey: 'river-city',
      workerId: 'codex-luna-vm-1',
      sourceSportLabels: ['Volleyball'],
    });

    expect(humanReview).toEqual(expect.objectContaining({
      status: 'HUMAN_REVIEW_REQUIRED',
      branch: null,
      commit: null,
      generatedPaths: [],
      candidateCount: 0,
      reviewScrapes: [],
      humanReviewRequired: expect.objectContaining({
        reasonCodes: ['SPORT_NOT_IN_CATALOG'],
        sourceSportLabels: ['Volleyball'],
      }),
    }));
    expect(codexAffiliateIngestionResultSchema.parse({
      ...humanReview,
      humanReviewRequired: {
        reasonCodes: ['SPORT_NOT_IN_CATALOG'],
        sourceSportLabels: ['Soccer'],
      },
    })).toEqual(expect.objectContaining({
      humanReviewRequired: expect.objectContaining({
        requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
      }),
    }));
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...humanReview,
      generatedPaths: ['scripts/setup-river-city-affiliate-source.ts'],
    })).toThrow('cannot claim mapping artifacts');
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...humanReview,
      candidateCount: 1,
    })).toThrow('cannot claim mapping artifacts');
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...humanReview,
      reviewScrapes: [successfulResult.reviewScrapes[0]],
    })).toThrow('cannot claim mapping artifacts');
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...humanReview,
      humanReviewRequired: {
        ...humanReview.humanReviewRequired,
        reasonCodes: ['INSUFFICIENT_STORED_EVIDENCE'],
      },
    })).toThrow('require SPORT_NOT_IN_CATALOG');
  });

  it('accepts a directory expansion only when every submitted URL is accounted for', () => {
    const expanded = {
      ...successfulResult,
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
        warnings: [],
      },
      directoryExpansion: {
        submitted: 5,
        created: 2,
        reused: 1,
        captureQueued: 2,
        reviewRequired: 1,
        blocked: 0,
        duplicate: 1,
        rejected: 1,
      },
      errorMessage: null,
    };

    expect(codexAffiliateIngestionResultSchema.parse(expanded)).toEqual(expanded);
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...expanded,
      directoryExpansion: { ...expanded.directoryExpansion, submitted: 6 },
    })).toThrow('account for every submitted URL');
    expect(() => codexAffiliateIngestionResultSchema.parse({
      ...expanded,
      directoryExpansion: {
        ...expanded.directoryExpansion,
        created: 0,
        reused: 0,
        duplicate: 0,
        rejected: 5,
      },
    })).toThrow('at least one accepted, reused, or duplicate URL');
  });

  it('builds the exact terminal result written by the directory enqueue command', () => {
    expect(buildCodexAffiliateDirectoryExpansionResult({
      jobId: 'job_1',
      intakeId: 'intake_1',
      sourceKey: 'directory-source',
      workerId: 'codex-luna-vm-1',
      directoryExpansion: {
        submitted: 2,
        created: 1,
        reused: 0,
        captureQueued: 1,
        reviewRequired: 0,
        blocked: 0,
        duplicate: 1,
        rejected: 0,
      },
      warnings: [],
    })).toEqual(expect.objectContaining({
      status: 'EXPANDED',
      branch: null,
      commit: null,
      generatedPaths: [],
      directoryExpansion: expect.objectContaining({ submitted: 2, duplicate: 1 }),
    }));
  });
});
