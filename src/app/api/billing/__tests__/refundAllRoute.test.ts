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
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { POST } from '@/app/api/billing/refund-all/route';
import { buildRefundScopeSnapshot, type RefundRequestRow } from '@/server/refunds/refundExecution';

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
      playerIds: ['manager_1', 'player_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.findMany.mockResolvedValue([]);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.refundRequests.createMany.mockResolvedValue({ count: 0 });
    prismaMock.bills.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.ownerType === 'TEAM') {
        return Promise.resolve([{ id: 'team_bill_1' }]);
      }
      return Promise.resolve([]);
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_team_1',
        payerUserId: 'manager_1',
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        id: 'event_1__team__team_1',
        eventId: 'event_1',
        registrantId: 'team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
  });

  it('rejects team-level refunds from event managers who are not team managers', async () => {
    canManageEventMock.mockResolvedValueOnce(true);

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

  it('allows a team manager to create a team-level request without event management permissions', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'manager_1', isAdmin: false });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedByUserId: 'manager_1',
          billIds: ['team_bill_1'],
          paymentIds: ['payment_team_1'],
          paymentScope: [{
            paymentId: 'payment_team_1',
            billId: 'team_bill_1',
            refundableAmountCents: 5000,
            currency: 'usd',
          }],
          requestedAmountCents: 5000,
          policyDecision: 'HOST_REVIEW_REQUIRED',
          scopeVersion: 2,
          scopeHash: expect.any(String),
        }),
      }),
    );
  });

  it('dedupes an existing waiting team-level request', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'manager_1', isAdmin: false });
    const existingRequest: RefundRequestRow = {
      id: 'refund_existing',
      eventId: 'event_1',
      userId: 'manager_1',
      requestedByUserId: 'manager_1',
      hostId: 'host_1',
      teamId: 'team_1',
      organizationId: 'org_1',
      reason: 'team_refund_requested',
      status: 'WAITING',
    };
    const scope = buildRefundScopeSnapshot(existingRequest, [{
      id: 'payment_team_1',
      billId: 'team_bill_1',
      amountCents: 5000,
      refundedAmountCents: 0,
      paymentIntentId: 'pi_team_1',
      payerUserId: 'manager_1',
      refundableAmountCents: 5000,
    }], 'HOST_REVIEW_REQUIRED');
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({ ...existingRequest, ...scope });

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

  it('replaces a legacy waiting team request with a verified payment snapshot', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'manager_1', isAdmin: false });
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({
      id: 'legacy_refund',
      eventId: 'event_1',
      userId: 'manager_1',
      requestedByUserId: null,
      hostId: 'host_1',
      teamId: 'team_1',
      organizationId: 'org_1',
      reason: 'team_refund_requested',
      status: 'WAITING',
      billIds: [],
      paymentIds: [],
      requestedAmountCents: 0,
      currency: 'usd',
      policyDecision: null,
      scopeVersion: 1,
      scopeHash: null,
      slotId: null,
      occurrenceDate: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund-all', {
        eventId: 'event_1',
        teamId: 'team_1',
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentIds: ['payment_team_1'],
          scopeHash: expect.any(String),
        }),
      }),
    );
  });

  it('creates event-wide requests one at a time only when each user has a refundable payment', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_1__self__user_2',
        eventId: 'event_1',
        registrantId: 'user_2',
        eventTeamId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.refundRequests.findMany.mockResolvedValueOnce([]);
    prismaMock.bills.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.ownerType === 'USER' && where.ownerId === 'user_2') {
        return Promise.resolve([{ id: 'user_2_bill' }]);
      }
      return Promise.resolve([]);
    });
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'user_2_payment',
        billId: 'user_2_bill',
        amountCents: 2500,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_user_2',
        payerUserId: 'user_2',
      },
    ]);

    const response = await POST(jsonPost('http://localhost/api/billing/refund-all', {
      eventId: 'event_1',
    }));

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_2',
          requestedByUserId: 'host_1',
          billIds: ['user_2_bill'],
          paymentIds: ['user_2_payment'],
          requestedAmountCents: 2500,
          scopeHash: expect.any(String),
        }),
      }),
    );
    expect(prismaMock.refundRequests.createMany).not.toHaveBeenCalled();
  });

  it('rejects team-level requests from non-admins who are not the team manager', async () => {
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
