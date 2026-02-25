/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  refundRequests: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { POST } from '@/app/api/billing/refund-all/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/refund-all', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'requester_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(false);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: ['assistant_1'],
      organizationId: 'org_1',
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: ['coach_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.refundRequests.createMany.mockResolvedValue({ count: 0 });
  });

  it('allows event managers to create a team-level waiting refund request', async () => {
    canManageEventMock.mockResolvedValueOnce(true);

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refundAlreadyPending).toBe(false);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          teamId: 'team_1',
          userId: 'requester_1',
          reason: 'team_refund_requested',
          status: 'WAITING',
        }),
      }),
    );
  });

  it('allows a team manager to create a team-level request without event management permissions', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'manager_1', isAdmin: false });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledTimes(1);
  });

  it('dedupes an existing waiting team-level request', async () => {
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({ id: 'refund_existing' });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refundAlreadyPending).toBe(true);
    expect(payload.refundId).toBe('refund_existing');
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });

  it('rejects team-level requests from non-admins who cannot manage the event or team', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'random_user', isAdmin: false });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });
});
