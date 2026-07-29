/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizationClaims: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
  authUser: {
    findMany: jest.fn(),
  },
};
const requireRazumlyAdminMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));

import { GET } from '@/app/api/admin/organization-claims/route';

describe('GET /api/admin/organization-claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({
      userId: 'admin_1',
      adminEmail: 'samuel.r@razumly.com',
    });
    prismaMock.organizationClaims.findMany.mockResolvedValue([]);
    prismaMock.organizationClaims.count.mockResolvedValue(0);
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.authUser.findMany.mockResolvedValue([]);
  });

  it('returns a hydrated needs-review queue with bounded filters and pagination', async () => {
    prismaMock.organizationClaims.findMany.mockResolvedValueOnce([{
      id: 'claim_1',
      organizationId: 'org_1',
      claimantUserId: 'claimant_1',
      requestType: 'OWNERSHIP_DISPUTE',
      status: 'PENDING_MANUAL_REVIEW',
      method: 'MANUAL_REVIEW',
      verificationLevel: 'NONE',
      roleTitle: 'Director',
      issueReason: 'FORMER_REPRESENTATIVE',
      requestedOutcome: 'OWNERSHIP_TRANSFER',
      submittedAt: new Date('2026-07-29T20:00:00.000Z'),
      createdAt: new Date('2026-07-29T19:00:00.000Z'),
      updatedAt: new Date('2026-07-29T20:00:00.000Z'),
    }]);
    prismaMock.organizationClaims.count.mockResolvedValueOnce(1);
    prismaMock.organizations.findMany.mockResolvedValueOnce([{
      id: 'org_1',
      name: 'River City Sports Club',
      ownershipStatus: 'CLAIMED',
    }]);
    prismaMock.authUser.findMany.mockResolvedValueOnce([{
      id: 'claimant_1',
      name: 'Morgan Reed',
      email: 'morgan@rivercitysports.org',
      emailVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    }]);

    const response = await GET(new NextRequest(
      'http://localhost/api/admin/organization-claims?status=NEEDS_REVIEW&method=MANUAL_REVIEW&requestType=OWNERSHIP_DISPUTE&page=2&pageSize=10',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireRazumlyAdminMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.organizationClaims.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: { in: ['PENDING_MANUAL_REVIEW', 'DISPUTED'] },
        method: 'MANUAL_REVIEW',
        requestType: 'OWNERSHIP_DISPUTE',
      },
      skip: 10,
      take: 10,
    }));
    expect(payload.claims[0]).toEqual(expect.objectContaining({
      id: 'claim_1',
      organization: expect.objectContaining({ name: 'River City Sports Club' }),
      claimant: expect.objectContaining({ email: 'morgan@rivercitysports.org' }),
    }));
    expect(payload.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
  });

  it('does not query organization or account tables when the queue is empty', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/organization-claims?status=not-a-real-status',
    ));

    expect(response.status).toBe(200);
    expect(prismaMock.organizationClaims.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
    }));
    expect(prismaMock.organizations.findMany).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findMany).not.toHaveBeenCalled();
  });
});
