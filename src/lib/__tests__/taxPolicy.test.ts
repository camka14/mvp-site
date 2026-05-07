import {
  extractUsStateCodeFromLocationText,
  resolvePurchaseTaxPolicy,
} from '@/lib/taxPolicy';

describe('taxPolicy', () => {
  it('extracts state codes from formatted addresses and location labels', () => {
    expect(extractUsStateCodeFromLocationText('123 Main St, Hoboken, NJ 07030')).toBe('NJ');
    expect(extractUsStateCodeFromLocationText('Pier 40, New York, New York')).toBe('NY');
    expect(extractUsStateCodeFromLocationText(null, 'Portland, OR')).toBe('OR');
  });

  it('marks New Jersey and New York sports participant event registrations as zero tax', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: '123 Main St, Hoboken, NJ 07030' },
    })).toEqual({
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState: 'NJ',
      purchaseType: 'event',
    });

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { location: 'Buffalo, NY' },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState: 'NY',
    }));
  });

  it('marks narrow no-general-sales-tax event states as zero tax', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: '100 Main St, Wilmington, DE 19801' },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'no_general_sales_tax_state',
      jurisdictionState: 'DE',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: 'Portland, Oregon' },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'no_general_sales_tax_state',
      jurisdictionState: 'OR',
    }));
  });

  it('marks individual Washington sports event registrations as zero tax', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: '123 Main St, Seattle, WA 98101' },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState: 'WA',
    }));
  });

  it('keeps rentals and unconfigured event states on Stripe Tax', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'rental',
      taxCategory: 'RENTAL',
      event: { address: '123 Main St, Hoboken, NJ 07030' },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'non_event_purchase',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: '123 Main St, Los Angeles, CA 90012' },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'tax_policy_not_configured',
      jurisdictionState: 'CA',
    }));
  });

  it('uses organization defaults for organization-hosted event registrations', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
      },
      organization: {
        defaultEventTaxHandling: 'STRIPE_TAX',
        taxResponsibilityAcceptedAt: '2026-05-07T00:00:00.000Z',
      },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organization_default_stripe_tax',
      jurisdictionState: 'WA',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
      },
      organization: {
        defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
        taxResponsibilityAcceptedAt: '2026-05-07T00:00:00.000Z',
      },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'organization_default_sports_exempt',
      jurisdictionState: 'WA',
    }));
  });

  it('keeps organization sports exemption off until the tax agreement is accepted', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
      },
      organization: {
        defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
      },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organization_tax_profile_incomplete',
      jurisdictionState: 'WA',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
        taxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
      },
      organization: {
        defaultEventTaxHandling: 'STRIPE_TAX',
      },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organization_tax_profile_incomplete',
      jurisdictionState: 'WA',
    }));
  });

  it('lets event-level tax handling override organization defaults', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
        taxHandling: 'STRIPE_TAX',
      },
      organization: {
        defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
        taxResponsibilityAcceptedAt: '2026-05-07T00:00:00.000Z',
      },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'seller_selected_stripe_tax',
      jurisdictionState: 'WA',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Seattle, WA 98101',
        organizationId: 'org_1',
        taxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
      },
      organization: {
        defaultEventTaxHandling: 'STRIPE_TAX',
        taxResponsibilityAcceptedAt: '2026-05-07T00:00:00.000Z',
      },
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'seller_attested_sports_exempt',
      jurisdictionState: 'WA',
    }));
  });
});
