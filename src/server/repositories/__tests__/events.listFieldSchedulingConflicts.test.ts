/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { listFieldSchedulingConflicts } from '@/server/repositories/events';

const windowStart = new Date('2026-06-01T09:00:00.000Z');
const windowEnd = new Date('2026-06-02T00:00:00.000Z');

const createClient = () => ({
  matches: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'match_event_1',
        fieldId: 'field_1',
        start: new Date('2026-06-01T10:00:00.000Z'),
        end: new Date('2026-06-01T10:30:00.000Z'),
      },
    ]),
  },
  events: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
      if (Array.isArray(args.where?.id?.in)) {
        return Promise.resolve([{ id: 'match_event_1' }]);
      }
      return Promise.resolve([
        {
          id: 'event_direct_1',
          eventType: 'EVENT',
          parentEvent: null,
          start: new Date('2026-06-01T08:30:00.000Z'),
          end: new Date('2026-06-01T09:30:00.000Z'),
          fieldIds: ['field_1'],
          timeSlotIds: [],
        },
        {
          id: 'event_weekly_1',
          eventType: 'WEEKLY_EVENT',
          parentEvent: null,
          start: new Date('2026-06-01T00:00:00.000Z'),
          end: new Date('2026-06-08T00:00:00.000Z'),
          fieldIds: ['field_1'],
          timeSlotIds: ['weekly_slot_1'],
        },
      ]);
    }),
  },
  timeSlots: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'weekly_slot_1',
        daysOfWeek: [0],
        startTimeMinutes: 12 * 60,
        endTimeMinutes: 13 * 60,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-08T00:00:00.000Z'),
        timeZone: 'UTC',
        repeating: true,
        scheduledFieldIds: ['field_1'],
      },
    ]),
  },
  rentalBookingItems: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'booking_item_1',
        bookingId: 'booking_1',
        fieldId: 'field_1',
        start: new Date('2026-06-01T11:00:00.000Z'),
        end: new Date('2026-06-01T11:30:00.000Z'),
      },
    ]),
  },
});

describe('listFieldSchedulingConflicts', () => {
  it('returns opaque blockers from direct events, recurring slots, matches, and active rental bookings', async () => {
    const client = createClient();

    const conflicts = await listFieldSchedulingConflicts({
      client: client as any,
      organizationId: 'organization_1',
      fieldIds: ['field_1'],
      windowStart,
      windowEnd,
      excludeEventId: 'draft_event_1',
    });

    expect(conflicts).toEqual([
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T08:30:00.000Z'),
        end: new Date('2026-06-01T09:30:00.000Z'),
      },
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T10:00:00.000Z'),
        end: new Date('2026-06-01T10:30:00.000Z'),
      },
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T11:00:00.000Z'),
        end: new Date('2026-06-01T11:30:00.000Z'),
      },
      {
        fieldId: 'field_1',
        start: new Date('2026-06-01T12:00:00.000Z'),
        end: new Date('2026-06-01T13:00:00.000Z'),
      },
    ]);
    expect(conflicts[0]).not.toHaveProperty('blockId');
    expect(conflicts[0]).not.toHaveProperty('parentId');
    expect(client.matches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: { not: 'draft_event_1' } }),
    }));
    expect(client.rentalBookingItems.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ eventId: null }, { eventId: { not: 'draft_event_1' } }],
      }),
    }));
  });

  it('does not report an interval ending exactly when the requested range starts', async () => {
    const client = createClient();
    client.matches.findMany.mockResolvedValueOnce([
      {
        id: 'boundary_match',
        eventId: 'match_event_1',
        fieldId: 'field_1',
        start: new Date('2026-06-01T08:00:00.000Z'),
        end: windowStart,
      },
    ]);
    client.events.findMany.mockImplementation((args: { where?: { id?: { in?: string[] } } }) => {
      if (Array.isArray(args.where?.id?.in)) {
        return Promise.resolve([{ id: 'match_event_1' }]);
      }
      return Promise.resolve([]);
    });
    client.rentalBookingItems.findMany.mockResolvedValue([]);

    const conflicts = await listFieldSchedulingConflicts({
      client: client as any,
      organizationId: 'organization_1',
      fieldIds: ['field_1'],
      windowStart,
      windowEnd,
    });

    expect(conflicts).toEqual([]);
  });
});
