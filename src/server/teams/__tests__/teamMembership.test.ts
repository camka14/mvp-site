/** @jest-environment node */

const upsertEventRegistrationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/events/eventRegistrations', () => ({
  upsertEventRegistration: (...args: any[]) => upsertEventRegistrationMock(...args),
}));

import {
  applyCanonicalTeamRegistrationMetadata,
  claimOrCreateEventTeamSnapshot,
  listTeamsByIds,
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

describe('listTeamsByIds', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('prefers canonical teams over event-team snapshots when the same id exists in both tables', async () => {
    const canonicalFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'team_1',
        name: 'Canonical Team',
        division: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        wins: null,
        losses: null,
        teamSize: 6,
        profileImageId: null,
        sport: 'Indoor Volleyball',
        organizationId: null,
        createdBy: 'user_1',
        openRegistration: true,
        registrationPriceCents: 2500,
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T01:00:00.000Z'),
      },
    ]);
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'team_1__player_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        isCaptain: true,
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T01:00:00.000Z'),
      },
    ]);
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'team_1__MANAGER__manager_1',
        teamId: 'team_1',
        userId: 'manager_1',
        role: 'MANAGER',
        status: 'ACTIVE',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T01:00:00.000Z'),
      },
    ]);
    const eventTeamsFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'event_team_1',
        name: 'Event Snapshot',
        eventId: 'event_1',
        kind: 'REGISTERED',
        playerIds: ['player_2'],
        playerRegistrationIds: [],
        division: 'Intermediate',
        divisionTypeId: 'intermediate',
        divisionTypeName: 'Intermediate',
        wins: 0,
        losses: 0,
        captainId: 'player_2',
        managerId: 'manager_2',
        headCoachId: null,
        coachIds: [],
        staffAssignmentIds: [],
        parentTeamId: 'team_2',
        pending: [],
        teamSize: 2,
        profileImageId: null,
        sport: 'Beach Volleyball',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T01:00:00.000Z'),
      },
    ]);

    const teams = await listTeamsByIds(['team_1', 'event_team_1'], {
      canonicalTeams: {
        findMany: canonicalFindManyMock,
      },
      teamRegistrations: {
        findMany: teamRegistrationsFindManyMock,
      },
      teamStaffAssignments: {
        findMany: teamStaffAssignmentsFindManyMock,
      },
      teams: {
        findMany: eventTeamsFindManyMock,
      },
    });

    expect(teams).toHaveLength(2);
    expect(teams[0]).toMatchObject({
      id: 'team_1',
      $id: 'team_1',
      name: 'Canonical Team',
      playerIds: ['player_1'],
      captainId: 'player_1',
      managerId: 'manager_1',
      openRegistration: true,
      registrationPriceCents: 2500,
    });
    expect(teams[1]).toMatchObject({
      id: 'event_team_1',
      $id: 'event_team_1',
      name: 'Event Snapshot',
      parentTeamId: 'team_2',
    });

    expect(canonicalFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['team_1', 'event_team_1'] } },
    });
    expect(teamRegistrationsFindManyMock).toHaveBeenCalledWith({
      where: { teamId: { in: ['team_1'] } },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
    expect(teamStaffAssignmentsFindManyMock).toHaveBeenCalledWith({
      where: { teamId: { in: ['team_1'] } },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
    expect(eventTeamsFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['event_team_1'] } },
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
