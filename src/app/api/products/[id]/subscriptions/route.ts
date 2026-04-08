import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  loadUserBillingProfile,
  resolveBillingAddressInput,
  upsertUserBillingAddress,
  validateUsBillingAddress,
} from '@/lib/billingAddress';
import { calculateTaxQuote, resolveTaxCategoryForPurchase } from '@/lib/stripeTax';
import {
  ensurePlatformFeeProduct,
  isRecurringProductPeriod,
  normalizeProductTaxCategory,
  syncPlatformProductCatalog,
} from '@/lib/stripeProducts';
import { upsertStripeSubscriptionMirror } from '@/lib/stripeSubscriptions';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  billingAddress: z.unknown().optional(),
}).strict();

const normalizeRecurringInterval = (period: string): 'week' | 'month' | 'year' => {
  const normalized = period.trim().toUpperCase();
  if (normalized === 'WEEK') return 'week';
  if (normalized === 'YEAR') return 'year';
  return 'month';
};

const toFeeBreakdown = (taxQuote: Awaited<ReturnType<typeof calculateTaxQuote>>) => ({
  eventPrice: taxQuote.subtotalCents / 100,
  processingFee: taxQuote.processingFeeCents / 100,
  stripeFee: taxQuote.stripeFeeCents / 100,
  taxAmount: taxQuote.taxAmountCents / 100,
  totalCharge: taxQuote.totalChargeCents / 100,
  hostReceives: taxQuote.hostReceivesCents / 100,
  feePercentage: taxQuote.feePercentage,
  purchaseType: taxQuote.purchaseType,
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const product = await prisma.products.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  if (product.isActive === false) {
    return NextResponse.json({ error: 'This product is inactive.' }, { status: 409 });
  }
  if (!isRecurringProductPeriod(product.period)) {
    return NextResponse.json({
      error: 'Single-purchase products do not support recurring subscriptions.',
    }, { status: 409 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const inlineBillingAddress = resolveBillingAddressInput(parsed.data.billingAddress);
  if (parsed.data.billingAddress !== undefined && !inlineBillingAddress) {
    return NextResponse.json({ error: 'A valid billing address is required.' }, { status: 400 });
  }

  const billingProfile = await loadUserBillingProfile(session.userId);
  let savedBillingProfile: Awaited<ReturnType<typeof upsertUserBillingAddress>> | null = null;
  if (inlineBillingAddress) {
    savedBillingProfile = await upsertUserBillingAddress(session.userId, inlineBillingAddress);
  }

  const billingAddress = savedBillingProfile?.billingAddress ?? billingProfile.billingAddress;
  const billingEmail = savedBillingProfile?.email ?? billingProfile.email ?? null;
  if (!billingAddress) {
    return NextResponse.json({
      error: 'Billing address is required before starting recurring billing.',
      billingAddressRequired: true,
    }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  const normalizedProductTaxCategory = normalizeProductTaxCategory(product.taxCategory);
  const taxCategory = resolveTaxCategoryForPurchase({
    purchaseType: 'product',
    productTaxCategory: normalizedProductTaxCategory,
  });
  const taxQuote = await calculateTaxQuote({
    stripe,
    userId: session.userId,
    organizationId: product.organizationId,
    email: billingEmail,
    billingAddress: validateUsBillingAddress(billingAddress),
    subtotalCents: product.priceCents,
    purchaseType: 'product',
    taxCategory,
    lineItemReference: `subscription:${product.id}`,
    description: product.name,
  });

  const stripeCatalog = await syncPlatformProductCatalog({
    stripe,
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      period: product.period,
      organizationId: product.organizationId,
      taxCategory: normalizedProductTaxCategory,
      stripeProductId: product.stripeProductId,
      stripePriceId: product.stripePriceId,
    },
    overrideTaxCategory: taxCategory,
  });
  if (!stripeCatalog.stripePriceId) {
    return NextResponse.json({
      error: 'Stripe did not return a recurring price for this product.',
    }, { status: 500 });
  }

  if (
    stripeCatalog.stripeProductId !== product.stripeProductId
    || stripeCatalog.stripePriceId !== product.stripePriceId
  ) {
    await prisma.products.update({
      where: { id: product.id },
      data: {
        stripeProductId: stripeCatalog.stripeProductId,
        stripePriceId: stripeCatalog.stripePriceId,
        updatedAt: new Date(),
      },
    });
  }

  const recurringInterval = normalizeRecurringInterval(product.period);
  const recurringFeeAmountCents = Math.max(
    0,
    taxQuote.totalChargeCents - taxQuote.subtotalCents - taxQuote.taxAmountCents,
  );
  const platformFeeProductId = recurringFeeAmountCents > 0
    ? await ensurePlatformFeeProduct({ stripe })
    : null;

  const subscription = await stripe.subscriptions.create({
    customer: taxQuote.customerId,
    automatic_tax: { enabled: true },
    collection_method: 'charge_automatically',
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    items: [
      {
        price: stripeCatalog.stripePriceId,
        quantity: 1,
        metadata: {
          line_type: 'product_base',
          local_product_id: product.id,
        },
      },
      ...(recurringFeeAmountCents > 0
        ? [
            {
              quantity: 1,
              metadata: {
                line_type: 'platform_fee',
                local_product_id: product.id,
              },
              price_data: {
                currency: 'usd',
                unit_amount: recurringFeeAmountCents,
                product: platformFeeProductId!,
                recurring: { interval: recurringInterval },
                tax_behavior: 'exclusive' as const,
              },
            },
          ]
        : []),
    ],
    metadata: {
      product_id: product.id,
      user_id: session.userId,
      organization_id: product.organizationId ?? '',
      tax_calculation_id: taxQuote.calculationId,
      tax_category: taxCategory,
      purchase_type: 'product_subscription',
    },
    expand: ['latest_invoice.confirmation_secret', 'items.data.price'],
  });

  await upsertStripeSubscriptionMirror({
    subscription,
    fallback: {
      productId: product.id,
      userId: session.userId,
      organizationId: product.organizationId,
    },
  });

  const latestInvoice = typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
    ? subscription.latest_invoice
    : null;
  const paymentIntentClientSecret = latestInvoice?.confirmation_secret?.client_secret ?? null;
  if (!paymentIntentClientSecret) {
    return NextResponse.json({
      error: 'Stripe did not return a subscription payment intent.',
    }, { status: 500 });
  }

  return NextResponse.json({
    paymentIntent: paymentIntentClientSecret,
    publishableKey,
    taxCalculationId: taxQuote.calculationId,
    taxCategory: taxQuote.taxCategory,
    feeBreakdown: toFeeBreakdown(taxQuote),
    stripeSubscriptionId: subscription.id,
    productId: product.id,
    productPeriod: product.period,
  }, { status: 200 });
}
