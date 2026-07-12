/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const resolvePurchaseContextMock = jest.fn();
const upsertUserBillingAddressMock = jest.fn();
const StripeMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/purchaseContext', () => ({
  resolvePurchaseContext: (...args: unknown[]) => resolvePurchaseContextMock(...args),
}));

jest.mock('@/lib/billingAddress', () => ({
  loadUserBillingProfile: jest.fn(),
  resolveBillingAddressInput: jest.fn(),
  upsertUserBillingAddress: (...args: unknown[]) => upsertUserBillingAddressMock(...args),
  validateUsBillingAddress: jest.fn(),
}));

import { POST } from '@/app/api/billing/tax-preview/route';

const jsonPost = (body: unknown) => new NextRequest('http://localhost/api/billing/tax-preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/billing/tax-preview', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    requireSessionMock.mockResolvedValue({ userId: 'buyer_1', isAdmin: false });
  });

  afterAll(() => {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  });

  it('fails closed before resolving a quote or saving a billing address without Stripe configuration', async () => {
    const response = await POST(jsonPost({
      productId: 'product_1',
      billingAddress: {
        line1: '123 Main St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        countryCode: 'US',
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Payment processing is temporarily unavailable. Please try again later.');
    expect(resolvePurchaseContextMock).not.toHaveBeenCalled();
    expect(upsertUserBillingAddressMock).not.toHaveBeenCalled();
    expect(StripeMock).not.toHaveBeenCalled();
  });
});
