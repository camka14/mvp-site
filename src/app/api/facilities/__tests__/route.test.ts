/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  facilities: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));

import { GET, POST } from '@/app/api/facilities/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/facilities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/facilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
  });

  it('returns an empty list for unscoped GET requests', async () => {
    const response = await GET(new NextRequest('http://localhost/api/facilities'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ facilities: [] });
    expect(prismaMock.facilities.findMany).not.toHaveBeenCalled();
  });

  it('lists facilities for an organization', async () => {
    prismaMock.facilities.findMany.mockResolvedValueOnce([
      {
        id: 'facility_1',
        organizationId: 'org_1',
        name: 'River City Sports Complex',
        location: '100 River City Way',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/facilities?organizationId=org_1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.facilities.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1' },
      }),
    );
    expect(json.facilities[0]).toEqual(expect.objectContaining({
      $id: 'facility_1',
      name: 'River City Sports Complex',
    }));
  });

  it('creates a facility with field management permission', async () => {
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.facilities.create.mockResolvedValueOnce({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Sports Complex',
      location: '100 River City Way',
      coordinates: [-122.353, 45.582],
      operatingHours: {
        version: 1,
        weekly: [
          { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
        ],
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await POST(jsonRequest({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Sports Complex',
      location: '100 River City Way',
      coordinates: [-122.353, 45.582],
      operatingHours: {
        version: 1,
        weekly: [
          { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
        ],
      },
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(hasOrgPermissionMock).toHaveBeenCalled();
    expect(prismaMock.facilities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'facility_1',
          organizationId: 'org_1',
          name: 'River City Sports Complex',
          location: '100 River City Way',
          coordinates: [-122.353, 45.582],
          operatingHours: {
            version: 1,
            weekly: [
              { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
              { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
            ],
          },
        }),
      }),
    );
    expect(json.$id).toBe('facility_1');
    expect(json.operatingHours).toEqual({
      version: 1,
      weekly: [
        { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
        { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
      ],
    });
  });

  it('rejects facility creation without field management permission', async () => {
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    hasOrgPermissionMock.mockResolvedValueOnce(false);

    const response = await POST(jsonRequest({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Sports Complex',
      location: '100 River City Way',
      coordinates: [-122.353, 45.582],
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(prismaMock.facilities.create).not.toHaveBeenCalled();
  });

  it('rejects facility creation without a location', async () => {
    const response = await POST(jsonRequest({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Sports Complex',
      location: '  ',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid input');
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.facilities.create).not.toHaveBeenCalled();
  });

  it('rejects facility creation when the location was not selected', async () => {
    const response = await POST(jsonRequest({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Sports Complex',
      location: '100 River City Way',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Facility location must be selected from suggestions or the map');
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.facilities.create).not.toHaveBeenCalled();
  });
});
