/** @jest-environment node */

import { NextRequest } from 'next/server';
import { buildBillingAddressFingerprint } from '@/lib/stripeCheckoutReuse';

const mockStripePaymentIntentList = jest.fn();
const mockStripePaymentIntentCreate = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    list: (...args: unknown[]) => mockStripePaymentIntentList(...args),
    create: (...args: unknown[]) => mockStripePaymentIntentCreate(...args),
  },
}));

const prismaMock = {
  stripeAccounts: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const resolvePurchaseContextMock = jest.fn();
const loadUserBillingProfileMock = jest.fn();
const resolveBillingAddressInputMock = jest.fn();
const upsertUserBillingAddressMock = jest.fn();
const validateUsBillingAddressMock = jest.fn();
const calculateTaxQuoteMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/purchaseContext', () => ({ resolvePurchaseContext: (...args: unknown[]) => resolvePurchaseContextMock(...args) }));
jest.mock('@/lib/billingAddress', () => ({
  loadUserBillingProfile: (...args: unknown[]) => loadUserBillingProfileMock(...args),
  resolveBillingAddressInput: (...args: unknown[]) => resolveBillingAddressInputMock(...args),
  upsertUserBillingAddress: (...args: unknown[]) => upsertUserBillingAddressMock(...args),
  validateUsBillingAddress: (...args: unknown[]) => validateUsBillingAddressMock(...args),
}));
jest.mock('@/lib/stripeTax', () => {
  const actual = jest.requireActual('@/lib/stripeTax');
  return {
    ...actual,
    calculateTaxQuote: (...args: unknown[]) => calculateTaxQuoteMock(...args),
  };
});

import { POST } from '@/app/api/billing/purchase-intent/route';

const jsonPost = (body: unknown) => new NextRequest('http://localhost/api/billing/purchase-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/billing/purchase-intent destination charges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123';

    requireSessionMock.mockResolvedValue({ userId: 'buyer_1', isAdmin: false });
    resolvePurchaseContextMock.mockResolvedValue({
      amountCents: 2500,
      purchaseType: 'product',
      taxCategory: 'ONE_TIME_PRODUCT',
      product: {
        id: 'product_1',
        name: 'Tournament Shirt',
        description: 'Single item product',
        priceCents: 2500,
        period: 'SINGLE',
        organizationId: 'org_1',
        taxCategory: 'ONE_TIME_PRODUCT',
        stripeProductId: 'prod_1',
        stripePriceId: null,
      },
      organizationId: 'org_1',
    });
    resolveBillingAddressInputMock.mockReturnValue(null);
    loadUserBillingProfileMock.mockResolvedValue({
      billingAddress: {
        line1: '123 Main St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        countryCode: 'US',
      },
      email: 'buyer@example.com',
    });
    upsertUserBillingAddressMock.mockResolvedValue(null);
    validateUsBillingAddressMock.mockImplementation((value: unknown) => value);
    calculateTaxQuoteMock.mockResolvedValue({
      customerId: 'cus_123',
      calculationId: 'taxcalc_123',
      subtotalCents: 2500,
      taxAmountCents: 213,
      totalChargeCents: 3043,
      processingFeeCents: 250,
      stripeFeeCents: 80,
      stripeProcessingFeeCents: 30,
      stripeTaxServiceFeeCents: 50,
      feePercentage: 10,
      purchaseType: 'product',
      hostReceivesCents: 2500,
      taxCategory: 'ONE_TIME_PRODUCT',
    });
    mockStripePaymentIntentList.mockResolvedValue({ data: [] });
    mockStripePaymentIntentCreate.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret_456',
    });
  });

  it('routes the product subtotal to the connected account and keeps taxes plus fees on the platform', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });

    const response = await POST(jsonPost({
      productId: 'product_1',
      organization: { $id: 'org_1', name: 'Summit Indoor Volleyball Facility' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paymentIntent).toBe('pi_123_secret_456');
    expect(mockStripePaymentIntentCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 3043,
      customer: 'cus_123',
      transfer_data: {
        destination: 'acct_connected_123',
        amount: 2500,
      },
      metadata: expect.objectContaining({
        purchase_type: 'product',
        product_id: 'product_1',
        organization_id: 'org_1',
        transfer_destination_account_id: 'acct_connected_123',
        transfer_amount_cents: '2500',
      }),
    }));
  });

  it('preserves the platform-only flow when no connected account is available', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue(null);

    const response = await POST(jsonPost({
      productId: 'product_1',
      organization: { $id: 'org_1', name: 'Summit Indoor Volleyball Facility' },
    }));

    expect(response.status).toBe(200);
    const createParams = mockStripePaymentIntentCreate.mock.calls[0]?.[0];
    expect(createParams).toBeTruthy();
    expect(createParams).not.toHaveProperty('transfer_data');
  });

  it('reuses an existing incomplete payment intent for the same product checkout', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });
    const billingAddressFingerprint = buildBillingAddressFingerprint({
      line1: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      countryCode: 'US',
    });
    mockStripePaymentIntentList.mockResolvedValue({
      data: [
        {
          id: 'pi_existing',
          status: 'requires_payment_method',
          amount: 3043,
          currency: 'usd',
          client_secret: 'pi_existing_secret_456',
          transfer_data: {
            destination: 'acct_connected_123',
            amount: 2500,
          },
          metadata: {
            purchase_type: 'product',
            product_id: 'product_1',
            user_id: 'buyer_1',
            organization_id: 'org_1',
            billing_address_fingerprint: billingAddressFingerprint ?? '',
            total_charge_cents: '3043',
            tax_calculation_id: 'taxcalc_existing',
            tax_category: 'ONE_TIME_PRODUCT',
          },
        },
      ],
    });

    const response = await POST(jsonPost({
      productId: 'product_1',
      organization: { $id: 'org_1', name: 'Summit Indoor Volleyball Facility' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paymentIntent).toBe('pi_existing_secret_456');
    expect(payload.taxCalculationId).toBe('taxcalc_existing');
    expect(mockStripePaymentIntentCreate).not.toHaveBeenCalled();
  });

  it('returns an API error instead of a fake client secret when Stripe payment intent creation fails', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });
    mockStripePaymentIntentCreate.mockRejectedValueOnce(new Error('Destination account is not ready.'));

    const response = await POST(jsonPost({
      productId: 'product_1',
      organization: { $id: 'org_1', name: 'Summit Indoor Volleyball Facility' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual(expect.objectContaining({
      error: 'Destination account is not ready.',
      taxCalculationId: 'taxcalc_123',
      taxCategory: 'ONE_TIME_PRODUCT',
      feeBreakdown: expect.any(Object),
    }));
    expect(payload.paymentIntent).toBeUndefined();
  });
});
