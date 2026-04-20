/** @jest-environment node */

const upsertEventRegistrationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/events/eventRegistrations', () => ({
  upsertEventRegistration: (...args: any[]) => upsertEventRegistrationMock(...args),
}));

import {
  applyCanonicalTeamRegistrationMetadata,
  claimOrCreateEventTeamSnapshot,
  normalizeJerseyNumber,
} from '@/server/teams/teamMembership';

describe('normalizeJerseyNumber', () => {
  it('returns digits or null for blank values', () => {
    expect(normalizeJerseyNumber('17')).toBe('17');
    expect(normalizeJerseyNumber(' 17 ')).toBe('17');
    expect(normalizeJerseyNumber('A17B')).toBe('17');
    expect(normalizeJerseyNumber('')).toBeNull();
    expect(normalizeJerseyNumber('ABC')).toBeNull();
  });
});

describe('applyCanonicalTeamRegistrationMetadata', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('updates optional jersey numbers and positions for matching team registrations', async () => {
    const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const now = new Date('2026-04-20T12:00:00.000Z');

    await applyCanonicalTeamRegistrationMetadata({
      client: {
        teamRegistrations: {
          updateMany: updateManyMock,
        },
      },
      teamId: 'team_1',
      now,
      playerRegistrations: [
        {
          userId: ' user_1 ',
          jerseyNumber: ' 7 ',
          position: ' Setter ',
        },
        {
          userId: 'user_2',
          jerseyNumber: '',
        },
      ],
    });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { teamId: 'team_1', userId: 'user_1' },
      data: {
        jerseyNumber: '7',
        position: 'Setter',
        updatedAt: now,
      },
    });
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { teamId: 'team_1', userId: 'user_2' },
      data: {
        jerseyNumber: null,
        updatedAt: now,
      },
    });
  });
});

describe('claimOrCreateEventTeamSnapshot', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    upsertEventRegistrationMock.mockResolvedValue({});
  });

  it('waits for a newly created event team snapshot before updating references', async () => {
    const storedTeams = new Map<string, Record<string, unknown>>();
    const createMock = jest.fn(({ data }: { data: Record<string, unknown> }) => (
      new Promise<Record<string, unknown>>((resolve) => {
        setTimeout(() => {
          storedTeams.set(String(data.id), { ...data });
          resolve({ ...data });
        }, 0);
      })
    ));
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = storedTeams.get(where.id);
      if (!existing) {
        throw new Error(`Event team ${where.id} was updated before it was created.`);
      }
      const next = { ...existing, ...data };
      storedTeams.set(where.id, next);
      return Promise.resolve(next);
    });

    const tx = {
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
        create: createMock,
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventTeamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const randomUuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('event_team_1');

    await expect(claimOrCreateEventTeamSnapshot({
      tx,
      eventId: 'event_1',
      canonicalTeamId: 'team_1',
      createdBy: 'user_1',
      canonicalTeam: {
        id: 'team_1',
        name: 'Canonical Team',
        division: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        wins: null,
        losses: null,
        teamSize: 2,
        profileImageId: null,
        sport: 'volleyball',
        captainId: '',
        managerId: 'user_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
        playerRegistrations: [],
        staffAssignments: [],
      },
    })).resolves.toEqual(expect.objectContaining({
      id: 'event_team_1',
    }));

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_1' },
      data: expect.objectContaining({
        playerRegistrationIds: [],
        staffAssignmentIds: [],
      }),
    }));

    randomUuidSpy.mockRestore();
  });

  it('reuses the active registered event team when refreshing a team without a placeholder slot', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([]);
      }
      if (where.kind === 'REGISTERED' && where.parentTeamId === 'team_1') {
        return Promise.resolve([
          {
            id: 'event_team_stale',
            eventId: 'event_1',
            kind: 'REGISTERED',
            parentTeamId: 'team_1',
            division: 'div_a',
            divisionTypeId: 'open',
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
            updatedAt: new Date('2026-01-04T00:00:00.000Z'),
          },
          {
            id: 'event_team_existing',
            eventId: 'event_1',
            kind: 'REGISTERED',
            parentTeamId: 'team_1',
            division: 'div_a',
            divisionTypeId: 'open',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const tx = {
      teams: {
        findMany: findManyMock,
        update: updateMock,
        create: jest.fn(),
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'event_team_existing',
            eventTeamId: 'event_team_existing',
          },
        ]),
      },
      eventTeamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(claimOrCreateEventTeamSnapshot({
      tx,
      eventId: 'event_1',
      canonicalTeamId: 'team_1',
      createdBy: 'user_1',
      canonicalTeam: {
        id: 'team_1',
        name: 'Canonical Team',
        division: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        wins: null,
        losses: null,
        teamSize: 2,
        profileImageId: null,
        sport: 'volleyball',
        captainId: '',
        managerId: 'user_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
        playerRegistrations: [],
        staffAssignments: [],
      },
    })).resolves.toEqual(expect.objectContaining({
      id: 'event_team_existing',
    }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_existing' },
      data: expect.objectContaining({
        name: 'Canonical Team',
      }),
    }));
    expect(tx.teams.create).not.toHaveBeenCalled();
  });
});
