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
  teams: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const canManageBillPaymentMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/billing/billPaymentActions', () => ({
  canManageBillPayment: (...args: any[]) => canManageBillPaymentMock(...args),
}));

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
    canManageBillPaymentMock.mockResolvedValue(true);
    prismaMock.teams.findUnique.mockResolvedValue({ playerIds: ['player_1', 'player_2'] });
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
      allowSplit: true,
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      { amountCents: 600, dueDate: dueDateOne, sequence: 1, status: 'PENDING' },
      { amountCents: 400, dueDate: dueDateTwo, sequence: 2, status: 'PENDING' },
    ]);

    const txMock = {
      billPayments: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'parent_payment_1', amountCents: 600, dueDate: dueDateOne, sequence: 1, status: 'PENDING', paymentIntentId: null },
          { id: 'parent_payment_2', amountCents: 400, dueDate: dueDateTwo, sequence: 2, status: 'PENDING', paymentIntentId: null },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockResolvedValue({}),
      },
      bills: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'child_1' })
          .mockResolvedValueOnce({ id: 'child_2' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
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
    expect(txMock.billPayments.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['parent_payment_1', 'parent_payment_2'] },
        paymentIntentId: null,
      }),
      data: expect.objectContaining({
        status: 'VOID',
        paymentIntentId: null,
      }),
    }));

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
      ownerType: 'TEAM',
      ownerId: 'team_1',
      totalAmountCents: 1000,
      paidAmountCents: 1000,
      allowSplit: true,
    });
    const txMock = {
      billPayments: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'parent_payment_1', amountCents: 500, dueDate: new Date('2026-04-01T00:00:00.000Z'), sequence: 1, status: 'PAID', paymentIntentId: 'pi_paid' },
          { id: 'parent_payment_2', amountCents: 500, dueDate: new Date('2026-05-01T00:00:00.000Z'), sequence: 2, status: 'VOID', paymentIntentId: null },
        ]),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      bills: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_2/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_2' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Bill has no pending installments to split');
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unrelated caller before creating split debt', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_3',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      allowSplit: true,
    });
    canManageBillPaymentMock.mockResolvedValueOnce(false);

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_3/split', {
        playerIds: ['player_1'],
      }),
      { params: Promise.resolve({ id: 'bill_team_3' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns a conflict instead of creating duplicate children when a split already completed', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_already_split',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      allowSplit: true,
    });
    const txMock = {
      billPayments: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      bills: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing_child_bill' }),
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_already_split/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_already_split' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Bill has already been split.');
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
    expect(txMock.bills.create).not.toHaveBeenCalled();
  });

  it('rejects a split while a parent installment has an active checkout', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_4',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      totalAmountCents: 1000,
      paidAmountCents: 0,
      allowSplit: true,
    });
    const txMock = {
      billPayments: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'parent_payment_1',
            amountCents: 1000,
            dueDate: new Date('2026-04-01T00:00:00.000Z'),
            status: 'PROCESSING',
            paymentIntentId: 'pi_in_flight',
          },
        ]),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      bills: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_4/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_4' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain('started or partially paid');
    expect(txMock.billPayments.updateMany).not.toHaveBeenCalled();
    expect(txMock.bills.create).not.toHaveBeenCalled();
  });

  it('does not create child debt when an intent binds after the payment snapshot', async () => {
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_team_race',
      ownerType: 'TEAM',
      ownerId: 'team_1',
      totalAmountCents: 1000,
      paidAmountCents: 0,
      allowSplit: true,
    });
    const txMock = {
      billPayments: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'parent_payment_1',
            amountCents: 1000,
            dueDate: new Date('2026-04-01T00:00:00.000Z'),
            status: 'PENDING',
            paymentIntentId: null,
          },
        ]),
        // The payment intent was linked after findMany but before the guarded void.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      bills: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const response = await POST(
      jsonPost('http://localhost/api/billing/bills/bill_team_race/split', {
        playerIds: ['player_1', 'player_2'],
      }),
      { params: Promise.resolve({ id: 'bill_team_race' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain('changed while it was being split');
    expect(txMock.billPayments.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ paymentIntentId: null }),
    }));
    expect(txMock.bills.create).not.toHaveBeenCalled();
  });
});
