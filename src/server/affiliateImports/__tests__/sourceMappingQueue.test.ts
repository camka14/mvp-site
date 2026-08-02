/** @jest-environment node */

const prismaMock = {
  affiliateSourceIntakes: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceMappingJobs: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  affiliateApprovalJobs: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => 'generated_job' }));

import {
  claimNextAffiliateSourceIntakeForMapping,
  finishAffiliateSourceMappingClaim,
} from '@/server/affiliateImports/sourceMappingQueue';

describe('affiliate source mapping queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('claims a queued mapping job once and marks the intake in progress', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'QUEUED',
      createdAt: new Date(),
      resultSummary: {
        mappingRepairHistory: [{
          repairReason: 'MANUAL_LOGO_REVIEW',
          repairReasons: ['OFFICIAL_LOGO_REPAIR_REQUIRED', 'EVENT_PRICING_INVALID'],
          queuedAt: '2026-08-01T23:00:00.000Z',
          priorMappingStatus: 'REVIEW_REQUIRED',
          priorMappingErrorMessage: 'Official logo verification failed.',
          approvalJobId: 'approval_1',
          approvalStatus: 'REJECTED',
          reviewerId: 'reviewer-1',
          decision: 'REJECT',
          rationale: 'The package needs two producer fixes.',
          blockingIssues: ['Logo invalid.', 'Prices collapsed.'],
        }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1', sourceKey: 'river-city-soccer', status: 'READY_FOR_MAPPING',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    const claimed = await claimNextAffiliateSourceIntakeForMapping({
      workerId: 'worker-1',
      now: new Date('2026-07-21T12:00:00Z'),
    });

    expect(claimed).toEqual(expect.objectContaining({
      jobId: 'job_1', intakeId: 'intake_1', sourceKey: 'river-city-soccer', workerId: 'worker-1',
      repairContext: {
        repairReason: 'MANUAL_LOGO_REVIEW',
        repairReasons: ['OFFICIAL_LOGO_REPAIR_REQUIRED', 'EVENT_PRICING_INVALID'],
        queuedAt: '2026-08-01T23:00:00.000Z',
        priorMappingStatus: 'REVIEW_REQUIRED',
        priorMappingErrorMessage: 'Official logo verification failed.',
        approvalJobId: 'approval_1',
        approvalStatus: 'REJECTED',
        reviewerId: 'reviewer-1',
        decision: 'REJECT',
        rationale: 'The package needs two producer fixes.',
        blockingIssues: ['Logo invalid.', 'Prices collapsed.'],
      },
    }));
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job_1' }),
      data: expect.objectContaining({ status: 'CLAIMED', workerId: 'worker-1' }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' }, data: { status: 'MAPPING_IN_PROGRESS' },
    });
  });

  it('returns null when no claimable job exists', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue(null);
    expect(await claimNextAffiliateSourceIntakeForMapping({ workerId: 'worker-1' })).toBeNull();
  });

  it('resumes and renews an active claim owned by the same mapper', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      attemptCount: 1,
      resultSummary: null,
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1', sourceKey: 'source-1', status: 'MAPPING_IN_PROGRESS',
    });

    const claim = await claimNextAffiliateSourceIntakeForMapping({
      workerId: 'worker-1',
      now: new Date('2026-08-02T12:00:00Z'),
    });

    expect(claim).toEqual(expect.objectContaining({
      jobId: 'job_1',
      workerId: 'worker-1',
      resumed: true,
      leaseExpiresAt: new Date('2026-08-02T14:00:00Z'),
    }));
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        status: 'CLAIMED',
        workerId: 'worker-1',
        leaseExpiresAt: { gte: new Date('2026-08-02T12:00:00Z') },
      },
      data: { leaseExpiresAt: new Date('2026-08-02T14:00:00Z') },
    });
  });

  it('assigns concurrent mappers different jobs through conditional claims', async () => {
    const jobs = [
      { id: 'job_1', intakeId: 'intake_1', status: 'QUEUED', createdAt: new Date('2026-08-02T10:00:00Z') },
      { id: 'job_2', intakeId: 'intake_2', status: 'QUEUED', createdAt: new Date('2026-08-02T10:01:00Z') },
    ];
    const intakes = [
      { id: 'intake_1', sourceKey: 'source-1', status: 'READY_FOR_MAPPING' },
      { id: 'intake_2', sourceKey: 'source-2', status: 'READY_FOR_MAPPING' },
    ];
    prismaMock.affiliateSourceMappingJobs.findFirst.mockImplementation(async () => (
      jobs.find((job) => job.status === 'QUEUED') ?? null
    ));
    prismaMock.affiliateSourceMappingJobs.updateMany.mockImplementation(async ({ where, data }: any) => {
      const job = jobs.find((candidate) => candidate.id === where.id);
      if (!job || job.status !== 'QUEUED') return { count: 0 };
      Object.assign(job, data, { attemptCount: 1 });
      return { count: 1 };
    });
    prismaMock.affiliateSourceIntakes.findUnique.mockImplementation(async ({ where }: any) => (
      intakes.find((intake) => intake.id === where.id) ?? null
    ));
    prismaMock.affiliateSourceIntakes.update.mockImplementation(async ({ where, data }: any) => {
      const intake = intakes.find((candidate) => candidate.id === where.id);
      Object.assign(intake!, data);
      return intake;
    });

    const claims = await Promise.all([
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-1' }),
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-2' }),
    ]);

    expect(claims.map((claim) => claim?.jobId).sort()).toEqual(['job_1', 'job_2']);
    expect(new Set(claims.map((claim) => claim?.workerId))).toEqual(new Set(['mapper-1', 'mapper-2']));
  });

  it('records a directory expansion as a terminal non-mapping intake result', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'CLAIMED',
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'EXPANDED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    await expect(finishAffiliateSourceMappingClaim({
      jobId: 'job_1',
      status: 'EXPANDED',
      resultSummary: { submitted: 3 },
    })).resolves.toEqual(expect.objectContaining({ status: 'EXPANDED' }));
    expect(prismaMock.affiliateSourceMappingJobs.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job_1' },
      data: expect.objectContaining({ status: 'EXPANDED', leaseExpiresAt: null }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'EXPANDED' },
    });
  });

  it('preserves repair history and reopens a rejected approval after a repaired package completes', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'CLAIMED',
      resultSummary: {
        mappingRepairHistory: [{ repairReason: 'EVENT_LOCATION_PACKAGE_REJECTION' }],
        mappingFullReviewHistory: [{
          cohortKey: 'description-quality-v1',
          repairHistoryStartIndex: 1,
        }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue({
      id: 'approval_1', status: 'REJECTED',
    });
    prismaMock.affiliateApprovalJobs.update.mockResolvedValue({});

    await finishAffiliateSourceMappingClaim({
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    });

    expect(prismaMock.affiliateSourceMappingJobs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultSummary: expect.objectContaining({
          mappingRepairHistory: [{ repairReason: 'EVENT_LOCATION_PACKAGE_REJECTION' }],
          mappingFullReviewHistory: [{
            cohortKey: 'description-quality-v1',
            repairHistoryStartIndex: 1,
          }],
        }),
      }),
    }));
    expect(prismaMock.affiliateApprovalJobs.update).toHaveBeenCalledWith({
      where: { id: 'approval_1' },
      data: {
        status: 'QUEUED',
        claimedAt: null,
        leaseExpiresAt: null,
        reviewerId: null,
        decision: null,
        errorMessage: null,
        finishedAt: null,
      },
    });
  });
});
