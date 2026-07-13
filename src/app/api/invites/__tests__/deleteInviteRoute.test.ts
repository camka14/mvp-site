/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const canManageOrganizationMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: any[]) => canManageEventMock(...args),
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: any[]) => acquireEventLockMock(...args),
}));

import { DELETE } from '@/app/api/invites/[id]/route';

const deleteRequest = () => new NextRequest('http://localhost/api/invites/invite_1', { method: 'DELETE' });

describe('DELETE /api/invites/[id]', () => {
  const txMock = {
    invites: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    events: {
      findUnique: jest.fn(),
    },
    teams: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
    txMock.invites.findUnique.mockImplementation((args) => prismaMock.invites.findUnique(args));
    txMock.events.findUnique.mockImplementation((args) => prismaMock.events.findUnique(args));
    txMock.invites.delete.mockResolvedValue({ id: 'invite_1' });
    txMock.teams.findUnique.mockResolvedValue(null);
    canManageEventMock.mockResolvedValue(false);
    canManageOrganizationMock.mockResolvedValue(false);
  });

  it('allows an event manager to delete a staff invite they did not create', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      organizationId: null,
      userId: 'invitee_1',
      createdBy: 'creator_1',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: null,
    });
    canManageEventMock.mockResolvedValue(true);

    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(acquireEventLockMock.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.invites.findUnique.mock.invocationCallOrder[0],
    );
    expect(canManageEventMock).toHaveBeenCalledWith(
      { userId: 'manager_1', isAdmin: false },
      expect.objectContaining({ hostId: 'host_1' }),
      txMock,
    );
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });

  it('keeps returning forbidden for unrelated users', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      organizationId: null,
      userId: 'invitee_1',
      createdBy: 'creator_1',
    });
    prismaMock.events.findUnique.mockResolvedValue({
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    canManageEventMock.mockResolvedValue(false);

    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(txMock.invites.delete).not.toHaveBeenCalled();
  });
});
