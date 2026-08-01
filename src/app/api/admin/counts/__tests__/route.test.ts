/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  events: { count: jest.fn() },
  organizations: { count: jest.fn() },
  canonicalTeams: { count: jest.fn() },
  organizationClaims: { count: jest.fn() },
  fields: { count: jest.fn() },
  userData: { count: jest.fn() },
  chatGroup: { count: jest.fn() },
  moderationReport: { count: jest.fn() },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET as adminCountsGet } from '@/app/api/admin/counts/route';

describe('GET /api/admin/counts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    const res = await adminCountsGet(new NextRequest('http://localhost/api/admin/counts'));

    expect(res.status).toBe(403);
  });

  it('returns database counts without loading paginated rows', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.events.count.mockResolvedValue(956);
    prismaMock.organizations.count
      .mockResolvedValueOnce(401)
      .mockResolvedValueOnce(12);
    prismaMock.canonicalTeams.count.mockResolvedValue(29);
    prismaMock.organizationClaims.count.mockResolvedValue(3);
    prismaMock.fields.count.mockResolvedValue(17);
    prismaMock.userData.count.mockResolvedValue(93);
    prismaMock.chatGroup.count.mockResolvedValue(18);
    prismaMock.moderationReport.count.mockResolvedValue(0);

    const res = await adminCountsGet(new NextRequest('http://localhost/api/admin/counts'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      events: 956,
      organizations: 401,
      teams: 29,
      verification: 12,
      claims: 3,
      fields: 17,
      users: 93,
      chats: 18,
      moderation: 0,
    });
    expect(prismaMock.events.count).toHaveBeenCalledWith({ where: { NOT: { state: 'TEMPLATE' } } });
    expect(prismaMock.organizations.count).toHaveBeenNthCalledWith(1);
    expect(prismaMock.organizations.count).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.any(Object) }));
  });
});
