/** @jest-environment node */

const prismaMock = {
  affiliateSourceMappingJobs: { findMany: jest.fn() },
  affiliateSourceIntakes: { findMany: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  affiliateMappingReviewGuidance,
  listAffiliateMappingHumanReviewJobs,
} from '@/server/affiliateImports/sourceMappingHumanReview';

describe('affiliate mapping human-review queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('joins terminal mapping jobs to intake identity and structured reasons', async () => {
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([{
      id: 'mapping_1',
      intakeId: 'intake_1',
      status: 'HUMAN_REVIEW_REQUIRED',
      updatedAt: new Date('2026-08-02T12:00:00.000Z'),
      finishedAt: new Date('2026-08-02T11:55:00.000Z'),
      attemptCount: 3,
      errorMessage: 'No supported logo could be verified.',
      resultSummary: {
        humanReviewRequired: {
          markedAt: '2026-08-02T11:56:00.000Z',
          source: 'HISTORICAL_TERMINAL_CLASSIFICATION',
          requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
          reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO', 'RETRY_LIMIT_EXCEEDED', 'NO_VERIFIABLE_OFFICIAL_LOGO'],
          rationale: 'Stored first-party evidence contains no reusable mark.',
          blockingIssues: ['Logo evidence is exhausted.'],
        },
      },
    }]);
    prismaMock.affiliateSourceIntakes.findMany.mockResolvedValue([{
      id: 'intake_1',
      name: 'New York Elite Volleyball',
      sourceKey: 'new-york-elite-volleyball',
      region: 'New York, NY',
      baseUrl: 'https://example.test',
      status: 'REVIEW_REQUIRED',
      complianceStatus: 'ALLOWED',
      selectedLogoArtifactId: null,
    }]);

    await expect(listAffiliateMappingHumanReviewJobs()).resolves.toEqual([{
      jobId: 'mapping_1',
      intakeId: 'intake_1',
      intakeName: 'New York Elite Volleyball',
      sourceKey: 'new-york-elite-volleyball',
      region: 'New York, NY',
      baseUrl: 'https://example.test',
      intakeStatus: 'REVIEW_REQUIRED',
      complianceStatus: 'ALLOWED',
      attemptCount: 3,
      markedAt: '2026-08-02T11:56:00.000Z',
      errorMessage: 'No supported logo could be verified.',
      source: 'HISTORICAL_TERMINAL_CLASSIFICATION',
      requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO', 'RETRY_LIMIT_EXCEEDED'],
      rationale: 'Stored first-party evidence contains no reusable mark.',
      blockingIssues: ['Logo evidence is exhausted.'],
      hasSelectedLogo: false,
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'Can this mapping proceed with no official logo?',
      recommendedAction: 'Accept the missing logo and return the package to automated review. A missing logo alone must not block the mapping.',
    }]);
    expect(prismaMock.affiliateSourceMappingJobs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'HUMAN_REVIEW_REQUIRED' },
      take: 250,
    }));
  });

  it('identifies producer commit handoff failures as system repairs', () => {
    expect(affiliateMappingReviewGuidance({
      reasonCodes: ['INSUFFICIENT_STORED_EVIDENCE'],
      rationale: 'The package-evidence command cannot resolve the exact producer commit in /producer-workspace.',
    })).toEqual(expect.objectContaining({
      reviewOwner: 'SYSTEM',
      reviewQuestion: expect.stringContaining('exact-commit evidence handoff'),
    }));
  });

  it('identifies conflicting live records as user decisions', () => {
    expect(affiliateMappingReviewGuidance({
      reasonCodes: ['CONFLICTING_LIVE_RECORD'],
    })).toEqual(expect.objectContaining({
      reviewOwner: 'USER',
      reviewQuestion: expect.stringContaining('conflicting live record'),
    }));
  });

  it('explains the product decision for an unsupported sport', () => {
    expect(affiliateMappingReviewGuidance({
      requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['SPORT_NOT_IN_CATALOG'],
      blockingIssues: ['Badminton is not in the BracketIQ sports catalog.'],
    })).toEqual({
      reviewOwner: 'USER',
      reviewQuestion: 'Should this sport be added to the BracketIQ sports catalog?',
      recommendedAction: 'Review the source sport below. Add a fully configured canonical sport only when BracketIQ should support it; otherwise leave this mapping stopped.',
    });
  });

  it('does not query intakes when the terminal queue is empty', async () => {
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);

    await expect(listAffiliateMappingHumanReviewJobs()).resolves.toEqual([]);
    expect(prismaMock.affiliateSourceIntakes.findMany).not.toHaveBeenCalled();
  });
});
