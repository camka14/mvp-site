/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { upsertEventFromPayload } from '@/server/repositories/events';
import { buildEventDivisionId } from '@/lib/divisionTypes';

type MockClient = {
  $executeRaw: jest.Mock;
  events: { findUnique: jest.Mock; upsert: jest.Mock };
  fields: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  matches: { deleteMany: jest.Mock };
  divisions: { findMany: jest.Mock; deleteMany: jest.Mock; upsert: jest.Mock };
  volleyBallTeams: { upsert: jest.Mock };
  timeSlots: { upsert: jest.Mock; deleteMany: jest.Mock };
};

const createMockClient = (): MockClient => ({
  $executeRaw: jest.fn().mockResolvedValue(1),
  events: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  fields: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  },
  matches: {
    deleteMany: jest.fn().mockResolvedValue(undefined),
  },
  divisions: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  volleyBallTeams: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  timeSlots: {
    upsert: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
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
  fields: [
    {
      $id: 'field_1',
      fieldNumber: 1,
      name: 'Court A',
      location: 'Main Gym',
      lat: 0,
      long: 0,
      divisions: ['OPEN'],
    },
  ],
  teams: [],
  timeSlots: [],
});

const divisionId = (token: string) => buildEventDivisionId('event_1', token);

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
          divisions: ['OPEN'],
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
    const persistedDivisions = client.timeSlots.upsert.mock.calls
      .map((_, index) => client.$executeRaw.mock.calls[index]?.[1]);
    expect(persistedDivisions).toEqual([[divisionId('open')], [divisionId('open')]]);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.timeSlotIds).toEqual(['slot_multi__d1', 'slot_multi__d3']);
    expect(eventUpsertArg.update.timeSlotIds).toEqual(['slot_multi__d1', 'slot_multi__d3']);
  });

  it('forces all event divisions onto each timeslot when singleDivision is enabled', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      singleDivision: true,
      divisions: ['BEGINNER', 'ADVANCED'],
      timeSlots: [
        {
          $id: 'slot_single_division',
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: ['BEGINNER'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
          scheduledFieldId: 'field_1',
          startDate: '2026-01-05T09:00:00.000Z',
          endDate: '2026-03-05T09:00:00.000Z',
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(1);
    expect(client.$executeRaw).toHaveBeenCalled();
    const persistedDivisions = client.$executeRaw.mock.calls[0]?.[1];
    expect(persistedDivisions).toEqual([divisionId('beginner'), divisionId('advanced')]);
  });

  it('fans out each multi-field slot/day combination and derives event fieldIds from slot assignments', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      fieldIds: ['field_old'],
      fields: [
        { $id: 'field_1', fieldNumber: 1, name: 'Court A', divisions: ['OPEN'] },
        { $id: 'field_2', fieldNumber: 2, name: 'Court B', divisions: ['OPEN'] },
      ],
      timeSlots: [
        {
          $id: 'slot_multi',
          daysOfWeek: [1, 3],
          divisions: ['OPEN'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
          scheduledFieldIds: ['field_1', 'field_2'],
          startDate: '2026-01-05T09:00:00.000Z',
          endDate: '2026-03-05T09:00:00.000Z',
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(4);
    const persistedSlotIds = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].where.id)
      .sort();
    expect(persistedSlotIds).toEqual([
      'slot_multi__d1__ffield_1',
      'slot_multi__d1__ffield_2',
      'slot_multi__d3__ffield_1',
      'slot_multi__d3__ffield_2',
    ]);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.fieldIds.sort()).toEqual(['field_1', 'field_2']);
    expect(eventUpsertArg.update.fieldIds.sort()).toEqual(['field_1', 'field_2']);
    expect(eventUpsertArg.create.timeSlotIds.sort()).toEqual([
      'slot_multi__d1__ffield_1',
      'slot_multi__d1__ffield_2',
      'slot_multi__d3__ffield_1',
      'slot_multi__d3__ffield_2',
    ]);
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
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.fields.findUnique).not.toHaveBeenCalled();
    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual([divisionId('beginner'), divisionId('advanced')]);
    expect(fieldUpsertArg.update.divisions).toEqual([divisionId('beginner'), divisionId('advanced')]);
    expect(client.divisions.upsert).toHaveBeenCalledTimes(2);
  });

  it('uses sport-based default divisions when payload divisions are omitted', async () => {
    const client = createMockClient();

    const payload = {
      ...baseEventPayload(),
      divisions: [],
      fields: [
        {
          $id: 'field_1',
          fieldNumber: 1,
          name: 'Court A',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual([
      divisionId('beginner'),
      divisionId('intermediate'),
      divisionId('advanced'),
    ]);
    expect(fieldUpsertArg.update.divisions).toEqual([
      divisionId('beginner'),
      divisionId('intermediate'),
      divisionId('advanced'),
    ]);
    expect(client.divisions.upsert).toHaveBeenCalledTimes(3);
  });

  it('uses beginner/advanced defaults for soccer when divisions are omitted', async () => {
    const client = createMockClient();

    const payload = {
      ...baseEventPayload(),
      sportId: 'Soccer',
      divisions: [],
      fields: [
        {
          $id: 'field_1',
          fieldNumber: 1,
          name: 'Court A',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.divisions).toEqual([divisionId('beginner'), divisionId('advanced')]);
    expect(fieldUpsertArg.update.divisions).toEqual([divisionId('beginner'), divisionId('advanced')]);
    expect(client.divisions.upsert).toHaveBeenCalledTimes(2);
  });
});
