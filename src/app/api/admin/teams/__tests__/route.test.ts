/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  canonicalTeams: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET as adminTeamsGet } from '@/app/api/admin/teams/route';

describe('GET /api/admin/teams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await adminTeamsGet(new NextRequest('http://localhost/api/admin/teams'));
    expect(res.status).toBe(403);
  });

  it('returns paginated teams including organization metadata', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.canonicalTeams.count.mockResolvedValue(1);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'team_1',
        name: 'City Aces',
        organizationId: 'org_1',
        sport: 'Volleyball',
        division: 'Open',
        teamSize: 6,
        openRegistration: true,
        visibility: 'PUBLIC',
      },
    ]);
    prismaMock.organizations.findMany.mockResolvedValue([
      { id: 'org_1', name: 'City Org' },
    ]);

    const res = await adminTeamsGet(new NextRequest('http://localhost/api/admin/teams?query=city'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.teams[0].$id).toBe('team_1');
    expect(json.teams[0].organization?.name).toBe('City Org');
    expect(prismaMock.canonicalTeams.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
      }),
    );
  });
});
