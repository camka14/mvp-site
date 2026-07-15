/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageBillPaymentMock = jest.fn();
const stripePaymentIntentCreateMock = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    create: (...args: unknown[]) => stripePaymentIntentCreateMock(...args),
  },
}));

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    update: jest.fn(),
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
    });
    prismaMock.teamRegistrations.findFirst.mockResolvedValue({ id: 'registration_1' });
    prismaMock.teams.findUnique.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.billPayments.update.mockResolvedValue({});
    stripePaymentIntentCreateMock.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret_456',
    });
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
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith({
      where: { id: 'payment_1' },
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
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
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
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
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
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
  });
});
