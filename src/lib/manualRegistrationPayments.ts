export type RegistrationPaymentMode = 'ONLINE' | 'MANUAL';

export type ManualPaymentProvider =
  | 'CASH_APP'
  | 'VENMO'
  | 'PAYPAL'
  | 'STRIPE'
  | 'ZELLE'
  | 'OTHER';

export type ManualPaymentLink = {
  id: string;
  provider: ManualPaymentProvider;
  label: string;
  url: string;
};

export type ManualPaymentSummary = {
  eventPrice: number;
  stripeFee: 0;
  stripeProcessingFee: 0;
  stripeTaxServiceFee: 0;
  processingFee: 0;
  mvpFee: 0;
  taxAmount: 0;
  totalCharge: number;
  hostReceives: number;
  feePercentage: 0;
  purchaseType: 'manual_event_registration';
  paymentMethodType: 'manual';
  paymentMethodLabel: 'Manual payment';
};

const PROVIDER_LABELS: Record<ManualPaymentProvider, string> = {
  CASH_APP: 'Cash App',
  VENMO: 'Venmo',
  PAYPAL: 'PayPal',
  STRIPE: 'Stripe',
  ZELLE: 'Zelle',
  OTHER: 'Payment link',
};

const PROVIDER_ALIASES: Record<string, ManualPaymentProvider> = {
  cash: 'CASH_APP',
  cashapp: 'CASH_APP',
  cash_app: 'CASH_APP',
  cash_app_pay: 'CASH_APP',
  venmo: 'VENMO',
  paypal: 'PAYPAL',
  pay_pal: 'PAYPAL',
  stripe: 'STRIPE',
  zelle: 'ZELLE',
  other: 'OTHER',
  custom: 'OTHER',
};

const normalizeIdPart = (value: unknown): string => (
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

export const normalizeRegistrationPaymentMode = (value: unknown): RegistrationPaymentMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === 'MANUAL' ? 'MANUAL' : 'ONLINE';
};

export const isManualRegistrationPaymentMode = (value: unknown): boolean => (
  normalizeRegistrationPaymentMode(value) === 'MANUAL'
);

export const normalizeManualPaymentProvider = (value: unknown): ManualPaymentProvider => {
  const normalized = normalizeIdPart(value);
  return PROVIDER_ALIASES[normalized] ?? 'OTHER';
};

export const getManualPaymentProviderLabel = (provider: unknown): string => (
  PROVIDER_LABELS[normalizeManualPaymentProvider(provider)]
);

const normalizeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

export const normalizeManualPaymentLinks = (value: unknown): ManualPaymentLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index): ManualPaymentLink | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const url = normalizeHttpsUrl(row.url ?? row.href ?? row.link);
      if (!url) {
        return null;
      }
      const provider = normalizeManualPaymentProvider(row.provider ?? row.type);
      const label = typeof row.label === 'string' && row.label.trim().length > 0
        ? row.label.trim().slice(0, 80)
        : PROVIDER_LABELS[provider];
      const explicitId = typeof row.id === 'string' ? normalizeIdPart(row.id) : '';
      return {
        id: explicitId || `${normalizeIdPart(provider)}_${index + 1}`,
        provider,
        label,
        url,
      };
    })
    .filter((entry): entry is ManualPaymentLink => Boolean(entry));
};

export const normalizeManualPaymentInstructions = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed.slice(0, 2000) : null;
};

const normalizeCents = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
};

export const buildManualPaymentSummary = (amountCents: unknown): ManualPaymentSummary => {
  const amount = normalizeCents(amountCents);
  return {
    eventPrice: amount,
    stripeFee: 0,
    stripeProcessingFee: 0,
    stripeTaxServiceFee: 0,
    processingFee: 0,
    mvpFee: 0,
    taxAmount: 0,
    totalCharge: amount,
    hostReceives: amount,
    feePercentage: 0,
    purchaseType: 'manual_event_registration',
    paymentMethodType: 'manual',
    paymentMethodLabel: 'Manual payment',
  };
};
