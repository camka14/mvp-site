import Stripe from 'stripe';
import { resolveStripeTaxCode, type InternalTaxCategory, type ProductTaxCategory } from '@/lib/stripeTax';

export type StripeBackedRecurringProduct = {
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

const PRODUCT_TAX_CATEGORIES = ['ONE_TIME_PRODUCT', 'SUBSCRIPTION', 'NON_TAXABLE'] as const;
const PLATFORM_FEE_PRODUCT_ROLE = 'platform_fee';
const PLATFORM_FEE_PRODUCT_NAME = 'MVP Platform Fee';

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

const resolveRecurringProductTaxCategory = (
  productTaxCategory: ProductTaxCategory | null | undefined,
  overrideTaxCategory?: InternalTaxCategory | null,
): InternalTaxCategory => {
  if (overrideTaxCategory) {
    return overrideTaxCategory;
  }
  if (productTaxCategory === 'NON_TAXABLE') {
    return 'NON_TAXABLE';
  }
  return 'SUBSCRIPTION';
};

const buildProductMetadata = (product: StripeBackedRecurringProduct): Stripe.MetadataParam => ({
  local_product_id: product.id,
  organization_id: product.organizationId,
  product_period: product.period,
});

const buildPriceMetadata = (
  product: StripeBackedRecurringProduct,
  taxCategory: InternalTaxCategory,
): Stripe.MetadataParam => ({
  local_product_id: product.id,
  organization_id: product.organizationId,
  tax_category: taxCategory,
  billing_period: product.period,
});

export const syncPlatformRecurringProduct = async ({
  stripe,
  product,
  forceNewPrice = false,
  overrideTaxCategory,
}: {
  stripe: Stripe;
  product: StripeBackedRecurringProduct;
  forceNewPrice?: boolean;
  overrideTaxCategory?: InternalTaxCategory | null;
}): Promise<{
  stripeProductId: string;
  stripePriceId: string;
  effectiveTaxCategory: InternalTaxCategory;
}> => {
  const effectiveTaxCategory = resolveRecurringProductTaxCategory(product.taxCategory, overrideTaxCategory);
  const recurringInterval = normalizeInterval(product.period);
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

  let stripePriceId = product.stripePriceId?.trim() || '';
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

  return {
    stripeProductId,
    stripePriceId,
    effectiveTaxCategory,
  };
};

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
