/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  bills: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  billPayments: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  subscriptions: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  products: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const sendPurchaseReceiptEmailMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/purchaseReceipts', () => ({
  sendPurchaseReceiptEmail: (...args: any[]) => sendPurchaseReceiptEmailMock(...args),
}));

import { POST } from '@/app/api/billing/webhook/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const buildPaymentIntentSucceededEvent = ({
  intentId,
  metadata,
  amount = 5000,
  amountReceived = amount,
}: {
  intentId: string;
  metadata: Record<string, string>;
  amount?: number;
  amountReceived?: number;
}) => ({
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: intentId,
      metadata,
      amount,
      amount_received: amountReceived,
    },
  },
});

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendPurchaseReceiptEmailMock.mockResolvedValue({ sent: true });

    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      totalAmountCents: 5000,
      status: 'OPEN',
      parentBillId: null,
    });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.bills.update.mockResolvedValue({});
    prismaMock.bills.create.mockResolvedValue({ id: 'bill_created_1' });

    prismaMock.billPayments.findUnique.mockResolvedValue({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'bill_payment_1',
        amountCents: 5000,
        status: 'PAID',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        paymentIntentId: 'pi_bill_1',
      },
    ]);
    prismaMock.billPayments.update.mockResolvedValue({});
    prismaMock.billPayments.findFirst.mockResolvedValue(null);
    prismaMock.billPayments.create.mockResolvedValue({ id: 'bill_payment_created_1' });

    prismaMock.subscriptions.findFirst.mockResolvedValue(null);
    prismaMock.subscriptions.create.mockResolvedValue({});
    prismaMock.products.findUnique.mockResolvedValue({
      id: 'product_1',
      priceCents: 1200,
      period: 'MONTH',
      organizationId: 'org_1',
    });

    prismaMock.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        bills: {
          create: prismaMock.bills.create,
        },
        billPayments: {
          findFirst: prismaMock.billPayments.findFirst,
          create: prismaMock.billPayments.create,
        },
      };
      return callback(tx);
    });
  });

  it('creates a paid bill and bill payment for an instant event purchase and sends a receipt', async () => {
    prismaMock.billPayments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.bills.create.mockResolvedValueOnce({ id: 'bill_instant_1' });
    prismaMock.billPayments.create.mockResolvedValueOnce({ id: 'bill_payment_instant_1' });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          organization_id: 'org_1',
          amount_cents: '4500',
        },
        amount: 4700,
        amountReceived: 4700,
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'TEAM',
          ownerId: 'team_1',
          eventId: 'event_1',
          organizationId: 'org_1',
          totalAmountCents: 4700,
          paidAmountCents: 4700,
          status: 'PAID',
        }),
      }),
    );
    expect(prismaMock.billPayments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billId: 'bill_instant_1',
          amountCents: 4700,
          status: 'PAID',
          paymentIntentId: 'pi_event_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'event',
        userId: 'user_1',
        teamId: 'team_1',
        eventId: 'event_1',
        billId: 'bill_instant_1',
        billPaymentId: 'bill_payment_instant_1',
      }),
    );
  });

  it('is idempotent for repeated instant webhook events by payment intent id', async () => {
    prismaMock.billPayments.findFirst.mockResolvedValueOnce({
      id: 'bill_payment_existing_1',
      billId: 'bill_existing_1',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_event_duplicate_1',
        metadata: {
          purchase_type: 'event',
          user_id: 'user_1',
          team_id: 'team_1',
          event_id: 'event_1',
          amount_cents: '4500',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.bills.create).not.toHaveBeenCalled();
    expect(prismaMock.billPayments.create).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });

  it('marks bill installments paid and sends a receipt on first successful bill payment', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PENDING',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_payment_1' },
        data: expect.objectContaining({
          status: 'PAID',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPurchaseReceiptEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseType: 'bill',
        billId: 'bill_1',
        billPaymentId: 'bill_payment_1',
      }),
    );
  });

  it('does not send duplicate receipt emails when bill payment is already marked paid', async () => {
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'bill_payment_1',
      billId: 'bill_1',
      status: 'PAID',
    });

    const response = await POST(
      jsonPost(buildPaymentIntentSucceededEvent({
        intentId: 'pi_bill_already_paid_1',
        metadata: {
          purchase_type: 'bill',
          bill_id: 'bill_1',
          bill_payment_id: 'bill_payment_1',
          user_id: 'user_1',
        },
      })),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.billPayments.update).not.toHaveBeenCalled();
    expect(sendPurchaseReceiptEmailMock).not.toHaveBeenCalled();
  });
});
