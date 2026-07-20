/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const verifyTeamInviteShareLinkMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const acceptTeamInviteWithGuardianRulesMock = jest.fn();

const txMock = {
  invites: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teamStaffAssignments: {
    upsert: jest.fn(),
  },
};

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/teamInviteLinks', () => ({
  verifyTeamInviteShareLink: (...args: any[]) => verifyTeamInviteShareLinkMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeIdList: (value: unknown) => Array.isArray(value) ? value : [],
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teams/teamGuardianInvites', () => ({
  acceptTeamInviteWithGuardianRules: (...args: any[]) => acceptTeamInviteWithGuardianRulesMock(...args),
}));

import { POST } from '@/app/api/team-invites/[id]/claim/route';

describe('/api/team-invites/[id]/claim POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'new_manager_1', isAdmin: false });
    verifyTeamInviteShareLinkMock.mockReturnValue(true);
    txMock.invites.updateMany.mockResolvedValue({ count: 1 });
    txMock.teamStaffAssignments.upsert.mockResolvedValue({});
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      teamSize: 6,
      playerIds: ['creator_1'],
      pending: [],
      captainId: 'creator_1',
      managerId: 'creator_1',
      headCoachId: null,
      coachIds: [],
    });
    acceptTeamInviteWithGuardianRulesMock.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it('claims an unregistered manager as staff without consuming a player slot', async () => {
    const pendingInvite = {
      id: 'invite_manager_1',
      type: 'TEAM',
      teamId: 'team_1',
      userId: null,
      createdBy: 'creator_1',
      status: 'PENDING',
      staffTypes: ['MANAGER'],
      linkVersion: 1,
      linkExpiresAt: new Date(Date.now() + 60_000),
    };
    const claimedInvite = { ...pendingInvite, userId: 'new_manager_1', claimedBy: 'new_manager_1' };
    prismaMock.invites.findUnique.mockResolvedValue(pendingInvite);
    txMock.invites.findUnique.mockResolvedValue(claimedInvite);

    const response = await POST(
      new NextRequest('http://localhost/api/team-invites/invite_manager_1/claim?v=1&e=1&s=signed', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_manager_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(txMock.teamStaffAssignments.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        teamId: 'team_1',
        userId: 'new_manager_1',
        role: 'MANAGER',
        status: 'INVITED',
      }),
    }));
    expect(syncCanonicalTeamRosterMock).not.toHaveBeenCalled();
    expect(acceptTeamInviteWithGuardianRulesMock).toHaveBeenCalledWith(expect.objectContaining({
      invite: claimedInvite,
      session: { userId: 'new_manager_1', isAdmin: false },
    }));
  });
});
