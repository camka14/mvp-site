/** @jest-environment node */

const syncNewCanonicalPlayerIntoMatchRostersMock = jest.fn();

jest.mock('@/server/matches/teamCheckIns', () => ({
  syncNewCanonicalPlayerIntoMatchRosters: (...args: unknown[]) => syncNewCanonicalPlayerIntoMatchRostersMock(...args),
}));

jest.mock('@/server/events/eventRegistrations', () => ({
  buildEventRegistrationId: ({
    eventId,
    registrantType,
    registrantId,
  }: {
    eventId: string;
    registrantType: string;
    registrantId: string;
  }) => `${eventId}__${registrantType.toLowerCase()}__${registrantId}`,
}));

jest.mock('@/server/teams/teamMembership', () => ({
  getEventTeamsDelegate: (client: any) => client?.teams ?? null,
  loadCanonicalTeamById: jest.fn(),
  normalizeId: (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null),
  normalizeIdList: (value: unknown) => (
    Array.isArray(value)
      ? Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
      : []
  ),
  syncCanonicalTeamRoster: jest.fn(),
}));

import { acceptTeamInviteEventSyncs } from '@/server/teams/teamInviteEventSync';

describe('acceptTeamInviteEventSyncs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds accepted players to linked future event teams', async () => {
    const now = new Date('2026-07-04T20:00:00.000Z');
    const registrationId = 'event_1__self__player_1';
    const tx = {
      teamInviteEventSyncs: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'event_team_1',
          eventId: 'event_1',
          playerIds: ['captain_1'],
          pending: ['player_1'],
          division: 'division_1',
          divisionTypeId: 'open',
        }]),
        update: jest.fn().mockResolvedValue({}),
      },
      events: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event_1' }]),
      },
      teamRegistrations: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team_1__player_1' }),
      },
      eventRegistrations: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: registrationId }]),
        upsert: jest.fn().mockResolvedValue({ id: registrationId }),
      },
    };

    await acceptTeamInviteEventSyncs(tx, {
      id: 'invite_1',
      teamId: 'team_1',
      userId: 'player_1',
      createdBy: 'manager_1',
    }, now, {
      propagateToLinkedEventTeams: true,
    });

    expect(tx.teams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        parentTeamId: 'team_1',
        eventId: { not: null },
        archivedAt: null,
      }),
    }));
    expect(tx.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ['event_1'] },
        NOT: { end: { lt: now } },
      },
    }));
    expect(tx.teams.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'event_team_1' },
      data: {
        playerIds: ['captain_1', 'player_1'],
        pending: [],
        updatedAt: now,
      },
    });
    expect(syncNewCanonicalPlayerIntoMatchRostersMock).toHaveBeenCalledWith(tx, {
      eventId: 'event_1',
      eventTeamId: 'event_team_1',
      userId: 'player_1',
      actorUserId: 'manager_1',
      now,
    });
    expect(tx.eventRegistrations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: registrationId },
      create: expect.objectContaining({
        id: registrationId,
        eventId: 'event_1',
        registrantId: 'player_1',
        parentId: 'team_1',
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'team_1__player_1',
        divisionId: 'division_1',
        divisionTypeId: 'open',
        divisionTypeKey: 'open',
        createdBy: 'manager_1',
      }),
      update: expect.objectContaining({
        parentId: 'team_1',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'team_1__player_1',
      }),
    }));
    expect(tx.teams.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'event_team_1' },
      data: {
        playerRegistrationIds: [registrationId],
        updatedAt: now,
      },
    });
    expect(tx.teamInviteEventSyncs.updateMany).not.toHaveBeenCalled();
  });

  it('marks historical sync rows accepted while propagating from the canonical team', async () => {
    const now = new Date('2026-07-04T20:00:00.000Z');
    const registrationId = 'event_1__self__player_1';
    const tx = {
      teamInviteEventSyncs: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'sync_1',
          inviteId: 'invite_1',
          canonicalTeamId: 'team_1',
          eventId: 'event_1',
          eventTeamId: 'selected_event_team_only',
          userId: 'player_1',
          status: 'PENDING',
        }]),
        updateMany: jest.fn(),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'event_team_1',
          eventId: 'event_1',
          playerIds: ['captain_1'],
          pending: ['player_1'],
          division: 'division_1',
          divisionTypeId: 'open',
        }]),
        update: jest.fn().mockResolvedValue({}),
      },
      events: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event_1' }]),
      },
      teamRegistrations: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team_1__player_1' }),
      },
      eventRegistrations: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: registrationId }]),
        upsert: jest.fn().mockResolvedValue({ id: registrationId }),
      },
    };

    await acceptTeamInviteEventSyncs(tx, {
      id: 'invite_1',
      teamId: 'team_1',
      userId: 'player_1',
      createdBy: 'manager_1',
    }, now, {
      propagateToLinkedEventTeams: true,
    });

    expect(tx.teams.update).toHaveBeenCalledWith({
      where: { id: 'event_team_1' },
      data: {
        playerIds: ['captain_1', 'player_1'],
        pending: [],
        updatedAt: now,
      },
    });
    expect(tx.teams.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'selected_event_team_only' },
    }));
    expect(tx.teamInviteEventSyncs.updateMany).toHaveBeenCalledWith({
      where: {
        inviteId: 'invite_1',
        status: 'PENDING',
      },
      data: {
        status: 'ACCEPTED',
        updatedAt: now,
      },
    });
  });

  it('does not propagate to linked event teams unless requested', async () => {
    const tx = {
      teamInviteEventSyncs: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      teams: {
        findMany: jest.fn(),
      },
    };

    await acceptTeamInviteEventSyncs(tx, {
      id: 'invite_1',
      teamId: 'team_1',
      userId: 'player_1',
    }, new Date('2026-07-04T20:00:00.000Z'));

    expect(tx.teams.findMany).not.toHaveBeenCalled();
  });
});
