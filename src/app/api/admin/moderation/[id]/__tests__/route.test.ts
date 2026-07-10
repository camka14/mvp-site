/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  moderationReport: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  organizationReviews: {
    updateMany: jest.fn(),
  },
};

jest.mock('@/generated/prisma/client', () => ({
  ModerationReportStatusEnum: {
    OPEN: 'OPEN',
    IN_REVIEW: 'IN_REVIEW',
    ACTIONED: 'ACTIONED',
    DISMISSED: 'DISMISSED',
  },
  ModerationReportTargetTypeEnum: {
    ORGANIZATION_REVIEW: 'ORGANIZATION_REVIEW',
  },
  OrganizationReviewStatusEnum: {
    PUBLISHED: 'PUBLISHED',
    HIDDEN: 'HIDDEN',
  },
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));

import { PATCH } from '@/app/api/admin/moderation/[id]/route';

describe('PATCH /api/admin/moderation/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
    prismaMock.moderationReport.findUnique.mockResolvedValue({
      id: 'report_1',
      targetType: 'ORGANIZATION_REVIEW',
      targetId: 'review_1',
    });
    prismaMock.moderationReport.update.mockResolvedValue({
      id: 'report_1',
      status: 'ACTIONED',
      targetType: 'ORGANIZATION_REVIEW',
      targetId: 'review_1',
    });
    prismaMock.organizationReviews.updateMany.mockResolvedValue({ count: 1 });
  });

  it('hides an organization review when its report is actioned', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/moderation/report_1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIONED' }),
      }),
      { params: Promise.resolve({ id: 'report_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organizationReviews.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'review_1' },
      data: expect.objectContaining({
        status: 'HIDDEN',
        hiddenByUserId: 'admin_1',
      }),
    }));
  });
});
