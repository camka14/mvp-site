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
import {
  attachDiscountCodeReservationPaymentIntent,
  DiscountCodeError,
  releaseDiscountCodeReservation,
  reserveDiscountApplication,
  resolveDiscountApplication,
  type ResolvedDiscountApplication,
} from '@/server/discounts/discountCodeResolver';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  billingAddress: z.unknown().optional(),
  discountCode: z.string().optional(),
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

const appendMetadata = (
  metadata: Stripe.MetadataParam,
  key: string,
  value: string | number | null | undefined,
): void => {
  if (value === null || value === undefined) {
    return;
  }
  const serialized = String(value).trim();
  if (serialized.length > 0) {
    metadata[key] = serialized;
  }
};

const getInvoicePaymentIntentId = (
  invoice: Pick<Stripe.Invoice, 'payments'> | null | undefined,
): string | null => {
  const payments = invoice?.payments?.data ?? [];
  for (const invoicePayment of payments) {
    if (invoicePayment.payment.type !== 'payment_intent') {
      continue;
    }
    const paymentIntent = invoicePayment.payment.payment_intent;
    if (typeof paymentIntent === 'string') {
      return paymentIntent;
    }
    if (paymentIntent?.id) {
      return paymentIntent.id;
    }
  }
  return null;
};

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
  let subtotalCents = product.priceCents;
  let discountApplication: ResolvedDiscountApplication | null = null;
  let discountReservationCode: string | null = null;
  const requestedDiscountCode = typeof parsed.data.discountCode === 'string'
    ? parsed.data.discountCode.trim()
    : '';
  if (requestedDiscountCode) {
    try {
      const discountResult = await resolveDiscountApplication({
        code: requestedDiscountCode,
        purchaseType: 'product',
        targetId: product.id,
        originalAmountCents: product.priceCents,
        buyerUserId: session.userId,
      });
      subtotalCents = discountResult.amountCents;
      discountApplication = discountResult.discount;
      if (discountResult.discount) {
        discountReservationCode = requestedDiscountCode;
      }
    } catch (error) {
      if (error instanceof DiscountCodeError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }
  if (subtotalCents <= 0) {
    return NextResponse.json({ error: 'Discounted subscription checkout without payment is not enabled yet.' }, { status: 409 });
  }

  const taxQuote = await calculateTaxQuote({
    stripe,
    userId: session.userId,
    organizationId: product.organizationId,
    email: billingEmail,
    billingAddress: validatedBillingAddress,
    subtotalCents,
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

  const reusableSubscription = discountApplication
    ? null
    : await findReusableIncompleteProductSubscriptionCheckout({
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

  if (discountApplication && discountReservationCode) {
    try {
      const reservationResult = await reserveDiscountApplication({
        code: discountReservationCode,
        purchaseType: 'product',
        targetId: product.id,
        originalAmountCents: product.priceCents,
        buyerUserId: session.userId,
        productId: product.id,
        organizationId: product.organizationId,
      });
      if (reservationResult.amountCents !== subtotalCents) {
        throw new DiscountCodeError('Discount code pricing changed. Please refresh checkout and try again.', 409);
      }
      discountApplication = reservationResult.discount;
    } catch (error) {
      if (error instanceof DiscountCodeError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      const message = error instanceof Error ? error.message : 'Unable to reserve discount code.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const metadata: Stripe.MetadataParam = {
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
  };
  appendMetadata(metadata, 'discount_code', discountApplication?.code);
  appendMetadata(metadata, 'discount_id', discountApplication?.discountId);
  appendMetadata(metadata, 'discount_code_id', discountApplication?.discountCodeId);
  appendMetadata(metadata, 'discount_reservation_id', discountApplication?.reservationId);
  appendMetadata(metadata, 'original_amount_cents', discountApplication?.originalAmountCents);
  appendMetadata(metadata, 'discounted_amount_cents', discountApplication?.discountedAmountCents);

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create({
      customer: taxQuote.customerId,
      automatic_tax: { enabled: true },
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      items: [
        {
          quantity: 1,
          metadata: {
            line_type: 'product_base',
            local_product_id: product.id,
          },
          ...(discountApplication
            ? {
                price_data: {
                  currency: 'usd',
                  unit_amount: taxQuote.subtotalCents,
                  product: stripeCatalog.stripeProductId,
                  recurring: { interval: recurringInterval },
                  tax_behavior: 'exclusive' as const,
                },
              }
            : { price: stripeCatalog.stripePriceId }),
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
      metadata,
      ...(connectedAccountId ? { transfer_data: { destination: connectedAccountId } } : {}),
      expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payments.data.payment.payment_intent', 'items.data.price'],
    });
  } catch (error) {
    await releaseDiscountCodeReservation({
      reservationId: discountApplication?.reservationId,
    });
    const message = error instanceof Error ? error.message : 'Unable to start recurring billing.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const latestInvoice = typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
      ? subscription.latest_invoice
      : null;
    let firstInvoicePaymentIntentId: string | null = getInvoicePaymentIntentId(latestInvoice);
    if (connectedAccountId && latestInvoice?.id && !firstInvoicePaymentIntentId) {
      const invoiceWithPayments = await stripe.invoices.retrieve(latestInvoice.id, {
        expand: ['payments.data.payment.payment_intent'],
      });
      firstInvoicePaymentIntentId = getInvoicePaymentIntentId(invoiceWithPayments);
    }
    if (connectedAccountId && firstInvoicePaymentIntentId) {
      await stripe.paymentIntents.update(firstInvoicePaymentIntentId, {
        // The destination account comes from the subscription's transfer_data.
        application_fee_amount: calculatePlatformApplicationFeeAmount({
          totalChargeCents: taxQuote.totalChargeCents,
          connectedAccountAmountCents: taxQuote.hostReceivesCents,
        }),
      });
    }
    if (discountApplication?.reservationId && firstInvoicePaymentIntentId) {
      await attachDiscountCodeReservationPaymentIntent({
        reservationId: discountApplication.reservationId,
        paymentIntentId: firstInvoicePaymentIntentId,
      }).catch((error) => {
        console.warn('Failed to attach subscription discount reservation to payment intent.', {
          reservationId: discountApplication?.reservationId,
          paymentIntentId: firstInvoicePaymentIntentId,
          error,
        });
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
      await releaseDiscountCodeReservation({
        reservationId: discountApplication?.reservationId,
      });
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
  } catch (error) {
    await releaseDiscountCodeReservation({
      reservationId: discountApplication?.reservationId,
    });
    const message = error instanceof Error ? error.message : 'Unable to prepare recurring billing checkout.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
