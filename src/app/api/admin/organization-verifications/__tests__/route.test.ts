/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  organizations: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/admin/organization-verifications/route';

describe('GET /api/admin/organization-verifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1' });
  });

  it('derives productIds for the paginated verification queue in one query', async () => {
    prismaMock.organizations.count.mockResolvedValue(2);
    prismaMock.organizations.findMany.mockResolvedValue([
      { id: 'org_1', name: 'One', productIds: ['legacy_only'] },
      { id: 'org_2', name: 'Two', productIds: ['legacy_only'] },
    ]);
    prismaMock.products.findMany.mockResolvedValue([
      { id: 'product_2', organizationId: 'org_1' },
      { id: 'product_1', organizationId: 'org_1' },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/admin/organization-verifications'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organizations).toEqual([
      expect.objectContaining({ id: 'org_1', productIds: ['product_1', 'product_2'] }),
      expect.objectContaining({ id: 'org_2', productIds: [] }),
    ]);
    expect(prismaMock.products.findMany).toHaveBeenCalledTimes(1);
  });
});
