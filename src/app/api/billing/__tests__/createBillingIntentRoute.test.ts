/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageBillPaymentMock = jest.fn();
const stripePaymentIntentCreateMock = jest.fn();
const stripePaymentIntentCancelMock = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    create: (...args: unknown[]) => stripePaymentIntentCreateMock(...args),
    cancel: (...args: unknown[]) => stripePaymentIntentCancelMock(...args),
  },
}));

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
  },
  events: {
    findUnique: jest.fn(),
  },
  teamRegistrations: {
    findFirst: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/billing/billPaymentActions', () => ({
  canManageBillPayment: canManageBillPaymentMock,
}));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

import { POST } from '@/app/api/billing/create_billing_intent/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/create_billing_intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/create_billing_intent', () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  let txMock: {
    bills: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    billPayments: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    teamRegistrations: {
      findFirst: jest.Mock;
    };
    teams: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });
    canManageBillPaymentMock.mockResolvedValue(false);
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      organizationId: 'org_1',
      status: 'OPEN',
      lineItems: [],
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      registrationPaymentMode: 'ONLINE',
    });
    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'payment_1',
      billId: 'bill_1',
      amountCents: 1279,
      status: 'PENDING',
      payerUserId: null,
      paymentIntentId: null,
    });
    prismaMock.teamRegistrations.findFirst.mockResolvedValue({ id: 'registration_1' });
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);
    stripePaymentIntentCreateMock.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret_456',
    });
    stripePaymentIntentCancelMock.mockResolvedValue({ id: 'pi_123', status: 'canceled' });
    txMock = {
      bills: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bill_1',
          ownerType: 'TEAM',
          ownerId: 'team_1',
          status: 'OPEN',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      billPayments: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment_1',
          billId: 'bill_1',
          status: 'PENDING',
          paymentIntentId: null,
          payerUserId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      teamRegistrations: {
        findFirst: jest.fn().mockResolvedValue({ id: 'registration_1' }),
      },
      teams: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));
  });

  afterEach(() => {
    if (originalSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecretKey;
    }
  });

  it('lets an active team member claim and pay a null-payer team bill payment', async () => {
    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.billId).toBe('bill_1');
    expect(payload.paymentIntent).toBe('pi_123_secret_456');
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.billPayments.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'payment_1',
        billId: 'bill_1',
        paymentIntentId: null,
        payerUserId: null,
      }),
      data: expect.objectContaining({
        payerUserId: 'player_1',
      }),
    });
    expect(canManageBillPaymentMock).not.toHaveBeenCalled();
  });

  it('fails closed before loading or claiming a bill payment when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Payment processing is temporarily unavailable. Please try again later.');
    expect(prismaMock.bills.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.findUnique).not.toHaveBeenCalled();
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
    expect(stripePaymentIntentCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a null-payer team bill payment when the user is not on the team', async () => {
    prismaMock.teamRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);

    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));

    expect(response.status).toBe(403);
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
  });

  it('rejects Stripe billing intents for manual-payment event bills', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      registrationPaymentMode: 'MANUAL',
    });

    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('This bill is paid outside BracketIQ. Upload proof of payment instead.');
    expect(prismaMock.teamRegistrations.findFirst).not.toHaveBeenCalled();
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
  });

  it('cancels a fresh intent and returns 409 when a split voids the parent before binding', async () => {
    txMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'payment_1',
      billId: 'bill_1',
      status: 'VOID',
      paymentIntentId: null,
      payerUserId: null,
    });

    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain('no longer available');
    expect(payload.paymentIntent).toBeUndefined();
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
    expect(stripePaymentIntentCancelMock).toHaveBeenCalledWith('pi_123', {
      cancellation_reason: 'requested_by_customer',
    });
  });

  it('derives Stripe payer metadata from the session instead of a caller-supplied user object', async () => {
    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
      user: { $id: 'victim_1' },
    }));

    expect(response.status).toBe(200);
    expect(stripePaymentIntentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ user_id: 'player_1' }),
      }),
    );
  });

  it('cancels the fresh intent when an unassigned team payer lost membership before binding', async () => {
    txMock.teamRegistrations.findFirst.mockResolvedValueOnce(null);
    txMock.teams.findUnique.mockResolvedValueOnce(null);
    txMock.teams.findMany.mockResolvedValueOnce([]);

    const response = await POST(jsonPost({
      billId: 'bill_1',
      billPaymentId: 'payment_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain('no longer available');
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
    expect(stripePaymentIntentCancelMock).toHaveBeenCalledWith('pi_123', {
      cancellation_reason: 'requested_by_customer',
    });
  });
});
