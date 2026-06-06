/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const canManageBillPaymentMock = jest.fn();

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    update: jest.fn(),
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
  default: jest.fn(),
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
    delete process.env.STRIPE_SECRET_KEY;
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
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith({
      where: { id: 'payment_1' },
      data: expect.objectContaining({
        payerUserId: 'player_1',
      }),
    });
    expect(canManageBillPaymentMock).not.toHaveBeenCalled();
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
});
