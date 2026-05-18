/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripePaymentIntentRetrieve = jest.fn();
const mockStripePaymentIntentUpdate = jest.fn();
const StripeMock = jest.fn().mockImplementation(() => ({
  paymentIntents: {
    retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
    update: (...args: unknown[]) => mockStripePaymentIntentUpdate(...args),
  },
}));
const requireSessionMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/billing/payment-intent-fee/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/payment-intent-fee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/payment-intent-fee', () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.resetAllMocks();
    StripeMock.mockImplementation(() => ({
      paymentIntents: {
        retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
        update: (...args: unknown[]) => mockStripePaymentIntentUpdate(...args),
      },
    }));
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    mockStripePaymentIntentRetrieve.mockResolvedValue({
      id: 'pi_123',
      status: 'requires_payment_method',
      metadata: {
        purchase_type: 'event',
        buyer_user_id: 'user_1',
        user_id: 'user_1',
        amount_cents: '10000',
        processing_fee_cents: '100',
        mvp_fee_cents: '100',
        stripe_tax_service_fee_cents: '0',
        tax_cents: '0',
        transfer_amount_cents: '10000',
        fee_percentage: '1.0000',
      },
    });
    mockStripePaymentIntentUpdate.mockResolvedValue({ id: 'pi_123' });
  });

  afterEach(() => {
    if (originalSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecretKey;
    }
  });

  it('updates an unconfirmed intent to ACH fee math', async () => {
    const response = await POST(jsonPost({
      paymentIntent: 'pi_123_secret_456',
      paymentMethodType: 'us_bank_account',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockStripePaymentIntentUpdate).toHaveBeenCalledWith('pi_123', expect.objectContaining({
      amount: 10181,
      metadata: expect.objectContaining({
        total_charge_cents: '10181',
        stripe_fee_cents: '81',
        stripe_processing_fee_cents: '81',
        payment_method_fee_type: 'us_bank_account',
      }),
    }));
    expect(payload.feeBreakdown).toEqual(expect.objectContaining({
      eventPrice: 10000,
      processingFee: 100,
      stripeFee: 81,
      totalCharge: 10181,
      paymentMethodType: 'us_bank_account',
      paymentMethodLabel: 'Bank account',
    }));
  });

  it('rejects users who do not own the payment intent', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });

    const response = await POST(jsonPost({
      paymentIntent: 'pi_123_secret_456',
      paymentMethodType: 'us_bank_account',
    }));

    expect(response.status).toBe(403);
    expect(mockStripePaymentIntentUpdate).not.toHaveBeenCalled();
  });
});
