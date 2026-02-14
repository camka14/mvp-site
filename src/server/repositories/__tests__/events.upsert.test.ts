/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { upsertEventFromPayload } from '@/server/repositories/events';

type MockClient = {
  events: { upsert: jest.Mock };
  fields: { findUnique: jest.Mock; upsert: jest.Mock };
  volleyBallTeams: { upsert: jest.Mock };
  timeSlots: { upsert: jest.Mock };
};

const createMockClient = (): MockClient => ({
  events: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  fields: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  volleyBallTeams: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  timeSlots: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
});

const baseEventPayload = () => ({
  $id: 'event_1',
  name: 'League Event',
  start: '2026-01-05T09:00:00.000Z',
  end: '2026-03-05T09:00:00.000Z',
  eventType: 'LEAGUE',
  sportId: 'sport_1',
  hostId: 'host_1',
  fieldType: 'INDOOR',
  fields: [
    {
      $id: 'field_1',
      fieldNumber: 1,
      name: 'Court A',
      type: 'INDOOR',
      location: 'Main Gym',
      lat: 0,
      long: 0,
      divisions: ['OPEN'],
    },
  ],
  teams: [],
  timeSlots: [],
});

describe('upsertEventFromPayload', () => {
  it('fans out multi-day slot payloads into one persisted slot per day', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      timeSlots: [
        {
          $id: 'slot_multi',
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
          scheduledFieldId: 'field_1',
          startDate: '2026-01-05T09:00:00.000Z',
          endDate: '2026-03-05T09:00:00.000Z',
        },
      ],
    };

    const eventId = await upsertEventFromPayload(payload, client as any);

    expect(eventId).toBe('event_1');
    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(2);
    const persistedSlotIds = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].where.id)
      .sort();
    expect(persistedSlotIds).toEqual(['slot_multi__d1', 'slot_multi__d3']);

    const persistedDays = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].create.dayOfWeek)
      .sort((a: number, b: number) => a - b);
    expect(persistedDays).toEqual([1, 3]);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.timeSlotIds).toEqual(['slot_multi__d1', 'slot_multi__d3']);
    expect(eventUpsertArg.update.timeSlotIds).toEqual(['slot_multi__d1', 'slot_multi__d3']);
  });

  it('falls back local field divisions to event divisions when field divisions are omitted', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['BEGINNER', 'ADVANCED'],
      fields: [
        {
          $id: 'field_1',
          fieldNumber: 1,
          name: 'Court A',
          type: 'INDOOR',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.fields.findUnique).not.toHaveBeenCalled();
    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual(['BEGINNER', 'ADVANCED']);
    expect(fieldUpsertArg.update.divisions).toEqual(['BEGINNER', 'ADVANCED']);
  });

  it('falls back local field divisions to existing field divisions before OPEN', async () => {
    const client = createMockClient();
    client.fields.findUnique.mockResolvedValue({ divisions: ['EXPERT'] });

    const payload = {
      ...baseEventPayload(),
      divisions: [],
      fields: [
        {
          $id: 'field_1',
          fieldNumber: 1,
          name: 'Court A',
          type: 'INDOOR',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.fields.findUnique).toHaveBeenCalledWith({
      where: { id: 'field_1' },
      select: { divisions: true },
    });
    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual(['EXPERT']);
    expect(fieldUpsertArg.update.divisions).toEqual(['EXPERT']);
  });

  it('uses OPEN as the final fallback when no divisions exist on payload or persisted field', async () => {
    const client = createMockClient();
    client.fields.findUnique.mockResolvedValue({ divisions: [] });

    const payload = {
      ...baseEventPayload(),
      divisions: [],
      fields: [
        {
          $id: 'field_1',
          fieldNumber: 1,
          name: 'Court A',
          type: 'INDOOR',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual(['OPEN']);
    expect(fieldUpsertArg.update.divisions).toEqual(['OPEN']);
  });
});
