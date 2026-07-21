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
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => 'generated_job' }));

import { claimNextAffiliateSourceIntakeForMapping } from '@/server/affiliateImports/sourceMappingQueue';

describe('affiliate source mapping queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('claims a queued mapping job once and marks the intake in progress', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'QUEUED', createdAt: new Date(),
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
});
