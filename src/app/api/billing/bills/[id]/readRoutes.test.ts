/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  bills: { findUnique: jest.fn() },
  billPayments: { findMany: jest.fn() },
};
const requireSessionMock = jest.fn();
const canManageBillPaymentMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));
jest.mock('@/server/billing/billPaymentActions', () => ({
  canManageBillPayment: (...args: unknown[]) => canManageBillPaymentMock(...args),
}));
jest.mock('@/server/billing/billDiscountSummaries', () => ({
  loadBillDiscountSummaries: jest.fn().mockResolvedValue(new Map()),
  withBillDiscountAmounts: (bill: unknown) => bill,
}));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: Record<string, unknown>) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: Array<Record<string, unknown>>) => rows.map((row) => ({ ...row, $id: row.id })),
}));

import { GET as getBill } from '@/app/api/billing/bills/[id]/route';
import { GET as getBillPayments } from '@/app/api/billing/bills/[id]/payments/route';

const request = (path: string) => new NextRequest(`http://localhost${path}`);
const bill = {
  id: 'bill_1', ownerType: 'TEAM', ownerId: 'team_1', organizationId: null,
  eventId: null, sourceType: null, sourceId: null, totalAmountCents: 5000,
  status: 'OPEN', paymentPlanEnabled: false, lineItems: [],
};

describe('bill read routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.bills.findUnique.mockResolvedValue(bill);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    canManageBillPaymentMock.mockResolvedValue(true);
  });

  it('denies an unrelated caller before returning a bill or its payments', async () => {
    canManageBillPaymentMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    const billResponse = await getBill(request('/api/billing/bills/bill_1'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });
    const paymentsResponse = await getBillPayments(request('/api/billing/bills/bill_1/payments'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });

    expect(billResponse.status).toBe(403);
    expect(paymentsResponse.status).toBe(403);
    expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 instead of throwing when the request has no session', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const billResponse = await getBill(request('/api/billing/bills/bill_1'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });

    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const paymentsResponse = await getBillPayments(request('/api/billing/bills/bill_1/payments'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });

    expect(billResponse.status).toBe(401);
    expect(paymentsResponse.status).toBe(401);
    expect(prismaMock.bills.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.findMany).not.toHaveBeenCalled();
  });

  it('returns authorized bill and installment data', async () => {
    prismaMock.billPayments.findMany
      .mockResolvedValueOnce([{ paymentIntentId: 'pi_1' }])
      .mockResolvedValueOnce([{ id: 'payment_1', billId: 'bill_1', sequence: 1 }]);

    const billResponse = await getBill(request('/api/billing/bills/bill_1'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });
    const paymentsResponse = await getBillPayments(request('/api/billing/bills/bill_1/payments'), {
      params: Promise.resolve({ id: 'bill_1' }),
    });

    expect(billResponse.status).toBe(200);
    expect(paymentsResponse.status).toBe(200);
    await expect(paymentsResponse.json()).resolves.toEqual({
      payments: [expect.objectContaining({ $id: 'payment_1' })],
    });
  });
});
