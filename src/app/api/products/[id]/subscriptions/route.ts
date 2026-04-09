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
import {
  calculatePlatformApplicationFeeAmount,
  resolveConnectedAccountId,
} from '@/lib/stripeConnectAccounts';
import { upsertStripeSubscriptionMirror } from '@/lib/stripeSubscriptions';
import {
  buildBillingAddressFingerprint,
  findReusableIncompleteProductSubscriptionCheckout,
  getCheckoutTaxCalculationIdFromMetadata,
  getCheckoutTaxCategoryFromMetadata,
} from '@/lib/stripeCheckoutReuse';

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
  eventPrice: taxQuote.subtotalCents,
  processingFee: taxQuote.processingFeeCents,
  stripeFee: taxQuote.stripeFeeCents,
  taxAmount: taxQuote.taxAmountCents,
  totalCharge: taxQuote.totalChargeCents,
  hostReceives: taxQuote.hostReceivesCents,
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
  const validatedBillingAddress = validateUsBillingAddress(billingAddress);
  const taxQuote = await calculateTaxQuote({
    stripe,
    userId: session.userId,
    organizationId: product.organizationId,
    email: billingEmail,
    billingAddress: validatedBillingAddress,
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
  const connectedAccountId = await resolveConnectedAccountId({
    organizationId: product.organizationId,
  });
  const billingAddressFingerprint = buildBillingAddressFingerprint(validatedBillingAddress);
  const platformFeeProductId = recurringFeeAmountCents > 0
    ? await ensurePlatformFeeProduct({ stripe })
    : null;

  const reusableSubscription = await findReusableIncompleteProductSubscriptionCheckout({
    stripe,
    customerId: taxQuote.customerId,
    productId: product.id,
    userId: session.userId,
    organizationId: product.organizationId,
    totalChargeCents: taxQuote.totalChargeCents,
    stripePriceId: stripeCatalog.stripePriceId,
    billingAddressFingerprint,
    connectedAccountId,
  });
  if (
    reusableSubscription?.latest_invoice
    && typeof reusableSubscription.latest_invoice !== 'string'
    && reusableSubscription.latest_invoice.confirmation_secret?.client_secret
  ) {
    await upsertStripeSubscriptionMirror({
      subscription: reusableSubscription,
      fallback: {
        productId: product.id,
        userId: session.userId,
        organizationId: product.organizationId,
      },
    });
    return NextResponse.json({
      paymentIntent: reusableSubscription.latest_invoice.confirmation_secret.client_secret,
      publishableKey,
      taxCalculationId: getCheckoutTaxCalculationIdFromMetadata(reusableSubscription.metadata) ?? taxQuote.calculationId,
      taxCategory: getCheckoutTaxCategoryFromMetadata(reusableSubscription.metadata) ?? taxQuote.taxCategory,
      feeBreakdown: toFeeBreakdown(taxQuote),
      stripeSubscriptionId: reusableSubscription.id,
      productId: product.id,
      productPeriod: product.period,
    }, { status: 200 });
  }

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
      amount_cents: String(taxQuote.subtotalCents),
      total_charge_cents: String(taxQuote.totalChargeCents),
      processing_fee_cents: String(taxQuote.processingFeeCents),
      stripe_fee_cents: String(taxQuote.stripeFeeCents),
      stripe_processing_fee_cents: String(taxQuote.stripeProcessingFeeCents),
      stripe_tax_service_fee_cents: String(taxQuote.stripeTaxServiceFeeCents),
      tax_cents: String(taxQuote.taxAmountCents),
      fee_percentage: taxQuote.feePercentage.toFixed(4),
      tax_calculation_id: taxQuote.calculationId,
      tax_category: taxCategory,
      billing_address_fingerprint: billingAddressFingerprint ?? '',
      transfer_destination_account_id: connectedAccountId ?? '',
      transfer_amount_cents: String(taxQuote.subtotalCents),
      purchase_type: 'product_subscription',
    },
    ...(connectedAccountId ? { transfer_data: { destination: connectedAccountId } } : {}),
    expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent', 'items.data.price'],
  });

  const latestInvoice = typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
    ? subscription.latest_invoice
    : null;
  let firstInvoicePaymentIntentId: string | null = null;
  if (connectedAccountId && latestInvoice?.id) {
    const invoiceWithPaymentIntent = await stripe.invoices.retrieve(latestInvoice.id, {
      expand: ['payment_intent'],
    });
    firstInvoicePaymentIntentId = typeof invoiceWithPaymentIntent.payment_intent === 'string'
      ? invoiceWithPaymentIntent.payment_intent
      : invoiceWithPaymentIntent.payment_intent?.id ?? null;
  }
  if (connectedAccountId && firstInvoicePaymentIntentId) {
    await stripe.paymentIntents.update(firstInvoicePaymentIntentId, {
      application_fee_amount: calculatePlatformApplicationFeeAmount({
        totalChargeCents: taxQuote.totalChargeCents,
        connectedAccountAmountCents: taxQuote.subtotalCents,
      }),
      transfer_data: {
        destination: connectedAccountId,
      },
    });
  }

  await upsertStripeSubscriptionMirror({
    subscription,
    fallback: {
      productId: product.id,
      userId: session.userId,
      organizationId: product.organizationId,
    },
  });

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
