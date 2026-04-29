/** @jest-environment node */

import { NextRequest } from 'next/server';

const canonicalUpdateMock = jest.fn();
const teamFindManyMock = jest.fn();
const teamUpdateMock = jest.fn();
const eventsFindManyMock = jest.fn();
const eventRegistrationsFindManyMock = jest.fn();
const organizationFindFirstMock = jest.fn();

const txClientMock = {
  canonicalTeams: {
    update: (...args: any[]) => canonicalUpdateMock(...args),
  },
  teams: {
    findMany: (...args: any[]) => teamFindManyMock(...args),
    update: (...args: any[]) => teamUpdateMock(...args),
  },
  events: {
    findMany: (...args: any[]) => eventsFindManyMock(...args),
  },
  eventRegistrations: {
    findMany: (...args: any[]) => eventRegistrationsFindManyMock(...args),
  },
};

const prismaMock = {
  canonicalTeams: {
    findUnique: jest.fn(),
    update: (...args: any[]) => canonicalUpdateMock(...args),
  },
  organizations: {
    findFirst: (...args: any[]) => organizationFindFirstMock(...args),
  },
  $transaction: jest.fn(async (handler: any) => handler(txClientMock)),
};

const requireSessionMock = jest.fn();
const canManageCanonicalTeamMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const applyCanonicalTeamRegistrationMetadataMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();
const getTeamChatBaseMemberIdsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  applyCanonicalTeamRegistrationMetadata: (...args: any[]) => applyCanonicalTeamRegistrationMetadataMock(...args),
  canManageCanonicalTeam: (...args: any[]) => canManageCanonicalTeamMock(...args),
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: (...args: any[]) => getTeamChatBaseMemberIdsMock(...args),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
  deleteTeamChatInTx: jest.fn(),
}));

import { PATCH } from '@/app/api/teams/[id]/route';

const patchJson = (body: unknown) => new NextRequest('http://localhost/api/teams/team_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams/[id] PATCH canonical team sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageCanonicalTeamMock.mockResolvedValue(true);
    organizationFindFirstMock.mockResolvedValue(null);
    syncCanonicalTeamRosterMock.mockResolvedValue(undefined);
    applyCanonicalTeamRegistrationMetadataMock.mockResolvedValue(undefined);
    syncTeamChatInTxMock.mockResolvedValue(undefined);
    getTeamChatBaseMemberIdsMock.mockImplementation((team: any) => team?.playerIds ?? []);
    teamFindManyMock.mockResolvedValue([
      {
        id: 'event_team_1',
        captainId: 'manager_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        playerIds: ['manager_1', 'user_2'],
      },
    ]);
    eventRegistrationsFindManyMock.mockResolvedValue([
      { eventId: 'event_1', registrantId: 'event_team_1' },
    ]);
    eventsFindManyMock.mockResolvedValue([
      { id: 'event_1' },
    ]);
    canonicalUpdateMock.mockResolvedValue({ id: 'team_1' });
    teamUpdateMock.mockResolvedValue({ id: 'event_team_1' });
    loadCanonicalTeamByIdMock
      .mockResolvedValueOnce({
        id: 'team_1',
        name: 'Team One',
        division: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        sport: 'Beach Volleyball',
        playerIds: ['manager_1', 'user_2'],
        captainId: 'manager_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
        teamSize: 2,
        profileImageId: null,
      })
      .mockResolvedValueOnce({
        id: 'team_1',
        name: 'Sandstorm',
        division: 'Open',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        sport: 'Beach Volleyball',
        playerIds: ['manager_1', 'user_2'],
        captainId: 'manager_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        pending: [],
        teamSize: 2,
        profileImageId: null,
      });
  });

  it('propagates versioned changes to future derived event teams', async () => {
    const response = await PATCH(
      patchJson({ team: { name: 'Sandstorm' } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(canonicalUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'team_1' },
      data: expect.objectContaining({ name: 'Sandstorm' }),
    }));
    expect(teamUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_team_1' },
      data: expect.objectContaining({
        name: 'Sandstorm',
        playerIds: ['manager_1', 'user_2'],
        teamSize: 2,
      }),
    }));
    expect(syncTeamChatInTxMock).toHaveBeenCalledWith(txClientMock, 'team_1', expect.any(Object));
    expect(syncTeamChatInTxMock).toHaveBeenCalledWith(txClientMock, 'event_team_1', expect.any(Object));
    expect(payload.name).toBe('Sandstorm');
  });

  it('accepts player registration jersey updates on canonical teams', async () => {
    const response = await PATCH(
      patchJson({
        team: {
          playerRegistrations: [
            {
              id: 'team_1__user_2',
              teamId: 'team_1',
              userId: 'user_2',
              status: 'ACTIVE',
              jerseyNumber: '21',
            },
          ],
        },
      }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(200);
    expect(applyCanonicalTeamRegistrationMetadataMock).toHaveBeenCalledWith({
      client: txClientMock,
      teamId: 'team_1',
      playerRegistrations: [
        {
          id: 'team_1__user_2',
          teamId: 'team_1',
          userId: 'user_2',
          status: 'ACTIVE',
          jerseyNumber: '21',
        },
      ],
      now: expect.any(Date),
    });
    expect(teamUpdateMock).not.toHaveBeenCalled();
  });
});
