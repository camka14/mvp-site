/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  events: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET as adminEventsGet } from '@/app/api/admin/events/route';

describe('GET /api/admin/events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await adminEventsGet(new NextRequest('http://localhost/api/admin/events'));
    expect(res.status).toBe(403);
  });

  it('returns paginated events including organization and sport metadata', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.events.count.mockResolvedValue(1);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        state: 'UNPUBLISHED',
        organizationId: 'org_1',
        sportId: 'sport_1',
        start: new Date('2026-03-01T10:00:00Z'),
      },
    ]);
    prismaMock.organizations.findMany.mockResolvedValue([
      { id: 'org_1', name: 'City Org', logoId: null, location: 'SF', address: null },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'sport_1', name: 'Volleyball' }]);

    const res = await adminEventsGet(new NextRequest('http://localhost/api/admin/events'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.limit).toBe(50);
    expect(json.offset).toBe(0);
    expect(json.events[0].organization?.name).toBe('City Org');
    expect(json.events[0].sport?.name).toBe('Volleyball');
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
        }),
      }),
    );
  });
});
