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

const PROVIDER_INPUT_LABELS: Record<ManualPaymentProvider, string> = {
  CASH_APP: 'Cash App username',
  VENMO: 'Venmo username',
  PAYPAL: 'PayPal.Me username',
  STRIPE: 'HTTPS link',
  ZELLE: 'HTTPS link',
  OTHER: 'HTTPS link',
};

const PROVIDER_INPUT_PLACEHOLDERS: Record<ManualPaymentProvider, string> = {
  CASH_APP: '$bracketiq',
  VENMO: '@bracketiq',
  PAYPAL: 'bracketiq',
  STRIPE: 'https://...',
  ZELLE: 'https://...',
  OTHER: 'https://...',
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

export const getManualPaymentProviderInputLabel = (provider: unknown): string => (
  PROVIDER_INPUT_LABELS[normalizeManualPaymentProvider(provider)]
);

export const getManualPaymentProviderInputPlaceholder = (provider: unknown): string => (
  PROVIDER_INPUT_PLACEHOLDERS[normalizeManualPaymentProvider(provider)]
);

export const manualPaymentProviderUsesUsername = (provider: unknown): boolean => (
  ['CASH_APP', 'VENMO', 'PAYPAL'].includes(normalizeManualPaymentProvider(provider))
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
    return trimmed;
  } catch {
    return null;
  }
};

const normalizeManualPaymentHandle = (value: string): string => (
  value
    .trim()
    .replace(/^[@$]+/, '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
);

export const normalizeManualPaymentUrl = (
  provider: unknown,
  value: unknown,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const input = value.trim();
  if (!input || /\s/.test(input)) {
    return null;
  }
  if (/^https:\/\//i.test(input)) {
    return normalizeHttpsUrl(input);
  }
  if (/^http:\/\//i.test(input)) {
    return null;
  }

  const handle = normalizeManualPaymentHandle(input);
  if (!handle) {
    return null;
  }
  switch (normalizeManualPaymentProvider(provider)) {
    case 'CASH_APP':
      return `https://cash.app/$${handle}`;
    case 'VENMO':
      return `https://venmo.com/u/${handle}`;
    case 'PAYPAL':
      return `https://paypal.me/${handle}`;
    default:
      return null;
  }
};

export const formatManualPaymentProviderInput = (
  provider: unknown,
  value: unknown,
): string => {
  const input = typeof value === 'string' ? value.trim() : '';
  const normalizedProvider = normalizeManualPaymentProvider(provider);
  const pathParts = input.split('/').filter(Boolean);
  const lastPathPart = pathParts[pathParts.length - 1];
  const storedHandle = normalizedProvider === 'CASH_APP' && /^https:\/\/cash\.app\//i.test(input)
    ? lastPathPart
    : normalizedProvider === 'VENMO' && /^https:\/\/venmo\.com\/u\//i.test(input)
      ? lastPathPart
      : normalizedProvider === 'PAYPAL' && /^https:\/\/paypal\.me\//i.test(input)
        ? lastPathPart
        : null;
  const handle = normalizeManualPaymentHandle(storedHandle ?? input);

  if (normalizedProvider === 'CASH_APP') {
    return `$${handle}`;
  }
  if (normalizedProvider === 'VENMO') {
    return `@${handle}`;
  }
  if (normalizedProvider === 'PAYPAL' && storedHandle) {
    return handle;
  }
  return input;
};

export const getManualPaymentLinkError = (
  provider: unknown,
  value: unknown,
): string | null => {
  const normalizedProvider = normalizeManualPaymentProvider(provider);
  const rawValue = typeof value === 'string' ? value.trim() : '';
  const inputLabel = getManualPaymentProviderInputLabel(normalizedProvider);
  if (!rawValue) {
    return `Enter ${inputLabel.toLowerCase()}.`;
  }
  if (normalizeManualPaymentUrl(normalizedProvider, rawValue)) {
    return null;
  }
  if (manualPaymentProviderUsesUsername(normalizedProvider)) {
    return `Enter a valid ${inputLabel} or HTTPS link.`;
  }
  return 'Enter a valid https:// payment link.';
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
      const provider = normalizeManualPaymentProvider(row.provider ?? row.type);
      const url = normalizeManualPaymentUrl(provider, row.url ?? row.href ?? row.link);
      if (!url) {
        return null;
      }
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
    .filter((entry): entry is ManualPaymentLink => Boolean(entry))
    .filter((entry, index, links) => links.findIndex((link) => link.id === entry.id) === index);
};

export const normalizeManualPaymentLinksForPersistence = (value: unknown): ManualPaymentLink[] => {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('Manual payment destinations must be a list.');
  }
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Remove the invalid manual payment destination.');
    }
    const row = entry as Record<string, unknown>;
    const provider = normalizeManualPaymentProvider(row.provider ?? row.type);
    const error = getManualPaymentLinkError(provider, row.url ?? row.href ?? row.link);
    if (error) {
      throw new Error(error);
    }
  });
  const normalized = normalizeManualPaymentLinks(value);
  if (normalized.length !== value.length) {
    throw new Error('Each manual payment destination needs a unique identifier.');
  }
  return normalized;
};

export const normalizeManualPaymentLinksForDraft = (value: unknown): ManualPaymentLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry, index): ManualPaymentLink[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const provider = normalizeManualPaymentProvider(row.provider ?? row.type);
    const rawValue = row.url ?? row.href ?? row.link;
    const rawUrl = typeof rawValue === 'string' ? rawValue.trim() : '';
    const normalizedUrl = normalizeManualPaymentUrl(provider, rawUrl);
    const explicitId = typeof row.id === 'string' ? normalizeIdPart(row.id) : '';
    return [{
      id: explicitId || `${normalizeIdPart(provider)}_${index + 1}`,
      provider,
      label: typeof row.label === 'string' && row.label.trim()
        ? row.label.trim().slice(0, 80)
        : PROVIDER_LABELS[provider],
      url: normalizedUrl ?? rawUrl,
    }];
  });
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
