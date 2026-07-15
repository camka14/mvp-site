/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findMany: jest.fn(),
  },
  fields: {
    findFirst: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  rentalBookingItems: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/events/field/[fieldId]/route';

describe('/api/events/field/[fieldId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.rentalBookingItems.findMany.mockResolvedValue([]);
  });

  it('does not disclose a private event through an anonymous field calendar request', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_private',
        state: 'PRIVATE',
        hostId: 'host_1',
        assistantHostIds: [],
        organizationId: null,
        eventType: 'EVENT',
        parentEvent: null,
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: new Date('2026-05-01T18:00:00.000Z'),
        fieldIds: ['field_1'],
        timeSlotIds: [],
      },
    ]);
    prismaMock.fields.findFirst.mockResolvedValue({ rentalSlotIds: [] });

    const response = await GET(
      new NextRequest('http://localhost/api/events/field/field_1?start=2026-05-01T00%3A00%3A00.000Z&end=2026-05-02T00%3A00%3A00.000Z'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ events: [] }));
  });

  it('returns public rental occupancy as an opaque unavailable interval', async () => {
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.fields.findFirst.mockResolvedValue({ rentalSlotIds: [] });
    prismaMock.rentalBookingItems.findMany.mockResolvedValue([
      {
        id: 'booking_item_secret',
        bookingId: 'booking_secret',
        organizationId: 'org_secret',
        fieldId: 'field_1',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: new Date('2026-05-01T18:00:00.000Z'),
        status: 'CONFIRMED',
        priceCents: 4500,
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/events/field/field_1?start=2026-05-01T00%3A00%3A00.000Z&end=2026-05-02T00%3A00%3A00.000Z'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.events).toEqual([
      expect.objectContaining({
        name: 'Unavailable',
        sourceType: 'RENTAL_UNAVAILABLE',
        rentalBookingId: null,
        rentalBookingItemId: null,
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain('booking_secret');
    expect(JSON.stringify(payload)).not.toContain('org_secret');
    expect(JSON.stringify(payload)).not.toContain('4500');
  });

  it('returns blockers for rental windows linked through the field when slot field ids are empty', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        eventType: 'EVENT',
        parentEvent: null,
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: new Date('2026-05-01T18:00:00.000Z'),
        noFixedEndDateTime: false,
        fieldIds: ['field_1'],
        timeSlotIds: [],
      },
    ]);
    prismaMock.fields.findFirst.mockResolvedValue({
      rentalSlotIds: ['rental_slot_1'],
    });
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([
      {
        id: 'rental_slot_1',
        startDate: new Date('2026-05-01T16:00:00.000Z'),
        endDate: new Date('2026-05-01T20:00:00.000Z'),
        repeating: false,
        scheduledFieldId: null,
        scheduledFieldIds: [],
      },
    ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/events/field/field_1?start=2026-05-01T00%3A00%3A00.000Z&end=2026-05-02T00%3A00%3A00.000Z&rentalOverlapOnly=1',
      ),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.events).toEqual([
      expect.objectContaining({
        id: 'event_1',
        $id: 'event_1',
      }),
    ]);
  });

  it('returns league time slots as rental window blockers', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'league_1',
        eventType: 'LEAGUE',
        parentEvent: null,
        start: new Date('2026-05-01T00:00:00.000Z'),
        end: new Date('2026-05-02T00:00:00.000Z'),
        noFixedEndDateTime: false,
        fieldIds: ['field_1'],
        timeSlotIds: ['league_slot_1'],
      },
    ]);
    prismaMock.fields.findFirst.mockResolvedValue({
      rentalSlotIds: ['rental_slot_1'],
    });
    prismaMock.timeSlots.findMany
      .mockResolvedValueOnce([
        {
          id: 'rental_slot_1',
          startDate: new Date('2026-05-01T16:00:00.000Z'),
          endDate: new Date('2026-05-01T20:00:00.000Z'),
          repeating: false,
          scheduledFieldId: null,
          scheduledFieldIds: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'league_slot_1',
          startDate: new Date('2026-05-01T17:00:00.000Z'),
          endDate: new Date('2026-05-01T18:00:00.000Z'),
          startTimeMinutes: 17 * 60,
          endTimeMinutes: 18 * 60,
          repeating: false,
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
        },
      ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/events/field/field_1?start=2026-05-01T00%3A00%3A00.000Z&end=2026-05-02T00%3A00%3A00.000Z&rentalOverlapOnly=1',
      ),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.events).toEqual([
      expect.objectContaining({
        id: 'league_1',
        $id: 'league_1',
      }),
    ]);
  });
});
