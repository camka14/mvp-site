/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  discounts: {
    findMany: jest.fn(),
  },
  discountCodes: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));

import { GET } from '@/app/api/discounts/route';

describe('GET /api/discounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: true });
    hasOrgPermissionMock.mockResolvedValue(false);
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.discountCodes.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([{ id: 'event_1', name: 'Summer Classic' }]);
  });

  it('includes the event name for organization event discount cards', async () => {
    prismaMock.discounts.findMany.mockResolvedValue([
      {
        id: 'discount_1',
        ownerType: 'ORGANIZATION',
        ownerId: 'org_1',
        createdBy: 'user_1',
        updatedBy: null,
        name: 'Early teams',
        description: null,
        status: 'ACTIVE',
        targetType: 'EVENT',
        targetId: 'event_1',
        originalPriceCentsSnapshot: 10000,
        discountedPriceCents: 8000,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/discounts?ownerType=ORGANIZATION&ownerId=org_1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['event_1'] } },
      select: { id: true, name: true },
    });
    expect(json.discounts).toEqual([
      expect.objectContaining({
        id: 'discount_1',
        targetName: 'Summer Classic',
        codes: [],
      }),
    ]);
  });
});
