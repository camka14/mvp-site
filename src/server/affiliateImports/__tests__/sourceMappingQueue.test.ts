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
          queuedAt: '2026-08-01T23:00:00.000Z',
          priorMappingErrorMessage: 'Official logo verification failed.',
          approvalJobId: 'approval_1',
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
        queuedAt: '2026-08-01T23:00:00.000Z',
        priorMappingErrorMessage: 'Official logo verification failed.',
        approvalJobId: 'approval_1',
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
