import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { buildDestinationTransferData } from '@/lib/stripeConnectAccounts';
import { buildZeroTaxQuote, type TaxQuote } from '@/lib/stripeTax';
import { resolveEventRegistrationPriceCents } from '@/server/paidRegistrationGate';
import {
  assertPublicWidgetEvent,
  normalizeGuestText,
  verifyGuestRegistrationToken,
} from '@/server/publicGuestRegistration';
import {
  attachDiscountCodeReservationPaymentIntent,
  DiscountCodeError,
  releaseDiscountCodeReservation,
  reserveDiscountApplication,
  resolveDiscountApplication,
  type ResolvedDiscountApplication,
} from '@/server/discounts/discountCodeResolver';
import { logBillingError } from '@/server/billing/errorLogging';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  registrationToken: z.string().min(1),
  discountCode: z.string().optional(),
}).strict();

type RouteContext = {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const appendMetadata = (
  metadata: Record<string, string>,
  key: string,
  value: unknown,
  maxLength = 200,
) => {
  const normalized = normalizeString(value);
  if (!normalized) return;
  metadata[key] = normalized.slice(0, maxLength);
};

const buildFeeBreakdown = (taxQuote: TaxQuote) => ({
  eventPrice: taxQuote.subtotalCents,
  stripeFee: taxQuote.stripeFeeCents,
  stripeProcessingFee: taxQuote.stripeProcessingFeeCents,
  stripeTaxServiceFee: taxQuote.stripeTaxServiceFeeCents,
  processingFee: taxQuote.processingFeeCents,
  mvpFee: taxQuote.processingFeeCents,
  taxAmount: taxQuote.taxAmountCents,
  totalCharge: taxQuote.totalChargeCents,
  hostReceives: taxQuote.hostReceivesCents,
  feePercentage: taxQuote.feePercentage,
  paymentMethodType: taxQuote.paymentMethodType,
  paymentMethodLabel: taxQuote.paymentMethodLabel,
  purchaseType: taxQuote.purchaseType,
});

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'registrationToken is required.' }, { status: 400 });
  }

  const token = verifyGuestRegistrationToken(parsed.data.registrationToken);
  if (!token || token.eventId !== params.eventId) {
    return NextResponse.json({ error: 'Invalid or expired guest registration token.' }, { status: 403 });
  }

  const publicContext = await assertPublicWidgetEvent(params.slug, params.eventId);
  if (!publicContext || publicContext.organization.id !== token.organizationId) {
    return NextResponse.json({ error: 'Public widget event not found.' }, { status: 404 });
  }

  const { organization, event } = publicContext;
  const registration = await (prisma as any).eventRegistrations.findUnique({
    where: { id: token.registrationId },
  });
  if (
    !registration
    || registration.eventId !== event.id
    || !['STARTED', 'PENDING', 'PAYMENT_FAILED'].includes(String(registration.status ?? '').toUpperCase())
  ) {
    return NextResponse.json({ error: 'Guest registration is not payable.' }, { status: 409 });
  }

  const priceCents = await resolveEventRegistrationPriceCents({
    event,
    selection: {
      divisionId: normalizeGuestText(registration.divisionId),
      divisionTypeId: normalizeGuestText(registration.divisionTypeId),
      divisionTypeKey: normalizeGuestText(registration.divisionTypeKey),
    },
    client: prisma,
  });
  if (priceCents <= 0) {
    return NextResponse.json({ error: 'This registration does not require payment.' }, { status: 409 });
  }
  let checkoutAmountCents = priceCents;
  let discountApplication: ResolvedDiscountApplication | null = null;
  let discountReservationCode: string | null = null;
  const requestedDiscountCode = normalizeGuestText(parsed.data.discountCode);
  if (requestedDiscountCode) {
    try {
      const discountResult = await resolveDiscountApplication({
        code: requestedDiscountCode,
        purchaseType: 'event',
        targetId: event.id,
        originalAmountCents: priceCents,
        buyerUserId: token.parentUserId,
      });
      checkoutAmountCents = discountResult.amountCents;
      discountApplication = discountResult.discount;
      if (discountResult.discount) {
        discountReservationCode = requestedDiscountCode;
      }
    } catch (error) {
      if (error instanceof DiscountCodeError) {
        logBillingError({
          route: '/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent',
          stage: 'resolve_discount',
          status: error.status,
          error,
          context: {
            slug: params.slug,
            eventId: event.id,
            organizationId: organization.id,
            registrationId: registration.id,
            userId: token.parentUserId,
            purchaseType: 'event',
            targetId: event.id,
            discountCode: requestedDiscountCode,
          },
        });
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      const message = error instanceof Error ? error.message : 'Unable to apply discount code.';
      logBillingError({
        route: '/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent',
        stage: 'resolve_discount',
        status: 400,
        error,
        context: {
          slug: params.slug,
          eventId: event.id,
          organizationId: organization.id,
          registrationId: registration.id,
          userId: token.parentUserId,
          purchaseType: 'event',
          targetId: event.id,
          discountCode: requestedDiscountCode,
        },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  if (checkoutAmountCents <= 0) {
    return NextResponse.json({ error: 'Discounted guest checkout without payment is not enabled yet.' }, { status: 409 });
  }

  const [parentSensitive, parentAuth] = await Promise.all([
    (prisma as any).sensitiveUserData.findFirst({
      where: { userId: token.parentUserId },
      select: { email: true },
    }),
    (prisma as any).authUser.findUnique({
      where: { id: token.parentUserId },
      select: { email: true },
    }),
  ]);
  const receiptEmail = normalizeGuestText(parentSensitive?.email) ?? normalizeGuestText(parentAuth?.email);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const taxQuote = buildZeroTaxQuote({
    subtotalCents: checkoutAmountCents,
    purchaseType: 'event',
    taxCategory: 'EVENT_PARTICIPANT',
    eventType: event.eventType,
  });
  const feeBreakdown = buildFeeBreakdown(taxQuote);
  const transferData = await buildDestinationTransferData({
    organizationId: organization.id,
    hostUserId: event.hostId ?? event.createdBy ?? null,
    transferAmountCents: taxQuote.hostReceivesCents,
  });

  if (discountApplication && discountReservationCode) {
    try {
      const reservationResult = await reserveDiscountApplication({
        code: discountReservationCode,
        purchaseType: 'event',
        targetId: event.id,
        originalAmountCents: priceCents,
        buyerUserId: token.parentUserId,
        guestEmail: receiptEmail,
        registrationId: registration.id,
        organizationId: organization.id,
      });
      if (reservationResult.amountCents !== checkoutAmountCents) {
        throw new DiscountCodeError('Discount code pricing changed. Please refresh checkout and try again.', 409);
      }
      discountApplication = reservationResult.discount;
    } catch (error) {
      if (error instanceof DiscountCodeError) {
        logBillingError({
          route: '/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent',
          stage: 'reserve_discount',
          status: error.status,
          error,
          context: {
            slug: params.slug,
            eventId: event.id,
            organizationId: organization.id,
            registrationId: registration.id,
            userId: token.parentUserId,
            purchaseType: 'event',
            targetId: event.id,
            discountCode: discountReservationCode,
          },
        });
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      const message = error instanceof Error ? error.message : 'Unable to reserve discount code.';
      logBillingError({
        route: '/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent',
        stage: 'reserve_discount',
        status: 400,
        error,
        context: {
          slug: params.slug,
          eventId: event.id,
          organizationId: organization.id,
          registrationId: registration.id,
          userId: token.parentUserId,
          purchaseType: 'event',
          targetId: event.id,
          discountCode: discountReservationCode,
        },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const isTeamRegistration = String(registration.registrantType ?? '').toUpperCase() === 'TEAM';
  const metadata: Record<string, string> = {
    purchase_type: 'event',
    guest_checkout: 'true',
  };
  appendMetadata(metadata, 'user_id', isTeamRegistration ? null : registration.registrantId);
  appendMetadata(metadata, 'buyer_user_id', token.parentUserId);
  appendMetadata(metadata, 'team_id', isTeamRegistration ? (registration.eventTeamId ?? registration.registrantId) : null);
  appendMetadata(metadata, 'event_id', event.id);
  appendMetadata(metadata, 'organization_id', organization.id);
  appendMetadata(metadata, 'organization_name', organization.name);
  appendMetadata(metadata, 'event_name', event.name);
  appendMetadata(metadata, 'event_location', event.location);
  appendMetadata(metadata, 'event_start', event.start instanceof Date ? event.start.toISOString() : event.start);
  appendMetadata(metadata, 'amount_cents', taxQuote.subtotalCents);
  appendMetadata(metadata, 'original_amount_cents', discountApplication?.originalAmountCents);
  appendMetadata(metadata, 'discounted_amount_cents', discountApplication?.discountedAmountCents);
  appendMetadata(metadata, 'discount_code', discountApplication?.code);
  appendMetadata(metadata, 'discount_id', discountApplication?.discountId);
  appendMetadata(metadata, 'discount_code_id', discountApplication?.discountCodeId);
  appendMetadata(metadata, 'discount_reservation_id', discountApplication?.reservationId);
  appendMetadata(metadata, 'total_charge_cents', taxQuote.totalChargeCents);
  appendMetadata(metadata, 'processing_fee_cents', taxQuote.processingFeeCents);
  appendMetadata(metadata, 'mvp_fee_cents', taxQuote.processingFeeCents);
  appendMetadata(metadata, 'stripe_fee_cents', taxQuote.stripeFeeCents);
  appendMetadata(metadata, 'stripe_processing_fee_cents', taxQuote.stripeProcessingFeeCents);
  appendMetadata(metadata, 'stripe_tax_service_fee_cents', taxQuote.stripeTaxServiceFeeCents);
  appendMetadata(metadata, 'payment_method_fee_type', taxQuote.paymentMethodType);
  appendMetadata(metadata, 'payment_method_fee_label', taxQuote.paymentMethodLabel);
  appendMetadata(metadata, 'tax_cents', taxQuote.taxAmountCents);
  appendMetadata(metadata, 'fee_percentage', taxQuote.feePercentage.toFixed(4));
  appendMetadata(metadata, 'tax_category', taxQuote.taxCategory);
  appendMetadata(metadata, 'registration_id', registration.id);
  appendMetadata(metadata, 'occurrence_slot_id', registration.slotId);
  appendMetadata(metadata, 'occurrence_date', registration.occurrenceDate);
  appendMetadata(metadata, 'receipt_email', receiptEmail);
  appendMetadata(metadata, 'transfer_destination_account_id', transferData?.destination);
  appendMetadata(metadata, 'transfer_amount_cents', transferData?.amount);

  try {
    const intent = await stripe.paymentIntents.create({
      amount: taxQuote.totalChargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: receiptEmail ?? undefined,
      metadata,
      ...(transferData ? { transfer_data: transferData } : {}),
    });

    if (discountApplication?.reservationId) {
      await attachDiscountCodeReservationPaymentIntent({
        reservationId: discountApplication.reservationId,
        paymentIntentId: intent.id,
      }).catch((error) => {
        console.warn('Failed to attach guest discount reservation to payment intent.', {
          reservationId: discountApplication?.reservationId,
          paymentIntentId: intent.id,
          error,
        });
      });
    }

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      checkoutMode: 'PAYMENT_INTENT',
      feeBreakdown,
      registrationId: registration.id,
    }, { status: 200 });
  } catch (error) {
    console.error('Guest Stripe payment intent failed', error);
    await releaseDiscountCodeReservation({
      reservationId: discountApplication?.reservationId,
    });
    return NextResponse.json({ error: 'Unable to start payment.' }, { status: 500 });
  }
}
