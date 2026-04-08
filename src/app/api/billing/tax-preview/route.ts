import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireSession } from '@/lib/permissions';
import {
  loadUserBillingProfile,
  resolveBillingAddressInput,
  upsertUserBillingAddress,
  validateUsBillingAddress,
} from '@/lib/billingAddress';
import { calculateMvpAndStripeFeesWithTax } from '@/lib/billingFees';
import { resolvePurchaseContext } from '@/lib/purchaseContext';
import { calculateTaxQuote, INTERNAL_TAX_CATEGORIES, type InternalTaxCategory } from '@/lib/stripeTax';

export const dynamic = 'force-dynamic';

const schema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  event: z.record(z.string(), z.any()).optional(),
  team: z.record(z.string(), z.any()).optional(),
  timeSlot: z.record(z.string(), z.any()).optional(),
  organization: z.record(z.string(), z.any()).optional(),
  productId: z.string().optional(),
  billId: z.string().optional(),
  billPaymentId: z.string().optional(),
  taxCategory: z.enum(INTERNAL_TAX_CATEGORIES).optional(),
  billingAddress: z.unknown().optional(),
}).passthrough();

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

const extractEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return normalizeString(value);
  }
  const row = value as Record<string, unknown>;
  return normalizeString(row.$id ?? row.id);
};

const buildLineItemReference = ({
  purchaseType,
  productId,
  eventId,
  timeSlotId,
  billId,
  billPaymentId,
}: {
  purchaseType: string;
  productId?: string | null;
  eventId?: string | null;
  timeSlotId?: string | null;
  billId?: string | null;
  billPaymentId?: string | null;
}) => [purchaseType, productId, eventId, timeSlotId, billId, billPaymentId]
  .filter((value): value is string => Boolean(value))
  .join('_')
  .slice(0, 200);

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tax preview input.', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const inlineBillingAddress = resolveBillingAddressInput(payload.billingAddress);
  if (payload.billingAddress !== undefined && !inlineBillingAddress) {
    return NextResponse.json({ error: 'Invalid billing address.' }, { status: 400 });
  }

  try {
    const resolvedPurchase = await resolvePurchaseContext({
      productId: payload.productId ?? null,
      event: payload.event ?? null,
      timeSlot: payload.timeSlot ?? null,
      requestedTaxCategory: (payload.taxCategory ?? null) as InternalTaxCategory | null,
    });

    const billingProfile = await loadUserBillingProfile(session.userId);
    let savedBillingProfile: Awaited<ReturnType<typeof upsertUserBillingAddress>> | null = null;
    if (inlineBillingAddress) {
      try {
        savedBillingProfile = await upsertUserBillingAddress(session.userId, inlineBillingAddress);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save billing address.';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
    const savedBillingAddress = savedBillingProfile?.billingAddress ?? billingProfile.billingAddress;
    const billingEmail = savedBillingProfile?.email ?? billingProfile.email;

    if (!savedBillingAddress) {
      return NextResponse.json({
        error: 'Billing address is required before calculating tax.',
        billingAddressRequired: true,
      }, { status: 400 });
    }

    const billingAddress = validateUsBillingAddress(savedBillingAddress);
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      const fallbackFees = calculateMvpAndStripeFeesWithTax({
        eventAmountCents: resolvedPurchase.amountCents,
        eventType: resolvedPurchase.eventType,
        taxAmountCents: 0,
        stripeTaxServiceFeeCents: 0,
      });
      return NextResponse.json({
        publishableKey,
        taxCalculationId: `tax_mock_${crypto.randomUUID()}`,
        taxCategory: resolvedPurchase.taxCategory,
        feeBreakdown: {
          eventPrice: resolvedPurchase.amountCents,
          stripeFee: fallbackFees.stripeFeeCents,
          processingFee: fallbackFees.mvpFeeCents,
          taxAmount: 0,
          totalCharge: fallbackFees.totalChargeCents,
          hostReceives: resolvedPurchase.amountCents,
          feePercentage: fallbackFees.mvpFeePercentage * 100,
          purchaseType: resolvedPurchase.purchaseType,
        },
      }, { status: 200 });
    }

    const stripe = new Stripe(secretKey);
    const eventId = extractEntityId(payload.event);
    const timeSlotId = extractEntityId(payload.timeSlot);
    const taxQuote = await calculateTaxQuote({
      stripe,
      userId: session.userId,
      organizationId:
        extractEntityId(payload.organization)
        ?? resolvedPurchase.organizationId
        ?? normalizeString(payload.event?.organizationId)
        ?? null,
      email: billingEmail,
      billingAddress,
      subtotalCents: resolvedPurchase.amountCents,
      purchaseType: resolvedPurchase.purchaseType,
      taxCategory: resolvedPurchase.taxCategory,
      eventType: resolvedPurchase.eventType,
      lineItemReference: buildLineItemReference({
        purchaseType: resolvedPurchase.purchaseType,
        productId: resolvedPurchase.product?.id ?? null,
        eventId,
        timeSlotId,
        billId: payload.billId ?? null,
        billPaymentId: payload.billPaymentId ?? null,
      }),
      description: resolvedPurchase.product?.name
        ?? normalizeString(payload.event?.name)
        ?? resolvedPurchase.purchaseType,
    });

    return NextResponse.json({
      publishableKey,
      taxCalculationId: taxQuote.calculationId,
      taxCategory: taxQuote.taxCategory,
      feeBreakdown: {
        eventPrice: taxQuote.subtotalCents,
        stripeFee: taxQuote.stripeFeeCents,
        processingFee: taxQuote.processingFeeCents,
        taxAmount: taxQuote.taxAmountCents,
        totalCharge: taxQuote.totalChargeCents,
        hostReceives: taxQuote.hostReceivesCents,
        feePercentage: taxQuote.feePercentage,
        purchaseType: taxQuote.purchaseType,
      },
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate tax preview.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
