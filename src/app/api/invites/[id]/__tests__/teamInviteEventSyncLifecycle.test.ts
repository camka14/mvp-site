/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const acceptTeamInviteEventSyncsMock = jest.fn();
const rollbackTeamInviteEventSyncsMock = jest.fn();
const removeCanonicalPendingInviteeMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();

const txMock = {
  invites: {
    delete: jest.fn(),
    update: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const invite = {
  id: 'invite_1',
  type: 'TEAM',
  status: 'PENDING',
  teamId: 'team_1',
  userId: 'free_1',
  createdBy: 'manager_1',
};

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teams/teamInviteEventSync', () => ({
  acceptTeamInviteEventSyncs: (...args: any[]) => acceptTeamInviteEventSyncsMock(...args),
  rollbackTeamInviteEventSyncs: (...args: any[]) => rollbackTeamInviteEventSyncsMock(...args),
  removeCanonicalPendingInvitee: (...args: any[]) => removeCanonicalPendingInviteeMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: jest.fn(() => ['manager_1']),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
  canManageOrganization: jest.fn(),
}));

import { POST as acceptInvite } from '@/app/api/invites/[id]/accept/route';
import { POST as declineInvite } from '@/app/api/invites/[id]/decline/route';
import { DELETE as deleteInvite } from '@/app/api/invites/[id]/route';

describe('team invite event-team sync lifecycle routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'free_1', isAdmin: false });
    prismaMock.invites.findUnique.mockResolvedValue(invite);
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      playerIds: ['manager_1'],
      pending: ['free_1'],
      captainId: 'manager_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: [],
    });
    syncCanonicalTeamRosterMock.mockResolvedValue(undefined);
    acceptTeamInviteEventSyncsMock.mockResolvedValue(undefined);
    rollbackTeamInviteEventSyncsMock.mockResolvedValue(undefined);
    removeCanonicalPendingInviteeMock.mockResolvedValue(undefined);
    syncTeamChatInTxMock.mockResolvedValue(undefined);
    txMock.invites.delete.mockResolvedValue({});
    txMock.invites.update.mockResolvedValue({});
    txMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      pending: ['free_1'],
    });
    txMock.teams.update.mockResolvedValue({});
  });

  it('accepting a team invite accepts pending event-team sync rows before deleting the invite', async () => {
    const response = await acceptInvite(
      new NextRequest('http://localhost/api/invites/invite_1/accept', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalled();
    expect(acceptTeamInviteEventSyncsMock).toHaveBeenCalledWith(txMock, invite, expect.any(Date));
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });

  it('declining a team invite rolls back event-team sync rows and removes pending canonical membership', async () => {
    const response = await declineInvite(
      new NextRequest('http://localhost/api/invites/invite_1/decline', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    expect(rollbackTeamInviteEventSyncsMock).toHaveBeenCalledWith(txMock, invite, 'DECLINED', expect.any(Date));
    expect(removeCanonicalPendingInviteeMock).toHaveBeenCalledWith(txMock, invite, 'free_1', expect.any(Date));
    expect(txMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: {
        status: 'DECLINED',
        updatedAt: expect.any(Date),
      },
    });
  });

  it('deleting a team invite rolls back event-team sync rows before deleting the invite', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    const response = await deleteInvite(
      new NextRequest('http://localhost/api/invites/invite_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    expect(rollbackTeamInviteEventSyncsMock).toHaveBeenCalledWith(txMock, invite, 'CANCELLED', expect.any(Date));
    expect(removeCanonicalPendingInviteeMock).toHaveBeenCalledWith(txMock, invite, 'manager_1', expect.any(Date));
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });
});
