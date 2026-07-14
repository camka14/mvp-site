/** @jest-environment node */

const upsertEventRegistrationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/events/eventRegistrations', () => ({
  upsertEventRegistration: (...args: any[]) => upsertEventRegistrationMock(...args),
}));

import {
  applyCanonicalTeamRegistrationMetadata,
  claimOrCreateEventTeamSnapshot,
  getCanonicalTeamIdsByUserIds,
  listCanonicalTeamsForUser,
  listTeamsByIds,
  normalizeJerseyNumber,
  syncCanonicalTeamRoster,
  withDerivedCanonicalTeamIds,
} from '@/server/teams/teamMembership';

describe('canonical user-team compatibility projection', () => {
  it('deduplicates and sorts active player and staff memberships', async () => {
    const teamRegistrationsFindMany = jest.fn().mockResolvedValue([
      { userId: 'user_1', teamId: 'team_z' },
      { userId: 'user_1', teamId: 'team_a' },
    ]);
    const teamStaffAssignmentsFindMany = jest.fn().mockResolvedValue([
      { userId: 'user_1', teamId: 'team_a' },
      { userId: 'user_2', teamId: 'team_b' },
    ]);

    const result = await getCanonicalTeamIdsByUserIds([' user_1 ', 'user_2'], {
      teamRegistrations: { findMany: teamRegistrationsFindMany },
      teamStaffAssignments: { findMany: teamStaffAssignmentsFindMany },
    });

    expect(result.get('user_1')).toEqual(['team_a', 'team_z']);
    expect(result.get('user_2')).toEqual(['team_b']);
    expect(teamRegistrationsFindMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user_1', 'user_2'] }, status: 'ACTIVE' },
      select: { userId: true, teamId: true },
    });
    expect(teamStaffAssignmentsFindMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user_1', 'user_2'] }, status: 'ACTIVE' },
      select: { userId: true, teamId: true },
    });
  });

  it('overrides contradictory stored arrays and only requires an id on selected users', async () => {
    const users = await withDerivedCanonicalTeamIds([
      { id: 'user_1', firstName: 'Sam', teamIds: ['legacy_only'] },
    ], {
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user_1', teamId: 'canonical_team' }]),
      },
      teamStaffAssignments: { findMany: jest.fn().mockResolvedValue([]) },
    });

    expect(users).toEqual([{
      id: 'user_1',
      firstName: 'Sam',
      teamIds: ['canonical_team'],
    }]);
  });

  it('fails explicitly instead of falling back to UserData.teamIds when normalized delegates are missing', async () => {
    const userDataFindMany = jest.fn().mockResolvedValue([
      { id: 'user_1', teamIds: ['legacy_only'] },
    ]);

    await expect(getCanonicalTeamIdsByUserIds(['user_1'], {
      userData: { findMany: userDataFindMany },
    })).rejects.toThrow('Canonical team membership requires TeamRegistrations and TeamStaffAssignments delegates.');
    expect(userDataFindMany).not.toHaveBeenCalled();
  });
});

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

describe('syncCanonicalTeamRoster', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates a pending team invite row when roster sync creates an invited registration', async () => {
    const now = new Date('2026-07-05T13:57:18.241Z');
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamRegistrationsUpsertMock = jest.fn().mockResolvedValue({});
    const teamRegistrationsUpdateManyMock = jest.fn().mockResolvedValue({ count: 0 });
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamStaffAssignmentsUpsertMock = jest.fn().mockResolvedValue({});
    const teamStaffAssignmentsUpdateManyMock = jest.fn().mockResolvedValue({ count: 0 });
    const invitesFindManyMock = jest.fn().mockResolvedValue([]);
    const createdInvite = {
      id: 'invite_1',
      type: 'TEAM',
      email: 'pending.player@example.com',
      status: 'PENDING',
      teamId: 'team_1',
      userId: 'player_2',
      firstName: 'Pending',
      lastName: 'Player',
    };
    const invitesCreateMock = jest.fn().mockResolvedValue(createdInvite);
    const authUserFindManyMock = jest.fn().mockResolvedValue([
      { id: 'player_2', email: 'pending.player@example.com' },
    ]);
    const sensitiveUserDataFindManyMock = jest.fn().mockResolvedValue([]);
    const userDataFindManyMock = jest.fn().mockResolvedValue([
      { id: 'player_2', firstName: ' Pending ', lastName: ' Player ' },
    ]);

    const result = await syncCanonicalTeamRoster({
      teamId: 'team_1',
      captainId: 'captain_1',
      playerIds: ['captain_1'],
      pendingPlayerIds: ['player_2'],
      managerId: 'captain_1',
      headCoachId: null,
      assistantCoachIds: [],
      actingUserId: 'manager_1',
      now,
    }, {
      teamRegistrations: {
        findMany: teamRegistrationsFindManyMock,
        upsert: teamRegistrationsUpsertMock,
        updateMany: teamRegistrationsUpdateManyMock,
      },
      teamStaffAssignments: {
        findMany: teamStaffAssignmentsFindManyMock,
        upsert: teamStaffAssignmentsUpsertMock,
        updateMany: teamStaffAssignmentsUpdateManyMock,
      },
      invites: {
        findMany: invitesFindManyMock,
        create: invitesCreateMock,
      },
      authUser: {
        findMany: authUserFindManyMock,
      },
      sensitiveUserData: {
        findMany: sensitiveUserDataFindManyMock,
      },
      userData: {
        findMany: userDataFindManyMock,
      },
    });

    expect(result.createdPendingInvites).toEqual([createdInvite]);
    expect(teamRegistrationsUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        teamId_userId: {
          teamId: 'team_1',
          userId: 'player_2',
        },
      },
      create: expect.objectContaining({
        teamId: 'team_1',
        userId: 'player_2',
        status: 'INVITED',
      }),
      update: expect.objectContaining({
        status: 'INVITED',
      }),
    }));
    expect(invitesFindManyMock).toHaveBeenCalledWith({
      where: {
        type: 'TEAM',
        teamId: 'team_1',
        userId: { in: ['player_2'] },
      },
      select: {
        id: true,
        email: true,
        status: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    });
    expect(invitesCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'TEAM',
        email: 'pending.player@example.com',
        status: 'PENDING',
        teamId: 'team_1',
        userId: 'player_2',
        createdBy: 'manager_1',
        firstName: 'Pending',
        lastName: 'Player',
        createdAt: now,
        updatedAt: now,
      }),
    });
  });

  it('does not create duplicate invite rows for already-pending team invites', async () => {
    const invitesCreateMock = jest.fn().mockResolvedValue({});
    const authUserFindManyMock = jest.fn().mockResolvedValue([]);

    const result = await syncCanonicalTeamRoster({
      teamId: 'team_1',
      captainId: 'captain_1',
      playerIds: ['captain_1'],
      pendingPlayerIds: ['player_2'],
      managerId: 'captain_1',
      headCoachId: null,
      assistantCoachIds: [],
      actingUserId: 'manager_1',
      now: new Date('2026-07-05T13:57:18.241Z'),
    }, {
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      teamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      invites: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'invite_1',
            status: 'PENDING',
            userId: 'player_2',
            email: 'pending.player@example.com',
          },
        ]),
        create: invitesCreateMock,
      },
      authUser: {
        findMany: authUserFindManyMock,
      },
    });

    expect(invitesCreateMock).not.toHaveBeenCalled();
    expect(authUserFindManyMock).not.toHaveBeenCalled();
    expect(result.createdPendingInvites).toEqual([]);
  });

  it('deletes pending invite rows when invited players are removed from the pending roster', async () => {
    const invitesDeleteManyMock = jest.fn().mockResolvedValue({ count: 1 });

    const result = await syncCanonicalTeamRoster({
      teamId: 'team_1',
      captainId: 'captain_1',
      playerIds: ['captain_1'],
      pendingPlayerIds: [],
      managerId: 'captain_1',
      headCoachId: null,
      assistantCoachIds: [],
      actingUserId: 'manager_1',
      now: new Date('2026-07-05T13:57:18.241Z'),
    }, {
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            teamId: 'team_1',
            userId: 'player_2',
            status: 'INVITED',
            isCaptain: false,
          },
        ]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      teamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      invites: {
        deleteMany: invitesDeleteManyMock,
      },
    });

    expect(invitesDeleteManyMock).toHaveBeenCalledWith({
      where: {
        type: 'TEAM',
        teamId: 'team_1',
        status: 'PENDING',
        userId: { in: ['player_2'] },
      },
    });
    expect(result.createdPendingInvites).toEqual([]);
  });
});

describe('listTeamsByIds', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('prefers canonical teams over event-team snapshots when the same id exists in both tables', async () => {
    const canonicalFindManyMock = jest.fn()
      .mockResolvedValueOnce([
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
          requiredTemplateIds: [],
          createdAt: new Date('2026-04-20T00:00:00.000Z'),
          updatedAt: new Date('2026-04-20T01:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'team_2',
          openRegistration: true,
          registrationPriceCents: 1500,
          requiredTemplateIds: ['template_1'],
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
      name: 'Canonical Team',
      playerIds: ['player_1'],
      captainId: 'player_1',
      managerId: 'manager_1',
      openRegistration: true,
      registrationPriceCents: 2500,
    });
    expect(teams[1]).toMatchObject({
      id: 'event_team_1',
      name: 'Event Snapshot',
      parentTeamId: 'team_2',
      openRegistration: true,
      registrationPriceCents: 1500,
      requiredTemplateIds: ['template_1'],
    });
    expect(teams[0]).not.toHaveProperty('$id');
    expect(teams[1]).not.toHaveProperty('$id');

    expect(canonicalFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['team_1', 'event_team_1'] } },
    });
    expect(canonicalFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['team_2'] } },
      select: {
        id: true,
        joinPolicy: true,
        openRegistration: true,
        registrationPriceCents: true,
        requiredTemplateIds: true,
      },
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

  it('prefers event-scoped teams over canonical teams when an event id is supplied', async () => {
    const canonicalFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'canonical_team_1',
        openRegistration: true,
        registrationPriceCents: 1750,
        requiredTemplateIds: ['template_event'],
      },
    ]);
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([]);
    const eventTeamsFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'shadow_id',
        name: 'Event Team',
        eventId: 'event_1',
        kind: 'REGISTERED',
        playerIds: ['player_1'],
        playerRegistrationIds: [],
        division: 'Men',
        divisionTypeId: 'men',
        wins: 0,
        losses: 0,
        captainId: 'player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        staffAssignmentIds: [],
        parentTeamId: 'canonical_team_1',
        pending: [],
        teamSize: 2,
        profileImageId: null,
        sport: 'Beach Volleyball',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T01:00:00.000Z'),
      },
    ]);

    const teams = await listTeamsByIds(['shadow_id'], {
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
    }, { eventId: 'event_1' });

    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      id: 'shadow_id',
      name: 'Event Team',
      eventId: 'event_1',
      parentTeamId: 'canonical_team_1',
      openRegistration: true,
      registrationPriceCents: 1750,
      requiredTemplateIds: ['template_event'],
    });
    expect(teams[0]).not.toHaveProperty('$id');
    expect(eventTeamsFindManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ['shadow_id'] },
        eventId: 'event_1',
      },
    });
    expect(canonicalFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['canonical_team_1'] } },
      select: {
        id: true,
        joinPolicy: true,
        openRegistration: true,
        registrationPriceCents: true,
        requiredTemplateIds: true,
      },
    });
    expect(teamRegistrationsFindManyMock).not.toHaveBeenCalled();
    expect(teamStaffAssignmentsFindManyMock).not.toHaveBeenCalled();
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
        visibility: 'PUBLIC',
        openRegistration: true,
        archivedAt: null,
        OR: [
          { name: { contains: 'aces', mode: 'insensitive' } },
          { sport: { contains: 'aces', mode: 'insensitive' } },
          { division: { contains: 'aces', mode: 'insensitive' } },
        ],
      },
      take: 25,
      skip: 0,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
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

  it('does not constrain canonical team discovery by visibility for admins', async () => {
    const canonicalFindManyMock = jest.fn().mockResolvedValue([]);
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([]);

    await listCanonicalTeamsForUser({
      organizationId: 'org_1',
      includeAdminOnly: true,
      limit: 50,
    }, {
      canonicalTeams: {
        findMany: canonicalFindManyMock,
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
        organizationId: 'org_1',
        archivedAt: null,
      },
      take: 50,
      skip: 0,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  });

  it('uses the id tie-breaker for consecutive organization pages with tied names', async () => {
    const sharedTeamFields = {
      name: 'Alpha Aces',
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
      registrationPriceCents: 0,
      requiredTemplateIds: [],
      visibility: 'PUBLIC',
      createdAt: new Date('2026-07-13T00:00:00.000Z'),
      updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    };
    const teamsById = {
      team_alpha_1: { ...sharedTeamFields, id: 'team_alpha_1' },
      team_alpha_2: { ...sharedTeamFields, id: 'team_alpha_2' },
    };
    const canonicalFindManyMock = jest.fn()
      .mockResolvedValueOnce([{ id: 'team_alpha_1' }])
      .mockResolvedValueOnce([{ id: 'team_alpha_2' }]);
    const canonicalFindUniqueMock = jest.fn(({ where }: { where: { id: keyof typeof teamsById } }) => (
      Promise.resolve(teamsById[where.id] ?? null)
    ));
    const teamRegistrationsFindManyMock = jest.fn().mockResolvedValue([]);
    const teamStaffAssignmentsFindManyMock = jest.fn().mockResolvedValue([]);
    const client = {
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
    };

    const firstPage = await listCanonicalTeamsForUser({
      organizationId: 'org_1',
      includeAdminOnly: true,
      limit: 1,
      offset: 0,
    }, client);
    const secondPage = await listCanonicalTeamsForUser({
      organizationId: 'org_1',
      includeAdminOnly: true,
      limit: 1,
      offset: 1,
    }, client);

    expect(firstPage.map((team) => team.id)).toEqual(['team_alpha_1']);
    expect(secondPage.map((team) => team.id)).toEqual(['team_alpha_2']);
    expect(canonicalFindManyMock).toHaveBeenNthCalledWith(1, {
      where: { organizationId: 'org_1', archivedAt: null },
      take: 1,
      skip: 0,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    expect(canonicalFindManyMock).toHaveBeenNthCalledWith(2, {
      where: { organizationId: 'org_1', archivedAt: null },
      take: 1,
      skip: 1,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
  });

  it('filters admin-only canonical teams from id lookups for non-admin team lists', async () => {
    const publicTeam = {
      id: 'team_public',
      name: 'Public Team',
      division: 'Open',
      divisionTypeId: 'open',
      wins: null,
      losses: null,
      teamSize: 6,
      profileImageId: null,
      sport: 'Volleyball',
      organizationId: null,
      createdBy: 'user_1',
      openRegistration: false,
      registrationPriceCents: 0,
      requiredTemplateIds: [],
      visibility: 'PUBLIC',
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T01:00:00.000Z'),
    };
    const adminOnlyTeam = {
      ...publicTeam,
      id: 'team_admin_only',
      name: 'Admin Only Team',
      visibility: 'ADMIN_ONLY',
    };

    const teams = await listCanonicalTeamsForUser({
      ids: ['team_public', 'team_admin_only'],
    }, {
      canonicalTeams: {
        findMany: jest.fn().mockResolvedValue([publicTeam, adminOnlyTeam]),
      },
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    expect(teams.map((team) => team.id)).toEqual(['team_public']);
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

  it('deletes stale placeholder registrations when checkout claims a placeholder slot', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const deleteManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([
          {
            id: 'placeholder_slot_1',
            eventId: 'event_1',
            kind: 'PLACEHOLDER',
            parentTeamId: null,
            division: 'open',
            divisionTypeId: null,
            name: 'Place Holder 1',
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
        deleteMany: deleteManyMock,
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
      createdBy: 'manager_1',
      upsertRegistration: false,
      canonicalTeam: {
        id: 'team_1',
        name: 'Checkout Team',
        division: 'open',
        divisionTypeId: null,
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
        playerRegistrations: [],
        staffAssignments: [],
      },
    })).resolves.toEqual(expect.objectContaining({
      id: 'placeholder_slot_1',
    }));

    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'placeholder_slot_1' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
      }),
    }));
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        registrantType: 'TEAM',
        parentId: null,
        OR: [
          { registrantId: { in: ['placeholder_slot_1'] } },
          { eventTeamId: { in: ['placeholder_slot_1'] } },
        ],
      },
    });
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

  it('claims the lowest numbered placeholder when generated placeholders share timestamps', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const sharedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([
          {
            id: 'placeholder_seed_10',
            eventId: 'event_1',
            kind: 'PLACEHOLDER',
            parentTeamId: null,
            division: 'div_a',
            divisionTypeId: 'open',
            name: 'Place Holder 10',
            createdAt: sharedCreatedAt,
          },
          {
            id: 'placeholder_seed_2',
            eventId: 'event_1',
            kind: 'PLACEHOLDER',
            parentTeamId: null,
            division: 'div_a',
            divisionTypeId: 'open',
            name: 'Place Holder 2',
            createdAt: sharedCreatedAt,
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
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
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
      id: 'placeholder_seed_2',
      division: 'div_a',
    }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'placeholder_seed_2' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        division: 'div_a',
      }),
    }));
    expect(tx.teams.create).not.toHaveBeenCalled();
  });

  it('swaps an existing registered event team into a target placeholder slot', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const createMock = jest.fn();
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'REGISTERED' && where.parentTeamId === 'team_1') {
        return Promise.resolve([
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
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([
          {
            id: 'slot_div_b_1',
            eventId: 'event_1',
              kind: 'PLACEHOLDER',
              parentTeamId: null,
              division: 'div_b',
              divisionTypeId: 'advanced',
              name: 'Place Holder 7',
              createdAt: new Date('2026-01-03T00:00:00.000Z'),
            },
          ]);
      }
      return Promise.resolve([]);
    });
    const eventRegistrationsFindManyMock = jest.fn(({ where }: { where: Record<string, any> }) => {
      if (where.registrantType === 'TEAM') {
        return Promise.resolve([
          {
            registrantId: 'event_team_existing',
            eventTeamId: 'event_team_existing',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const tx = {
      teams: {
        findMany: findManyMock,
        update: updateMock,
        create: createMock,
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

    await expect(claimOrCreateEventTeamSnapshot({
      tx,
      eventId: 'event_1',
      canonicalTeamId: 'team_1',
      createdBy: 'user_1',
      divisionId: 'div_b',
      divisionTypeId: 'advanced',
      divisionTypeKey: 'c_skill_advanced',
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
      id: 'slot_div_b_1',
      division: 'div_b',
    }));

    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_1',
        kind: 'PLACEHOLDER',
        parentTeamId: null,
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_div_b_1' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        division: 'div_b',
        divisionTypeId: 'advanced',
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_existing' },
      data: expect.objectContaining({
        kind: 'PLACEHOLDER',
        parentTeamId: null,
        division: 'div_a',
        divisionTypeId: 'open',
        name: 'Place Holder 7',
      }),
    }));
    expect(createMock).not.toHaveBeenCalled();
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_div_b_1',
      eventTeamId: 'slot_div_b_1',
      parentId: 'team_1',
      divisionId: 'div_b',
      divisionTypeId: 'advanced',
      divisionTypeKey: 'c_skill_advanced',
    }), expect.anything());
  });

  it('moves the requested legacy event team id instead of a child duplicate', async () => {
    const updateMock = jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => (
      Promise.resolve({ id: where.id, ...data })
    ));
    const createMock = jest.fn();
    const findManyMock = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.kind === 'REGISTERED' && where.id === 'event_team_existing') {
        return Promise.resolve([
          {
            id: 'event_team_existing',
            eventId: 'event_1',
            kind: 'REGISTERED',
            parentTeamId: 'canonical_team_1',
            division: 'div_b',
            divisionTypeId: 'open',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          },
        ]);
      }
      if (where.kind === 'REGISTERED' && where.parentTeamId === 'event_team_existing') {
        return Promise.resolve([
          {
            id: 'event_team_duplicate',
            eventId: 'event_1',
            kind: 'REGISTERED',
            parentTeamId: 'event_team_existing',
            division: 'div_a',
            divisionTypeId: 'open',
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
            updatedAt: new Date('2026-01-04T00:00:00.000Z'),
          },
        ]);
      }
      if (where.kind === 'PLACEHOLDER') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const eventRegistrationsFindManyMock = jest.fn(({ where }: { where: Record<string, any> }) => {
      if (where.registrantType === 'TEAM') {
        return Promise.resolve([
          {
            registrantId: 'event_team_existing',
            eventTeamId: 'event_team_existing',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const tx = {
      teams: {
        findMany: findManyMock,
        update: updateMock,
        create: createMock,
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

    await expect(claimOrCreateEventTeamSnapshot({
      tx,
      eventId: 'event_1',
      canonicalTeamId: 'event_team_existing',
      createdBy: 'user_1',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
      canonicalTeam: {
        id: 'event_team_existing',
        name: 'Legacy Event Team',
        division: 'div_b',
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
      division: 'div_a',
    }));

    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: 'PLACEHOLDER' }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_existing' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'canonical_team_1',
        division: 'div_a',
        divisionTypeId: 'open',
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_duplicate' },
      data: expect.objectContaining({
        kind: 'PLACEHOLDER',
        parentTeamId: null,
        division: 'div_a',
        divisionTypeId: 'open',
      }),
    }));
    expect(createMock).not.toHaveBeenCalled();
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'event_team_existing',
      eventTeamId: 'event_team_existing',
      parentId: 'canonical_team_1',
      divisionId: 'div_a',
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
