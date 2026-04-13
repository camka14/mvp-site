/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripeRefundCreate = jest.fn();
const mockStripePaymentIntentRetrieve = jest.fn();

jest.mock('stripe', () => (
  jest.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
    },
    refunds: {
      create: (...args: unknown[]) => mockStripeRefundCreate(...args),
    },
  }))
));

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
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));

import { GET as LIST_GET } from '@/app/api/refund-requests/route';
import { PATCH } from '@/app/api/refund-requests/[id]/route';

const jsonPatch = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('refund request routes', () => {
  const existingTeamRequest = {
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
    mockStripeRefundCreate.mockReset();
    mockStripePaymentIntentRetrieve.mockReset();
    requireSessionMock.mockReset();
    canManageEventMock.mockReset();
    prismaMock.refundRequests.findUnique.mockReset();
    prismaMock.refundRequests.findMany.mockReset();
    prismaMock.refundRequests.update.mockReset();
    prismaMock.refundRequests.create.mockReset();
    prismaMock.events.findUnique.mockReset();
    prismaMock.teams.findUnique.mockReset();
    prismaMock.bills.findMany.mockReset();
    prismaMock.billPayments.findMany.mockReset();
    prismaMock.billPayments.findUnique.mockReset();
    prismaMock.billPayments.update.mockReset();
    prismaMock.$transaction.mockReset();

    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);

    prismaMock.refundRequests.findUnique.mockResolvedValue(existingTeamRequest);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: 'org_1',
    });
    prismaMock.refundRequests.update.mockResolvedValue({
      ...existingTeamRequest,
      status: 'APPROVED',
      updatedAt: new Date('2026-02-25T12:00:00.000Z'),
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: ['coach_1'],
      playerIds: ['player_1', 'player_2'],
      parentTeamId: 'parent_team_1',
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findUnique.mockResolvedValue(null);
    prismaMock.billPayments.update.mockResolvedValue({ id: 'payment_1', refundedAmountCents: 5000 });
    mockStripePaymentIntentRetrieve.mockResolvedValue({ id: 'pi_default', transfer_data: null });

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  describe('PATCH /api/refund-requests/[id]', () => {
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

    it('approves a team refund without creating extra refund request rows', async () => {
      prismaMock.bills.findMany
        .mockResolvedValueOnce([{ id: 'team_bill_1' }])
        .mockResolvedValueOnce([{ id: 'split_bill_1' }])
        .mockResolvedValueOnce([{ id: 'direct_bill_1' }]);
      prismaMock.billPayments.findMany.mockResolvedValueOnce([
        {
          id: 'payment_team_1',
          billId: 'team_bill_1',
          amountCents: 5000,
          refundedAmountCents: 0,
          paymentIntentId: 'pi_team_1',
        },
        {
          id: 'payment_split_1',
          billId: 'split_bill_1',
          amountCents: 2000,
          refundedAmountCents: 500,
          paymentIntentId: 'pi_split_1',
        },
        {
          id: 'payment_direct_1',
          billId: 'direct_bill_1',
          amountCents: 1500,
          refundedAmountCents: 0,
          paymentIntentId: 'pi_direct_1',
        },
      ]);
      mockStripeRefundCreate
        .mockResolvedValueOnce({ id: 're_team_1' })
        .mockResolvedValueOnce({ id: 're_split_1' })
        .mockResolvedValueOnce({ id: 're_direct_1' });
      prismaMock.billPayments.findUnique
        .mockResolvedValueOnce({
          id: 'payment_team_1',
          amountCents: 5000,
          refundedAmountCents: 0,
        })
        .mockResolvedValueOnce({
          id: 'payment_split_1',
          amountCents: 2000,
          refundedAmountCents: 500,
        })
        .mockResolvedValueOnce({
          id: 'payment_direct_1',
          amountCents: 1500,
          refundedAmountCents: 0,
        });
      prismaMock.billPayments.update
        .mockResolvedValueOnce({ id: 'payment_team_1', refundedAmountCents: 5000 })
        .mockResolvedValueOnce({ id: 'payment_split_1', refundedAmountCents: 2000 })
        .mockResolvedValueOnce({ id: 'payment_direct_1', refundedAmountCents: 1500 });

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
      expect(mockStripeRefundCreate).toHaveBeenCalledTimes(3);
      expect(mockStripeRefundCreate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          payment_intent: 'pi_team_1',
          amount: 5000,
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_team_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_team_1',
        }),
      );
      expect(mockStripeRefundCreate).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          payment_intent: 'pi_split_1',
          amount: 1500,
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_split_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_split_1',
        }),
      );
      expect(mockStripeRefundCreate).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          payment_intent: 'pi_direct_1',
          amount: 1500,
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_direct_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_direct_1',
        }),
      );
      expect(payload).toEqual(
        expect.objectContaining({
          status: 'APPROVED',
          refundedAmountCents: 8000,
          stripeRefundIds: ['re_team_1', 're_split_1', 're_direct_1'],
          refundedPaymentIds: ['payment_team_1', 'payment_split_1', 'payment_direct_1'],
        }),
      );
    });

    it('creates Stripe refunds and persists refunded bill payments when approving an individual refund', async () => {
      prismaMock.refundRequests.findUnique.mockResolvedValueOnce({
        ...existingTeamRequest,
        teamId: null,
        userId: 'player_1',
        reason: 'requested_by_customer',
      });
      prismaMock.bills.findMany.mockResolvedValueOnce([
        { id: 'bill_1' },
      ]);
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

      const response = await PATCH(
        jsonPatch('http://localhost/api/refund-requests/refund_1', { status: 'APPROVED' }),
        { params: Promise.resolve({ id: 'refund_1' }) },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(mockStripeRefundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_1',
          amount: 5000,
          reason: 'requested_by_customer',
          metadata: expect.objectContaining({
            refund_request_id: 'refund_1',
            bill_payment_id: 'payment_1',
          }),
        }),
        expect.objectContaining({
          idempotencyKey: 'refund-request:refund_1:payment:payment_1',
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
          status: 'APPROVED',
          refundedAmountCents: 5000,
          stripeRefundIds: ['re_1'],
          refundedPaymentIds: ['payment_1'],
        }),
      );
    });
  });

  describe('GET /api/refund-requests', () => {
    it('filters legacy team fanout rows from the returned list', async () => {
      prismaMock.refundRequests.findMany.mockResolvedValueOnce([]);

      const response = await LIST_GET(
        new NextRequest('http://localhost/api/refund-requests?hostId=host_1'),
      );

      expect(response.status).toBe(200);
      expect(prismaMock.refundRequests.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hostId: 'host_1',
            reason: { not: 'team_refund_fanout' },
          }),
        }),
      );
    });
  });
});
