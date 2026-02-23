/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  bills: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  billPayments: {
    create: jest.fn(),
  },
};

const prismaMock = {
  bills: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/bills/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/bills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    txMock.bills.findFirst.mockResolvedValue(null);
    txMock.bills.create.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      totalAmountCents: 12000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
      status: 'OPEN',
    });
    txMock.billPayments.create
      .mockResolvedValueOnce({
        id: 'payment_1',
        billId: 'bill_1',
        sequence: 1,
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        amountCents: 6000,
      })
      .mockResolvedValueOnce({
        id: 'payment_2',
        billId: 'bill_1',
        sequence: 2,
        dueDate: new Date('2026-04-01T00:00:00.000Z'),
        amountCents: 6000,
      });
    txMock.bills.update.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      eventId: 'event_1',
      totalAmountCents: 12000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
      status: 'OPEN',
      nextPaymentAmountCents: 6000,
    });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) => callback(txMock));
  });

  it('creates a payment-plan bill and installments', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        paymentPlanEnabled: true,
        installmentAmounts: [6000, 6000],
        installmentDueDates: ['2026-03-01', '2026-04-01'],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.bill).toEqual(expect.objectContaining({ $id: 'bill_1' }));
    expect(txMock.bills.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          parentBillId: null,
          paymentPlanEnabled: true,
        }),
      }),
    );
    expect(txMock.bills.create).toHaveBeenCalled();
    expect(txMock.billPayments.create).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate payment plans for the same event and owner', async () => {
    txMock.bills.findFirst.mockResolvedValueOnce({ id: 'bill_existing' });

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills', {
        ownerType: 'TEAM',
        ownerId: 'team_1',
        totalAmountCents: 12000,
        eventId: 'event_1',
        paymentPlanEnabled: true,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('A payment plan already exists for this owner and event.');
    expect(payload.billId).toBe('bill_existing');
    expect(txMock.bills.create).not.toHaveBeenCalled();
    expect(txMock.billPayments.create).not.toHaveBeenCalled();
  });
});
