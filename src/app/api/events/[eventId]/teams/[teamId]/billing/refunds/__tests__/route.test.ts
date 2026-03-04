/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripeRefundCreate = jest.fn();

jest.mock('stripe', () => (
  jest.fn().mockImplementation(() => ({
    refunds: {
      create: (...args: unknown[]) => mockStripeRefundCreate(...args),
    },
  }))
));

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  bills: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: unknown[]) => canManageEventMock(...args) }));

import { POST } from '@/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route';

const requestFor = (body: unknown) =>
  new NextRequest('http://localhost/api/events/event_1/teams/team_1/billing/refunds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/teams/[teamId]/billing/refunds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      teamIds: ['team_1'],
      teamSignup: true,
    });
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      playerIds: ['user_2'],
      captainId: 'user_2',
      managerId: null,
      headCoachId: null,
      parentTeamId: null,
    });
  });

  it('creates a partial stripe refund and persists refundedAmountCents on the payment', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 1000,
      status: 'PAID',
      paymentIntentId: 'pi_1',
      refundedAmountCents: 200,
    });
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'USER',
      ownerId: 'user_2',
      eventId: 'event_1',
    });
    mockStripeRefundCreate.mockResolvedValue({ id: 're_1' });
    prismaMock.billPayments.update.mockResolvedValue({
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 1000,
      status: 'PAID',
      paymentIntentId: 'pi_1',
      refundedAmountCents: 500,
    });

    const response = await POST(
      requestFor({
        billPaymentId: 'payment_1',
        amountCents: 300,
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockStripeRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_1',
        amount: 300,
        reason: 'requested_by_customer',
      }),
    );
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_1' },
        data: expect.objectContaining({
          refundedAmountCents: 500,
        }),
      }),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        refundedAmountCents: 300,
        remainingRefundableAmountCents: 500,
        refundId: 're_1',
      }),
    );
  });

  it('rejects refund amounts above the remaining refundable balance', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 1000,
      status: 'PAID',
      paymentIntentId: 'pi_1',
      refundedAmountCents: 900,
    });
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'USER',
      ownerId: 'user_2',
      eventId: 'event_1',
    });

    const response = await POST(
      requestFor({
        billPaymentId: 'payment_1',
        amountCents: 200,
      }),
      {
        params: Promise.resolve({ eventId: 'event_1', teamId: 'team_1' }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Requested refund exceeds refundable balance.');
    expect(payload.refundableAmountCents).toBe(100);
    expect(mockStripeRefundCreate).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
  });
});
