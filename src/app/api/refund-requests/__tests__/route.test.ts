/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  refundRequests: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { PATCH } from '@/app/api/refund-requests/[id]/route';

const jsonPatch = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PATCH /api/refund-requests/[id]', () => {
  const existingRequest = {
    id: 'refund_1',
    eventId: 'event_1',
    userId: 'requester_1',
    hostId: 'host_1',
    teamId: 'team_1',
    organizationId: 'org_1',
    reason: 'team_refund_requested',
    status: 'WAITING',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);

    prismaMock.refundRequests.findUnique.mockResolvedValue(existingRequest);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: 'org_1',
    });
    prismaMock.refundRequests.update.mockResolvedValue({
      ...existingRequest,
      status: 'APPROVED',
      updatedAt: new Date('2026-02-25T12:00:00.000Z'),
    });
    prismaMock.refundRequests.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'fanout_1' });

    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: ['coach_1'],
      playerIds: ['player_1', 'player_2'],
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it('rejects users who cannot manage the event', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const response = await PATCH(
      jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
      { params: Promise.resolve({ id: 'refund_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('fans out team-level approval to split-bill user owners', async () => {
    prismaMock.bills.findMany
      .mockResolvedValueOnce([{ id: 'team_bill_1' }])
      .mockResolvedValueOnce([
        { id: 'user_bill_1', ownerId: 'split_user_1' },
        { id: 'user_bill_2', ownerId: 'split_user_2' },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([]);
    prismaMock.refundRequests.findMany.mockResolvedValueOnce([]);

    const response = await PATCH(
      jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
      { params: Promise.resolve({ id: 'refund_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fanoutUserIds).toEqual(['split_user_1', 'split_user_2']);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledTimes(2);

    const createdUserIds = prismaMock.refundRequests.create.mock.calls.map(
      ([arg]: [{ data: { userId: string } }]) => arg.data.userId,
    );
    expect(createdUserIds).toEqual(expect.arrayContaining(['split_user_1', 'split_user_2']));

    for (const [arg] of prismaMock.refundRequests.create.mock.calls) {
      expect(arg).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: 'event_1',
            teamId: 'team_1',
            reason: 'team_refund_fanout',
            status: 'APPROVED',
          }),
        }),
      );
    }
  });

  it('updates existing team fanout rows idempotently on re-approval', async () => {
    prismaMock.bills.findMany
      .mockResolvedValueOnce([{ id: 'team_bill_1' }])
      .mockResolvedValueOnce([{ id: 'user_bill_1', ownerId: 'split_user_1' }])
      .mockResolvedValueOnce([]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([]);
    prismaMock.refundRequests.findMany.mockResolvedValueOnce([
      { id: 'fanout_existing_1', userId: 'split_user_1' },
    ]);

    const response = await PATCH(
      jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
      { params: Promise.resolve({ id: 'refund_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fanoutUserIds).toEqual(['split_user_1']);
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
    expect(prismaMock.refundRequests.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.refundRequests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'fanout_existing_1' },
        data: expect.objectContaining({
          status: 'APPROVED',
        }),
      }),
    );
  });
});
