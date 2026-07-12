/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripeRefundCreate = jest.fn();
const mockStripePaymentIntentRetrieve = jest.fn();

jest.mock('stripe', () => (
  jest.fn().mockImplementation(() => ({
    refunds: {
      create: (...args: unknown[]) => mockStripeRefundCreate(...args),
    },
    paymentIntents: {
      retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
    },
  }))
));

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teams: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  timeSlots: {
    findUnique: jest.fn(),
  },
  refundRequests: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/refund/route';
import { buildRefundScopeSnapshot } from '@/server/refunds/refundExecution';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/refund', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeRefundCreate.mockReset();
    mockStripePaymentIntentRetrieve.mockReset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      cancellationRefundHours: null,
      hostId: 'host_1',
      organizationId: 'org_1',
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.teams.findFirst.mockResolvedValue(null);
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.timeSlots.findUnique.mockResolvedValue(null);
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.refundRequests.update.mockResolvedValue({ id: 'refund_1', status: 'APPROVED' });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findUnique.mockResolvedValue(null);
    prismaMock.billPayments.update.mockResolvedValue({ id: 'payment_1', refundedAmountCents: 5000 });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        id: 'event_1__self__user_1',
        eventId: 'event_1',
        registrantId: 'user_1',
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
    mockStripePaymentIntentRetrieve.mockResolvedValue({ id: 'pi_1', transfer_data: null });
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
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          registrantId: 'user_1',
          registrantType: { in: ['SELF', 'CHILD'] },
          rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
        }),
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      }),
    );
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          eventId: 'event_1',
          reason: 'Need to cancel',
          status: 'WAITING',
        }),
      }),
    );
  });

  it('auto refunds immediately when the event is inside the configured refund window', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date(Date.now() + 72 * 60 * 60 * 1000),
      cancellationRefundHours: 24,
      hostId: 'host_1',
      organizationId: 'org_1',
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_1',
      },
    ]);
    mockStripeRefundCreate.mockResolvedValueOnce({ id: 're_1' });
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'payment_1',
      amountCents: 5000,
      refundedAmountCents: 0,
    });
    mockStripePaymentIntentRetrieve.mockResolvedValueOnce({
      id: 'pi_1',
      transfer_data: { destination: 'acct_connected_123' },
    });
    prismaMock.refundRequests.create.mockResolvedValueOnce({
      id: 'refund_1',
      status: 'APPROVED',
    });
    prismaMock.billPayments.update.mockResolvedValueOnce({
      id: 'payment_1',
      refundedAmountCents: 5000,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        reason: 'Need to cancel',
      }),
    );
    const payload = await response.json();
    const createdRequestId = prismaMock.refundRequests.create.mock.calls[0]?.[0]?.data?.id;

    expect(response.status).toBe(200);
    expect(mockStripeRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_1',
        amount: 5000,
        reverse_transfer: true,
        metadata: expect.objectContaining({
          refund_request_id: createdRequestId,
          user_id: 'user_1',
          bill_payment_id: 'payment_1',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: `refund-request:${createdRequestId}:payment:payment_1`,
      }),
    );
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          userId: 'user_1',
          reason: 'Need to cancel',
          status: 'APPROVED',
        }),
      }),
    );
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_1' },
        data: expect.objectContaining({
          refundedAmountCents: 5000,
        }),
      }),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        refundId: 'refund_1',
        refundStatus: 'APPROVED',
        refundedAmountCents: 5000,
        stripeRefundIds: ['re_1'],
        refundedPaymentIds: ['payment_1'],
      }),
    );
  });

  it('rejects an automatic retry when the stored payment scope has drifted', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date(Date.now() + 72 * 60 * 60 * 1000),
      cancellationRefundHours: 24,
      hostId: 'host_1',
      organizationId: 'org_1',
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
    });
    const existingRequest = {
      id: 'refund_existing',
      eventId: 'event_1',
      userId: 'user_1',
      requestedByUserId: 'user_1',
      hostId: 'host_1',
      teamId: null,
      organizationId: 'org_1',
      reason: 'Need to cancel',
      status: 'APPROVED' as const,
      slotId: null,
      occurrenceDate: null,
    };
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({
      ...existingRequest,
      ...buildRefundScopeSnapshot(existingRequest, [{
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_1',
        payerUserId: 'user_1',
      }], 'AUTO_APPROVED'),
    });
    prismaMock.billPayments.findMany.mockResolvedValueOnce([{
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 4000,
      refundedAmountCents: 0,
      paymentIntentId: 'pi_1',
      payerUserId: 'user_1',
    }]);

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        reason: 'Need to cancel',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain('payment scope changed');
    expect(mockStripeRefundCreate).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('uses the weekly occurrence start and bill scope for automatic session refunds', async () => {
    const futureOccurrence = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const occurrenceDate = futureOccurrence.toISOString().slice(0, 10);
    const occurrenceDay = (futureOccurrence.getUTCDay() + 6) % 7;
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'weekly_parent',
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      cancellationRefundHours: 24,
      hostId: 'host_1',
      organizationId: 'org_1',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlotIds: ['slot_1'],
      divisions: [],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      startTimeMinutes: 12 * 60,
      daysOfWeek: [occurrenceDay],
      startDate: occurrenceDate,
      endDate: occurrenceDate,
      divisions: [],
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: `weekly_parent__self__user_1__slot_1__${occurrenceDate}`,
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_1',
      },
    ]);
    mockStripeRefundCreate.mockResolvedValueOnce({ id: 're_1' });
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'payment_1',
      amountCents: 5000,
      refundedAmountCents: 0,
    });
    prismaMock.billPayments.update.mockResolvedValueOnce({
      id: 'payment_1',
      refundedAmountCents: 5000,
    });
    prismaMock.refundRequests.create.mockResolvedValueOnce({
      id: 'refund_1',
      status: 'APPROVED',
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'weekly_parent' },
        reason: 'Need to cancel this session',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refundStatus).toBe('APPROVED');
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'weekly_parent',
        ownerType: 'USER',
        ownerId: 'user_1',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    }));
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    }));
    expect(mockStripeRefundCreate).toHaveBeenCalledTimes(1);
  });

  it('persists the exact weekly occurrence and payment scope for a manual refund review', async () => {
    const futureOccurrence = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const occurrenceDate = futureOccurrence.toISOString().slice(0, 10);
    const occurrenceDay = (futureOccurrence.getUTCDay() + 6) % 7;
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'weekly_parent',
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      cancellationRefundHours: null,
      hostId: 'host_1',
      organizationId: 'org_1',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlotIds: ['slot_1'],
      divisions: [],
    });
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      startTimeMinutes: 12 * 60,
      daysOfWeek: [occurrenceDay],
      startDate: occurrenceDate,
      endDate: occurrenceDate,
      divisions: [],
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: `weekly_parent__self__user_1__slot_1__${occurrenceDate}`,
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_weekly_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_weekly_1',
        billId: 'bill_weekly_1',
        amountCents: 2500,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_weekly_1',
        status: 'PAID',
      },
    ]);

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'weekly_parent' },
        reason: 'Need host approval for this session',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      refundAlreadyPending: false,
    }));
    expect(mockStripeRefundCreate).not.toHaveBeenCalled();
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventId: 'weekly_parent',
        userId: 'user_1',
        slotId: 'slot_1',
        occurrenceDate,
        billIds: ['bill_weekly_1'],
        paymentIds: ['payment_weekly_1'],
        paymentScope: [{
          paymentId: 'payment_weekly_1',
          billId: 'bill_weekly_1',
          refundableAmountCents: 2500,
          currency: 'usd',
        }],
        requestedAmountCents: 2500,
        currency: 'usd',
        policyDecision: 'HOST_REVIEW_REQUIRED',
        scopeVersion: 2,
        scopeHash: expect.any(String),
        status: 'WAITING',
      }),
    }));
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    }));
  });

  it('allows a parent to request refund for a linked child target', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_1__child__child_1',
        eventId: 'event_1',
        registrantId: 'child_1',
        registrantType: 'CHILD',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      cancellationRefundHours: null,
      hostId: 'host_1',
      organizationId: 'org_1',
      teamIds: [],
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
    const existingRequest = {
      id: 'refund_existing',
      eventId: 'event_1',
      userId: 'user_1',
      requestedByUserId: 'user_1',
      hostId: 'host_1',
      teamId: null,
      organizationId: 'org_1',
      reason: 'requested_by_customer',
      status: 'WAITING' as const,
      slotId: null,
      occurrenceDate: null,
    };
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({
      ...existingRequest,
      ...buildRefundScopeSnapshot(existingRequest, [{
        id: 'payment_existing',
        billId: 'bill_existing',
        amountCents: 5000,
        refundedAmountCents: 0,
        refundableAmountCents: 5000,
        paymentIntentId: 'pi_existing',
        payerUserId: 'user_1',
      }], 'HOST_REVIEW_REQUIRED'),
    });

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

  it('reissues an invalid legacy waiting request instead of leaving it unapprovable', async () => {
    prismaMock.refundRequests.findFirst.mockResolvedValueOnce({
      id: 'legacy_refund',
      eventId: 'event_1',
      userId: 'user_1',
      requestedByUserId: 'user_1',
      hostId: 'host_1',
      teamId: null,
      organizationId: 'org_1',
      reason: 'requested_by_customer',
      status: 'WAITING',
      slotId: null,
      occurrenceDate: null,
      billIds: ['bill_legacy'],
      paymentIds: ['payment_legacy'],
      paymentScope: [],
      requestedAmountCents: 5000,
      currency: 'usd',
      policyDecision: 'HOST_REVIEW_REQUIRED',
      scopeVersion: 1,
      scopeHash: 'legacy_scope_hash',
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([{
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 5000,
      refundedAmountCents: 0,
      paymentIntentId: 'pi_1',
      payerUserId: 'user_1',
    }]);

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refundAlreadyPending).toBe(false);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentIds: ['payment_1'],
        paymentScope: [{
          paymentId: 'payment_1',
          billId: 'bill_1',
          refundableAmountCents: 5000,
          currency: 'usd',
        }],
        scopeVersion: 2,
      }),
    }));
  });

  it('allows refund requests for users registered through an event team slot', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'team_player_1', isAdmin: false });
    prismaMock.eventRegistrations.findMany.mockResolvedValueOnce([
      {
        id: 'event_1__team__slot_team_1',
        eventId: 'event_1',
        registrantId: 'slot_team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      cancellationRefundHours: null,
      hostId: 'host_1',
      organizationId: 'org_1',
      teamIds: ['slot_team_1'],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.teams.findFirst.mockResolvedValueOnce({ id: 'slot_team_1' });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'slot_team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: [],
      playerIds: ['team_player_1'],
      parentTeamId: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/billing/refund', {
        payloadEvent: { id: 'event_1' },
        userId: 'team_player_1',
        reason: 'Unable to attend',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.targetUserId).toBe('team_player_1');
    expect(prismaMock.teams.findFirst).toHaveBeenCalledWith({
      where: {
        id: { in: ['slot_team_1'] },
        OR: [
          { playerIds: { has: 'team_player_1' } },
          { captainId: 'team_player_1' },
          { managerId: 'team_player_1' },
          { headCoachId: 'team_player_1' },
          { coachIds: { has: 'team_player_1' } },
        ],
      },
      select: { id: true },
    });
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          userId: 'team_player_1',
          teamId: 'slot_team_1',
          reason: 'Unable to attend',
        }),
      }),
    );
  });
});
