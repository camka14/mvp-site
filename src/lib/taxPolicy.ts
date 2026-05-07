export type TaxMode = 'ZERO_TAX' | 'STRIPE_TAX_REQUIRED';

export const ORG_TAX_AGREEMENT_VERSION = '2026-05-07';

export type OrganizationTaxClassification =
  | 'INDIVIDUAL_OR_CLUB'
  | 'NONPROFIT_OR_ASSOCIATION'
  | 'FACILITY_OPERATOR'
  | 'BUSINESS_OTHER';

export type EventTaxHandling =
  | 'INHERIT_ORG'
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
];

export const ORGANIZATION_DEFAULT_EVENT_TAX_HANDLING_VALUES: readonly Exclude<EventTaxHandling, 'INHERIT_ORG'>[] = [
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
};

export type ResolvePurchaseTaxPolicyParams = {
  purchaseType: string;
  taxCategory?: string | null;
  event?: {
    address?: unknown;
    location?: unknown;
    organizationId?: unknown;
    taxHandling?: unknown;
  } | null;
  organization?: {
    defaultEventTaxHandling?: unknown;
    taxResponsibilityAcceptedAt?: unknown;
  } | null;
  timeSlot?: {
    taxHandling?: unknown;
  } | null;
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
  fallback: Exclude<EventTaxHandling, 'INHERIT_ORG'> = 'STRIPE_TAX',
): Exclude<EventTaxHandling, 'INHERIT_ORG'> => {
  const normalized = normalizeEventTaxHandling(value, fallback);
  return normalized === 'INHERIT_ORG' ? fallback : normalized;
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

export const resolvePurchaseTaxPolicy = ({
  purchaseType,
  taxCategory,
  event,
  organization,
}: ResolvePurchaseTaxPolicyParams): TaxPolicyDecision => {
  const normalizedPurchaseType = normalizeText(purchaseType)?.toLowerCase() ?? '';
  if (normalizedPurchaseType !== 'event') {
    return {
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'non_event_purchase',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
    };
  }

  const normalizedTaxCategory = normalizeText(taxCategory)?.toUpperCase() ?? 'EVENT_PARTICIPANT';
  if (normalizedTaxCategory !== 'EVENT_PARTICIPANT') {
    return {
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'unsupported_tax_category',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
    };
  }

  const jurisdictionState = extractUsStateCodeFromLocationText(event?.address, event?.location);
  const selectedEventTaxHandling = normalizeEventTaxHandling(event?.taxHandling);
  const hasOrganizationContext = Boolean(organization) || Boolean(normalizeText(event?.organizationId));

  if (selectedEventTaxHandling === 'STRIPE_TAX') {
    return {
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'seller_selected_stripe_tax',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
    };
  }

  if (selectedEventTaxHandling === 'EXEMPT_PARTICIPANT_SPORTS') {
    if (hasOrganizationContext && !hasAcceptedTaxResponsibility(organization?.taxResponsibilityAcceptedAt)) {
      return {
        mode: 'STRIPE_TAX_REQUIRED',
        reasonCode: 'organization_tax_profile_incomplete',
        jurisdictionState,
        purchaseType: normalizedPurchaseType,
      };
    }
    if (!jurisdictionState) {
      return {
        mode: 'STRIPE_TAX_REQUIRED',
        reasonCode: 'missing_event_jurisdiction',
        jurisdictionState: null,
        purchaseType: normalizedPurchaseType,
      };
    }

    return {
      mode: 'ZERO_TAX',
      reasonCode: 'seller_attested_sports_exempt',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
    };
  }

  if (hasOrganizationContext) {
    const organizationDefaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(
      organization?.defaultEventTaxHandling,
    );
    if (organizationDefaultEventTaxHandling === 'EXEMPT_PARTICIPANT_SPORTS') {
      if (!hasAcceptedTaxResponsibility(organization?.taxResponsibilityAcceptedAt)) {
        return {
          mode: 'STRIPE_TAX_REQUIRED',
          reasonCode: 'organization_tax_profile_incomplete',
          jurisdictionState,
          purchaseType: normalizedPurchaseType,
        };
      }
      if (!jurisdictionState) {
        return {
          mode: 'STRIPE_TAX_REQUIRED',
          reasonCode: 'missing_event_jurisdiction',
          jurisdictionState: null,
          purchaseType: normalizedPurchaseType,
        };
      }
      return {
        mode: 'ZERO_TAX',
        reasonCode: 'organization_default_sports_exempt',
        jurisdictionState,
        purchaseType: normalizedPurchaseType,
      };
    }

    return {
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'organization_default_stripe_tax',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
    };
  }

  if (!jurisdictionState) {
    return {
      mode: 'STRIPE_TAX_REQUIRED',
      reasonCode: 'missing_event_jurisdiction',
      jurisdictionState: null,
      purchaseType: normalizedPurchaseType,
    };
  }

  if (SPORTS_PARTICIPANT_EXEMPT_STATE_CODES.has(jurisdictionState)) {
    return {
      mode: 'ZERO_TAX',
      reasonCode: 'sports_participant_state_exempt',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
    };
  }

  if (NO_GENERAL_SALES_TAX_STATE_CODES.has(jurisdictionState)) {
    return {
      mode: 'ZERO_TAX',
      reasonCode: 'no_general_sales_tax_state',
      jurisdictionState,
      purchaseType: normalizedPurchaseType,
    };
  }

  return {
    mode: 'STRIPE_TAX_REQUIRED',
    reasonCode: 'tax_policy_not_configured',
    jurisdictionState,
    purchaseType: normalizedPurchaseType,
  };
};
