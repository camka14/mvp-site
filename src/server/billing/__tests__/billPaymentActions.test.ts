/** @jest-environment node */

const stripeRetrieveMock = jest.fn();
const stripeCancelMock = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    retrieve: (...args: unknown[]) => stripeRetrieveMock(...args),
    cancel: (...args: unknown[]) => stripeCancelMock(...args),
  },
}));

const prismaMock = {
  billPayments: {
    update: jest.fn(),
    findMany: jest.fn(),
  },
  bills: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

import {
  cancelProcessingBillPaymentForAction,
  markBillPaymentProcessingForAction,
} from '@/server/billing/billPaymentActions';

describe('bill payment actions', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
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
      },
      paymentIntent: 'pi_pending_1_secret_abc',
      userId: 'user_1',
      now,
    });

    expect(prismaMock.billPayments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_1' },
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
});
