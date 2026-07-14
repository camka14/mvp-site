/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { PATCH } from '@/app/api/admin/organization-verifications/[id]/route';

describe('PATCH /api/admin/organization-verifications/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
  });

  it('returns productIds derived after the review update', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1' });
    prismaMock.organizations.update.mockResolvedValue({
      id: 'org_1',
      name: 'Club',
      productIds: ['legacy_only'],
      verificationReviewStatus: 'RESOLVED',
    });
    prismaMock.products.findMany.mockResolvedValue([
      { id: 'product_current', organizationId: 'org_1' },
    ]);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization-verifications/org_1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewStatus: 'RESOLVED' }),
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productIds).toEqual(['product_current']);
  });
});
