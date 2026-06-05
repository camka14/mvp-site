/** @jest-environment node */

const claimOrCreateEventTeamSnapshotMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const getTeamChatBaseMemberIdsMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();

jest.mock('@/server/teams/teamMembership', () => ({
  claimOrCreateEventTeamSnapshot: (...args: any[]) => claimOrCreateEventTeamSnapshotMock(...args),
  getEventTeamsDelegate: (client: any) => client?.teams ?? client?.volleyBallTeams ?? null,
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  },
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: (...args: any[]) => getTeamChatBaseMemberIdsMock(...args),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
}));

import { syncCanonicalTeamFutureEventSnapshots } from '@/server/teams/teamEventSnapshotSync';

describe('syncCanonicalTeamFutureEventSnapshots', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getTeamChatBaseMemberIdsMock.mockImplementation((team: any) => team?.playerIds ?? []);
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'Open Team',
      playerIds: ['player_1', 'player_2'],
      playerRegistrations: [
        { id: 'team_1__player_1', userId: 'player_1', status: 'ACTIVE' },
        { id: 'team_1__player_2', userId: 'player_2', status: 'ACTIVE' },
      ],
      staffAssignments: [],
      createdBy: 'manager_1',
    });
    claimOrCreateEventTeamSnapshotMock.mockResolvedValue({ id: 'event_team_1' });
    syncTeamChatInTxMock.mockResolvedValue(undefined);
  });

  it('refreshes future registered event team snapshots from the canonical roster', async () => {
    const teamsFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'event_team_1',
        parentTeamId: 'team_1',
        playerIds: ['player_1'],
        captainId: 'player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
      },
    ]);
    const eventRegistrationsFindManyMock = jest.fn().mockResolvedValue([
      {
        eventId: 'event_future',
        registrantId: 'event_team_1',
        eventTeamId: 'event_team_1',
        status: 'PENDING',
        divisionId: 'division_1',
        divisionTypeId: 'open',
        divisionTypeKey: 'open',
      },
      {
        eventId: 'event_past',
        registrantId: 'event_team_1',
        eventTeamId: 'event_team_1',
        status: 'ACTIVE',
        divisionId: null,
        divisionTypeId: null,
        divisionTypeKey: null,
      },
    ]);
    const eventsFindManyMock = jest.fn().mockResolvedValue([{ id: 'event_future' }]);
    const tx = {
      teams: {
        findMany: teamsFindManyMock,
      },
      eventRegistrations: {
        findMany: eventRegistrationsFindManyMock,
      },
      events: {
        findMany: eventsFindManyMock,
      },
    };
    const now = new Date('2026-06-05T20:30:00.000Z');

    const updatedTeamIds = await syncCanonicalTeamFutureEventSnapshots({
      tx,
      canonicalTeamId: 'team_1',
      createdBy: 'manager_1',
      now,
    });

    expect(updatedTeamIds).toEqual(['event_team_1']);
    expect(teamsFindManyMock).toHaveBeenCalledWith({
      where: { parentTeamId: 'team_1' },
      select: expect.objectContaining({ id: true, playerIds: true }),
    });
    expect(eventRegistrationsFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        OR: [
          { registrantId: { in: ['team_1', 'event_team_1'] } },
          { eventTeamId: { in: ['team_1', 'event_team_1'] } },
        ],
      }),
    }));
    expect(eventsFindManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ['event_future', 'event_past'] },
        end: { gte: now },
      },
      select: { id: true },
    });
    expect(loadCanonicalTeamByIdMock).toHaveBeenCalledWith('team_1', tx);
    expect(claimOrCreateEventTeamSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({
      tx,
      eventId: 'event_future',
      canonicalTeamId: 'team_1',
      createdBy: 'manager_1',
      divisionId: 'division_1',
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
      registrationStatus: 'PENDING',
    }));
    expect(claimOrCreateEventTeamSnapshotMock).toHaveBeenCalledTimes(1);
    expect(syncTeamChatInTxMock).toHaveBeenCalledWith(tx, 'event_team_1', {
      previousMemberIds: ['player_1'],
    });
  });
});
