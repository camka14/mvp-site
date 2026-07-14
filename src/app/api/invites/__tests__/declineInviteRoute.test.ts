/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  invites: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const declineTeamInviteWithGuardianRulesMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/teams/teamGuardianInvites', () => ({
  declineTeamInviteWithGuardianRules: (...args: unknown[]) => declineTeamInviteWithGuardianRulesMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
}));

import { POST } from '@/app/api/invites/[id]/decline/route';

const postRequest = () => new NextRequest('http://localhost/api/invites/invite_1/decline', {
  method: 'POST',
});

describe('POST /api/invites/[id]/decline', () => {
  const txMock = {
    invites: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));
    txMock.invites.findUnique.mockImplementation((args) => prismaMock.invites.findUnique(args));
    txMock.invites.update.mockResolvedValue({ id: 'invite_1', status: 'DECLINED' });
  });

  it('locks an event-scoped STAFF invite before re-authorizing and declining it', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      userId: 'user_1',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(acquireEventLockMock.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.invites.findUnique.mock.invocationCallOrder[0],
    );
    expect(txMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: {
        status: 'DECLINED',
        updatedAt: expect.any(Date),
      },
    });
  });

  it('does not mutate an event-scoped STAFF invite when the locked row is not for the session user', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      userId: 'other_user',
    });

    const response = await POST(
      postRequest(),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(txMock.invites.update).not.toHaveBeenCalled();
  });
});
