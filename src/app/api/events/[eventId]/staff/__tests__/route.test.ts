/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  events: {
    findUnique: jest.fn(),
  },
  invites: {
    updateMany: jest.fn(),
  },
};
const prismaMock = {
  ...txMock,
  $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const acquireEventLockMock = jest.fn();
const loadEventStaffSnapshotMock = jest.fn();
const loadLockedEventStaffSnapshotMock = jest.fn();
const reconcileEventStaffDesiredStateMock = jest.fn();
const sendInviteEmailsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
}));
jest.mock('@/server/inviteEmails', () => ({
  sendInviteEmails: (...args: unknown[]) => sendInviteEmailsMock(...args),
}));
jest.mock('@/lib/requestOrigin', () => ({
  getRequestOrigin: () => 'http://localhost',
}));
jest.mock('@/server/events/eventStaffReconciliation', () => {
  const actual = jest.requireActual('@/server/events/eventStaffReconciliation');
  return {
    ...actual,
    loadEventStaffSnapshot: (...args: unknown[]) => loadEventStaffSnapshotMock(...args),
    loadLockedEventStaffSnapshot: (...args: unknown[]) => loadLockedEventStaffSnapshotMock(...args),
    reconcileEventStaffDesiredState: (...args: unknown[]) => reconcileEventStaffDesiredStateMock(...args),
  };
});

import { GET, PUT } from '@/app/api/events/[eventId]/staff/route';
import { EventStaffRevisionConflictError } from '@/server/events/eventStaffReconciliation';

const params = { params: Promise.resolve({ eventId: 'event_1' }) };
const putRequest = (body: unknown) => new NextRequest('http://localhost/api/events/event_1/staff', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const validBody = {
  contractVersion: 1,
  expectedRevision: 'revision_1',
  assistantHostIds: ['assistant_1'],
  eventOfficials: [{
    userId: 'official_1',
    positionIds: ['position_1'],
    fieldIds: [],
    isActive: true,
  }],
  pendingInvites: [],
};

describe('/api/events/[eventId]/staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    acquireEventLockMock.mockResolvedValue(undefined);
    txMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      state: 'PUBLISHED',
    });
    const snapshot = {
      contractVersion: 1,
      eventId: 'event_1',
      revision: 'revision_2',
      assistantHostIds: ['assistant_1'],
      eventOfficials: [],
      officialIds: [],
      staffInvites: [],
    };
    loadEventStaffSnapshotMock.mockResolvedValue(snapshot);
    loadLockedEventStaffSnapshotMock.mockResolvedValue(snapshot);
    txMock.invites.updateMany.mockResolvedValue({ count: 0 });
    reconcileEventStaffDesiredStateMock.mockResolvedValue({
      snapshot: { eventId: 'event_1', revision: 'revision_2' },
      emailCandidates: [],
    });
    sendInviteEmailsMock.mockResolvedValue([]);
  });

  it('serializes an authorized GET under the event lock', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/staff'),
      params,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      eventId: 'event_1',
      revision: 'revision_2',
    }));
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(loadEventStaffSnapshotMock).toHaveBeenCalledWith(txMock, 'event_1');
  });

  it('does not disclose staff state to a viewer who cannot manage the event', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/staff'),
      params,
    );

    expect(response.status).toBe(403);
    expect(loadEventStaffSnapshotMock).not.toHaveBeenCalled();
  });

  it('requires authentication for GET', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/staff'),
      params,
    );

    expect(response.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requires authentication for PUT', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredStateMock).not.toHaveBeenCalled();
  });

  it('rejects PUT when the viewer cannot manage the event', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(403);
    expect(reconcileEventStaffDesiredStateMock).not.toHaveBeenCalled();
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
  });

  it('rejects malformed desired state before opening a transaction', async () => {
    const response = await PUT(putRequest({
      ...validBody,
      contractVersion: 2,
    }), params);

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(reconcileEventStaffDesiredStateMock).not.toHaveBeenCalled();
  });

  it('returns the stable conflict contract without sending email', async () => {
    reconcileEventStaffDesiredStateMock.mockRejectedValueOnce(
      new EventStaffRevisionConflictError('revision_current'),
    );

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Event staff changed. Reload and try again.',
      code: 'EVENT_STAFF_REVISION_CONFLICT',
      currentRevision: 'revision_current',
    });
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
    expect(loadEventStaffSnapshotMock).not.toHaveBeenCalled();
  });

  it('commits one desired-state transaction, delivers afterward, and returns the post-delivery snapshot', async () => {
    const emailCandidate = {
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      email: 'official@example.com',
      status: 'PENDING',
    };
    reconcileEventStaffDesiredStateMock.mockResolvedValueOnce({
      snapshot: { eventId: 'event_1', revision: 'revision_before_delivery' },
      emailCandidates: [emailCandidate],
    });

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(200);
    expect(reconcileEventStaffDesiredStateMock).toHaveBeenCalledWith(
      txMock,
      'event_1',
      expect.objectContaining({ expectedRevision: 'revision_1' }),
      'host_1',
    );
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([emailCandidate], 'http://localhost');
    expect(loadLockedEventStaffSnapshotMock).toHaveBeenCalledWith(prismaMock, 'event_1');
  });

  it('never sends delivery or reports success when reconciliation fails inside the transaction', async () => {
    reconcileEventStaffDesiredStateMock.mockRejectedValueOnce(new Error('injected official write failure'));

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(500);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
    expect(loadEventStaffSnapshotMock).not.toHaveBeenCalled();
    expect(loadLockedEventStaffSnapshotMock).not.toHaveBeenCalled();
  });

  it('marks candidates failed when delivery rejects so the next save can retry them', async () => {
    const emailCandidate = {
      id: 'invite_1',
      type: 'STAFF',
      eventId: 'event_1',
      email: 'official@example.com',
      status: 'PENDING',
    };
    reconcileEventStaffDesiredStateMock.mockResolvedValueOnce({
      snapshot: { eventId: 'event_1', revision: 'revision_before_delivery' },
      emailCandidates: [emailCandidate],
    });
    sendInviteEmailsMock.mockRejectedValueOnce(new Error('mail provider unavailable'));

    const response = await PUT(putRequest(validBody), params);

    expect(response.status).toBe(200);
    expect(txMock.invites.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['invite_1'] },
        eventId: 'event_1',
        type: 'STAFF',
        status: 'PENDING',
      },
      data: expect.objectContaining({
        status: 'FAILED',
        sentAt: null,
        updatedAt: expect.any(Date),
      }),
    });
    expect(acquireEventLockMock).toHaveBeenLastCalledWith(txMock, 'event_1');
    expect(loadLockedEventStaffSnapshotMock).toHaveBeenCalledWith(prismaMock, 'event_1');
  });
});
