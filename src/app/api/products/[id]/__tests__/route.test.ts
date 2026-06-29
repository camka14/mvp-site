/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  products: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  subscriptions: {
    count: jest.fn(),
  },
  discounts: {
    count: jest.fn(),
  },
  discountCodeRedemptions: {
    count: jest.fn(),
  },
  discountCodeReservations: {
    count: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));

import { DELETE } from '@/app/api/products/[id]/route';

const deleteRequest = () => new NextRequest('http://localhost/api/products/product_1', { method: 'DELETE' });

describe('DELETE /api/products/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.products.findUnique.mockResolvedValue({
      id: 'product_1',
      organizationId: 'org_1',
      isActive: true,
    });
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.subscriptions.count.mockResolvedValue(0);
    prismaMock.discounts.count.mockResolvedValue(0);
    prismaMock.discountCodeRedemptions.count.mockResolvedValue(0);
    prismaMock.discountCodeReservations.count.mockResolvedValue(0);
    prismaMock.products.update.mockResolvedValue({});
    prismaMock.products.delete.mockResolvedValue({});
  });

  it('hard deletes an unreferenced product', async () => {
    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'product_1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: true,
      deactivated: false,
      action: 'deleted',
      entityType: 'product',
      entityId: 'product_1',
    }));
    expect(prismaMock.products.delete).toHaveBeenCalledWith({ where: { id: 'product_1' } });
    expect(prismaMock.products.update).not.toHaveBeenCalled();
  });

  it('deactivates a product with billing references', async () => {
    prismaMock.subscriptions.count.mockResolvedValueOnce(3);

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'product_1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: false,
      deactivated: true,
      action: 'deactivated',
      entityType: 'product',
      entityId: 'product_1',
      references: [{ type: 'subscriptions', count: 3 }],
    }));
    expect(prismaMock.products.update).toHaveBeenCalledWith({
      where: { id: 'product_1' },
      data: {
        isActive: false,
        updatedAt: expect.any(Date),
      },
    });
    expect(prismaMock.products.delete).not.toHaveBeenCalled();
  });
});
