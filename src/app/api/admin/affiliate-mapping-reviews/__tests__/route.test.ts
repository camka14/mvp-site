/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const listHumanReviewJobsMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/affiliateImports/sourceMappingHumanReview', () => ({
  listAffiliateMappingHumanReviewJobs: (...args: unknown[]) => listHumanReviewJobsMock(...args),
}));

import { GET } from '@/app/api/admin/affiliate-mapping-reviews/route';

describe('GET /api/admin/affiliate-mapping-reviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
  });

  it('requires Razumly admin access', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/admin/affiliate-mapping-reviews'));

    expect(response.status).toBe(403);
    expect(listHumanReviewJobsMock).not.toHaveBeenCalled();
  });

  it('returns terminal human-review jobs', async () => {
    listHumanReviewJobsMock.mockResolvedValue([{ jobId: 'mapping_1', intakeId: 'intake_1' }]);

    const response = await GET(new NextRequest('http://localhost/api/admin/affiliate-mapping-reviews'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobs: [{ jobId: 'mapping_1', intakeId: 'intake_1' }],
      total: 1,
    });
  });
});
