/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { persistScheduledRosterTeams, upsertEventFromPayload } from '@/server/repositories/events';
import { buildEventDivisionId } from '@/lib/divisionTypes';

type MockClient = {
  $executeRaw: jest.Mock;
  events: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  sports: { findUnique: jest.Mock };
  organizations: { findUnique: jest.Mock };
  staffMembers: { findMany: jest.Mock };
  invites: { findMany: jest.Mock };
  userData: { findUnique: jest.Mock };
  leagueScoringConfigs: { upsert: jest.Mock };
  eventOfficials: { findMany: jest.Mock; deleteMany: jest.Mock; create: jest.Mock };
  fields: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  matches: { findMany: jest.Mock; deleteMany: jest.Mock };
  divisions: { findMany: jest.Mock; deleteMany: jest.Mock; upsert: jest.Mock };
  teams: { upsert: jest.Mock };
  timeSlots: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
};

const createMockClient = (): MockClient => ({
  $executeRaw: jest.fn().mockResolvedValue(1),
  events: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  sports: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  organizations: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  staffMembers: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  invites: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userData: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  leagueScoringConfigs: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  eventOfficials: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  },
  fields: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(1),
    upsert: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  },
  matches: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  },
  divisions: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  teams: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  timeSlots: {
    findMany: jest.fn().mockResolvedValue([]),
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
  it('rejects fixed endDateTime values that are not after startDateTime', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      start: '2026-01-05T09:00:00.000Z',
      end: '2026-01-05T09:00:00.000Z',
      noFixedEndDateTime: false,
      divisions: ['OPEN'],
    };

    await expect(upsertEventFromPayload(payload, client as any)).rejects.toThrow(
      'End date/time must be after start date/time when "No fixed end datetime scheduling" is disabled.',
    );
    expect(client.events.upsert).not.toHaveBeenCalled();
  });

  it('preserves an existing scheduler-computed end for open-ended schedulable upserts', async () => {
    const client = createMockClient();
    const computedEnd = new Date('2026-05-03T01:20:00.000Z');
    client.events.findUnique.mockResolvedValueOnce({
      fieldIds: ['field_1'],
      timeSlotIds: ['slot_1'],
      eventType: 'TOURNAMENT',
      end: computedEnd,
      noFixedEndDateTime: true,
      leagueScoringConfigId: null,
      hostId: 'host_1',
      organizationId: null,
      parentEvent: null,
      officialIds: [],
      officialPositions: [],
      officialSchedulingMode: 'SCHEDULE',
      sportId: 'sport_1',
    });
    const payload = {
      ...baseEventPayload(),
      eventType: 'TOURNAMENT',
      noFixedEndDateTime: true,
      end: null,
      divisions: ['OPEN'],
    };

    await upsertEventFromPayload(payload, client as any);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.end).toEqual(computedEnd);
    expect(eventUpsertArg.update.end).toEqual(computedEnd);
  });

  it('persists a provided end date for open-ended schedulable upserts', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      eventType: 'TOURNAMENT',
      noFixedEndDateTime: true,
      end: '2026-05-03T01:20:00.000Z',
      divisions: ['OPEN'],
    };

    await upsertEventFromPayload(payload, client as any);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.end).toEqual(new Date('2026-05-03T01:20:00.000Z'));
    expect(eventUpsertArg.update.end).toEqual(new Date('2026-05-03T01:20:00.000Z'));
  });

  it('persists multi-day slot payloads as one canonical row', async () => {
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
    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(1);
    const persistedSlotIds = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].where.id)
      .sort();
    expect(persistedSlotIds).toEqual(['slot_multi']);

    const persistedSlot = client.timeSlots.upsert.mock.calls[0][0].create;
    expect(persistedSlot.dayOfWeek).toBe(1);
    expect(persistedSlot.daysOfWeek).toEqual([1, 3]);
    expect(persistedSlot.scheduledFieldId).toBe('field_1');
    expect(persistedSlot.scheduledFieldIds).toEqual(['field_1']);
    const persistedDivisions = client.timeSlots.upsert.mock.calls
      .map((_, index) => client.$executeRaw.mock.calls[index]?.[1]);
    expect(persistedDivisions).toEqual([[divisionId('open')]]);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.timeSlotIds).toEqual(['slot_multi']);
    expect(eventUpsertArg.update.timeSlotIds).toEqual(['slot_multi']);
  });

  it('persists both slots when incoming payload contains duplicate slot ids', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      timeSlots: [
        {
          $id: 'slot_duplicate',
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: ['OPEN'],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
          scheduledFieldId: 'field_1',
          startDate: '2026-01-05T09:00:00.000Z',
          endDate: '2026-03-05T09:00:00.000Z',
        },
        {
          $id: 'slot_duplicate',
          dayOfWeek: 2,
          daysOfWeek: [2],
          divisions: ['OPEN'],
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          repeating: true,
          scheduledFieldId: 'field_1',
          startDate: '2026-01-05T09:00:00.000Z',
          endDate: '2026-03-05T09:00:00.000Z',
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(2);
    const persistedSlotIds = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].where.id)
      .sort();
    expect(persistedSlotIds).toEqual(['slot_duplicate', 'slot_duplicate__dup1']);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.timeSlotIds.sort()).toEqual(['slot_duplicate', 'slot_duplicate__dup1']);
    expect(eventUpsertArg.update.timeSlotIds.sort()).toEqual(['slot_duplicate', 'slot_duplicate__dup1']);
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

  it('remaps foreign event-scoped division ids to the current event before persisting', async () => {
    const client = createMockClient();
    const sourceOpenDivisionId = buildEventDivisionId('event_source', 'open');
    const sourceAdvancedDivisionId = buildEventDivisionId('event_source', 'advanced');
    const targetOpenDivisionId = buildEventDivisionId('event_target', 'open');
    const targetAdvancedDivisionId = buildEventDivisionId('event_target', 'advanced');

    const payload = {
      ...baseEventPayload(),
      $id: 'event_target',
      divisions: [sourceOpenDivisionId, sourceAdvancedDivisionId],
      divisionDetails: [
        {
          id: sourceOpenDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'skill_open_age_18plus',
          divisionTypeName: 'Open • 18+',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 18+ as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
          playoffPlacementDivisionIds: [sourceAdvancedDivisionId, ''],
        },
        {
          id: sourceAdvancedDivisionId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'skill_premier_age_u17',
          divisionTypeName: 'Premier • U17',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: '2026-08-01T19:00:00.000Z',
          ageCutoffLabel: 'Age 17 or younger as of 08/01/2026',
          ageCutoffSource: 'US Youth Soccer seasonal-year age grouping guidance.',
        },
      ],
      timeSlots: [
        {
          $id: 'slot_foreign_divisions',
          dayOfWeek: 1,
          daysOfWeek: [1],
          divisions: [sourceOpenDivisionId],
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

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.divisions).toEqual([targetOpenDivisionId, targetAdvancedDivisionId]);
    expect(eventUpsertArg.update.divisions).toEqual([targetOpenDivisionId, targetAdvancedDivisionId]);

    const persistedDivisionIds = client.divisions.upsert.mock.calls.map(([args]) => args.where.id);
    expect(persistedDivisionIds).toEqual(expect.arrayContaining([targetOpenDivisionId, targetAdvancedDivisionId]));
    expect(persistedDivisionIds).not.toContain(sourceOpenDivisionId);
    expect(persistedDivisionIds).not.toContain(sourceAdvancedDivisionId);

    const openDivisionUpsertArgs = client.divisions.upsert.mock.calls.find(
      ([args]) => args.where.id === targetOpenDivisionId,
    )?.[0];
    expect(openDivisionUpsertArgs?.create.divisionTypeId).toBe('skill_open_age_18plus');
    expect(openDivisionUpsertArgs?.create.divisionTypeName).toBe('Open • 18+');
    expect(openDivisionUpsertArgs?.create.ageCutoffDate).toEqual(new Date('2026-08-01T19:00:00.000Z'));
    expect(openDivisionUpsertArgs?.create.ageCutoffLabel).toBe('Age 18+ as of 08/01/2026');
    expect(openDivisionUpsertArgs?.create.ageCutoffSource).toBe('US Youth Soccer seasonal-year age grouping guidance.');
    expect(openDivisionUpsertArgs?.update.divisionTypeId).toBe('skill_open_age_18plus');
    expect(openDivisionUpsertArgs?.update.ageCutoffDate).toEqual(new Date('2026-08-01T19:00:00.000Z'));
    expect(openDivisionUpsertArgs?.create.playoffPlacementDivisionIds).toEqual([targetAdvancedDivisionId, '']);
    expect(openDivisionUpsertArgs?.update.playoffPlacementDivisionIds).toEqual([targetAdvancedDivisionId, '']);

    const persistedSlotDivisions = client.$executeRaw.mock.calls[0]?.[1];
    expect(persistedSlotDivisions).toEqual([targetOpenDivisionId]);
  });

  it('persists each multi-field slot/day selection as one canonical row and derives event fieldIds from slot assignments', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      fieldIds: ['field_old'],
      fields: [
        { $id: 'field_1', name: 'Court A', divisions: ['OPEN'] },
        { $id: 'field_2', name: 'Court B', divisions: ['OPEN'] },
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

    expect(client.timeSlots.upsert).toHaveBeenCalledTimes(1);
    const persistedSlotIds = client.timeSlots.upsert.mock.calls
      .map((call) => call[0].where.id)
      .sort();
    expect(persistedSlotIds).toEqual(['slot_multi']);
    const persistedSlot = client.timeSlots.upsert.mock.calls[0][0].create;
    expect(persistedSlot.dayOfWeek).toBe(1);
    expect(persistedSlot.daysOfWeek).toEqual([1, 3]);
    expect(persistedSlot.scheduledFieldId).toBe('field_1');
    expect(persistedSlot.scheduledFieldIds).toEqual(['field_1', 'field_2']);

    const eventUpsertArg = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArg.create.fieldIds.sort()).toEqual(['field_1', 'field_2']);
    expect(eventUpsertArg.update.fieldIds.sort()).toEqual(['field_1', 'field_2']);
    expect(eventUpsertArg.create.timeSlotIds).toEqual(['slot_multi']);
  });

  it('falls back local field divisions to event divisions when field divisions are omitted', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['BEGINNER', 'ADVANCED'],
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(client.divisions.upsert).toHaveBeenCalledTimes(2);
  });

  it('does not clear field rentalSlotIds when payload omits rentalSlotIds', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      organizationId: 'org_1',
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          divisions: ['OPEN'],
          // rentalSlotIds intentionally omitted
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.rentalSlotIds).toEqual([]);
    expect(fieldUpsertArg.update).not.toHaveProperty('rentalSlotIds');
  });

  it('preserves existing field ownership when payload field omits organizationId', async () => {
    const client = createMockClient();
    client.fields.findMany.mockResolvedValueOnce([
      { id: 'field_1', organizationId: 'org_facility_1' },
    ]);
    const payload = {
      ...baseEventPayload(),
      organizationId: null,
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          divisions: ['OPEN'],
          organizationId: null,
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(fieldUpsertArg.create.organizationId).toBeNull();
    expect(fieldUpsertArg.update.organizationId).toBe('org_facility_1');
  });

  it('uses sport-based default divisions when payload divisions are omitted', async () => {
    const client = createMockClient();

    const payload = {
      ...baseEventPayload(),
      divisions: [],
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
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
          name: 'Court A',
          divisions: [],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const fieldUpsertArg = client.fields.upsert.mock.calls[0][0];
    expect(client.divisions.upsert).toHaveBeenCalledTimes(2);
  });

  it('persists division pricing, capacity, playoffs, and payment-plan fields from division details', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    client.userData.findUnique.mockResolvedValue({ hasStripeAccount: true });

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      allowPaymentPlans: true,
      installmentCount: 3,
      installmentAmounts: [1200, 800, 500],
      installmentDueDates: [
        '2026-01-08T09:00:00.000Z',
        '2026-01-15T09:00:00.000Z',
        '2026-01-22T09:00:00.000Z',
      ],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          price: 2500,
          maxParticipants: 12,
          playoffTeamCount: 8,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: [
            '2026-01-09T09:00:00.000Z',
            '2026-01-16T09:00:00.000Z',
          ],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          price: 2500,
          maxParticipants: 12,
          playoffTeamCount: 8,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: [
            new Date('2026-01-09T09:00:00.000Z'),
            new Date('2026-01-16T09:00:00.000Z'),
          ],
        }),
        update: expect.objectContaining({
          price: 2500,
          maxParticipants: 12,
          playoffTeamCount: 8,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: [
            new Date('2026-01-09T09:00:00.000Z'),
            new Date('2026-01-16T09:00:00.000Z'),
          ],
        }),
      }),
    );
  });

  it('rejects split-division payloads that assign a team to multiple league divisions', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    const advancedDivisionId = divisionId('advanced');

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN', 'ADVANCED'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          teamIds: ['team_1'],
        },
        {
          id: advancedDivisionId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'advanced',
          divisionTypeName: 'Advanced',
          ratingType: 'SKILL',
          gender: 'C',
          teamIds: ['team_1'],
        },
      ],
    };

    await expect(upsertEventFromPayload(payload, client as any))
      .rejects
      .toThrow('Team team_1 is assigned to more than one division.');
  });

  it('clears persisted division teamIds when singleDivision mode is enabled', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    const advancedDivisionId = divisionId('advanced');

    const payload = {
      ...baseEventPayload(),
      singleDivision: true,
      divisions: ['OPEN', 'ADVANCED'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          teamIds: ['team_1'],
        },
        {
          id: advancedDivisionId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'advanced',
          divisionTypeName: 'Advanced',
          ratingType: 'SKILL',
          gender: 'C',
          teamIds: ['team_2', 'team_3'],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    const leagueDivisionUpsertCalls = client.divisions.upsert.mock.calls.filter(
      ([args]) => args.where.id === openDivisionId || args.where.id === advancedDivisionId,
    );
    expect(leagueDivisionUpsertCalls).toHaveLength(2);
    for (const [args] of leagueDivisionUpsertCalls) {
      expect(args.create.teamIds).toEqual([]);
      expect(args.update.teamIds).toEqual([]);
    }
  });

  it('preserves existing division teamIds when divisionDetails omits teamIds', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    client.divisions.findMany.mockResolvedValue([
      {
        id: openDivisionId,
        key: 'open',
        name: 'Open',
        kind: 'LEAGUE',
        fieldIds: [],
        teamIds: ['team_1', 'team_2'],
      },
    ]);

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          maxParticipants: 12,
          // teamIds intentionally omitted; existing assignment should be preserved
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          teamIds: ['team_1', 'team_2'],
        }),
        update: expect.objectContaining({
          teamIds: ['team_1', 'team_2'],
        }),
      }),
    );
  });

  it('preserves existing playoff placement mappings when divisionDetails omits playoffPlacementDivisionIds', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    const playoffDivisionOneId = divisionId('playoff_1');
    const playoffDivisionTwoId = divisionId('playoff_2');
    client.divisions.findMany.mockResolvedValue([
      {
        id: openDivisionId,
        key: 'open',
        name: 'Open',
        kind: 'LEAGUE',
        fieldIds: [],
        playoffPlacementDivisionIds: [playoffDivisionOneId, playoffDivisionTwoId],
      },
    ]);

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          playoffTeamCount: 2,
          // playoffPlacementDivisionIds intentionally omitted; existing mapping should be preserved
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          playoffPlacementDivisionIds: [playoffDivisionOneId, playoffDivisionTwoId],
        }),
        update: expect.objectContaining({
          playoffPlacementDivisionIds: [playoffDivisionOneId, playoffDivisionTwoId],
        }),
      }),
    );
  });

  it('preserves playoff placement indexes when mapping includes empty positions', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    const playoffDivisionOneId = divisionId('playoff_1');
    const playoffDivisionTwoId = divisionId('playoff_2');

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          playoffTeamCount: 3,
          playoffPlacementDivisionIds: [playoffDivisionOneId, '', 'playoff_2'],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          playoffPlacementDivisionIds: [playoffDivisionOneId, '', playoffDivisionTwoId],
        }),
        update: expect.objectContaining({
          playoffPlacementDivisionIds: [playoffDivisionOneId, '', playoffDivisionTwoId],
        }),
      }),
    );
  });

  it('requires an explicit event playoff team count when playoffs are enabled', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');

    const payload = {
      ...baseEventPayload(),
      includePlayoffs: true,
      singleDivision: true,
      divisions: ['OPEN'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
        },
      ],
    };

    await expect(upsertEventFromPayload(payload, client as any)).rejects.toThrow(
      'Playoff team count must be at least 2 when playoffs are enabled.',
    );
    expect(client.divisions.upsert).not.toHaveBeenCalled();
  });

  it('requires explicit playoff team counts for each division in split leagues', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    const advancedDivisionId = divisionId('advanced');

    const payload = {
      ...baseEventPayload(),
      includePlayoffs: true,
      singleDivision: false,
      playoffTeamCount: 8,
      divisions: ['OPEN', 'ADVANCED'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          playoffTeamCount: 4,
        },
        {
          id: advancedDivisionId,
          key: 'advanced',
          name: 'Advanced',
          divisionTypeId: 'advanced',
          divisionTypeName: 'Advanced',
          ratingType: 'SKILL',
          gender: 'C',
        },
      ],
    };

    await expect(upsertEventFromPayload(payload, client as any)).rejects.toThrow(
      'Playoff team count must be at least 2 for division "Advanced" when playoffs are enabled.',
    );
    expect(client.divisions.upsert).not.toHaveBeenCalled();
  });

  it('falls back to event-level payment-plan defaults when division payment fields are omitted', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    client.userData.findUnique.mockResolvedValue({ hasStripeAccount: true });

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      allowPaymentPlans: true,
      installmentCount: 3,
      installmentAmounts: [1200, 800, 500],
      installmentDueDates: [
        '2026-01-08T09:00:00.000Z',
        '2026-01-15T09:00:00.000Z',
        '2026-01-22T09:00:00.000Z',
      ],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          price: 2500,
          maxParticipants: 12,
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          allowPaymentPlans: true,
          installmentCount: 3,
          installmentAmounts: [1200, 800, 500],
          installmentDueDates: [
            new Date('2026-01-08T09:00:00.000Z'),
            new Date('2026-01-15T09:00:00.000Z'),
            new Date('2026-01-22T09:00:00.000Z'),
          ],
        }),
        update: expect.objectContaining({
          allowPaymentPlans: true,
          installmentCount: 3,
          installmentAmounts: [1200, 800, 500],
          installmentDueDates: [
            new Date('2026-01-08T09:00:00.000Z'),
            new Date('2026-01-15T09:00:00.000Z'),
            new Date('2026-01-22T09:00:00.000Z'),
          ],
        }),
      }),
    );
  });

  it('forces event and division pricing to free when the billing owner has no Stripe account', async () => {
    const client = createMockClient();
    const openDivisionId = divisionId('open');
    client.userData.findUnique.mockResolvedValue({ hasStripeAccount: false });

    const payload = {
      ...baseEventPayload(),
      price: 2500,
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [1500, 1000],
      installmentDueDates: [
        '2026-01-09T09:00:00.000Z',
        '2026-01-16T09:00:00.000Z',
      ],
      divisions: ['OPEN'],
      divisionDetails: [
        {
          id: openDivisionId,
          key: 'open',
          name: 'Open',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          price: 2500,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: [
            '2026-01-09T09:00:00.000Z',
            '2026-01-16T09:00:00.000Z',
          ],
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.userData.findUnique).toHaveBeenCalledWith({
      where: { id: 'host_1' },
      select: { hasStripeAccount: true },
    });

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create.price).toBe(0);
    expect(eventUpsertArgs.update.price).toBe(0);
    expect(eventUpsertArgs.create.allowPaymentPlans).toBe(false);
    expect(eventUpsertArgs.update.allowPaymentPlans).toBe(false);
    expect(eventUpsertArgs.create.installmentCount).toBe(0);
    expect(eventUpsertArgs.update.installmentCount).toBe(0);
    expect(eventUpsertArgs.create.installmentAmounts).toEqual([]);
    expect(eventUpsertArgs.update.installmentAmounts).toEqual([]);
    expect(eventUpsertArgs.create.installmentDueDates).toEqual([]);
    expect(eventUpsertArgs.update.installmentDueDates).toEqual([]);

    expect(client.divisions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openDivisionId },
        create: expect.objectContaining({
          price: 0,
          allowPaymentPlans: false,
          installmentCount: null,
          installmentAmounts: [],
          installmentDueDates: [],
        }),
        update: expect.objectContaining({
          price: 0,
          allowPaymentPlans: false,
          installmentCount: null,
          installmentAmounts: [],
          installmentDueDates: [],
        }),
      }),
    );
  });

  it('uses organization Stripe status for organization events', async () => {
    const client = createMockClient();
    client.organizations.findUnique.mockResolvedValue({ hasStripeAccount: false, verificationStatus: 'UNVERIFIED' });
    client.userData.findUnique.mockResolvedValue({ hasStripeAccount: true });

    const payload = {
      ...baseEventPayload(),
      organizationId: 'org_1',
      price: 3000,
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.organizations.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { hasStripeAccount: true, verificationStatus: true },
    });
    expect(client.userData.findUnique).not.toHaveBeenCalled();

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create.price).toBe(0);
    expect(eventUpsertArgs.update.price).toBe(0);
  });

  it('rejects new organization events when the organization has no saved fields', async () => {
    const client = createMockClient();
    client.organizations.findUnique.mockResolvedValueOnce({
      ownerId: 'owner_1',
      hostIds: ['owner_1'],
      officialIds: [],
    });
    client.fields.count.mockResolvedValueOnce(0);

    const payload = {
      ...baseEventPayload(),
      eventType: 'EVENT',
      organizationId: 'org_1',
      end: '2026-01-05T11:00:00.000Z',
      timeSlots: [],
    };

    await expect(upsertEventFromPayload(payload, client as any)).rejects.toThrow(
      'Organization events require at least one saved field. Create a field for this organization before creating an event.',
    );
    expect(client.events.upsert).not.toHaveBeenCalled();
  });

  it('retries event upsert without unknown Prisma arguments', async () => {
    const client = createMockClient();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    client.events.upsert
      .mockRejectedValueOnce(new Error('Unknown argument `noFixedEndDateTime`. Available options are marked with ?.'))
      .mockResolvedValue(undefined);

    const payload = {
      ...baseEventPayload(),
      noFixedEndDateTime: false,
    };

    try {
      await upsertEventFromPayload(payload, client as any);

      expect(client.events.upsert).toHaveBeenCalledTimes(2);
      const firstCallArgs = client.events.upsert.mock.calls[0][0];
      const secondCallArgs = client.events.upsert.mock.calls[1][0];
      expect(firstCallArgs.create.noFixedEndDateTime).toBe(false);
      expect(firstCallArgs.update.noFixedEndDateTime).toBe(false);
      expect(secondCallArgs.create.noFixedEndDateTime).toBeUndefined();
      expect(secondCallArgs.update.noFixedEndDateTime).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('noFixedEndDateTime'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('persists league scoring config values and links the resulting config id on event upsert', async () => {
    const client = createMockClient();
    client.leagueScoringConfigs.upsert.mockResolvedValue({
      id: 'cfg_1',
      pointsForWin: 3,
      pointsForDraw: 1,
      pointsForLoss: 0,
    });

    const payload = {
      ...baseEventPayload(),
      leagueScoringConfig: {
        id: 'cfg_1',
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      },
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.leagueScoringConfigs.upsert).toHaveBeenCalledTimes(1);
    expect(client.leagueScoringConfigs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cfg_1' },
        update: expect.objectContaining({
          pointsForWin: 3,
          pointsForDraw: 1,
          pointsForLoss: 0,
        }),
      }),
    );

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create.leagueScoringConfigId).toBe('cfg_1');
    expect(eventUpsertArgs.update.leagueScoringConfigId).toBe('cfg_1');
  });

  it('creates a league scoring config when a league is saved without one', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      leagueScoringConfig: undefined,
      leagueScoringConfigId: undefined,
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.leagueScoringConfigs.upsert).toHaveBeenCalledTimes(1);
    const configUpsertArgs = client.leagueScoringConfigs.upsert.mock.calls[0][0];
    expect(configUpsertArgs.where.id).toEqual(expect.any(String));
    expect(configUpsertArgs.create.id).toBe(configUpsertArgs.where.id);
    expect(configUpsertArgs.create.createdAt).toBeInstanceOf(Date);
    expect(configUpsertArgs.create.updatedAt).toBeInstanceOf(Date);
    expect(configUpsertArgs.update.updatedAt).toBeInstanceOf(Date);

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create.leagueScoringConfigId).toBe(configUpsertArgs.where.id);
    expect(eventUpsertArgs.update.leagueScoringConfigId).toBe(configUpsertArgs.where.id);
  });

  it('keeps the creator as host for new organization events even when hostIds exclude them', async () => {
    const client = createMockClient();
    client.organizations.findUnique
      .mockResolvedValueOnce({
        ownerId: 'owner_1',
        hostIds: ['owner_1'],
        officialIds: [],
      })
      .mockResolvedValueOnce({ hasStripeAccount: true });

    const payload = {
      ...baseEventPayload(),
      eventType: 'EVENT',
      organizationId: 'org_1',
      hostId: 'creator_1',
      end: '2026-01-05T11:00:00.000Z',
      timeSlots: [],
    };

    await upsertEventFromPayload(payload, client as any);

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create.hostId).toBe('creator_1');
    expect(eventUpsertArgs.update.hostId).toBe('creator_1');
  });

  it('rejects overlapping rental event windows on the same field', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      eventType: 'EVENT',
      start: '2026-01-05T13:30:00.000Z',
      end: '2026-01-05T16:00:00.000Z',
      divisions: ['OPEN'],
      fields: [
        {
          $id: 'field_1',
          name: 'Court A',
          location: 'Main Gym',
          lat: 0,
          long: 0,
          divisions: ['OPEN'],
          rentalSlotIds: [],
        },
      ],
      timeSlots: [],
    };
    client.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_existing',
        eventType: 'EVENT',
        parentEvent: null,
        start: new Date('2026-01-05T14:00:00.000Z'),
        end: new Date('2026-01-05T17:00:00.000Z'),
        fieldIds: ['field_1'],
        timeSlotIds: [],
      },
    ]);
    client.fields.findMany.mockResolvedValueOnce([
      {
        id: 'field_1',
        rentalSlotIds: [],
      },
    ]);

    await expect(upsertEventFromPayload(payload, client as any)).rejects.toThrow(
      'Selected fields and time range conflict with existing reservations.',
    );
    expect(client.events.upsert).not.toHaveBeenCalled();
  });

  it('persists official staffing payload fields and event-official rows', async () => {
    const client = createMockClient();
    client.sports.findUnique.mockResolvedValue({
      officialPositionTemplates: [
        { name: 'R1', count: 1 },
        { name: 'Line Judge', count: 2 },
      ],
    });

    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        {
          id: 'event_pos_r1',
          name: 'R1',
          count: 1,
          order: 0,
        },
        {
          id: 'event_pos_line',
          name: 'Line Judge',
          count: 2,
          order: 1,
        },
      ],
      officialIds: ['official_1'],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: 'official_1',
          positionIds: ['event_pos_r1'],
          fieldIds: ['field_1'],
          isActive: true,
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.events.upsert).toHaveBeenCalledTimes(1);
    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create).toEqual(
      expect.objectContaining({
        officialSchedulingMode: 'SCHEDULE',
        officialPositions: payload.officialPositions,
        officialIds: ['official_1'],
      }),
    );
    expect(eventUpsertArgs.update).toEqual(
      expect.objectContaining({
        officialSchedulingMode: 'SCHEDULE',
        officialPositions: payload.officialPositions,
        officialIds: ['official_1'],
      }),
    );
    expect(client.eventOfficials.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event_1' },
    });
    expect(client.eventOfficials.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'event_official_1',
        eventId: 'event_1',
        userId: 'official_1',
        positionIds: ['event_pos_r1'],
        fieldIds: ['field_1'],
        isActive: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    });
  });

  it('persists event teams with the resolved event id when payload only provides $id', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      teams: [
        {
          $id: 'team_1',
          name: 'Place Holder 1',
          captainId: '',
          playerIds: [],
          division: 'OPEN',
          teamSize: 2,
        },
      ],
    };

    await upsertEventFromPayload(payload, client as any);

    expect(client.teams.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team_1' },
        create: expect.objectContaining({
          eventId: 'event_1',
          kind: 'PLACEHOLDER',
        }),
        update: expect.objectContaining({
          eventId: 'event_1',
          kind: 'PLACEHOLDER',
        }),
      }),
    );
  });

  it('persists match rules overrides and point-incident automation settings', async () => {
    const client = createMockClient();
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      matchRulesOverride: {
        segmentCount: 2,
        supportsOvertime: true,
        supportsShootout: false,
        supportedIncidentTypes: ['DISCIPLINE', 'NOTE'],
      },
      autoCreatePointMatchIncidents: true,
    };

    await upsertEventFromPayload(payload, client as any);

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create).toEqual(
      expect.objectContaining({
        matchRulesOverride: payload.matchRulesOverride,
        autoCreatePointMatchIncidents: true,
      }),
    );
    expect(eventUpsertArgs.update).toEqual(
      expect.objectContaining({
        matchRulesOverride: payload.matchRulesOverride,
        autoCreatePointMatchIncidents: true,
      }),
    );
  });

  it('preserves stored match rules when an update payload omits them', async () => {
    const client = createMockClient();
    const existingMatchRulesOverride = {
      segmentCount: 4,
      supportsOvertime: true,
      supportedIncidentTypes: ['DISCIPLINE', 'NOTE', 'ADMIN'],
    };
    client.events.findUnique.mockResolvedValueOnce({
      fieldIds: ['field_1'],
      timeSlotIds: [],
      eventType: 'LEAGUE',
      end: new Date('2026-03-05T09:00:00.000Z'),
      noFixedEndDateTime: false,
      leagueScoringConfigId: null,
      hostId: 'host_1',
      organizationId: null,
      parentEvent: null,
      officialIds: [],
      officialPositions: [],
      officialSchedulingMode: 'SCHEDULE',
      sportId: 'sport_1',
      matchRulesOverride: existingMatchRulesOverride,
      autoCreatePointMatchIncidents: true,
    });
    const payload = {
      ...baseEventPayload(),
      divisions: ['OPEN'],
      description: 'Updated details only',
    };

    await upsertEventFromPayload(payload, client as any);

    const eventUpsertArgs = client.events.upsert.mock.calls[0][0];
    expect(eventUpsertArgs.create).toEqual(
      expect.objectContaining({
        matchRulesOverride: existingMatchRulesOverride,
        autoCreatePointMatchIncidents: true,
      }),
    );
    expect(eventUpsertArgs.update).toEqual(
      expect.objectContaining({
        matchRulesOverride: existingMatchRulesOverride,
        autoCreatePointMatchIncidents: true,
      }),
    );
  });
});

describe('persistScheduledRosterTeams', () => {
  it('creates missing roster slot teams and syncs split-division teamIds', async () => {
    const divisionA = buildEventDivisionId('event_1', 'a');
    const divisionB = buildEventDivisionId('event_1', 'b');
    const scheduled = {
      eventType: 'LEAGUE',
      singleDivision: false,
      divisions: [
        { id: divisionA, kind: 'LEAGUE' },
        { id: divisionB, kind: 'LEAGUE' },
      ],
      teams: {
        slot_1: {
          id: 'slot_1',
          seed: 1,
          captainId: '',
          division: { id: divisionA },
          name: 'Place Holder 1',
          playerIds: [],
          wins: 0,
          losses: 0,
        },
        slot_2: {
          id: 'slot_2',
          seed: 2,
          captainId: '',
          division: { id: divisionB },
          name: 'Place Holder 2',
          playerIds: [],
          wins: 0,
          losses: 0,
        },
      },
    } as any;

    const client = {
      events: {
        update: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue({
          teamSizeLimit: 2,
          singleDivision: false,
        }),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          { id: divisionA, key: 'a', kind: 'LEAGUE' },
          { id: divisionB, key: 'b', kind: 'LEAGUE' },
          { id: buildEventDivisionId('event_1', 'playoff'), key: 'playoff', kind: 'PLAYOFF' },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    const rosterTeamIds = await persistScheduledRosterTeams(
      { eventId: 'event_1', scheduled },
      client as any,
    );

    expect(rosterTeamIds).toEqual(['slot_1', 'slot_2']);
    expect(client.events.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: expect.objectContaining({
        teamIds: ['slot_1', 'slot_2'],
      }),
    });
    expect(client.teams.create).toHaveBeenCalledTimes(2);
    expect(client.teams.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'slot_1',
          eventId: 'event_1',
          division: divisionA,
        }),
      }),
    );
    expect(client.teams.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'slot_2',
          eventId: 'event_1',
          division: divisionB,
        }),
      }),
    );
    expect(client.divisions.update).toHaveBeenCalledTimes(2);
    expect(client.divisions.update).toHaveBeenCalledWith({
      where: { id: divisionA },
      data: expect.objectContaining({ teamIds: ['slot_1'] }),
    });
    expect(client.divisions.update).toHaveBeenCalledWith({
      where: { id: divisionB },
      data: expect.objectContaining({ teamIds: ['slot_2'] }),
    });
  });

  it('updates existing slot teams with scheduled division during rebuild', async () => {
    const divisionA = buildEventDivisionId('event_1', 'a');
    const divisionB = buildEventDivisionId('event_1', 'b');
    const scheduled = {
      eventType: 'LEAGUE',
      singleDivision: false,
      divisions: [
        { id: divisionA, kind: 'LEAGUE' },
        { id: divisionB, kind: 'LEAGUE' },
      ],
      teams: {
        slot_1: {
          id: 'slot_1',
          captainId: '',
          division: { id: divisionA },
          name: 'Place Holder 1',
          playerIds: [],
        },
        slot_2: {
          id: 'slot_2',
          captainId: '',
          division: { id: divisionB },
          name: 'Place Holder 2',
          playerIds: [],
        },
      },
    } as any;

    const client = {
      events: {
        update: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue({
          teamSizeLimit: 2,
          singleDivision: false,
        }),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'slot_1', division: 'open' },
          { id: 'slot_2', division: divisionB },
        ]),
        create: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          { id: divisionA, key: 'a', kind: 'LEAGUE' },
          { id: divisionB, key: 'b', kind: 'LEAGUE' },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await persistScheduledRosterTeams(
      { eventId: 'event_1', scheduled },
      client as any,
    );

    expect(client.teams.create).not.toHaveBeenCalled();
    expect(client.teams.update).toHaveBeenCalledTimes(1);
    expect(client.teams.update).toHaveBeenCalledWith({
      where: { id: 'slot_1' },
      data: expect.objectContaining({
        division: divisionA,
      }),
    });
    expect(client.divisions.update).toHaveBeenCalledWith({
      where: { id: divisionA },
      data: expect.objectContaining({ teamIds: ['slot_1'] }),
    });
    expect(client.divisions.update).toHaveBeenCalledWith({
      where: { id: divisionB },
      data: expect.objectContaining({ teamIds: ['slot_2'] }),
    });
  });
});
