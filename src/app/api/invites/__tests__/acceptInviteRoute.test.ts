/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const getTeamChatBaseMemberIdsMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: (...args: unknown[]) => getTeamChatBaseMemberIdsMock(...args),
  syncTeamChatInTx: (...args: unknown[]) => syncTeamChatInTxMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: unknown[]) => loadCanonicalTeamByIdMock(...args),
  syncCanonicalTeamRoster: (...args: unknown[]) => syncCanonicalTeamRosterMock(...args),
}));

import { POST } from '@/app/api/invites/[id]/accept/route';

const postRequest = () =>
  new NextRequest('http://localhost/api/invites/invite_1/accept', {
    method: 'POST',
  });

describe('POST /api/invites/[id]/accept', () => {
  const txMock = {
    invites: {
      delete: jest.fn(),
    },
    teams: {
      update: jest.fn(),
    },
    userData: {
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
    prismaMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    txMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    getTeamChatBaseMemberIdsMock.mockReturnValue(['captain_1']);
    syncTeamChatInTxMock.mockResolvedValue(undefined);
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      headCoachId: null,
      coachIds: [],
      playerIds: ['captain_1'],
      pending: ['user_1'],
    });
    syncCanonicalTeamRosterMock.mockResolvedValue(undefined);
  });

  it('accepts a STAFF invite by deleting it without a transaction', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      organizationId: 'org_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(prismaMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a TEAM player invite by syncing the canonical roster and deleting the invite', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(loadCanonicalTeamByIdMock).toHaveBeenCalledWith('team_1', txMock);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      headCoachId: null,
      assistantCoachIds: [],
      actingUserId: 'user_1',
      playerIds: ['captain_1', 'user_1'],
      pendingPlayerIds: [],
      now: expect.any(Date),
    }), txMock);
    expect(getTeamChatBaseMemberIdsMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'team_1',
      playerIds: ['captain_1'],
      pending: ['user_1'],
    }));
    expect(syncTeamChatInTxMock).toHaveBeenCalledWith(txMock, 'team_1', {
      previousMemberIds: ['captain_1'],
    });
    expect(txMock.teams.update).not.toHaveBeenCalled();
    expect(txMock.userData.update).not.toHaveBeenCalled();
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });

  it('does not touch legacy profile teamIds when canonical membership is the source of truth', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledTimes(1);
    expect(txMock.userData.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the canonical team cannot be found', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'user_1',
    });
    loadCanonicalTeamByIdMock.mockResolvedValue(null);

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Team not found');
    expect(syncCanonicalTeamRosterMock).not.toHaveBeenCalled();
    expect(txMock.invites.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when invite type is not a staff or team invite', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'EVENT',
      eventId: 'event_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid invite');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
