/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const timeSlotsMock = {
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const fieldsMock = {
  findMany: jest.fn(),
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const matchesMock = {
  deleteMany: jest.fn(),
};

const divisionsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
  upsert: jest.fn(),
};

const leagueScoringConfigsMock = {
  upsert: jest.fn(),
};

const sportsMock = {
  findUnique: jest.fn(),
};

const eventOfficialsMock = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
  create: jest.fn(),
};

const organizationsMock = {
  findUnique: jest.fn(),
};

const staffMembersMock = {
  findMany: jest.fn(),
};

const invitesMock = {
  findMany: jest.fn(),
};

const executeRawMock = jest.fn();

const prismaMock = {
  events: eventsMock,
  timeSlots: timeSlotsMock,
  divisions: divisionsMock,
  sports: sportsMock,
  eventOfficials: eventOfficialsMock,
  organizations: organizationsMock,
  staffMembers: staffMembersMock,
  invites: invitesMock,
  $transaction: jest.fn(async (callback: any) => callback({
    events: eventsMock,
    timeSlots: timeSlotsMock,
    fields: fieldsMock,
    matches: matchesMock,
    divisions: divisionsMock,
    sports: sportsMock,
    eventOfficials: eventOfficialsMock,
    leagueScoringConfigs: leagueScoringConfigsMock,
    organizations: organizationsMock,
    staffMembers: staffMembersMock,
    invites: invitesMock,
    $executeRaw: executeRawMock,
  })),
};

const requireSessionMock = jest.fn();
const scheduleEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/scheduler/scheduleEvent', () => ({
  scheduleEvent: (...args: any[]) => scheduleEventMock(...args),
  ScheduleError: class ScheduleError extends Error {},
}));

import { PATCH as eventPatch } from '@/app/api/events/[eventId]/route';

const patchRequest = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event PATCH route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      events: eventsMock,
      timeSlots: timeSlotsMock,
      fields: fieldsMock,
      matches: matchesMock,
      divisions: divisionsMock,
      sports: sportsMock,
      eventOfficials: eventOfficialsMock,
      leagueScoringConfigs: leagueScoringConfigsMock,
      organizations: organizationsMock,
      staffMembers: staffMembersMock,
      invites: invitesMock,
      $executeRaw: executeRawMock,
    }));
    fieldsMock.findMany.mockResolvedValue([]);
    divisionsMock.findMany.mockResolvedValue([]);
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.upsert.mockResolvedValue({});
    organizationsMock.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      hostIds: ['host_1'],
      officialIds: ['official_1'],
    });
    staffMembersMock.findMany.mockResolvedValue([]);
    invitesMock.findMany.mockResolvedValue([]);
    sportsMock.findUnique.mockResolvedValue(null);
    eventOfficialsMock.findMany.mockResolvedValue([]);
    eventOfficialsMock.deleteMany.mockResolvedValue({ count: 0 });
    eventOfficialsMock.create.mockResolvedValue({});
  });

  it('rejects unknown patch keys instead of silently ignoring them', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' })
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          playerIds: ['user_1'],
          players: [{ $id: 'user_2' }],
          organization: 'org_1',
          sport: { $id: 'sport_1', name: 'Volleyball' },
          state: 'PUBLISHED',
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('Unknown event patch fields.');
    expect(payload.unknownKeys).toEqual(expect.arrayContaining([
      'playerIds',
      'players',
      'organization',
      'sport',
    ]));
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('updates userIds when provided (preferred field name)', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' })
      .mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    prismaMock.events.update.mockResolvedValueOnce({ id: 'event_1', hostId: 'host_1' });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          userIds: ['user_1'],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(1);

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'event_1' });
    expect(updateArg.data.userIds).toEqual(['user_1']);
  });

  it('restricts org event host and official assignments to organization hosts/officials', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    organizationsMock.findUnique.mockResolvedValueOnce({
      ownerId: 'owner_1',
      hostIds: ['host_1', 'host_2'],
      officialIds: ['official_org_1'],
    });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        organizationId: 'org_1',
        assistantHostIds: ['host_2'],
        officialIds: ['official_org_1'],
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'owner_1',
        organizationId: 'org_1',
        assistantHostIds: ['host_2'],
        officialIds: ['official_org_1'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'owner_1',
      organizationId: 'org_1',
      assistantHostIds: ['host_2'],
      officialIds: ['official_org_1'],
    });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          hostId: 'outside_host',
          assistantHostIds: ['host_2', 'outside_assistant'],
          officialIds: ['official_org_1', 'outside_official'],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.data.hostId).toBe('owner_1');
    expect(updateArg.data.assistantHostIds).toEqual(['host_2']);
    expect(updateArg.data.officialIds).toEqual(['official_org_1']);
  });

  it('syncs division field mappings when divisionFieldIds are provided', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['open'],
        fieldIds: ['field_1'],
        eventType: 'EVENT',
        sportId: 'sport_1',
        organizationId: 'org_1',
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['advanced'],
        fieldIds: ['field_1', 'field_2'],
        eventType: 'EVENT',
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      divisions: ['advanced'],
      fieldIds: ['field_1', 'field_2'],
      eventType: 'EVENT',
      sportId: 'sport_1',
      organizationId: 'org_1',
      start: new Date('2026-01-01T00:00:00.000Z'),
    });
    divisionsMock.findMany
      .mockResolvedValueOnce([]) // currentDivisionFieldMap lookup
      .mockResolvedValueOnce([]) // existing divisions lookup in syncEventDivisions
      .mockResolvedValueOnce([]) // playoff division ids lookup (kind=PLAYOFF)
      .mockResolvedValueOnce([{ id: 'event_1__division__advanced', key: 'advanced', fieldIds: ['field_2'] }]) // response divisionFieldIds
      .mockResolvedValueOnce([{ id: 'event_1__division__advanced', key: 'advanced', fieldIds: ['field_2'] }]); // response divisionDetails
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.upsert.mockResolvedValue({});

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          divisions: ['Advanced'],
          fieldIds: ['field_1', 'field_2'],
          divisionFieldIds: { advanced: ['field_2'] },
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__division__advanced' },
      }),
    );

    const json = await res.json();
    expect(json.divisionFieldIds).toEqual({ advanced: ['field_2'] });
    expect(json.divisions).toEqual(['advanced']);
  });

  it('persists division-level payment-plan fields from divisionDetails payload', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['event_1__division__open'],
        fieldIds: ['field_1'],
        eventType: 'EVENT',
        sportId: 'sport_1',
        organizationId: null,
        start: new Date('2026-01-01T00:00:00.000Z'),
        allowPaymentPlans: true,
        installmentCount: 3,
        installmentDueDates: [
          new Date('2026-01-08T09:00:00.000Z'),
          new Date('2026-01-15T09:00:00.000Z'),
          new Date('2026-01-22T09:00:00.000Z'),
        ],
        installmentAmounts: [1200, 800, 500],
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['event_1__division__open'],
        fieldIds: ['field_1'],
        eventType: 'EVENT',
        start: new Date('2026-01-01T00:00:00.000Z'),
        allowPaymentPlans: true,
        installmentCount: 3,
        installmentDueDates: [
          new Date('2026-01-08T09:00:00.000Z'),
          new Date('2026-01-15T09:00:00.000Z'),
          new Date('2026-01-22T09:00:00.000Z'),
        ],
        installmentAmounts: [1200, 800, 500],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      divisions: ['event_1__division__open'],
      fieldIds: ['field_1'],
      eventType: 'EVENT',
      start: new Date('2026-01-01T00:00:00.000Z'),
      allowPaymentPlans: true,
      installmentCount: 3,
      installmentDueDates: [
        new Date('2026-01-08T09:00:00.000Z'),
        new Date('2026-01-15T09:00:00.000Z'),
        new Date('2026-01-22T09:00:00.000Z'),
      ],
      installmentAmounts: [1200, 800, 500],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.upsert.mockResolvedValue({});

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          divisions: ['event_1__division__open'],
          divisionDetails: [
            {
              id: 'event_1__division__open',
              key: 'open',
              name: 'Open',
              divisionTypeId: 'open',
              divisionTypeName: 'Open',
              ratingType: 'SKILL',
              gender: 'C',
              price: 2500,
              maxParticipants: 12,
              allowPaymentPlans: true,
              installmentCount: 2,
              installmentAmounts: [1500, 1000],
              installmentDueDates: ['2026-01-09T09:00:00.000Z', '2026-01-16T09:00:00.000Z'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__division__open' },
        create: expect.objectContaining({
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: [
            new Date('2026-01-09T09:00:00.000Z'),
            new Date('2026-01-16T09:00:00.000Z'),
          ],
        }),
        update: expect.objectContaining({
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

  it('preserves existing division teamIds when divisionDetails omits teamIds', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['event_1__division__open'],
        fieldIds: ['field_1'],
        eventType: 'LEAGUE',
        sportId: 'sport_1',
        organizationId: null,
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-02-01T00:00:00.000Z'),
        singleDivision: false,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        divisions: ['event_1__division__open'],
        fieldIds: ['field_1'],
        eventType: 'LEAGUE',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-02-01T00:00:00.000Z'),
        singleDivision: false,
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      divisions: ['event_1__division__open'],
      fieldIds: ['field_1'],
      eventType: 'LEAGUE',
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-02-01T00:00:00.000Z'),
      singleDivision: false,
    });
    divisionsMock.findMany
      .mockResolvedValueOnce([
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          fieldIds: ['field_1'],
          teamIds: ['team_1', 'team_2'],
        },
      ]) // currentDivisionFieldMap lookup
      .mockResolvedValueOnce([
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          fieldIds: ['field_1'],
          teamIds: ['team_1', 'team_2'],
        },
      ]) // existing divisions lookup in syncEventDivisions
      .mockResolvedValueOnce([]) // playoff division ids lookup (kind=PLAYOFF)
      .mockResolvedValueOnce([
        {
          id: 'event_1__division__open',
          key: 'open',
          fieldIds: ['field_1'],
          teamIds: ['team_1', 'team_2'],
        },
      ]) // response divisionFieldIds
      .mockResolvedValueOnce([
        {
          id: 'event_1__division__open',
          key: 'open',
          name: 'Open',
          kind: 'LEAGUE',
          fieldIds: ['field_1'],
          teamIds: ['team_1', 'team_2'],
        },
      ]); // response divisionDetails
    divisionsMock.deleteMany.mockResolvedValue({ count: 0 });
    divisionsMock.upsert.mockResolvedValue({});

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          divisions: ['event_1__division__open'],
          divisionDetails: [
            {
              id: 'event_1__division__open',
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
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(divisionsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__division__open' },
        create: expect.objectContaining({
          teamIds: ['team_1', 'team_2'],
        }),
        update: expect.objectContaining({
          teamIds: ['team_1', 'team_2'],
        }),
      }),
    );
  });

  it('forces slot divisions to all selected event divisions when singleDivision is enabled', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner', 'advanced'],
        fieldIds: ['field_1'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        timeSlotIds: ['slot_old'],
        singleDivision: false,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner', 'advanced'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'EVENT',
      divisions: ['beginner', 'advanced'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 0 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          singleDivision: true,
          divisions: ['beginner', 'advanced'],
          timeSlots: [
            {
              $id: 'slot_1',
              dayOfWeek: 1,
              daysOfWeek: [1],
              scheduledFieldId: 'field_1',
              startTimeMinutes: 540,
              endTimeMinutes: 600,
              divisions: ['beginner'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(timeSlotsMock.upsert).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalled();
    expect(executeRawMock.mock.calls[0]?.[1]).toEqual(['beginner', 'advanced']);
  });

  it('persists multi-day + multi-field slots canonically and removes local fields that were unassigned', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner'],
        fieldIds: ['field_old', 'field_keep'],
        timeSlotIds: ['slot_legacy'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        singleDivision: false,
        organizationId: null,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'EVENT',
        divisions: ['beginner'],
        fieldIds: ['field_keep', 'field_new'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'EVENT',
      divisions: ['beginner'],
      fieldIds: ['field_keep', 'field_new'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 1 });
    fieldsMock.upsert.mockResolvedValue({});
    fieldsMock.deleteMany.mockResolvedValue({ count: 1 });
    matchesMock.deleteMany.mockResolvedValue({ count: 2 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          fields: [
            { $id: 'field_keep', fieldNumber: 1, name: 'Field Keep' },
            { $id: 'field_new', fieldNumber: 2, name: 'Field New' },
          ],
          timeSlots: [
            {
              $id: 'slot_multi',
              daysOfWeek: [1, 3],
              startTimeMinutes: 540,
              endTimeMinutes: 600,
              divisions: ['beginner'],
              scheduledFieldIds: ['field_keep', 'field_new'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(timeSlotsMock.upsert).toHaveBeenCalledTimes(1);
    expect(
      timeSlotsMock.upsert.mock.calls.map((call) => call[0].where.id).sort(),
    ).toEqual(['slot_multi']);
    expect(timeSlotsMock.upsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          dayOfWeek: 1,
          daysOfWeek: [1, 3],
          scheduledFieldId: 'field_keep',
          scheduledFieldIds: ['field_keep', 'field_new'],
        }),
      }),
    );
    expect(fieldsMock.upsert).toHaveBeenCalledTimes(2);
    expect(matchesMock.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        fieldId: { in: ['field_old'] },
      },
    });
    expect(fieldsMock.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['field_old'] },
        organizationId: null,
      },
    });

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.data.fieldIds.sort()).toEqual(['field_keep', 'field_new']);
  });

  it('preserves existing field organization ownership when incoming nested fields omit organizationId', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        divisions: ['open'],
        fieldIds: ['field_owned'],
        timeSlotIds: [],
        organizationId: null,
        noFixedEndDateTime: true,
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        divisions: ['open'],
        fieldIds: ['field_owned'],
        organizationId: null,
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'LEAGUE',
      divisions: ['open'],
      fieldIds: ['field_owned'],
      organizationId: null,
    });
    divisionsMock.findMany.mockResolvedValue([]);
    fieldsMock.findMany.mockResolvedValueOnce([
      { id: 'field_owned', organizationId: 'org_facility_1' },
    ]);
    fieldsMock.upsert.mockResolvedValue({});

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          fieldIds: ['field_owned'],
          fields: [
            { $id: 'field_owned', fieldNumber: 1, name: 'Facility Court', organizationId: null },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(fieldsMock.upsert).toHaveBeenCalledTimes(1);
    expect(fieldsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'field_owned' },
        update: expect.objectContaining({
          organizationId: 'org_facility_1',
        }),
      }),
    );
  });

  it('does not auto-reschedule leagues on regular PATCH saves', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        noFixedEndDateTime: true,
        divisions: ['open'],
        fieldIds: ['field_1'],
        timeSlotIds: ['slot_1'],
        start: new Date('2026-01-01T00:00:00.000Z'),
        singleDivision: true,
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        noFixedEndDateTime: true,
        divisions: ['open'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'LEAGUE',
      noFixedEndDateTime: true,
      divisions: ['open'],
    });
    divisionsMock.findMany.mockResolvedValue([]);
    timeSlotsMock.upsert.mockResolvedValue({});
    timeSlotsMock.deleteMany.mockResolvedValue({ count: 0 });

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          eventType: 'LEAGUE',
          timeSlots: [
            {
              $id: 'slot_1',
              dayOfWeek: 5,
              daysOfWeek: [5],
              scheduledFieldIds: ['field_1', 'field_2'],
              startTimeMinutes: 1020,
              endTimeMinutes: 1260,
              repeating: true,
              divisions: ['open'],
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(scheduleEventMock).not.toHaveBeenCalled();
  });

  it('rejects fixed schedulable windows when persisted end equals start', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    const equalBoundary = new Date('2026-03-01T10:00:00.000Z');
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'TOURNAMENT',
      noFixedEndDateTime: false,
      start: equalBoundary,
      end: equalBoundary,
      divisions: ['open'],
      fieldIds: ['field_1'],
      timeSlotIds: [],
      singleDivision: false,
    });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          name: 'Updated Tournament Name',
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(400);
    expect(prismaMock.events.update).not.toHaveBeenCalled();
    await expect(res.text()).resolves.toBe(
      'End date/time must be after start date/time when no fixed end date/time is disabled.',
    );
  });

  it('persists league scoring config values and links the event config id', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        leagueScoringConfigId: null,
        noFixedEndDateTime: true,
        divisions: ['open'],
        fieldIds: ['field_1'],
        timeSlotIds: [],
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        leagueScoringConfigId: 'cfg_new',
        divisions: ['open'],
      });
    leagueScoringConfigsMock.upsert.mockImplementation(({ create }: any) => Promise.resolve(create));
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'LEAGUE',
      leagueScoringConfigId: 'cfg_new',
      divisions: ['open'],
    });
    divisionsMock.findMany.mockResolvedValue([]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          leagueScoringConfig: {
            id: 'cfg_new',
            pointsForWin: 3,
            pointsForDraw: 1,
            pointsForLoss: 0,
          },
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(leagueScoringConfigsMock.upsert).toHaveBeenCalledTimes(1);
    expect(leagueScoringConfigsMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cfg_new' },
        update: expect.objectContaining({
          pointsForWin: 3,
          pointsForDraw: 1,
          pointsForLoss: 0,
        }),
      }),
    );

    const updateArg = prismaMock.events.update.mock.calls[0][0];
    expect(updateArg.data.leagueScoringConfigId).toBe('cfg_new');
    expect(updateArg.data.leagueScoringConfig).toBeUndefined();
  });

  it('creates a league scoring config id when saving a league missing config data', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    const randomUUIDSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('cfg_auto');
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        leagueScoringConfigId: null,
        noFixedEndDateTime: true,
        divisions: ['open'],
        fieldIds: ['field_1'],
        timeSlotIds: [],
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        eventType: 'LEAGUE',
        leagueScoringConfigId: 'cfg_auto',
        divisions: ['open'],
      });
    leagueScoringConfigsMock.upsert.mockImplementation(({ create }: any) => Promise.resolve(create));
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      eventType: 'LEAGUE',
      leagueScoringConfigId: 'cfg_auto',
      divisions: ['open'],
    });
    divisionsMock.findMany.mockResolvedValue([]);

    try {
      const res = await eventPatch(
        patchRequest('http://localhost/api/events/event_1', {
          event: {
            name: 'Renamed League',
          },
        }),
        { params: Promise.resolve({ eventId: 'event_1' }) },
      );

      expect(res.status).toBe(200);
      expect(leagueScoringConfigsMock.upsert).toHaveBeenCalledTimes(1);
      expect(leagueScoringConfigsMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cfg_auto' },
          create: expect.objectContaining({ id: 'cfg_auto' }),
          update: expect.objectContaining({
            updatedAt: expect.any(Date),
          }),
        }),
      );

      const updateArg = prismaMock.events.update.mock.calls[0][0];
      expect(updateArg.data.leagueScoringConfigId).toBe('cfg_auto');
    } finally {
      randomUUIDSpy.mockRestore();
    }
  });

  it('persists address via SQL fallback when Prisma update input rejects address and returns address in response', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-01-01T01:00:00.000Z'),
        divisions: [],
        fieldIds: [],
        eventType: 'EVENT',
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-01-01T01:00:00.000Z'),
        divisions: [],
        fieldIds: [],
        eventType: 'EVENT',
      });
    prismaMock.events.update
      .mockRejectedValueOnce(new Error('Unknown argument `address` for type EventsUpdateInput.'))
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-01-01T01:00:00.000Z'),
        divisions: [],
        fieldIds: [],
        eventType: 'EVENT',
      });
    divisionsMock.findMany.mockResolvedValue([]);

    const persistedAddress = '12001 Main St, Bellevue, WA 98005, USA';
    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          address: persistedAddress,
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.events.update.mock.calls[1][0].data.address).toBeUndefined();
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    const rawQueryCall = executeRawMock.mock.calls[0];
    expect(String(rawQueryCall[0])).toContain('UPDATE \"Events\"');
    expect(rawQueryCall[1]).toBe(persistedAddress);
    expect(rawQueryCall[3]).toBe('event_1');

    const json = await res.json();
    expect(json.address).toBe(persistedAddress);
  });

  it('persists explicit official staffing fields on PATCH and returns normalized staffing response', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findUnique
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        sportId: 'sport_1',
        officialSchedulingMode: 'STAFFING',
        officialPositions: null,
        officialIds: ['official_legacy'],
        fieldIds: ['field_1'],
        start: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'event_1',
        hostId: 'host_1',
        sportId: 'sport_1',
        officialSchedulingMode: 'SCHEDULE',
        officialPositions: [
          { id: 'event_pos_r1', name: 'R1', count: 1, order: 0 },
          { id: 'event_pos_line', name: 'Line Judge', count: 2, order: 1 },
        ],
        officialIds: ['official_1'],
        fieldIds: ['field_1'],
      });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      sportId: 'sport_1',
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'event_pos_r1', name: 'R1', count: 1, order: 0 },
        { id: 'event_pos_line', name: 'Line Judge', count: 2, order: 1 },
      ],
      officialIds: ['official_1'],
      fieldIds: ['field_1'],
    });
    sportsMock.findUnique.mockResolvedValue({
      officialPositionTemplates: [
        { name: 'R1', count: 1 },
        { name: 'Line Judge', count: 2 },
      ],
    });
    eventOfficialsMock.findMany.mockResolvedValueOnce([
      {
        id: 'event_official_1',
        userId: 'official_1',
        positionIds: ['event_pos_r1'],
        fieldIds: ['field_1'],
        isActive: true,
      },
    ]);

    const res = await eventPatch(
      patchRequest('http://localhost/api/events/event_1', {
        event: {
          officialSchedulingMode: 'SCHEDULE',
          officialPositions: [
            { id: 'event_pos_r1', name: 'R1', count: 1, order: 0 },
            { id: 'event_pos_line', name: 'Line Judge', count: 2, order: 1 },
          ],
          eventOfficials: [
            {
              id: 'event_official_1',
              userId: 'official_1',
              positionIds: ['event_pos_r1'],
              fieldIds: ['field_1'],
              isActive: true,
            },
          ],
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officialSchedulingMode: 'SCHEDULE',
          officialPositions: [
            { id: 'event_pos_r1', name: 'R1', count: 1, order: 0 },
            { id: 'event_pos_line', name: 'Line Judge', count: 2, order: 1 },
          ],
        }),
      }),
    );
    expect(eventOfficialsMock.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event_1' } });
    expect(eventOfficialsMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event_official_1',
          eventId: 'event_1',
          userId: 'official_1',
          positionIds: ['event_pos_r1'],
          fieldIds: ['field_1'],
          isActive: true,
        }),
      }),
    );

    const json = await res.json();
    expect(json.officialSchedulingMode).toBe('SCHEDULE');
    expect(json.officialPositions).toEqual([
      { id: 'event_pos_r1', name: 'R1', count: 1, order: 0 },
      { id: 'event_pos_line', name: 'Line Judge', count: 2, order: 1 },
    ]);
    expect(json.eventOfficials).toHaveLength(1);
    expect(json.eventOfficials[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        userId: 'official_1',
        positionIds: ['event_pos_r1', 'event_pos_line'],
        fieldIds: [],
        isActive: true,
      }),
    );
    expect(json.officialIds).toEqual(['official_1']);
  });
});

