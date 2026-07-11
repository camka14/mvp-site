/** @jest-environment node */

const stripeRetrieveMock = jest.fn();
const stripeCancelMock = jest.fn();
const stripeRefundCreateMock = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    retrieve: (...args: unknown[]) => stripeRetrieveMock(...args),
    cancel: (...args: unknown[]) => stripeCancelMock(...args),
  },
  refunds: {
    create: (...args: unknown[]) => stripeRefundCreateMock(...args),
  },
}));

const prismaMock = {
  billPayments: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  bills: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

import {
  cancelBillPaymentPlanForAction,
  cancelProcessingBillPaymentForAction,
  markBillPaymentProcessingForAction,
  refundBillPaymentForAction,
} from '@/server/billing/billPaymentActions';

describe('bill payment actions', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    stripeRefundCreateMock.mockResolvedValue({ id: 're_1' });
    stripeRetrieveMock.mockResolvedValue({ id: 'pi_pending_1', status: 'processing' });
    stripeCancelMock.mockResolvedValue({ id: 'pi_pending_1', status: 'canceled' });
    prismaMock.bills.findUnique.mockResolvedValue({
      id: 'bill_1',
      totalAmountCents: 5000,
      status: 'OPEN',
    });
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        amountCents: 5000,
        status: 'PROCESSING',
        dueDate: new Date('2026-05-19T00:00:00.000Z'),
      },
    ]);
    prismaMock.bills.update.mockResolvedValue({
      id: 'bill_1',
      status: 'PENDING',
    });
    prismaMock.billPayments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  afterAll(() => {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  });

  it('marks a bill payment processing and reconciles the bill as pending', async () => {
    const now = new Date('2026-05-19T12:00:00.000Z');

    await markBillPaymentProcessingForAction({
      bill: {
        id: 'bill_1',
        ownerType: 'USER',
        ownerId: 'user_1',
        organizationId: null,
        eventId: 'event_1',
        totalAmountCents: 5000,
        status: 'OPEN',
        paymentPlanEnabled: false,
        lineItems: [],
      },
      payment: {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        status: 'PENDING',
        paymentIntentId: 'pi_pending_1',
        payerUserId: null,
        refundedAmountCents: 0,
      },
      paymentIntent: 'pi_pending_1_secret_abc',
      userId: 'user_1',
      now,
    });

    expect(prismaMock.billPayments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'payment_1' }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          paymentIntentId: 'pi_pending_1',
          payerUserId: 'user_1',
        }),
      }),
    );
    expect(prismaMock.bills.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_1' },
        data: expect.objectContaining({
          paidAmountCents: 0,
          status: 'PENDING',
          nextPaymentAmountCents: 5000,
        }),
      }),
    );
  });

  it('refuses to revive an installment that was voided by a concurrent split', async () => {
    prismaMock.billPayments.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(markBillPaymentProcessingForAction({
      bill: {
        id: 'bill_1', ownerType: 'USER', ownerId: 'user_1', organizationId: null,
        eventId: null, totalAmountCents: 5000, status: 'OPEN', paymentPlanEnabled: false, lineItems: [],
      },
      payment: {
        id: 'payment_1', billId: 'bill_1', amountCents: 5000, status: 'PENDING',
        paymentIntentId: null, payerUserId: null, refundedAmountCents: 0,
      },
      paymentIntent: 'pi_pending_1_secret_abc',
      userId: 'user_1',
      now: new Date('2026-05-19T12:00:00.000Z'),
    })).rejects.toThrow('no longer available');
  });

  it('cancels Stripe and restores a payment-plan installment to due', async () => {
    const now = new Date('2026-05-19T12:00:00.000Z');
    prismaMock.bills.update.mockResolvedValueOnce({ id: 'bill_1', status: 'OPEN' });

    await cancelProcessingBillPaymentForAction({
      bill: {
        id: 'bill_1',
        ownerType: 'USER',
        ownerId: 'user_1',
        organizationId: null,
        eventId: 'event_1',
        totalAmountCents: 5000,
        status: 'OPEN',
        paymentPlanEnabled: true,
        lineItems: [],
      },
      payment: {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        status: 'PROCESSING',
        paymentIntentId: 'pi_pending_1',
        payerUserId: 'user_1',
        refundedAmountCents: 0,
      },
      now,
    });

    expect(stripeRetrieveMock).toHaveBeenCalledWith('pi_pending_1');
    expect(stripeCancelMock).toHaveBeenCalledWith('pi_pending_1', {
      cancellation_reason: 'requested_by_customer',
    });
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_1' },
        data: expect.objectContaining({
          status: 'PENDING',
          paymentIntentId: null,
        }),
      }),
    );
  });

  it('refunds a paid bill payment through Stripe and records the refunded amount', async () => {
    const now = new Date('2026-05-19T12:00:00.000Z');
    prismaMock.billPayments.update.mockResolvedValueOnce({
      id: 'payment_1',
      amountCents: 5000,
      refundedAmountCents: 2000,
    });

    const result = await refundBillPaymentForAction({
      bill: {
        id: 'bill_1',
        ownerType: 'USER',
        ownerId: 'user_1',
        organizationId: 'org_1',
        eventId: 'event_1',
        totalAmountCents: 5000,
        status: 'PAID',
        paymentPlanEnabled: false,
        lineItems: [],
      },
      payment: {
        id: 'payment_1',
        billId: 'bill_1',
        amountCents: 5000,
        status: 'PAID',
        paymentIntentId: 'pi_paid_1',
        payerUserId: 'user_1',
        refundedAmountCents: 1000,
      },
      amountCents: 1000,
      actorUserId: 'host_1',
      now,
    });

    expect(stripeRefundCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_paid_1',
        amount: 1000,
        metadata: expect.objectContaining({
          bill_id: 'bill_1',
          bill_payment_id: 'payment_1',
          actor_user_id: 'host_1',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: 'bill-payment-refund:payment_1:1000:1000',
      }),
    );
    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_1' },
        data: expect.objectContaining({
          refundedAmountCents: 2000,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      refundedAmountCents: 1000,
      remainingRefundableAmountCents: 3000,
      refundId: 're_1',
    }));
  });

  it('voids unpaid installments when cancelling a bill payment plan', async () => {
    const now = new Date('2026-05-19T12:00:00.000Z');
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_paid',
        billId: 'bill_1',
        amountCents: 2500,
        status: 'PAID',
        paymentIntentId: 'pi_paid_1',
        payerUserId: 'user_1',
        refundedAmountCents: 0,
      },
      {
        id: 'payment_processing',
        billId: 'bill_1',
        amountCents: 2500,
        status: 'PROCESSING',
        paymentIntentId: 'pi_pending_1',
        payerUserId: 'user_1',
        refundedAmountCents: 0,
      },
    ]);
    prismaMock.bills.update.mockResolvedValueOnce({
      id: 'bill_1',
      status: 'CANCELLED',
      paymentPlanEnabled: false,
    });

    const result = await cancelBillPaymentPlanForAction({
      bill: {
        id: 'bill_1',
        ownerType: 'USER',
        ownerId: 'user_1',
        organizationId: 'org_1',
        eventId: 'event_1',
        totalAmountCents: 5000,
        status: 'PENDING',
        paymentPlanEnabled: true,
        lineItems: [],
      },
      now,
    });

    expect(stripeCancelMock).toHaveBeenCalledWith('pi_pending_1', {
      cancellation_reason: 'requested_by_customer',
    });
    expect(prismaMock.billPayments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['payment_processing'] } },
        data: expect.objectContaining({
          status: 'VOID',
          paymentIntentId: null,
        }),
      }),
    );
    expect(prismaMock.bills.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bill_1' },
        data: expect.objectContaining({
          paidAmountCents: 2500,
          status: 'CANCELLED',
          paymentPlanEnabled: false,
          nextPaymentDue: null,
          nextPaymentAmountCents: null,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'CANCELLED' }));
  });
});
