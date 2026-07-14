/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const getTeamChatBaseMemberIdsMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const reserveChildTeamRegistrationForGuardianMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: (...args: unknown[]) => getTeamChatBaseMemberIdsMock(...args),
  syncTeamChatInTx: (...args: unknown[]) => syncTeamChatInTxMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  getEventTeamsDelegate: (client: any) => client?.teams ?? null,
  loadCanonicalTeamById: (...args: unknown[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null),
  normalizeIdList: (value: unknown) => (
    Array.isArray(value)
      ? Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
      : []
  ),
  syncCanonicalTeamRoster: (...args: unknown[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teams/teamChildRegistration', () => ({
  reserveChildTeamRegistrationForGuardian: (...args: unknown[]) => reserveChildTeamRegistrationForGuardianMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
}));

import { POST } from '@/app/api/invites/[id]/accept/route';

const postRequest = () =>
  new NextRequest('http://localhost/api/invites/invite_1/accept', {
    method: 'POST',
  });

describe('POST /api/invites/[id]/accept', () => {
  const txMock = {
    invites: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    teams: {
      update: jest.fn(),
    },
    userData: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
    txMock.invites.findUnique.mockImplementation((args) => prismaMock.invites.findUnique(args));
    prismaMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    txMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    txMock.userData.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);
    reserveChildTeamRegistrationForGuardianMock.mockResolvedValue({
      ok: true,
      payload: {
        registrationId: 'team_1__child_1',
        status: 'ACTIVE',
        registration: null,
        team: null,
      },
    });
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

  it('accepts a STAFF invite and sets the organization as home when unset', async () => {
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
    expect(payload.organizationId).toBe('org_1');
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
    expect(txMock.userData.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user_1',
        homePageOrganizationId: null,
      },
      data: {
        homePageOrganizationId: 'org_1',
        updatedAt: expect.any(Date),
      },
    });
  });

  it('locks an event-scoped STAFF invite before re-authorizing and accepting it', async () => {
    const invite = {
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      organizationId: null,
      userId: 'user_1',
    };
    prismaMock.invites.findUnique.mockResolvedValue(invite);

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, organizationId: null });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(acquireEventLockMock.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.invites.findUnique.mock.invocationCallOrder[0],
    );
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
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
    expect(txMock.userData.updateMany).not.toHaveBeenCalled();
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

  it('blocks a child from accepting a team invite when no parent link is detected', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'child_1',
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2014-05-20T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('No parent/guardian link is detected. Please have your parent or guardian create an account and accept this invitation on your behalf.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(reserveChildTeamRegistrationForGuardianMock).not.toHaveBeenCalled();
  });

  it('blocks a child from accepting a team invite when a parent must accept', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'child_1', isAdmin: false });
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'child_1',
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2014-05-20T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('A parent or guardian must accept team invitations for child accounts.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('lets a linked parent accept a child open team join request and creates the registration then', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'parent_1', isAdmin: false });
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: 'child_1',
      createdBy: 'child_1',
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2014-05-20T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1' });
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: '',
      headCoachId: null,
      coachIds: [],
      playerIds: ['captain_1'],
      pending: [],
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.registrationId).toBe('team_1__child_1');
    expect(reserveChildTeamRegistrationForGuardianMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      childId: 'child_1',
      parentId: 'parent_1',
      actorUserId: 'parent_1',
    }));
    expect(prismaMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
