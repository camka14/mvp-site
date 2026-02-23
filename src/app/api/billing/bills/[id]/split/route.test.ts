/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/bills/[id]/split/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/bills/[id]/split', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
  });

  it('splits each pending installment across players and preserves installment due dates', async () => {
    const dueDateOne = new Date('2026-04-01T00:00:00.000Z');
    const dueDateTwo = new Date('2026-05-01T00:00:00.000Z');

    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_1',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      organizationId: 'org_1',
      eventId: 'event_1',
      totalAmountCents: 1000,
      paidAmountCents: 0,
      paymentPlanEnabled: true,
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      { amountCents: 600, dueDate: dueDateOne, sequence: 1, status: 'PENDING' },
      { amountCents: 400, dueDate: dueDateTwo, sequence: 2, status: 'PENDING' },
    ]);

    const txMock = {
      bills: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'child_1' })
          .mockResolvedValueOnce({ id: 'child_2' }),
      },
      billPayments: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_1/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(payload.children)).toBe(true);
    expect(payload.children).toHaveLength(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(txMock.bills.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'player_1',
          totalAmountCents: 500,
          nextPaymentDue: dueDateOne,
          nextPaymentAmountCents: 300,
          paymentPlanEnabled: true,
          parentBillId: 'bill_team_1',
        }),
      }),
    );
    expect(txMock.bills.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'player_2',
          totalAmountCents: 500,
          nextPaymentDue: dueDateOne,
          nextPaymentAmountCents: 300,
          paymentPlanEnabled: true,
          parentBillId: 'bill_team_1',
        }),
      }),
    );

    expect(txMock.billPayments.create).toHaveBeenCalledTimes(4);
    expect(txMock.billPayments.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'child_1',
          sequence: 1,
          dueDate: dueDateOne,
          amountCents: 300,
          status: 'PENDING',
        }),
      }),
    );
    expect(txMock.billPayments.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'child_1',
          sequence: 2,
          dueDate: dueDateTwo,
          amountCents: 200,
          status: 'PENDING',
        }),
      }),
    );
    expect(txMock.billPayments.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'child_2',
          sequence: 1,
          dueDate: dueDateOne,
          amountCents: 300,
          status: 'PENDING',
        }),
      }),
    );
    expect(txMock.billPayments.create).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'child_2',
          sequence: 2,
          dueDate: dueDateTwo,
          amountCents: 200,
          status: 'PENDING',
        }),
      }),
    );
  });

  it('returns 400 when the bill has no pending installments to split', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_2',
      totalAmountCents: 1000,
      paidAmountCents: 1000,
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      { amountCents: 500, dueDate: new Date('2026-04-01T00:00:00.000Z'), sequence: 1, status: 'PAID' },
      { amountCents: 500, dueDate: new Date('2026-05-01T00:00:00.000Z'), sequence: 2, status: 'VOID' },
    ]);

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_2/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_2' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Bill has no pending installments to split');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
