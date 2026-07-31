/** @jest-environment node */

import { codexAffiliateIngestionResultSchema } from '../codexIngestionResult';

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
});
