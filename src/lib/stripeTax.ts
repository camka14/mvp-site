import Stripe from 'stripe';
import type { BillingAddress } from '@/lib/billingAddress';
import {
  calculateMvpAndStripeFeesWithTax,
  DEFAULT_STRIPE_TAX_SERVICE_FEE_CENTS,
} from '@/lib/billingFees';
import { ensurePlatformStripeCustomer } from '@/lib/stripeCustomer';

export type ProductTaxCategory =
  | 'ONE_TIME_PRODUCT'
  | 'DAY_PASS'
  | 'EQUIPMENT_RENTAL'
  | 'SUBSCRIPTION'
  | 'NON_TAXABLE';

export type InternalTaxCategory =
  | 'EVENT_PARTICIPANT'
  | 'EVENT_SPECTATOR'
  | 'RENTAL'
  | 'DAY_PASS'
  | 'EQUIPMENT_RENTAL'
  | 'SUBSCRIPTION'
  | 'ONE_TIME_PRODUCT'
  | 'NON_TAXABLE';

export const INTERNAL_TAX_CATEGORIES = [
  'EVENT_PARTICIPANT',
  'EVENT_SPECTATOR',
  'RENTAL',
  'DAY_PASS',
  'EQUIPMENT_RENTAL',
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

const GENERAL_SERVICES_STRIPE_TAX_CODE = 'txcd_20030000';
const GENERAL_TANGIBLE_GOODS_STRIPE_TAX_CODE = 'txcd_99999999';
const NON_TAXABLE_STRIPE_TAX_CODE = 'txcd_00000000';

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveStripeTaxServiceFeeCents = (): number =>
  Math.max(0, parseIntEnv(process.env.STRIPE_TAX_SERVICE_FEE_CENTS, DEFAULT_STRIPE_TAX_SERVICE_FEE_CENTS));

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
    if (productTaxCategory === 'DAY_PASS') return 'DAY_PASS';
    if (productTaxCategory === 'EQUIPMENT_RENTAL') return 'EQUIPMENT_RENTAL';
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
  // Use Stripe's general service and tangible-goods codes unless we later
  // introduce a narrower domain model with product-specific legal categories.
  const hardcodedMapping: Record<InternalTaxCategory, string> = {
    EVENT_PARTICIPANT: GENERAL_SERVICES_STRIPE_TAX_CODE,
    EVENT_SPECTATOR: GENERAL_SERVICES_STRIPE_TAX_CODE,
    RENTAL: GENERAL_SERVICES_STRIPE_TAX_CODE,
    DAY_PASS: GENERAL_SERVICES_STRIPE_TAX_CODE,
    EQUIPMENT_RENTAL: GENERAL_SERVICES_STRIPE_TAX_CODE,
    SUBSCRIPTION: GENERAL_SERVICES_STRIPE_TAX_CODE,
    ONE_TIME_PRODUCT: GENERAL_TANGIBLE_GOODS_STRIPE_TAX_CODE,
    NON_TAXABLE: NON_TAXABLE_STRIPE_TAX_CODE,
  };
  return hardcodedMapping[taxCategory];
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
