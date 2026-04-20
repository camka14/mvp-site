/** @jest-environment node */

import { NextRequest } from 'next/server';
import { buildBillingAddressFingerprint } from '@/lib/stripeCheckoutReuse';

const subscriptionsListMock = jest.fn();
const subscriptionsCreateMock = jest.fn();
const invoicesRetrieveMock = jest.fn();
const paymentIntentsUpdateMock = jest.fn();
const stripeInstance = {
  subscriptions: {
    list: subscriptionsListMock,
    create: subscriptionsCreateMock,
  },
  invoices: {
    retrieve: invoicesRetrieveMock,
  },
  paymentIntents: {
    update: paymentIntentsUpdateMock,
  },
};
const StripeMock = jest.fn(() => stripeInstance);

const prismaMock = {
  products: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  stripeAccounts: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const loadUserBillingProfileMock = jest.fn();
const resolveBillingAddressInputMock = jest.fn();
const upsertUserBillingAddressMock = jest.fn();
const validateUsBillingAddressMock = jest.fn();
const calculateTaxQuoteMock = jest.fn();
const resolveTaxCategoryForPurchaseMock = jest.fn();
const ensurePlatformFeeProductMock = jest.fn();
const isRecurringProductPeriodMock = jest.fn();
const normalizeProductTaxCategoryMock = jest.fn();
const syncPlatformProductCatalogMock = jest.fn();
const upsertStripeSubscriptionMirrorMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/billingAddress', () => ({
  loadUserBillingProfile: (...args: unknown[]) => loadUserBillingProfileMock(...args),
  resolveBillingAddressInput: (...args: unknown[]) => resolveBillingAddressInputMock(...args),
  upsertUserBillingAddress: (...args: unknown[]) => upsertUserBillingAddressMock(...args),
  validateUsBillingAddress: (...args: unknown[]) => validateUsBillingAddressMock(...args),
}));

jest.mock('@/lib/stripeTax', () => ({
  calculateTaxQuote: (...args: unknown[]) => calculateTaxQuoteMock(...args),
  resolveTaxCategoryForPurchase: (...args: unknown[]) => resolveTaxCategoryForPurchaseMock(...args),
}));

jest.mock('@/lib/stripeProducts', () => ({
  ensurePlatformFeeProduct: (...args: unknown[]) => ensurePlatformFeeProductMock(...args),
  isRecurringProductPeriod: (...args: unknown[]) => isRecurringProductPeriodMock(...args),
  normalizeProductTaxCategory: (...args: unknown[]) => normalizeProductTaxCategoryMock(...args),
  syncPlatformProductCatalog: (...args: unknown[]) => syncPlatformProductCatalogMock(...args),
}));

jest.mock('@/lib/stripeSubscriptions', () => ({
  upsertStripeSubscriptionMirror: (...args: unknown[]) => upsertStripeSubscriptionMirrorMock(...args),
}));

import { POST } from '@/app/api/products/[id]/subscriptions/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/products/prod_1/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/products/[id]/subscriptions', () => {
  const originalEnv = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_123';

    requireSessionMock.mockResolvedValue({ userId: 'user_1' });
    prismaMock.products.findUnique.mockResolvedValue({
      id: 'prod_1',
      name: 'Gold Membership',
      description: 'Monthly plan',
      priceCents: 2500,
      period: 'MONTH',
      taxCategory: 'SUBSCRIPTION',
      organizationId: 'org_1',
      isActive: true,
      stripeProductId: 'stripe_prod_1',
      stripePriceId: 'stripe_price_1',
    });
    prismaMock.products.update.mockResolvedValue({});
    prismaMock.stripeAccounts.findFirst.mockResolvedValue({ accountId: 'acct_connected_123' });

    resolveBillingAddressInputMock.mockReturnValue(undefined);
    loadUserBillingProfileMock.mockResolvedValue({
      billingAddress: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        countryCode: 'US',
      },
      email: 'user@example.com',
    });
    upsertUserBillingAddressMock.mockResolvedValue(null);
    validateUsBillingAddressMock.mockImplementation((address: unknown) => address);

    isRecurringProductPeriodMock.mockReturnValue(true);
    normalizeProductTaxCategoryMock.mockReturnValue('SUBSCRIPTION');
    resolveTaxCategoryForPurchaseMock.mockReturnValue('SUBSCRIPTION');
    calculateTaxQuoteMock.mockResolvedValue({
      subtotalCents: 2500,
      processingFeeCents: 200,
      stripeFeeCents: 103,
      taxAmountCents: 175,
      totalChargeCents: 2978,
      hostReceivesCents: 2500,
      feePercentage: 0.08,
      purchaseType: 'product',
      customerId: 'cus_123',
      calculationId: 'taxcalc_123',
      taxCategory: 'SUBSCRIPTION',
    });
    syncPlatformProductCatalogMock.mockResolvedValue({
      stripeProductId: 'stripe_prod_1',
      stripePriceId: 'stripe_price_1',
    });
    ensurePlatformFeeProductMock.mockResolvedValue('fee_prod_1');
    subscriptionsListMock.mockResolvedValue({ data: [] });
    subscriptionsCreateMock.mockResolvedValue({
      id: 'sub_123',
      latest_invoice: {
        id: 'in_123',
        confirmation_secret: {
          client_secret: 'seti_123_secret_456',
        },
      },
    });
    invoicesRetrieveMock.mockResolvedValue({
      id: 'in_123',
      payments: {
        data: [
          {
            payment: {
              type: 'payment_intent',
              payment_intent: {
                id: 'pi_123',
              },
            },
          },
        ],
      },
    });
    paymentIntentsUpdateMock.mockResolvedValue({});
    upsertStripeSubscriptionMirrorMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalEnv.STRIPE_SECRET_KEY === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;
    }

    if (originalEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = originalEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    }
  });

  it('returns fee breakdown values in cents for the shared payment UI', async () => {
    const response = await POST(jsonPost({}), { params: Promise.resolve({ id: 'prod_1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.feeBreakdown).toEqual(expect.objectContaining({
      eventPrice: 2500,
      processingFee: 200,
      stripeFee: 103,
      taxAmount: 175,
      totalCharge: 2978,
      hostReceives: 2500,
      purchaseType: 'product',
    }));
  });

  it('routes recurring subscription payments to the connected account while the platform keeps tax and fees', async () => {
    const response = await POST(jsonPost({}), { params: Promise.resolve({ id: 'prod_1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentIntent).toBe('seti_123_secret_456');
    expect(subscriptionsCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      transfer_data: {
        destination: 'acct_connected_123',
      },
    }));
    expect(paymentIntentsUpdateMock).toHaveBeenCalledWith('pi_123', {
      application_fee_amount: 478,
    });
    expect(invoicesRetrieveMock).toHaveBeenCalledWith('in_123', {
      expand: ['payments.data.payment.payment_intent'],
    });
  });

  it('preserves the platform-only subscription flow when no connected account is configured', async () => {
    prismaMock.stripeAccounts.findFirst.mockResolvedValueOnce(null);

    const response = await POST(jsonPost({}), { params: Promise.resolve({ id: 'prod_1' }) });

    expect(response.status).toBe(200);
    expect(subscriptionsCreateMock).toHaveBeenCalledWith(expect.not.objectContaining({
      transfer_data: expect.anything(),
    }));
    expect(invoicesRetrieveMock).not.toHaveBeenCalled();
    expect(paymentIntentsUpdateMock).not.toHaveBeenCalled();
  });

  it('reuses an existing incomplete subscription checkout for the same product', async () => {
    const billingAddressFingerprint = buildBillingAddressFingerprint({
      line1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      countryCode: 'US',
    });
    subscriptionsListMock.mockResolvedValue({
      data: [
        {
          id: 'sub_existing',
          status: 'incomplete',
          transfer_data: {
            destination: 'acct_connected_123',
          },
          metadata: {
            purchase_type: 'product_subscription',
            product_id: 'prod_1',
            user_id: 'user_1',
            organization_id: 'org_1',
            billing_address_fingerprint: billingAddressFingerprint ?? '',
            total_charge_cents: '2978',
            tax_calculation_id: 'taxcalc_existing',
            tax_category: 'SUBSCRIPTION',
          },
          items: {
            data: [
              {
                metadata: { line_type: 'product_base' },
                price: {
                  id: 'stripe_price_1',
                },
              },
            ],
          },
          latest_invoice: {
            confirmation_secret: {
              client_secret: 'seti_existing_secret_456',
            },
          },
        },
      ],
    });

    const response = await POST(jsonPost({}), { params: Promise.resolve({ id: 'prod_1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.paymentIntent).toBe('seti_existing_secret_456');
    expect(data.taxCalculationId).toBe('taxcalc_existing');
    expect(subscriptionsCreateMock).not.toHaveBeenCalled();
    expect(invoicesRetrieveMock).not.toHaveBeenCalled();
    expect(paymentIntentsUpdateMock).not.toHaveBeenCalled();
    expect(upsertStripeSubscriptionMirrorMock).toHaveBeenCalledWith(expect.objectContaining({
      subscription: expect.objectContaining({ id: 'sub_existing' }),
    }));
  });
});
