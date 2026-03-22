/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { loadEventWithRelations } from '@/server/repositories/events';

type LoadClient = {
  events: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  divisions: {
    findMany: jest.Mock;
  };
  fields: {
    findMany: jest.Mock;
  };
  teams: {
    findMany: jest.Mock;
  };
  timeSlots: {
    findMany: jest.Mock;
  };
  userData: {
    findMany: jest.Mock;
  };
  matches: {
    findMany: jest.Mock;
  };
  leagueScoringConfigs: {
    findUnique: jest.Mock;
  };
};

const baseEventRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'event_sched',
  name: 'Scheduling Event',
  start: new Date('2026-03-01T10:00:00.000Z'),
  end: new Date('2026-03-01T12:00:00.000Z'),
  eventType: 'TOURNAMENT',
  state: 'PUBLISHED',
  divisions: ['open'],
  fieldIds: ['field_1'],
  teamIds: [],
  timeSlotIds: [],
  officialIds: [],
  waitListIds: [],
  freeAgentIds: [],
  requiredTemplateIds: [],
  organizationId: null,
  sportId: null,
  teamSignup: true,
  doubleElimination: false,
  usesSets: false,
  setDurationMinutes: 0,
  matchDurationMinutes: 60,
  restTimeMinutes: 0,
  ...overrides,
});

const createClient = (eventOverrides: Record<string, unknown> = {}): LoadClient => {
  const eventRow = baseEventRow(eventOverrides);
  return {
    events: {
      findUnique: jest.fn().mockResolvedValue(eventRow),
      findMany: jest.fn().mockResolvedValue([]),
    },
    divisions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    fields: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'field_1',
          fieldNumber: 1,
          organizationId: null,
          divisions: ['open'],
          name: 'Court A',
          createdAt: null,
          updatedAt: null,
        },
      ]),
    },
    teams: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    matches: {
      findMany: jest.fn().mockImplementation((args?: Record<string, any>) => {
        if (args?.where?.eventId === 'event_sched') {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    },
    leagueScoringConfigs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
};

describe('loadEventWithRelations field conflict hydration', () => {
  it('hydrates field blocking windows from external regular events and matches', async () => {
    const client = createClient();

    client.matches.findMany.mockImplementation((args?: Record<string, any>) => {
      if (args?.where?.eventId === 'event_sched') {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: 'match_external_1',
          eventId: 'event_other_tournament',
          fieldId: 'field_1',
          start: new Date('2026-03-01T10:30:00.000Z'),
          end: new Date('2026-03-01T11:15:00.000Z'),
        },
      ]);
    });

    client.events.findMany.mockResolvedValue([
      {
        id: 'event_regular_1',
        eventType: 'EVENT',
        start: new Date('2026-03-01T11:20:00.000Z'),
        end: new Date('2026-03-01T11:50:00.000Z'),
        fieldIds: ['field_1'],
      },
      {
        id: 'event_other_league',
        eventType: 'LEAGUE',
        start: new Date('2026-03-01T10:20:00.000Z'),
        end: new Date('2026-03-01T10:45:00.000Z'),
        fieldIds: ['field_1'],
      },
    ]);

    const loaded = await loadEventWithRelations('event_sched', client as any);
    const field = loaded.fields.field_1;

    expect(field).toBeDefined();
    expect(field.events.map((event) => event.id).sort()).toEqual([
      '__field_event_block__event_regular_1__field_1',
      '__field_match_block__match_external_1',
    ]);
    expect(field.events.map((event) => event.start.toISOString())).toEqual([
      '2026-03-01T10:30:00.000Z',
      '2026-03-01T11:20:00.000Z',
    ]);
    expect(field.events.map((event) => event.end.toISOString())).toEqual([
      '2026-03-01T11:15:00.000Z',
      '2026-03-01T11:50:00.000Z',
    ]);
  });

  it('queries external conflicts using open-ended lookahead when noFixedEndDateTime is enabled', async () => {
    const start = new Date('2026-03-01T10:00:00.000Z');
    const end = new Date('2026-03-01T10:15:00.000Z');
    const client = createClient({
      start,
      end,
      noFixedEndDateTime: true,
    });

    await loadEventWithRelations('event_sched', client as any);

    expect(client.matches.findMany).toHaveBeenCalledTimes(2);
    expect(client.events.findMany).toHaveBeenCalledTimes(1);

    const matchConflictWhere = client.matches.findMany.mock.calls[1][0].where;
    const eventConflictWhere = client.events.findMany.mock.calls[0][0].where;
    const expectedWindowEnd = new Date(end.getTime() + 52 * 7 * 24 * 60 * 60 * 1000);

    expect(matchConflictWhere.start.lt.toISOString()).toBe(expectedWindowEnd.toISOString());
    expect(matchConflictWhere.end.gt.toISOString()).toBe(start.toISOString());
    expect(eventConflictWhere.start.lt.toISOString()).toBe(expectedWindowEnd.toISOString());
    expect(eventConflictWhere.end.gt.toISOString()).toBe(start.toISOString());
  });
});
