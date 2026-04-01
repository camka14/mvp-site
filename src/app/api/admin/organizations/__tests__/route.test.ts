/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  organizations: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET as adminOrganizationsGet } from '@/app/api/admin/organizations/route';

describe('GET /api/admin/organizations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await adminOrganizationsGet(new NextRequest('http://localhost/api/admin/organizations'));
    expect(res.status).toBe(403);
  });

  it('returns paginated organizations payload', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com' });
    prismaMock.organizations.count.mockResolvedValue(2);
    prismaMock.organizations.findMany.mockResolvedValue([
      { id: 'org_1', name: 'Alpha Org' },
      { id: 'org_2', name: 'Beta Org' },
    ]);

    const res = await adminOrganizationsGet(new NextRequest('http://localhost/api/admin/organizations?limit=50&offset=0'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(2);
    expect(json.organizations).toHaveLength(2);
    expect(json.organizations[0].$id).toBe('org_1');
  });
});
