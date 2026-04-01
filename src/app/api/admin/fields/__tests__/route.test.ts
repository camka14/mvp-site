/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  organizations: {
    findMany: jest.fn(),
  },
  fields: {
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

import { GET as adminFieldsGet } from '@/app/api/admin/fields/route';

describe('GET /api/admin/fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await adminFieldsGet(new NextRequest('http://localhost/api/admin/fields'));
    expect(res.status).toBe(403);
  });

  it('returns paginated fields with organization metadata', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.organizations.findMany.mockResolvedValue([{ id: 'org_1', name: 'City Org' }]);
    prismaMock.fields.count.mockResolvedValue(1);
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court 1',
        fieldNumber: 1,
        organizationId: 'org_1',
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      },
    ]);

    const res = await adminFieldsGet(new NextRequest('http://localhost/api/admin/fields'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.fields).toHaveLength(1);
    expect(json.fields[0].organization?.name).toBe('City Org');
  });
});
