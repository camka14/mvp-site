/** @jest-environment node */

const upsertEventRegistrationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/events/eventRegistrations', () => ({
  upsertEventRegistration: (...args: any[]) => upsertEventRegistrationMock(...args),
}));

import {
  applyCanonicalTeamRegistrationMetadata,
  claimOrCreateEventTeamSnapshot,
  listCanonicalTeamsForUser,
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

describe('listCanonicalTeamsForUser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('passes query and open-registration filters to canonical team discovery', async () => {
    const teamRow = {
      id: 'team_open',
      name: 'Open Aces',
      division: 'Open',
      divisionTypeId: 'open',
      wins: null,
      losses: null,
      teamSize: 6,
      profileImageId: null,
      sport: 'Volleyball',
      organizationId: 'org_1',
      createdBy: 'user_1',
      openRegistration: true,
      registrationPriceCents: 2500,
      requiredTemplateIds: [],
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T01:00:00.000Z'),
    };
    const canonicalFindManyMock = jest.fn().mockResolvedValue([{ id: 'team_open' }]);
    const canonicalFindUniqueMock = jest.fn().mockResolvedValue(teamRow);
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([]);

    const teams = await listCanonicalTeamsForUser({
      query: ' Aces ',
      openRegistrationOnly: true,
      limit: 25,
    }, {
      canonicalTeams: {
        findMany: canonicalFindManyMock,
        findUnique: canonicalFindUniqueMock,
      },
      teamRegistrations: {
        findMany: teamRegistrationsFindManyMock,
      },
      teamStaffAssignments: {
        findMany: teamStaffAssignmentsFindManyMock,
      },
    });

    expect(canonicalFindManyMock).toHaveBeenCalledWith({
      where: {
        openRegistration: true,
        OR: [
          { name: { contains: 'aces', mode: 'insensitive' } },
          { sport: { contains: 'aces', mode: 'insensitive' } },
          { division: { contains: 'aces', mode: 'insensitive' } },
        ],
      },
      take: 25,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }],
    });
    expect(canonicalFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'team_open' },
    });
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      id: 'team_open',
      name: 'Open Aces',
      openRegistration: true,
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

  it('can create a checkout snapshot without activating team or player registrations', async () => {
    const createMock = jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data }));
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const eventRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);

    const tx = {
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
        create: createMock,
        update: updateMock,
      },
      eventRegistrations: {
        findMany: eventRegistrationsFindManyMock,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventTeamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const randomUuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('event_team_checkout');

    await expect(claimOrCreateEventTeamSnapshot({
      tx,
      eventId: 'event_1',
      canonicalTeamId: 'team_1',
      createdBy: 'manager_1',
      upsertRegistration: false,
      canonicalTeam: {
        id: 'team_1',
        name: 'Checkout Team',
        division: 'Open',
        divisionTypeId: 'open',
        wins: null,
        losses: null,
        teamSize: 2,
        profileImageId: null,
        sport: 'volleyball',
        captainId: 'player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
        playerRegistrations: [
          {
            id: 'team_1__player_1',
            teamId: 'team_1',
            userId: 'player_1',
            status: 'ACTIVE',
            isCaptain: true,
          },
        ],
        staffAssignments: [],
      },
    })).resolves.toEqual(expect.objectContaining({
      id: 'event_team_checkout',
    }));

    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'event_team_checkout',
        parentTeamId: 'team_1',
        playerIds: ['player_1'],
      }),
    }));
    expect(eventRegistrationsFindManyMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_checkout' },
      data: expect.objectContaining({
        playerRegistrationIds: [],
      }),
    }));

    randomUuidSpy.mockRestore();
  });

  it('claims a placeholder from a tournament pool while keeping registration on the bracket division', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([
          {
            id: 'slot_pool_a_1',
            eventId: 'event_1',
            kind: 'PLACEHOLDER',
            parentTeamId: null,
            division: 'pool_a',
            divisionTypeId: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
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
        findMany: jest.fn().mockResolvedValue([]),
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
      divisionId: 'bracket_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      placeholderDivisionIds: ['pool_a'],
      canonicalTeam: {
        id: 'team_1',
        name: 'Canonical Team',
        division: 'Open',
        divisionTypeId: 'open',
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
      id: 'slot_pool_a_1',
      division: 'pool_a',
    }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_pool_a_1' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        division: 'pool_a',
      }),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_pool_a_1',
      eventTeamId: 'slot_pool_a_1',
      parentId: 'team_1',
      divisionId: 'bracket_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    }), expect.anything());
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
