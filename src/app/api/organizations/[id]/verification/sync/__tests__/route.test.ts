/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const findManagedOrganizationStripeAccountMock = jest.fn();
const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
}));
jest.mock('@/server/organizationStripeVerification', () => ({
  findManagedOrganizationStripeAccount: (...args: unknown[]) => findManagedOrganizationStripeAccountMock(...args),
  syncManagedOrganizationStripeAccount: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/organizations/[id]/verification/sync/route';

describe('POST /api/organizations/[id]/verification/sync', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValue(true);
    findManagedOrganizationStripeAccountMock.mockResolvedValue(null);
  });

  afterAll(() => {
    if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeSecret;
  });

  it('returns the current derived productIds after verification synchronization', async () => {
    prismaMock.organizations.findUnique
      .mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' })
      .mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1', productIds: ['legacy_only'] });
    prismaMock.products.findMany.mockResolvedValue([
      { id: 'product_current', organizationId: 'org_1' },
    ]);

    const response = await POST(
      new NextRequest('http://localhost/api/organizations/org_1/verification/sync', { method: 'POST' }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productIds).toEqual(['product_current']);
  });
});
