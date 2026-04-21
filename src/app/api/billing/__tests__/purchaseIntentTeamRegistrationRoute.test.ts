/** @jest-environment node */

import { NextRequest } from 'next/server';

const stripePaymentIntentCreateMock = jest.fn();
const stripePaymentIntentListMock = jest.fn();
const StripeMock = jest.fn(() => ({
  paymentIntents: {
    create: (...args: unknown[]) => stripePaymentIntentCreateMock(...args),
    list: (...args: unknown[]) => stripePaymentIntentListMock(...args),
  },
}));
const requireSessionMock = jest.fn();
const loadUserBillingProfileMock = jest.fn();
const resolveBillingAddressInputMock = jest.fn();
const upsertUserBillingAddressMock = jest.fn();
const validateUsBillingAddressMock = jest.fn((value) => value);
const resolvePurchaseContextMock = jest.fn();
const calculateTaxQuoteMock = jest.fn();
const buildDestinationTransferDataMock = jest.fn();
const buildBillingAddressFingerprintMock = jest.fn().mockReturnValue('fp_team_123');
const findReusableIncompleteProductPaymentIntentMock = jest.fn().mockResolvedValue(null);
const findReusableIncompleteTeamRegistrationPaymentIntentMock = jest.fn();
const getCheckoutTaxCalculationIdFromMetadataMock = jest.fn();
const getCheckoutTaxCategoryFromMetadataMock = jest.fn();
const reserveTeamRegistrationSlotMock = jest.fn();
const releaseStartedTeamRegistrationMock = jest.fn();

jest.mock('stripe', () => ({
  __esModule: true,
  default: StripeMock,
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/lib/billingAddress', () => ({
  loadUserBillingProfile: (...args: unknown[]) => loadUserBillingProfileMock(...args),
  resolveBillingAddressInput: (...args: unknown[]) => resolveBillingAddressInputMock(...args),
  upsertUserBillingAddress: (...args: unknown[]) => upsertUserBillingAddressMock(...args),
  validateUsBillingAddress: (...args: unknown[]) => validateUsBillingAddressMock(...args),
}));
jest.mock('@/lib/purchaseContext', () => ({
  resolvePurchaseContext: (...args: unknown[]) => resolvePurchaseContextMock(...args),
}));
jest.mock('@/lib/stripeTax', () => ({
  INTERNAL_TAX_CATEGORIES: ['general'],
  calculateTaxQuote: (...args: unknown[]) => calculateTaxQuoteMock(...args),
}));
jest.mock('@/lib/stripeConnectAccounts', () => ({
  buildDestinationTransferData: (...args: unknown[]) => buildDestinationTransferDataMock(...args),
}));
jest.mock('@/lib/stripeCheckoutReuse', () => ({
  buildBillingAddressFingerprint: (...args: unknown[]) => buildBillingAddressFingerprintMock(...args),
  findReusableIncompleteProductPaymentIntent: (...args: unknown[]) => findReusableIncompleteProductPaymentIntentMock(...args),
  findReusableIncompleteTeamRegistrationPaymentIntent: (...args: unknown[]) => findReusableIncompleteTeamRegistrationPaymentIntentMock(...args),
  getCheckoutTaxCalculationIdFromMetadata: (...args: unknown[]) => getCheckoutTaxCalculationIdFromMetadataMock(...args),
  getCheckoutTaxCategoryFromMetadata: (...args: unknown[]) => getCheckoutTaxCategoryFromMetadataMock(...args),
}));
jest.mock('@/app/api/events/[eventId]/registrationDivisionUtils', () => ({
  resolveEventDivisionSelection: jest.fn(),
}));
jest.mock('@/server/repositories/rentalCheckoutLocks', () => ({
  extractRentalCheckoutWindow: jest.fn(),
  releaseRentalCheckoutLocks: jest.fn(),
  reserveRentalCheckoutLocks: jest.fn(),
}));
jest.mock('@/server/teams/teamOpenRegistration', () => ({
  reserveTeamRegistrationSlot: (...args: unknown[]) => reserveTeamRegistrationSlotMock(...args),
  releaseStartedTeamRegistration: (...args: unknown[]) => releaseStartedTeamRegistrationMock(...args),
}));

import { POST } from '@/app/api/billing/purchase-intent/route';

const jsonPost = (body: unknown) => new NextRequest('http://localhost/api/billing/purchase-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/billing/purchase-intent team registration reuse', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_mock';

    StripeMock.mockImplementation(() => ({
      paymentIntents: {
        create: (...args: unknown[]) => stripePaymentIntentCreateMock(...args),
        list: (...args: unknown[]) => stripePaymentIntentListMock(...args),
      },
    }));
    buildBillingAddressFingerprintMock.mockReturnValue('fp_team_123');
    findReusableIncompleteProductPaymentIntentMock.mockResolvedValue(null);
    validateUsBillingAddressMock.mockImplementation((value) => value);
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    loadUserBillingProfileMock.mockResolvedValue({
      email: 'user@example.com',
      billingAddress: {
        line1: '123 Main St',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        countryCode: 'US',
      },
    });
    resolveBillingAddressInputMock.mockReturnValue({
      line1: '123 Main St',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      countryCode: 'US',
    });
    resolvePurchaseContextMock.mockResolvedValue({
      amountCents: 2500,
      purchaseType: 'team_registration',
      taxCategory: 'general',
      eventType: undefined,
      product: null,
      team: {
        id: 'team_1',
        name: 'Pacific Spike Volleyball',
        registrationPriceCents: 2500,
        organizationId: 'org_1',
        hostUserId: 'host_1',
      },
      organizationId: 'org_1',
      hostUserId: 'host_1',
    });
    calculateTaxQuoteMock.mockResolvedValue({
      subtotalCents: 2500,
      stripeFeeCents: 90,
      processingFeeCents: 90,
      taxAmountCents: 0,
      totalChargeCents: 2590,
      hostReceivesCents: 2500,
      feePercentage: 0.01,
      purchaseType: 'team_registration',
      taxCategory: 'general',
      calculationId: 'tax_calc_1',
      customerId: 'cus_1',
      stripeProcessingFeeCents: 90,
      stripeTaxServiceFeeCents: 0,
    });
    buildDestinationTransferDataMock.mockResolvedValue(null);
    reserveTeamRegistrationSlotMock.mockResolvedValue({
      ok: true,
      registrationId: 'team_1__user_1',
      status: 'STARTED',
    });
    stripePaymentIntentCreateMock.mockResolvedValue({
      id: 'pi_team_1',
      client_secret: 'pi_team_1_secret',
    });
    stripePaymentIntentListMock.mockResolvedValue({ data: [] });
    getCheckoutTaxCalculationIdFromMetadataMock.mockReturnValue('tax_calc_existing');
    getCheckoutTaxCategoryFromMetadataMock.mockReturnValue('general');
  });

  it('reuses an existing incomplete payment intent for the same team registration checkout', async () => {
    findReusableIncompleteTeamRegistrationPaymentIntentMock.mockResolvedValue({
      id: 'pi_existing',
      client_secret: 'pi_existing_secret',
      metadata: {
        tax_calculation_id: 'tax_calc_existing',
        tax_category: 'general',
      },
    });

    const response = await POST(jsonPost({
      purchaseType: 'team_registration',
      user: { $id: 'user_1' },
      team: { $id: 'team_1', name: 'Pacific Spike Volleyball' },
      teamRegistration: { teamId: 'team_1' },
      organization: { $id: 'org_1', name: 'Pacific Spike' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paymentIntent).toBe('pi_existing_secret');
    expect(findReusableIncompleteTeamRegistrationPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        teamId: 'team_1',
        userId: 'user_1',
        organizationId: 'org_1',
        registrationId: 'team_1__user_1',
        totalChargeCents: 2590,
      }),
    );
    expect(stripePaymentIntentCreateMock).not.toHaveBeenCalled();
  });

  it('creates a fresh payment intent when the existing team registration reservation has no reusable intent', async () => {
    findReusableIncompleteTeamRegistrationPaymentIntentMock.mockResolvedValue(null);

    const response = await POST(jsonPost({
      purchaseType: 'team_registration',
      user: { $id: 'user_1' },
      team: { $id: 'team_1', name: 'Pacific Spike Volleyball' },
      teamRegistration: { teamId: 'team_1' },
      organization: { $id: 'org_1', name: 'Pacific Spike' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paymentIntent).toBe('pi_team_1_secret');
    expect(stripePaymentIntentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        purchase_type: 'team_registration',
        team_id: 'team_1',
        user_id: 'user_1',
        registration_id: 'team_1__user_1',
      }),
    }));
    expect(releaseStartedTeamRegistrationMock).not.toHaveBeenCalled();
  });
});
