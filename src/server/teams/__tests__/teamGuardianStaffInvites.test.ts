/** @jest-environment node */

const loadCanonicalTeamByIdMock = jest.fn();
const updateManyMock = jest.fn();
const inviteDeleteManyMock = jest.fn();
const inviteUpdateMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();

const txMock: any = {
  teamStaffAssignments: { updateMany: (...args: any[]) => updateManyMock(...args) },
  invites: {
    deleteMany: (...args: any[]) => inviteDeleteManyMock(...args),
    update: (...args: any[]) => inviteUpdateMock(...args),
  },
};

const prismaMock: any = {
  userData: { findUnique: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01T00:00:00.000Z') }) },
  parentChildLinks: { findFirst: jest.fn() },
  $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(txMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
  normalizeIdList: (value: unknown) => Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [],
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: jest.fn(() => []),
  syncTeamChatInTx: jest.fn(),
}));
jest.mock('@/server/teams/teamInviteEventSync', () => ({
  acceptTeamInviteEventSyncs: jest.fn(),
  removeCanonicalPendingInvitee: jest.fn(),
  rollbackTeamInviteEventSyncs: jest.fn(),
}));
jest.mock('@/server/teams/teamChildRegistration', () => ({ reserveChildTeamRegistrationForGuardian: jest.fn() }));

import {
  acceptTeamInviteWithGuardianRules,
  declineTeamInviteWithGuardianRules,
} from '@/server/teams/teamGuardianInvites';

describe('team staff invite lifecycle', () => {
  const team = {
    id: 'team_1',
    pending: [],
    playerIds: [],
    staffAssignments: [
      { userId: 'creator_1', role: 'MANAGER', status: 'ACTIVE' },
      { userId: 'manager_2', role: 'MANAGER', status: 'INVITED' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.userData.findUnique.mockResolvedValue({ dateOfBirth: new Date('1990-01-01T00:00:00.000Z') });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(txMock));
    loadCanonicalTeamByIdMock.mockResolvedValue(team);
    updateManyMock.mockResolvedValue({ count: 1 });
    inviteDeleteManyMock.mockResolvedValue({ count: 1 });
    inviteUpdateMock.mockResolvedValue({});
    syncCanonicalTeamRosterMock.mockResolvedValue({ createdPendingInvites: [] });
  });

  it('activates an invited manager and retires the temporary manager after acceptance', async () => {
    const result = await acceptTeamInviteWithGuardianRules({
      invite: { id: 'invite_1', type: 'TEAM', teamId: 'team_1', userId: 'manager_2', createdBy: 'creator_1' },
      session: { userId: 'manager_2' },
    });

    expect(result.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teamId: 'team_1', role: 'MANAGER', status: 'ACTIVE' }),
      data: expect.objectContaining({ status: 'REMOVED' }),
    }));
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ teamId: 'team_1', userId: 'manager_2', role: 'MANAGER', status: 'INVITED' }),
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });

  it('removes pending staff assignments when the invite is declined', async () => {
    const result = await declineTeamInviteWithGuardianRules({
      invite: { id: 'invite_1', type: 'TEAM', teamId: 'team_1', userId: 'manager_2', createdBy: 'creator_1' },
      session: { userId: 'manager_2' },
    });

    expect(result.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId: 'team_1', userId: 'manager_2', status: 'INVITED' },
      data: expect.objectContaining({ status: 'REMOVED' }),
    }));
  });

  it('keeps an invited staff role active through a combined player acceptance', async () => {
    const combinedTeam = {
      ...team,
      pending: ['manager_2'],
    };
    loadCanonicalTeamByIdMock.mockResolvedValue(combinedTeam);

    const result = await acceptTeamInviteWithGuardianRules({
      invite: { id: 'invite_combined', type: 'TEAM', teamId: 'team_1', userId: 'manager_2', createdBy: 'creator_1' },
      session: { userId: 'manager_2' },
    });

    expect(result.status).toBe(200);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team_1',
      preserveInvitedStaffAssignments: true,
    }), txMock);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'manager_2', role: 'MANAGER', status: 'INVITED' }),
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });
});
