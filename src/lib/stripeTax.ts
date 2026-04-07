import Stripe from 'stripe';
import type { BillingAddress } from '@/lib/billingAddress';
import { calculateMvpAndStripeFeesWithTax } from '@/lib/billingFees';
import { ensurePlatformStripeCustomer } from '@/lib/stripeCustomer';

export type ProductTaxCategory = 'ONE_TIME_PRODUCT' | 'SUBSCRIPTION' | 'NON_TAXABLE';

export type InternalTaxCategory =
  | 'EVENT_PARTICIPANT'
  | 'EVENT_SPECTATOR'
  | 'RENTAL'
  | 'SUBSCRIPTION'
  | 'ONE_TIME_PRODUCT'
  | 'NON_TAXABLE';

export const INTERNAL_TAX_CATEGORIES = [
  'EVENT_PARTICIPANT',
  'EVENT_SPECTATOR',
  'RENTAL',
  'SUBSCRIPTION',
  'ONE_TIME_PRODUCT',
  'NON_TAXABLE',
] as const satisfies ReadonlyArray<InternalTaxCategory>;

export type TaxQuote = {
  calculationId: string;
  subtotalCents: number;
  processingFeeCents: number;
  stripeProcessingFeeCents: number;
  stripeTaxServiceFeeCents: number;
  stripeFeeCents: number;
  taxAmountCents: number;
  totalChargeCents: number;
  hostReceivesCents: number;
  feePercentage: number;
  purchaseType: string;
  taxCategory: InternalTaxCategory;
  customerId: string;
};

const STRIPE_TAX_SERVICE_FEE_CENTS_DEFAULT = 50;
const NON_TAXABLE_STRIPE_TAX_CODE = 'txcd_00000000';

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveStripeTaxServiceFeeCents = (): number =>
  Math.max(0, parseIntEnv(process.env.STRIPE_TAX_SERVICE_FEE_CENTS, STRIPE_TAX_SERVICE_FEE_CENTS_DEFAULT));

export const resolveTaxCategoryForPurchase = ({
  purchaseType,
  requestedTaxCategory,
  productTaxCategory,
}: {
  purchaseType: string;
  requestedTaxCategory?: InternalTaxCategory | null;
  productTaxCategory?: ProductTaxCategory | null;
}): InternalTaxCategory => {
  if (requestedTaxCategory) {
    return requestedTaxCategory;
  }

  if (purchaseType === 'product') {
    if (productTaxCategory === 'SUBSCRIPTION') return 'SUBSCRIPTION';
    if (productTaxCategory === 'NON_TAXABLE') return 'NON_TAXABLE';
    return 'ONE_TIME_PRODUCT';
  }

  if (purchaseType === 'rental') {
    return 'RENTAL';
  }

  return 'EVENT_PARTICIPANT';
};

export const resolveStripeTaxCode = (taxCategory: InternalTaxCategory): string => {
  const envMapping: Record<InternalTaxCategory, string | undefined> = {
    EVENT_PARTICIPANT: process.env.STRIPE_TAX_CODE_EVENT_PARTICIPANT,
    EVENT_SPECTATOR: process.env.STRIPE_TAX_CODE_EVENT_SPECTATOR,
    RENTAL: process.env.STRIPE_TAX_CODE_RENTAL,
    SUBSCRIPTION: process.env.STRIPE_TAX_CODE_SUBSCRIPTION,
    ONE_TIME_PRODUCT: process.env.STRIPE_TAX_CODE_ONE_TIME_PRODUCT,
    NON_TAXABLE: process.env.STRIPE_TAX_CODE_NON_TAXABLE,
  };

  const configuredCode = envMapping[taxCategory]?.trim();
  if (configuredCode) {
    return configuredCode;
  }
  if (taxCategory === 'NON_TAXABLE') {
    return NON_TAXABLE_STRIPE_TAX_CODE;
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`Missing Stripe tax code mapping for ${taxCategory}; falling back to non-taxable in development.`);
    return NON_TAXABLE_STRIPE_TAX_CODE;
  }
  throw new Error(`Missing Stripe tax code mapping for ${taxCategory}.`);
};

export const calculateTaxQuote = async ({
  stripe,
  userId,
  organizationId,
  email,
  billingAddress,
  subtotalCents,
  purchaseType,
  taxCategory,
  eventType,
  lineItemReference,
  description,
}: {
  stripe: Stripe;
  userId?: string | null;
  organizationId?: string | null;
  email?: string | null;
  billingAddress: BillingAddress;
  subtotalCents: number;
  purchaseType: string;
  taxCategory: InternalTaxCategory;
  eventType?: unknown;
  lineItemReference: string;
  description?: string | null;
}): Promise<TaxQuote> => {
  const normalizedSubtotal = Math.max(0, Math.round(subtotalCents));
  if (normalizedSubtotal <= 0) {
    throw new Error('A positive subtotal is required before calculating tax.');
  }

  const customerId = await ensurePlatformStripeCustomer({
    stripe,
    userId,
    organizationId,
    email,
    billingAddress,
  });

  const calculation = await stripe.tax.calculations.create({
    customer: customerId,
    currency: 'usd',
    line_items: [
      {
        amount: normalizedSubtotal,
        reference: lineItemReference.slice(0, 200),
        tax_behavior: 'exclusive',
        tax_code: resolveStripeTaxCode(taxCategory),
        metadata: description ? { description: description.slice(0, 200) } : undefined,
      },
    ],
  });

  const taxAmountCents = Math.max(0, calculation.tax_amount_exclusive ?? 0);
  const stripeTaxServiceFeeCents = resolveStripeTaxServiceFeeCents();
  const fees = calculateMvpAndStripeFeesWithTax({
    eventAmountCents: normalizedSubtotal,
    eventType,
    taxAmountCents,
    stripeTaxServiceFeeCents,
  });

  return {
    calculationId: calculation.id ?? '',
    subtotalCents: normalizedSubtotal,
    processingFeeCents: fees.mvpFeeCents,
    stripeProcessingFeeCents: fees.stripeProcessingFeeCents,
    stripeTaxServiceFeeCents: fees.stripeTaxServiceFeeCents,
    stripeFeeCents: fees.stripeFeeCents,
    taxAmountCents,
    totalChargeCents: fees.totalChargeCents,
    hostReceivesCents: normalizedSubtotal,
    feePercentage: fees.mvpFeePercentage * 100,
    purchaseType,
    taxCategory,
    customerId,
  };
};
