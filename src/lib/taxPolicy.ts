export type TaxMode = 'ZERO_TAX' | 'STRIPE_TAX_REQUIRED';
export type Taxability = 'TAXABLE' | 'NOT_TAXABLE' | 'UNKNOWN';
export type TaxLiabilityParty = 'PLATFORM' | 'ORGANIZER' | 'NONE' | 'UNKNOWN';
export type TaxCollectionStrategy =
  | 'PLATFORM_STRIPE_TAX'
  | 'ORGANIZER_STRIPE_TAX'
  | 'ORGANIZER_MANUAL_TAX'
  | 'NO_TAX'
  | 'BLOCKED_NEEDS_REVIEW';

export const ORGANIZER_TAX_RESPONSIBILITY_MESSAGE =
  'You are responsible for reporting and collecting sales tax in your state.';

export const ORG_TAX_AGREEMENT_VERSION = '2026-05-07';

export type OrganizationTaxClassification =
  | 'INDIVIDUAL_OR_CLUB'
  | 'NONPROFIT_OR_ASSOCIATION'
  | 'FACILITY_OPERATOR'
  | 'BUSINESS_OTHER';

export type EventTaxHandling =
  | 'INHERIT_ORG'
  | 'STRIPE_TAX'
  | 'EXEMPT_PARTICIPANT_SPORTS'
  | 'ORGANIZER_MANUAL_TAX'
  | 'ORGANIZER_STRIPE_TAX';

export type OrganizationDefaultEventTaxHandling =
  | 'STRIPE_TAX'
  | 'EXEMPT_PARTICIPANT_SPORTS';

export type RentalTaxHandling = 'STRIPE_TAX';

export const ORGANIZATION_TAX_CLASSIFICATION_VALUES: readonly OrganizationTaxClassification[] = [
  'INDIVIDUAL_OR_CLUB',
  'NONPROFIT_OR_ASSOCIATION',
  'FACILITY_OPERATOR',
  'BUSINESS_OTHER',
];

export const EVENT_TAX_HANDLING_VALUES: readonly EventTaxHandling[] = [
  'INHERIT_ORG',
  'STRIPE_TAX',
  'EXEMPT_PARTICIPANT_SPORTS',
  'ORGANIZER_MANUAL_TAX',
  'ORGANIZER_STRIPE_TAX',
];

export const ORGANIZATION_DEFAULT_EVENT_TAX_HANDLING_VALUES: readonly OrganizationDefaultEventTaxHandling[] = [
  'STRIPE_TAX',
  'EXEMPT_PARTICIPANT_SPORTS',
];

export const RENTAL_TAX_HANDLING_VALUES: readonly RentalTaxHandling[] = ['STRIPE_TAX'];

export type TaxReasonCode =
  | 'sports_participant_state_exempt'
  | 'no_general_sales_tax_state'
  | 'seller_selected_stripe_tax'
  | 'seller_attested_sports_exempt'
  | 'organization_default_stripe_tax'
  | 'organization_default_sports_exempt'
  | 'organizer_manual_tax_selected'
  | 'organizer_stripe_tax_selected'
  | 'organizer_tax_collection_not_selected'
  | 'organizer_tax_collection_not_allowed'
  | 'organization_tax_profile_incomplete'
  | 'non_event_purchase'
  | 'unsupported_tax_category'
  | 'missing_event_jurisdiction'
  | 'tax_policy_not_configured';

export type TaxPolicyDecision = {
  mode: TaxMode;
  reasonCode: TaxReasonCode;
  jurisdictionState: string | null;
  purchaseType: string;
  taxability: Taxability;
  liabilityParty: TaxLiabilityParty;
  collectionStrategy: TaxCollectionStrategy;
  organizerResponsibilityMessage?: string;
  policyRuleId?: string;
  policyRuleVersion?: string;
};

export type OrganizerLiabilityRule = {
  stateCode: string;
  purchaseTypes?: readonly string[];
  taxCategories?: readonly string[];
  allowedCollectionStrategies?: readonly Extract<TaxCollectionStrategy, 'ORGANIZER_MANUAL_TAX' | 'ORGANIZER_STRIPE_TAX'>[];
  defaultCollectionStrategy?: Extract<TaxCollectionStrategy, 'ORGANIZER_MANUAL_TAX' | 'ORGANIZER_STRIPE_TAX'>;
  ruleId: string;
  ruleVersion: string;
};

export type ResolvePurchaseTaxPolicyParams = {
  purchaseType: string;
  taxCategory?: string | null;
  event?: {
    address?: unknown;
    location?: unknown;
    organizationId?: unknown;
    taxHandling?: unknown;
    organizerManualTaxRateBps?: unknown;
  } | null;
  organization?: {
    defaultEventTaxHandling?: unknown;
    taxResponsibilityAcceptedAt?: unknown;
  } | null;
  timeSlot?: {
    taxHandling?: unknown;
  } | null;
  organizerLiabilityRules?: readonly OrganizerLiabilityRule[];
};

const US_STATE_NAMES_TO_CODES: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

const US_STATE_CODES = new Set(Object.values(US_STATE_NAMES_TO_CODES));

const SPORTS_PARTICIPANT_EXEMPT_STATE_CODES = new Set(['NJ', 'NY', 'WA']);

// Keep this list intentionally narrow. Alaska and Montana have local/resort
// taxes that need city-level handling before they can be safely auto-exempted.
const NO_GENERAL_SALES_TAX_STATE_CODES = new Set(['DE', 'OR']);

export const CONFIRMED_ORGANIZER_LIABLE_EVENT_TAX_RULES: readonly OrganizerLiabilityRule[] = [];

export const MAX_ORGANIZER_MANUAL_TAX_RATE_BPS = 2500;

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeUpperToken = (value: unknown): string | null => (
  normalizeText(value)?.toUpperCase().replace(/[^A-Z0-9_]/g, '_') ?? null
);

export const normalizeOrganizationTaxClassification = (
  value: unknown,
  fallback: OrganizationTaxClassification = 'INDIVIDUAL_OR_CLUB',
): OrganizationTaxClassification => {
  const normalized = normalizeUpperToken(value);
  return ORGANIZATION_TAX_CLASSIFICATION_VALUES.includes(normalized as OrganizationTaxClassification)
    ? normalized as OrganizationTaxClassification
    : fallback;
};

export const normalizeEventTaxHandling = (
  value: unknown,
  fallback: EventTaxHandling = 'INHERIT_ORG',
): EventTaxHandling => {
  const normalized = normalizeUpperToken(value);
  return EVENT_TAX_HANDLING_VALUES.includes(normalized as EventTaxHandling)
    ? normalized as EventTaxHandling
    : fallback;
};

export const normalizeOrganizationDefaultEventTaxHandling = (
  value: unknown,
  fallback: OrganizationDefaultEventTaxHandling = 'STRIPE_TAX',
): OrganizationDefaultEventTaxHandling => {
  const normalized = normalizeEventTaxHandling(value, fallback);
  return ORGANIZATION_DEFAULT_EVENT_TAX_HANDLING_VALUES.includes(normalized as OrganizationDefaultEventTaxHandling)
    ? normalized as OrganizationDefaultEventTaxHandling
    : fallback;
};

export const normalizeRentalTaxHandling = (
  value: unknown,
  fallback: RentalTaxHandling = 'STRIPE_TAX',
): RentalTaxHandling => (
  RENTAL_TAX_HANDLING_VALUES.includes(normalizeUpperToken(value) as RentalTaxHandling)
    ? 'STRIPE_TAX'
    : fallback
);

const hasAcceptedTaxResponsibility = (value: unknown): boolean => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return true;
  }
  return Boolean(normalizeText(value));
};

export const normalizeOrganizerManualTaxRateBps = (value: unknown): number => {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : 0;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(MAX_ORGANIZER_MANUAL_TAX_RATE_BPS, Math.max(0, Math.round(numeric)));
};

const normalizeStateCode = (value: unknown): string | null => {
  const normalized = normalizeText(value)?.toUpperCase().replace(/[^A-Z]/g, '') ?? null;
  if (!normalized) {
    return null;
  }
  if (US_STATE_CODES.has(normalized)) {
    return normalized;
  }
  return US_STATE_NAMES_TO_CODES[normalized] ?? null;
};

const extractStateCodeFromSegment = (segment: string): string | null => {
  const trimmed = segment.trim();
  if (!trimmed) {
    return null;
  }

  const direct = normalizeStateCode(trimmed);
  if (direct) {
    return direct;
  }

  const postalMatch = trimmed.toUpperCase().match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (postalMatch) {
    const postalState = normalizeStateCode(postalMatch[1]);
    if (postalState) {
      return postalState;
    }
  }

  const codeMatch = trimmed.toUpperCase().match(/\b([A-Z]{2})\b/);
  if (codeMatch) {
    const stateCode = normalizeStateCode(codeMatch[1]);
    if (stateCode) {
      return stateCode;
    }
  }

  const upper = trimmed.toUpperCase();
  for (const [stateName, stateCode] of Object.entries(US_STATE_NAMES_TO_CODES)) {
    const pattern = new RegExp(`\\b${stateName.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(upper)) {
      return stateCode;
    }
  }

  return null;
};

export const extractUsStateCodeFromLocationText = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) {
      continue;
    }

    const segments = text.split(/[,|\n]/).map((segment) => segment.trim()).filter(Boolean);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const stateCode = extractStateCodeFromSegment(segments[index]);
      if (stateCode) {
        return stateCode;
      }
    }

    const stateCode = extractStateCodeFromSegment(text);
    if (stateCode) {
      return stateCode;
    }
  }

  return null;
};

const normalizePurchaseType = (value: unknown): string => normalizeText(value)?.toLowerCase() ?? '';
const normalizeTaxCategory = (value: unknown): string => normalizeText(value)?.toUpperCase() ?? 'EVENT_PARTICIPANT';

const buildTaxPolicyDecision = ({
  mode,
  reasonCode,
  jurisdictionState,
  purchaseType,
  taxability,
  liabilityParty,
  collectionStrategy,
  organizerResponsibilityMessage,
  policyRuleId,
  policyRuleVersion,
}: TaxPolicyDecision): TaxPolicyDecision => ({
  mode,
  reasonCode,
  jurisdictionState,
  purchaseType,
  taxability,
  liabilityParty,
  collectionStrategy,
  ...(organizerResponsibilityMessage ? { organizerResponsibilityMessage } : {}),
  ...(policyRuleId ? { policyRuleId } : {}),
  ...(policyRuleVersion ? { policyRuleVersion } : {}),
});

const findOrganizerLiabilityRule = ({
  stateCode,
  purchaseType,
  taxCategory,
  rules,
}: {
  stateCode: string | null;
  purchaseType: string;
  taxCategory: string;
  rules: readonly OrganizerLiabilityRule[];
}): OrganizerLiabilityRule | null => {
  if (!stateCode) {
    return null;
  }
  return rules.find((rule) => {
    const ruleState = normalizeStateCode(rule.stateCode);
    if (ruleState !== stateCode) {
      return false;
    }
    const purchaseTypes = rule.purchaseTypes?.map((value) => normalizePurchaseType(value)).filter(Boolean);
    if (purchaseTypes?.length && !purchaseTypes.includes(purchaseType)) {
      return false;
    }
    const taxCategories = rule.taxCategories?.map((value) => normalizeTaxCategory(value)).filter(Boolean);
    if (taxCategories?.length && !taxCategories.includes(taxCategory)) {
      return false;
    }
    return true;
  }) ?? null;
};

const resolveOrganizerCollectionStrategy = ({
  selectedEventTaxHandling,
  rule,
}: {
  selectedEventTaxHandling: EventTaxHandling;
  rule: OrganizerLiabilityRule;
}): TaxCollectionStrategy => {
  const allowed = new Set(rule.allowedCollectionStrategies ?? ['ORGANIZER_MANUAL_TAX']);
  if (selectedEventTaxHandling === 'ORGANIZER_STRIPE_TAX') {
    return allowed.has('ORGANIZER_STRIPE_TAX') ? 'ORGANIZER_STRIPE_TAX' : 'BLOCKED_NEEDS_REVIEW';
  }
  if (selectedEventTaxHandling === 'ORGANIZER_MANUAL_TAX') {
    return allowed.has('ORGANIZER_MANUAL_TAX') ? 'ORGANIZER_MANUAL_TAX' : 'BLOCKED_NEEDS_REVIEW';
  }
  if (rule.defaultCollectionStrategy && allowed.has(rule.defaultCollectionStrategy)) {
    return rule.defaultCollectionStrategy;
  }
  return 'BLOCKED_NEEDS_REVIEW';
};

export const taxPolicyRequiresStripeTaxCalculation = (taxPolicy: TaxPolicyDecision): boolean => (
  taxPolicy.collectionStrategy === 'PLATFORM_STRIPE_TAX'
  || taxPolicy.collectionStrategy === 'ORGANIZER_STRIPE_TAX'
);

export const taxPolicyUsesOrganizerManualTax = (taxPolicy: TaxPolicyDecision): boolean => (
  taxPolicy.collectionStrategy === 'ORGANIZER_MANUAL_TAX'
);

export const resolvePurchaseTaxPolicy = ({
  purchaseType,
  taxCategory,
  event,
  organization,
  organizerLiabilityRules = CONFIRMED_ORGANIZER_LIABLE_EVENT_TAX_RULES,
}: ResolvePurchaseTaxPolicyParams): TaxPolicyDecision => {
  const normalizedPurchaseType = normalizePurchaseType(purchaseType);
  if (normalizedPurchaseType !== 'event') {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'non_event_purchase',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  const normalizedTaxCategory = normalizeTaxCategory(taxCategory);
  if (normalizedTaxCategory !== 'EVENT_PARTICIPANT') {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'unsupported_tax_category',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  const jurisdictionState = extractUsStateCodeFromLocationText(event?.address, event?.location);
  const selectedEventTaxHandling = normalizeEventTaxHandling(event?.taxHandling);
  const hasOrganizationContext = Boolean(organization) || Boolean(normalizeText(event?.organizationId));

  if (selectedEventTaxHandling === 'EXEMPT_PARTICIPANT_SPORTS') {
    if (hasOrganizationContext && !hasAcceptedTaxResponsibility(organization?.taxResponsibilityAcceptedAt)) {
      return buildTaxPolicyDecision({
        mode: 'STRIPE_TAX_REQUIRED',
        reasonCode: 'organization_tax_profile_incomplete',
        jurisdictionState,
        purchaseType: normalizedPurchaseType,
        taxability: 'UNKNOWN',
        liabilityParty: 'PLATFORM',
        collectionStrategy: 'PLATFORM_STRIPE_TAX',
      });
    }
    if (!jurisdictionState) {
      return buildTaxPolicyDecision({
        mode: 'STRIPE_TAX_REQUIRED',
        reasonCode: 'missing_event_jurisdiction',
        jurisdictionState: null,
        purchaseType: normalizedPurchaseType,
        taxability: 'UNKNOWN',
        liabilityParty: 'PLATFORM',
        collectionStrategy: 'PLATFORM_STRIPE_TAX',
      });
    }

    return buildTaxPolicyDecision({
      mode: 'ZERO_TAX',
      reasonCode: 'seller_attested_sports_exempt',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'NOT_TAXABLE',
      liabilityParty: 'NONE',
      collectionStrategy: 'NO_TAX',
    });
  }

  if (hasOrganizationContext && selectedEventTaxHandling === 'INHERIT_ORG') {
    const organizationDefaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(
      organization?.defaultEventTaxHandling,
    );
    if (organizationDefaultEventTaxHandling === 'EXEMPT_PARTICIPANT_SPORTS') {
      if (!hasAcceptedTaxResponsibility(organization?.taxResponsibilityAcceptedAt)) {
        return buildTaxPolicyDecision({
          mode: 'STRIPE_TAX_REQUIRED',
          reasonCode: 'organization_tax_profile_incomplete',
          jurisdictionState,
          purchaseType: normalizedPurchaseType,
          taxability: 'UNKNOWN',
          liabilityParty: 'PLATFORM',
          collectionStrategy: 'PLATFORM_STRIPE_TAX',
        });
      }
      if (!jurisdictionState) {
        return buildTaxPolicyDecision({
          mode: 'STRIPE_TAX_REQUIRED',
          reasonCode: 'missing_event_jurisdiction',
          jurisdictionState: null,
          purchaseType: normalizedPurchaseType,
          taxability: 'UNKNOWN',
          liabilityParty: 'PLATFORM',
          collectionStrategy: 'PLATFORM_STRIPE_TAX',
        });
      }
      return buildTaxPolicyDecision({
        mode: 'ZERO_TAX',
        reasonCode: 'organization_default_sports_exempt',
        jurisdictionState,
        purchaseType: normalizedPurchaseType,
        taxability: 'NOT_TAXABLE',
        liabilityParty: 'NONE',
        collectionStrategy: 'NO_TAX',
      });
    }
  }

  if (!jurisdictionState) {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'missing_event_jurisdiction',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
      taxability: 'UNKNOWN',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  const organizerLiabilityRule = findOrganizerLiabilityRule({
    stateCode: jurisdictionState,
    purchaseType: normalizedPurchaseType,
    taxCategory: normalizedTaxCategory,
    rules: organizerLiabilityRules,
  });
  if (organizerLiabilityRule) {
    const collectionStrategy = resolveOrganizerCollectionStrategy({
      selectedEventTaxHandling,
      rule: organizerLiabilityRule,
    });
    const selectedOrganizerStripeTax = selectedEventTaxHandling === 'ORGANIZER_STRIPE_TAX';
    const selectedOrganizerManualTax = selectedEventTaxHandling === 'ORGANIZER_MANUAL_TAX';
    const collectionSelected = selectedOrganizerManualTax || selectedOrganizerStripeTax || collectionStrategy !== 'BLOCKED_NEEDS_REVIEW';
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: collectionStrategy === 'ORGANIZER_MANUAL_TAX'
        ? 'organizer_manual_tax_selected'
        : collectionStrategy === 'ORGANIZER_STRIPE_TAX'
          ? 'organizer_stripe_tax_selected'
          : collectionSelected
            ? 'organizer_tax_collection_not_allowed'
            : 'organizer_tax_collection_not_selected',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'ORGANIZER',
      collectionStrategy,
      organizerResponsibilityMessage: ORGANIZER_TAX_RESPONSIBILITY_MESSAGE,
      policyRuleId: organizerLiabilityRule.ruleId,
      policyRuleVersion: organizerLiabilityRule.ruleVersion,
    });
  }

  if (selectedEventTaxHandling === 'ORGANIZER_MANUAL_TAX' || selectedEventTaxHandling === 'ORGANIZER_STRIPE_TAX') {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organizer_tax_collection_not_allowed',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  if (selectedEventTaxHandling === 'STRIPE_TAX') {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'seller_selected_stripe_tax',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  if (hasOrganizationContext) {
    return buildTaxPolicyDecision({
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organization_default_stripe_tax',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'TAXABLE',
      liabilityParty: 'PLATFORM',
      collectionStrategy: 'PLATFORM_STRIPE_TAX',
    });
  }

  if (SPORTS_PARTICIPANT_EXEMPT_STATE_CODES.has(jurisdictionState)) {
    return buildTaxPolicyDecision({
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'NOT_TAXABLE',
      liabilityParty: 'NONE',
      collectionStrategy: 'NO_TAX',
    });
  }

  if (NO_GENERAL_SALES_TAX_STATE_CODES.has(jurisdictionState)) {
    return buildTaxPolicyDecision({
      mode: 'ZERO_TAX',
      reasonCode: 'no_general_sales_tax_state',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
      taxability: 'NOT_TAXABLE',
      liabilityParty: 'NONE',
      collectionStrategy: 'NO_TAX',
    });
  }

  return buildTaxPolicyDecision({
    mode: 'STRIPE_TAX_REQUIRED',
    reasonCode: 'tax_policy_not_configured',
    jurisdictionState,
    purchaseType: normalizedPurchaseType,
    taxability: 'TAXABLE',
    liabilityParty: 'PLATFORM',
    collectionStrategy: 'PLATFORM_STRIPE_TAX',
  });
};
