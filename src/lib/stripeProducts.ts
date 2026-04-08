import Stripe from 'stripe';
import { resolveStripeTaxCode, type InternalTaxCategory, type ProductTaxCategory } from '@/lib/stripeTax';

export type StripeBackedProduct = {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  period: string;
  organizationId: string;
  taxCategory?: ProductTaxCategory | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
};

export const PRODUCT_PERIODS = ['SINGLE', 'WEEK', 'MONTH', 'YEAR'] as const;
export const RECURRING_PRODUCT_PERIODS = ['WEEK', 'MONTH', 'YEAR'] as const;
export const PRODUCT_TAX_CATEGORIES = [
  'ONE_TIME_PRODUCT',
  'DAY_PASS',
  'EQUIPMENT_RENTAL',
  'SUBSCRIPTION',
  'NON_TAXABLE',
] as const;
const PLATFORM_FEE_PRODUCT_ROLE = 'platform_fee';
const PLATFORM_FEE_PRODUCT_NAME = 'MVP Platform Fee';

export const normalizeProductPeriod = (value: unknown): (typeof PRODUCT_PERIODS)[number] | null => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'MONTHLY') return 'MONTH';
  if (normalized === 'WEEKLY') return 'WEEK';
  if (normalized === 'YEARLY') return 'YEAR';
  if (normalized === 'SINGLE_PURCHASE' || normalized === 'ONE-TIME' || normalized === 'ONE_TIME') {
    return 'SINGLE';
  }
  return PRODUCT_PERIODS.includes(normalized as (typeof PRODUCT_PERIODS)[number])
    ? (normalized as (typeof PRODUCT_PERIODS)[number])
    : null;
};

export const isRecurringProductPeriod = (value: unknown): boolean => {
  const normalized = normalizeProductPeriod(value);
  return normalized != null && RECURRING_PRODUCT_PERIODS.includes(normalized as (typeof RECURRING_PRODUCT_PERIODS)[number]);
};

const normalizeInterval = (period: string): Stripe.PriceCreateParams.Recurring.Interval => {
  const normalized = period.trim().toUpperCase();
  if (normalized === 'WEEK') return 'week';
  if (normalized === 'YEAR') return 'year';
  return 'month';
};

export const normalizeProductTaxCategory = (
  value: unknown,
): ProductTaxCategory | null => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return PRODUCT_TAX_CATEGORIES.includes(normalized as ProductTaxCategory)
    ? (normalized as ProductTaxCategory)
    : null;
};

const resolveProductTaxCategory = (
  productTaxCategory: ProductTaxCategory | null | undefined,
  overrideTaxCategory?: InternalTaxCategory | null,
): InternalTaxCategory => {
  if (overrideTaxCategory) {
    return overrideTaxCategory;
  }
  if (productTaxCategory === 'DAY_PASS') {
    return 'DAY_PASS';
  }
  if (productTaxCategory === 'EQUIPMENT_RENTAL') {
    return 'EQUIPMENT_RENTAL';
  }
  if (productTaxCategory === 'NON_TAXABLE') {
    return 'NON_TAXABLE';
  }
  if (productTaxCategory === 'SUBSCRIPTION') {
    return 'SUBSCRIPTION';
  }
  return 'ONE_TIME_PRODUCT';
};

const buildProductMetadata = (product: StripeBackedProduct): Stripe.MetadataParam => ({
  local_product_id: product.id,
  organization_id: product.organizationId,
  product_period: product.period,
  is_recurring: String(isRecurringProductPeriod(product.period)),
});

const buildPriceMetadata = (
  product: StripeBackedProduct,
  taxCategory: InternalTaxCategory,
): Stripe.MetadataParam => ({
  local_product_id: product.id,
  organization_id: product.organizationId,
  tax_category: taxCategory,
  billing_period: product.period,
});

export const syncPlatformProductCatalog = async ({
  stripe,
  product,
  forceNewPrice = false,
  overrideTaxCategory,
}: {
  stripe: Stripe;
  product: StripeBackedProduct;
  forceNewPrice?: boolean;
  overrideTaxCategory?: InternalTaxCategory | null;
}): Promise<{
  stripeProductId: string;
  stripePriceId: string | null;
  effectiveTaxCategory: InternalTaxCategory;
}> => {
  const effectiveTaxCategory = resolveProductTaxCategory(product.taxCategory, overrideTaxCategory);
  const isRecurring = isRecurringProductPeriod(product.period);
  const stripeTaxCode = resolveStripeTaxCode(effectiveTaxCategory);
  const productMetadata = buildProductMetadata(product);

  let stripeProductId = product.stripeProductId?.trim() || '';
  if (stripeProductId) {
    try {
      await stripe.products.update(stripeProductId, {
        name: product.name,
        description: product.description ?? undefined,
        metadata: productMetadata,
        tax_code: stripeTaxCode,
        active: true,
      });
    } catch (error) {
      console.warn(`Failed to update Stripe product ${stripeProductId}; creating a replacement.`, error);
      stripeProductId = '';
    }
  }

  if (!stripeProductId) {
    const createdProduct = await stripe.products.create({
      name: product.name,
      description: product.description ?? undefined,
      metadata: productMetadata,
      tax_code: stripeTaxCode,
      active: true,
    });
    stripeProductId = createdProduct.id;
  }

  let stripePriceId: string | null = product.stripePriceId?.trim() || null;
  if (!isRecurring) {
    if (stripePriceId) {
      try {
        await stripe.prices.update(stripePriceId, { active: false });
      } catch (error) {
        console.warn(`Failed to archive Stripe price ${stripePriceId}.`, error);
      }
      stripePriceId = null;
    } else {
      stripePriceId = null;
    }
  } else {
    const recurringInterval = normalizeInterval(product.period);
    const needsNewPrice = forceNewPrice || !stripePriceId;
    if (needsNewPrice) {
      const createdPrice = await stripe.prices.create({
        currency: 'usd',
        unit_amount: Math.max(0, Math.round(product.priceCents)),
        product: stripeProductId,
        recurring: { interval: recurringInterval },
        tax_behavior: 'exclusive',
        metadata: buildPriceMetadata(product, effectiveTaxCategory),
      });
      const previousPriceId = stripePriceId;
      stripePriceId = createdPrice.id;

      if (previousPriceId && previousPriceId !== stripePriceId) {
        try {
          await stripe.prices.update(previousPriceId, { active: false });
        } catch (error) {
          console.warn(`Failed to archive Stripe price ${previousPriceId}.`, error);
        }
      }
    }
  }

  return {
    stripeProductId,
    stripePriceId,
    effectiveTaxCategory,
  };
};

export const syncPlatformRecurringProduct = syncPlatformProductCatalog;

export const defaultProductTaxCategoryForPeriod = (period: unknown): ProductTaxCategory => (
  isRecurringProductPeriod(period) ? 'SUBSCRIPTION' : 'ONE_TIME_PRODUCT'
);

export const ensurePlatformFeeProduct = async ({
  stripe,
}: {
  stripe: Stripe;
}): Promise<string> => {
  const configuredProductId = process.env.STRIPE_PLATFORM_FEE_PRODUCT_ID?.trim();
  if (configuredProductId) {
    return configuredProductId;
  }

  let startingAfter: string | undefined;
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const existing = page.data.find((product) => product.metadata?.product_role === PLATFORM_FEE_PRODUCT_ROLE);
    if (existing?.id) {
      return existing.id;
    }
    if (!page.has_more) {
      break;
    }
    startingAfter = page.data[page.data.length - 1]?.id;
  } while (startingAfter);

  const created = await stripe.products.create({
    name: PLATFORM_FEE_PRODUCT_NAME,
    active: true,
    metadata: {
      product_role: PLATFORM_FEE_PRODUCT_ROLE,
    },
    tax_code: resolveStripeTaxCode('NON_TAXABLE'),
  });
  return created.id;
};
