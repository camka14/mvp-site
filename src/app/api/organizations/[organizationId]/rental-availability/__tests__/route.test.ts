/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  facilities: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
};
const getOptionalSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const listFieldSchedulingConflictsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ getOptionalSession: getOptionalSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: unknown[]) => canManageOrganizationMock(...args),
}));
jest.mock('@/server/repositories/events', () => ({
  listFieldSchedulingConflicts: (...args: unknown[]) => listFieldSchedulingConflictsMock(...args),
}));

import { GET } from '@/app/api/organizations/[organizationId]/rental-availability/route';

const rangeStart = '2026-06-01T09:00:00.000Z';
const rangeEnd = '2026-06-01T12:00:00.000Z';

const request = (search = `start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`) => (
  new NextRequest(`http://localhost/api/organizations/organization_1/rental-availability?${search}`)
);

const routeParams = () => ({ params: Promise.resolve({ organizationId: 'organization_1' }) });

describe('/api/organizations/[organizationId]/rental-availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockResolvedValue(null);
    canManageOrganizationMock.mockResolvedValue(false);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'organization_1',
      ownerId: 'owner_1',
      publicPageEnabled: true,
    });
    prismaMock.facilities.findMany.mockResolvedValue([
      { id: 'facility_1', organizationId: 'organization_1', name: 'Main Facility' },
    ]);
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court A',
        organizationId: 'organization_1',
        facilityId: 'facility_1',
        rentalSlotIds: ['slot_1'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        archivedAt: null,
        dayOfWeek: 0,
        daysOfWeek: [0, 2],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 17 * 60,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        timeZone: 'UTC',
        repeating: true,
        price: 1800,
      },
    ]);
    listFieldSchedulingConflictsMock.mockResolvedValue([]);
  });

  it('rejects missing, malformed, and oversized date ranges with a typed 400 response', async () => {
    const missingEnd = await GET(request(`start=${encodeURIComponent(rangeStart)}`), routeParams());
    expect(missingEnd.status).toBe(400);
    await expect(missingEnd.json()).resolves.toEqual(expect.objectContaining({
      code: 'INVALID_RENTAL_AVAILABILITY_RANGE',
    }));

    const missingTimeZone = await GET(
      request('start=2026-06-01T00%3A00%3A00&end=2026-06-01T01%3A00%3A00'),
      routeParams(),
    );
    expect(missingTimeZone.status).toBe(400);
    await expect(missingTimeZone.json()).resolves.toEqual(expect.objectContaining({
      code: 'INVALID_RENTAL_AVAILABILITY_RANGE',
    }));

    const oversized = await GET(
      request('start=2026-06-01T00%3A00%3A00.000Z&end=2026-07-03T00%3A00%3A00.000Z'),
      routeParams(),
    );
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual(expect.objectContaining({
      code: 'INVALID_RENTAL_AVAILABILITY_RANGE',
    }));
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
  });

  it('does not disclose private rental inventory to an anonymous caller', async () => {
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'organization_1',
      ownerId: 'owner_1',
      publicPageEnabled: false,
    });

    const response = await GET(request(), routeParams());

    expect(response.status).toBe(404);
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
  });

  it('allows an organization manager to read private rental availability', async () => {
    getOptionalSessionMock.mockResolvedValueOnce({ userId: 'owner_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValueOnce(true);
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'organization_1',
      ownerId: 'owner_1',
      publicPageEnabled: false,
    });

    const response = await GET(request(), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fields).toHaveLength(1);
    expect(canManageOrganizationMock).toHaveBeenCalledWith(
      { userId: 'owner_1', isAdmin: false },
      expect.objectContaining({ id: 'organization_1' }),
      prismaMock,
    );
  });

  it('returns only rentable inventory and opaque, range-clipped busy blocks', async () => {
    prismaMock.fields.findMany.mockResolvedValueOnce([
      {
        id: 'field_1',
        name: 'Court A',
        organizationId: 'organization_1',
        facilityId: 'facility_1',
        rentalSlotIds: ['slot_1'],
      },
      {
        id: 'field_without_rental_inventory',
        name: 'Practice Court',
        organizationId: 'organization_1',
        facilityId: 'facility_1',
        rentalSlotIds: [],
      },
    ]);
    listFieldSchedulingConflictsMock.mockResolvedValueOnce([
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T08:30:00.000Z'),
        end: new Date('2026-06-01T09:15:00.000Z'),
        eventId: 'event_secret',
        bookingId: 'booking_secret',
      },
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T11:30:00.000Z'),
        end: new Date('2026-06-01T12:30:00.000Z'),
        matchId: 'match_secret',
      },
    ]);

    const response = await GET(request(), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      range: { start: rangeStart, end: rangeEnd },
      fields: [
        {
          id: 'field_1',
          fieldNumber: null,
          name: 'Court A',
          facilityId: 'facility_1',
          facilityName: 'Main Facility',
          rentalSlots: [
            {
              id: 'slot_1',
              daysOfWeek: [0, 2],
              startTimeMinutes: 540,
              endTimeMinutes: 1020,
              startDate: '2026-06-01T00:00:00.000Z',
              endDate: '2026-12-31T00:00:00.000Z',
              timeZone: 'UTC',
              repeating: true,
              price: 1800,
            },
          ],
        },
      ],
      busyBlocks: [
        {
          fieldId: 'field_1',
          start: rangeStart,
          end: '2026-06-01T09:15:00.000Z',
        },
        {
          fieldId: 'field_1',
          start: '2026-06-01T11:30:00.000Z',
          end: rangeEnd,
        },
      ],
    });
    expect(listFieldSchedulingConflictsMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organization_1',
      fieldIds: ['field_1'],
      windowStart: new Date(rangeStart),
      windowEnd: new Date(rangeEnd),
    }));
    expect(JSON.stringify(payload)).not.toContain('event_secret');
    expect(JSON.stringify(payload)).not.toContain('booking_secret');
    expect(JSON.stringify(payload)).not.toContain('match_secret');
  });

  it('excludes unpriced slots while preserving an explicit free price', async () => {
    prismaMock.fields.findMany.mockResolvedValueOnce([
      {
        id: 'field_1',
        name: 'Court A',
        organizationId: 'organization_1',
        facilityId: 'facility_1',
        rentalSlotIds: ['slot_unpriced', 'slot_free'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([
      {
        id: 'slot_unpriced',
        archivedAt: null,
        dayOfWeek: 0,
        daysOfWeek: [0],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: null,
        timeZone: 'UTC',
        repeating: true,
        price: null,
      },
      {
        id: 'slot_free',
        archivedAt: null,
        dayOfWeek: 0,
        daysOfWeek: [0],
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 11 * 60,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: null,
        timeZone: 'UTC',
        repeating: true,
        price: 0,
      },
    ]);

    const response = await GET(request(), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fields).toHaveLength(1);
    expect(payload.fields[0].rentalSlots).toEqual([
      expect.objectContaining({ id: 'slot_free', price: 0 }),
    ]);
    expect(prismaMock.timeSlots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ price: { not: null } }),
    }));
  });
});
