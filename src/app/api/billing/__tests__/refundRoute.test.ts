/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refundRequests: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/refund/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/refund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      organizationId: 'org_1',
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it('creates a refund request for the current user and withdraws them from event state', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        reason: 'Need to cancel',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.targetUserId).toBe('user_1');
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          userIds: [],
          waitListIds: [],
          freeAgentIds: [],
        }),
      }),
    );
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          eventId: 'event_1',
          reason: 'Need to cancel',
        }),
      }),
    );
  });

  it('allows a parent to request refund for a linked child target', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      organizationId: 'org_1',
      userIds: ['child_1'],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        userId: 'child_1',
        reason: 'Family conflict',
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).toHaveBeenCalledWith({
      where: {
        parentId: 'parent_1',
        childId: 'child_1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'child_1',
        }),
      }),
    );
  });

  it('rejects unrelated child target refund requests', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        userId: 'child_1',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.events.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });

  it('does not create duplicate waiting refunds for the same event and target user', async () => {
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({ id: 'refund_existing' });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refundAlreadyPending).toBe(true);
    expect(payload.refundId).toBe('refund_existing');
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });
});
