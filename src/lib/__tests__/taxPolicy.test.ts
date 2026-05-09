import {
  ORGANIZER_TAX_RESPONSIBILITY_MESSAGE,
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
    })).toEqual(expect.objectContaining({
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState: 'NJ',
      purchaseType: 'event',
      taxability: 'NOT_TAXABLE',
      liabilityParty: 'NONE',
      collectionStrategy: 'NO_TAX',
    }));

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
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    }));

    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: { address: '123 Main St, Los Angeles, CA 90012' },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'tax_policy_not_configured',
      jurisdictionState: 'CA',
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    }));
  });

  it('starts with no organizer-liable marketplace facilitator states configured', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Boise, ID 83702',
        taxHandling: 'ORGANIZER_MANUAL_TAX',
      },
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organizer_tax_collection_not_allowed',
      jurisdictionState: 'ID',
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    }));
  });

  it('resolves organizer responsibility when a reviewed state rule is provided', () => {
    expect(resolvePurchaseTaxPolicy({
      purchaseType: 'event',
      taxCategory: 'EVENT_PARTICIPANT',
      event: {
        address: '123 Main St, Boise, ID 83702',
        taxHandling: 'ORGANIZER_MANUAL_TAX',
      },
      organizerLiabilityRules: [
        {
          stateCode: 'ID',
          purchaseTypes: ['event'],
          taxCategories: ['EVENT_PARTICIPANT'],
          allowedCollectionStrategies: ['ORGANIZER_MANUAL_TAX', 'ORGANIZER_STRIPE_TAX'],
          ruleId: 'test-id-event-participant-organizer-liable',
          ruleVersion: 'test-2026-05-08',
        },
      ],
    })).toEqual(expect.objectContaining({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organizer_manual_tax_selected',
      jurisdictionState: 'ID',
      taxability: 'TAXABLE',
      liabilityParty: 'ORGANIZER',
      collectionStrategy: 'ORGANIZER_MANUAL_TAX',
      organizerResponsibilityMessage: ORGANIZER_TAX_RESPONSIBILITY_MESSAGE,
      policyRuleId: 'test-id-event-participant-organizer-liable',
      policyRuleVersion: 'test-2026-05-08',
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
