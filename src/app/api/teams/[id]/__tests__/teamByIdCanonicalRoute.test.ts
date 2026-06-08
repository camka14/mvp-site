/** @jest-environment node */

import { NextRequest } from 'next/server';

const canonicalUpdateMock = jest.fn();
const teamFindManyMock = jest.fn();
const teamUpdateMock = jest.fn();
const eventsFindManyMock = jest.fn();
const eventRegistrationsFindManyMock = jest.fn();
const canonicalFindUniqueMock = jest.fn();
const organizationFindFirstMock = jest.fn();
const organizationFindUniqueMock = jest.fn();

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
    findUnique: (...args: any[]) => canonicalFindUniqueMock(...args),
    update: (...args: any[]) => canonicalUpdateMock(...args),
  },
  organizations: {
    findFirst: (...args: any[]) => organizationFindFirstMock(...args),
    findUnique: (...args: any[]) => organizationFindUniqueMock(...args),
  },
  $transaction: jest.fn(async (handler: any) => handler(txClientMock)),
};

const requireSessionMock = jest.fn();
const getOptionalSessionMock = jest.fn();
const canManageCanonicalTeamMock = jest.fn();
const claimOrCreateEventTeamSnapshotMock = jest.fn();
const isAdminOnlyCanonicalTeamMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const applyCanonicalTeamRegistrationMetadataMock = jest.fn();
const syncCanonicalTeamFutureEventSnapshotsMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();
const getTeamChatBaseMemberIdsMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const evaluateRazumlyAdminAccessMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: any[]) => getOptionalSessionMock(...args),
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  applyCanonicalTeamRegistrationMetadata: (...args: any[]) => applyCanonicalTeamRegistrationMetadataMock(...args),
  canManageCanonicalTeam: (...args: any[]) => canManageCanonicalTeamMock(...args),
  claimOrCreateEventTeamSnapshot: (...args: any[]) => claimOrCreateEventTeamSnapshotMock(...args),
  isAdminOnlyCanonicalTeam: (...args: any[]) => isAdminOnlyCanonicalTeamMock(...args),
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teams/teamEventSnapshotSync', () => ({
  findFutureRegisteredTeamRefs: jest.fn(),
  syncCanonicalTeamFutureEventSnapshots: (...args: any[]) => syncCanonicalTeamFutureEventSnapshotsMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: (...args: any[]) => getTeamChatBaseMemberIdsMock(...args),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
  deleteTeamChatInTx: jest.fn(),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));
jest.mock('@/server/razumlyAdmin', () => ({
  evaluateRazumlyAdminAccess: (...args: any[]) => evaluateRazumlyAdminAccessMock(...args),
}));

import { GET, PATCH } from '@/app/api/teams/[id]/route';

const patchJson = (body: unknown) => new NextRequest('http://localhost/api/teams/team_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams/[id] PATCH canonical team sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockResolvedValue(null);
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageCanonicalTeamMock.mockResolvedValue(true);
    claimOrCreateEventTeamSnapshotMock.mockResolvedValue({ id: 'event_team_1' });
    isAdminOnlyCanonicalTeamMock.mockReturnValue(false);
    canonicalFindUniqueMock.mockResolvedValue(null);
    organizationFindFirstMock.mockResolvedValue(null);
    organizationFindUniqueMock.mockResolvedValue(null);
    hasOrgPermissionMock.mockResolvedValue(false);
    evaluateRazumlyAdminAccessMock.mockResolvedValue({ allowed: false, email: null, verified: false });
    syncCanonicalTeamRosterMock.mockResolvedValue(undefined);
    applyCanonicalTeamRegistrationMetadataMock.mockResolvedValue(undefined);
    syncCanonicalTeamFutureEventSnapshotsMock.mockResolvedValue([]);
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
      {
        eventId: 'event_1',
        registrantId: 'event_team_1',
        eventTeamId: 'event_team_1',
        status: 'PENDING',
        divisionId: 'division_1',
        divisionTypeId: 'open',
        divisionTypeKey: 'open',
      },
    ]);
    eventsFindManyMock.mockResolvedValue([
      { id: 'event_1' },
    ]);
    canonicalUpdateMock.mockResolvedValue({ id: 'team_1' });
    teamUpdateMock.mockResolvedValue({ id: 'event_team_1' });
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'Sandstorm',
      division: 'Open',
      divisionTypeId: 'open',
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
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Team One',
      division: 'Open',
      divisionTypeId: 'open',
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

  it('hides admin-only canonical teams from non-admin direct reads', async () => {
    loadCanonicalTeamByIdMock.mockReset();
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Admin Only Team',
      visibility: 'ADMIN_ONLY',
    });
    isAdminOnlyCanonicalTeamMock.mockReturnValue(true);
    getOptionalSessionMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(404);
  });

  it('allows admins to directly read admin-only canonical teams', async () => {
    loadCanonicalTeamByIdMock.mockReset();
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Admin Only Team',
      visibility: 'ADMIN_ONLY',
    });
    isAdminOnlyCanonicalTeamMock.mockReturnValue(true);
    getOptionalSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: 'team_1',
      visibility: 'ADMIN_ONLY',
    });
  });

  it('allows verified Razumly admins to directly read admin-only canonical teams', async () => {
    loadCanonicalTeamByIdMock.mockReset();
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Admin Only Team',
      visibility: 'ADMIN_ONLY',
    });
    isAdminOnlyCanonicalTeamMock.mockReturnValue(true);
    getOptionalSessionMock.mockResolvedValue({ userId: 'raz_admin_1', isAdmin: false });
    evaluateRazumlyAdminAccessMock.mockResolvedValueOnce({
      allowed: true,
      email: 'admin@razumly.com',
      verified: true,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(evaluateRazumlyAdminAccessMock).toHaveBeenCalledWith('raz_admin_1');
    expect(hasOrgPermissionMock).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      id: 'team_1',
      visibility: 'ADMIN_ONLY',
    });
  });

  it('allows organization team managers to directly read admin-only canonical teams', async () => {
    const session = { userId: 'staff_1', isAdmin: false };
    loadCanonicalTeamByIdMock.mockReset();
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Admin Only Team',
      organizationId: 'org_1',
      visibility: 'ADMIN_ONLY',
    });
    canonicalFindUniqueMock.mockResolvedValueOnce({ organizationId: 'org_1' });
    organizationFindUniqueMock.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });
    hasOrgPermissionMock.mockResolvedValueOnce(true);
    isAdminOnlyCanonicalTeamMock.mockReturnValue(true);
    getOptionalSessionMock.mockResolvedValue(session);

    const response = await GET(
      new NextRequest('http://localhost/api/teams/team_1'),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(
      session,
      { id: 'org_1', ownerId: 'owner_1' },
      'teams.manage',
    );
    expect(payload).toMatchObject({
      id: 'team_1',
      visibility: 'ADMIN_ONLY',
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
    expect(syncCanonicalTeamFutureEventSnapshotsMock).toHaveBeenCalledWith(expect.objectContaining({
      tx: txClientMock,
      canonicalTeamId: 'team_1',
      createdBy: 'manager_1',
      now: expect.any(Date),
    }));
    expect(teamUpdateMock).not.toHaveBeenCalled();
    expect(syncTeamChatInTxMock).toHaveBeenCalledWith(txClientMock, 'team_1', expect.any(Object));
    expect(payload.name).toBe('Sandstorm');
  });

  it('syncs canonical player removals through future event team snapshots', async () => {
    loadCanonicalTeamByIdMock.mockReset();
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'Team One',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'Beach Volleyball',
      playerIds: ['manager_1'],
      captainId: 'manager_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    });
    loadCanonicalTeamByIdMock.mockResolvedValueOnce({
      id: 'team_1',
      name: 'Team One',
      division: 'Open',
      divisionTypeId: 'open',
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

    const response = await PATCH(
      patchJson({ team: { playerIds: ['manager_1'] } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      playerIds: ['manager_1'],
    }), txClientMock);
    expect(syncCanonicalTeamFutureEventSnapshotsMock).toHaveBeenCalledWith(expect.objectContaining({
      canonicalTeamId: 'team_1',
      tx: txClientMock,
    }));
    expect(payload.playerIds).toEqual(['manager_1']);
  });

  it('treats verified Razumly admins as admins for canonical roster patches', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'raz_admin_1', isAdmin: false });
    evaluateRazumlyAdminAccessMock.mockResolvedValueOnce({
      allowed: true,
      email: 'admin@razumly.com',
      verified: true,
    });

    const response = await PATCH(
      patchJson({ team: { playerIds: ['manager_1'] } }),
      { params: Promise.resolve({ id: 'team_1' }) },
    );

    expect(response.status).toBe(200);
    expect(canManageCanonicalTeamMock).toHaveBeenCalledWith({
      teamId: 'team_1',
      userId: 'raz_admin_1',
      isAdmin: true,
    }, prismaMock);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      playerIds: ['manager_1'],
    }), txClientMock);
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
