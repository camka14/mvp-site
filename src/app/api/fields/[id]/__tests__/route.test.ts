/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  fields: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  facilities: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  events: {
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  timeSlots: {
    count: jest.fn(),
  },
  rentalBookingItems: {
    count: jest.fn(),
  },
  staffScheduleAssignments: {
    count: jest.fn(),
  },
  eventOfficials: {
    count: jest.fn(),
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

import { DELETE, GET, PATCH } from '@/app/api/fields/[id]/route';

const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/fields/field_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('PATCH /api/fields/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.facilities.findFirst.mockResolvedValue({
      id: 'facility_1',
      organizationId: 'org_1',
      name: 'Main Facility',
    });
    prismaMock.facilities.findMany.mockResolvedValue([]);
    prismaMock.events.count.mockResolvedValue(0);
    prismaMock.timeSlots.count.mockResolvedValue(0);
    prismaMock.rentalBookingItems.count.mockResolvedValue(0);
    prismaMock.staffScheduleAssignments.count.mockResolvedValue(0);
    prismaMock.eventOfficials.count.mockResolvedValue(0);
    prismaMock.fields.delete.mockResolvedValue({});
  });

  it('returns facility metadata with a field', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      name: 'Court A',
      organizationId: 'org_1',
      facilityId: 'facility_1',
      rentalSlotIds: [],
    });
    prismaMock.facilities.findMany.mockResolvedValueOnce([
      {
        id: 'facility_1',
        organizationId: 'org_1',
        name: 'Main Facility',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/fields/field_1'),
      { params: Promise.resolve({ id: 'field_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.$id).toBe('field_1');
    expect(json.facility).toMatchObject({
      $id: 'facility_1',
      name: 'Main Facility',
    });
  });

  it('rejects immutable organization ownership updates', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
    });

    const response = await PATCH(
      patchRequest({
        field: {
          organizationId: 'org_2',
          name: 'Court A',
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Immutable field fields cannot be updated.',
      fields: ['organizationId'],
    });
    expect(prismaMock.fields.update).not.toHaveBeenCalled();
  });

  it('updates mutable field properties', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
    });
    prismaMock.fields.update.mockResolvedValueOnce({
      id: 'field_1',
      name: 'Court A',
      organizationId: null,
      rentalSlotIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await PATCH(
      patchRequest({
        field: {
          name: 'Court A',
          sportIds: ['Basketball', 'Basketball', 'Indoor Soccer', ''],
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.fields.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.fields.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'field_1' },
        data: expect.objectContaining({
          name: 'Court A',
          sportIds: ['Basketball', 'Indoor Soccer'],
          updatedAt: expect.any(Date),
        }),
      }),
    );
    const json = await response.json();
    expect(json.$id).toBe('field_1');
  });

  it('rejects updating a field location without selected coordinates', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
      location: '',
      lat: null,
      long: null,
    });

    const response = await PATCH(
      patchRequest({
        field: {
          location: 'Main Gym',
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Resource location must be selected from suggestions or the map',
    });
    expect(prismaMock.fields.update).not.toHaveBeenCalled();
  });

  it('updates a field location with selected coordinates', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
      location: '',
      lat: null,
      long: null,
    });
    prismaMock.fields.update.mockResolvedValueOnce({
      id: 'field_1',
      name: 'Court A',
      location: 'Main Gym',
      lat: 45.582,
      long: -122.353,
      organizationId: null,
      rentalSlotIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await PATCH(
      patchRequest({
        field: {
          location: 'Main Gym',
          lat: 45.582,
          long: -122.353,
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.fields.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: 'Main Gym',
          lat: 45.582,
          long: -122.353,
        }),
      }),
    );
  });

  it('updates a field facility when it belongs to the same organization', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: 'org_1',
      createdBy: 'user_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.fields.update.mockResolvedValueOnce({
      id: 'field_1',
      name: 'Court A',
      organizationId: 'org_1',
      facilityId: 'facility_1',
      rentalSlotIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await PATCH(
      patchRequest({
        field: {
          facilityId: 'facility_1',
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.facilities.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'facility_1',
        organizationId: 'org_1',
      },
    });
    expect(prismaMock.fields.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          facilityId: 'facility_1',
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('hard deletes an unreferenced field', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: 'org_1',
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });

    const response = await DELETE(
      new NextRequest('http://localhost/api/fields/field_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: true,
      archived: false,
      action: 'deleted',
      entityType: 'field',
      entityId: 'field_1',
    }));
    expect(prismaMock.fields.delete).toHaveBeenCalledWith({ where: { id: 'field_1' } });
    expect(prismaMock.fields.update).not.toHaveBeenCalled();
  });

  it('archives a field with rental references', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: 'org_1',
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: null,
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.rentalBookingItems.count.mockResolvedValueOnce(2);
    prismaMock.fields.update.mockResolvedValueOnce({});

    const response = await DELETE(
      new NextRequest('http://localhost/api/fields/field_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      deleted: false,
      archived: true,
      action: 'archived',
      entityType: 'field',
      entityId: 'field_1',
      references: [{ type: 'rental_booking_items', count: 2 }],
    }));
    expect(prismaMock.fields.update).toHaveBeenCalledWith({
      where: { id: 'field_1' },
      data: expect.objectContaining({
        archivedAt: expect.any(Date),
        archivedByUserId: 'user_1',
        archiveReason: 'delete_requested',
        updatedAt: expect.any(Date),
      }),
    });
    expect(prismaMock.fields.delete).not.toHaveBeenCalled();
  });
});
