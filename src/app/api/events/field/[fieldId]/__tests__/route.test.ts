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
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/events/field/[fieldId]/route';

describe('/api/events/field/[fieldId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
