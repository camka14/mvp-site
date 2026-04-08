import { prisma } from '@/lib/prisma';
import type { InternalTaxCategory, ProductTaxCategory } from '@/lib/stripeTax';
import { resolveTaxCategoryForPurchase } from '@/lib/stripeTax';

type ProductContext = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  period: string;
  organizationId: string;
  taxCategory: ProductTaxCategory;
  stripeProductId: string | null;
  stripePriceId: string | null;
};

export type ResolvedPurchaseContext = {
  amountCents: number;
  purchaseType: 'event' | 'rental' | 'product';
  eventType?: unknown;
  taxCategory: InternalTaxCategory;
  product: ProductContext | null;
  organizationId: string | null;
};

export const resolvePurchaseContext = async ({
  productId,
  event,
  timeSlot,
  requestedTaxCategory,
}: {
  productId?: string | null;
  event?: Record<string, unknown> | null;
  timeSlot?: Record<string, unknown> | null;
  requestedTaxCategory?: InternalTaxCategory | null;
}): Promise<ResolvedPurchaseContext> => {
  if (productId) {
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        period: true,
        organizationId: true,
        taxCategory: true,
        stripeProductId: true,
        stripePriceId: true,
      },
    });
    if (!product) {
      throw new Error('Product not found.');
    }

    return {
      amountCents: product.priceCents,
      purchaseType: 'product',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'product',
        requestedTaxCategory,
        productTaxCategory: product.taxCategory as ProductTaxCategory,
      }),
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        period: product.period,
        organizationId: product.organizationId,
        taxCategory: product.taxCategory as ProductTaxCategory,
        stripeProductId: product.stripeProductId,
        stripePriceId: product.stripePriceId,
      },
      organizationId: product.organizationId,
    };
  }

  if (timeSlot && typeof timeSlot.price === 'number') {
    return {
      amountCents: timeSlot.price,
      purchaseType: 'rental',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'rental',
        requestedTaxCategory,
      }),
      eventType: event?.eventType,
      product: null,
      organizationId: typeof event?.organizationId === 'string' ? event.organizationId : null,
    };
  }

  if (event && typeof event.price === 'number') {
    return {
      amountCents: event.price,
      purchaseType: 'event',
      taxCategory: resolveTaxCategoryForPurchase({
        purchaseType: 'event',
        requestedTaxCategory,
      }),
      eventType: event.eventType,
      product: null,
      organizationId: typeof event.organizationId === 'string' ? event.organizationId : null,
    };
  }

  throw new Error('Unable to resolve a purchase amount from the request.');
};
