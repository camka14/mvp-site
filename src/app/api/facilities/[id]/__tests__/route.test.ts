/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  facilities: {
    findUnique: jest.fn(),
    update: jest.fn(),
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

import { PATCH } from '@/app/api/facilities/[id]/route';

const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/facilities/facility_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('PATCH /api/facilities/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.facilities.findUnique.mockResolvedValue({
      id: 'facility_1',
      organizationId: 'org_1',
      location: 'Downtown',
      coordinates: [-122.353, 45.582],
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
  });

  it('updates mutable facility details with field management permission', async () => {
    prismaMock.facilities.update.mockResolvedValueOnce({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'River City Courts',
      location: 'Downtown',
      coordinates: [-122.353, 45.582],
      operatingHours: {
        version: 1,
        weekly: [
          { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 420, closeMinutes: 1290 }] },
          { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
        ],
      },
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await PATCH(
      patchRequest({
        facility: {
          name: 'River City Courts',
          location: 'Downtown',
          coordinates: [-122.353, 45.582],
          operatingHours: {
            version: 1,
            weekly: [
              { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 420, closeMinutes: 1290 }] },
              { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
            ],
          },
        },
      }),
      { params: Promise.resolve({ id: 'facility_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(hasOrgPermissionMock).toHaveBeenCalled();
    expect(prismaMock.facilities.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'facility_1' },
        data: expect.objectContaining({
          name: 'River City Courts',
          location: 'Downtown',
          coordinates: [-122.353, 45.582],
          operatingHours: {
            version: 1,
            weekly: [
              { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 420, closeMinutes: 1290 }] },
              { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
            ],
          },
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(json.$id).toBe('facility_1');
    expect(json.operatingHours).toEqual({
      version: 1,
      weekly: [
        { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 420, closeMinutes: 1290 }] },
        { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
      ],
    });
  });

  it('rejects updates without field management permission', async () => {
    hasOrgPermissionMock.mockResolvedValueOnce(false);

    const response = await PATCH(
      patchRequest({
        facility: {
          name: 'River City Courts',
        },
      }),
      { params: Promise.resolve({ id: 'facility_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(prismaMock.facilities.update).not.toHaveBeenCalled();
  });

  it('rejects clearing the facility location', async () => {
    const response = await PATCH(
      patchRequest({
        facility: {
          location: '   ',
        },
      }),
      { params: Promise.resolve({ id: 'facility_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid input');
    expect(prismaMock.facilities.update).not.toHaveBeenCalled();
  });

  it('rejects updating a facility location without selected coordinates', async () => {
    const response = await PATCH(
      patchRequest({
        facility: {
          location: 'New Downtown',
          coordinates: null,
        },
      }),
      { params: Promise.resolve({ id: 'facility_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Facility location must be selected from suggestions or the map');
    expect(prismaMock.facilities.update).not.toHaveBeenCalled();
  });

  it('rejects organization ownership updates', async () => {
    const response = await PATCH(
      patchRequest({
        facility: {
          organizationId: 'org_2',
        },
      }),
      { params: Promise.resolve({ id: 'facility_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      error: 'Immutable facility fields cannot be updated.',
      fields: ['organizationId'],
    });
    expect(prismaMock.facilities.update).not.toHaveBeenCalled();
  });
});
