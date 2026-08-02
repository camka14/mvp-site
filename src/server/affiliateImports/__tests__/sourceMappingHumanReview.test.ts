/** @jest-environment node */

const prismaMock = {
  affiliateSourceMappingJobs: { findMany: jest.fn() },
  affiliateSourceIntakes: { findMany: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { listAffiliateMappingHumanReviewJobs } from '@/server/affiliateImports/sourceMappingHumanReview';

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
          reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO', 'NO_VERIFIABLE_OFFICIAL_LOGO'],
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
      reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
      rationale: 'Stored first-party evidence contains no reusable mark.',
      blockingIssues: ['Logo evidence is exhausted.'],
      hasSelectedLogo: false,
    }]);
    expect(prismaMock.affiliateSourceMappingJobs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'HUMAN_REVIEW_REQUIRED' },
      take: 100,
    }));
  });

  it('does not query intakes when the terminal queue is empty', async () => {
    prismaMock.affiliateSourceMappingJobs.findMany.mockResolvedValue([]);

    await expect(listAffiliateMappingHumanReviewJobs()).resolves.toEqual([]);
    expect(prismaMock.affiliateSourceIntakes.findMany).not.toHaveBeenCalled();
  });
});
