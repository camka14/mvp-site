import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireSession } from '@/lib/permissions';
import {
  type BillingAddress,
  loadUserBillingProfile,
  resolveBillingAddressInput,
  upsertUserBillingAddress,
  validateUsBillingAddress,
} from '@/lib/billingAddress';
import { resolvePurchaseContext } from '@/lib/purchaseContext';
import {
  buildOrganizerManualTaxQuote,
  buildZeroTaxQuote,
  calculateTaxQuote,
  INTERNAL_TAX_CATEGORIES,
  type InternalTaxCategory,
  type TaxQuote,
} from '@/lib/stripeTax';
import {
  normalizeOrganizerManualTaxRateBps,
  resolvePurchaseTaxPolicy,
  taxPolicyRequiresStripeTaxCalculation,
  taxPolicyUsesOrganizerManualTax,
  type TaxPolicyDecision,
} from '@/lib/taxPolicy';
import { loadBillingTaxPolicyContext } from '@/server/billingTaxContext';
import { getConfiguredStripeSecretKey, STRIPE_UNAVAILABLE_ERROR } from '@/server/stripeConfiguration';

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
  purchaseType: taxQuote.purchaseType,
});

const taxPolicyResponseFields = (taxPolicy: TaxPolicyDecision) => ({
  taxMode: taxPolicy.mode,
  taxReasonCode: taxPolicy.reasonCode,
  taxJurisdictionState: taxPolicy.jurisdictionState,
  taxability: taxPolicy.taxability,
  taxLiabilityParty: taxPolicy.liabilityParty,
  taxCollectionStrategy: taxPolicy.collectionStrategy,
  taxPolicyRuleId: taxPolicy.policyRuleId,
  taxPolicyRuleVersion: taxPolicy.policyRuleVersion,
  organizerResponsibilityMessage: taxPolicy.organizerResponsibilityMessage,
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tax preview input.', details: parsed.error.flatten() }, { status: 400 });
  }

  const secretKey = getConfiguredStripeSecretKey();
  if (!secretKey) {
    return NextResponse.json({ error: STRIPE_UNAVAILABLE_ERROR }, { status: 503 });
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
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
    const taxContext = await loadBillingTaxPolicyContext({
      event: payload.event ?? null,
      timeSlot: payload.timeSlot ?? null,
      organization: payload.organization ?? null,
      organizationId:
        resolvedPurchase.organizationId
        ?? normalizeString(payload.event?.organizationId)
        ?? null,
    });
    const taxPolicy = resolvePurchaseTaxPolicy({
      purchaseType: resolvedPurchase.purchaseType,
      taxCategory: resolvedPurchase.taxCategory,
      event: taxContext.event ?? payload.event ?? null,
      organization: taxContext.organization ?? payload.organization ?? null,
      timeSlot: taxContext.timeSlot ?? payload.timeSlot ?? null,
    });
    const organizerManualTaxRateBps = normalizeOrganizerManualTaxRateBps(
      (taxContext.event ?? payload.event ?? null)?.organizerManualTaxRateBps,
    );

    if (taxPolicy.collectionStrategy === 'BLOCKED_NEEDS_REVIEW') {
      return NextResponse.json({
        error: 'Tax collection must be configured before calculating a preview.',
        ...taxPolicyResponseFields(taxPolicy),
      }, { status: 400 });
    }
    if (taxPolicy.collectionStrategy === 'ORGANIZER_STRIPE_TAX') {
      return NextResponse.json({
        error: 'Organizer Stripe Tax preview requires connected-account tax setup and is not enabled for this checkout yet.',
        ...taxPolicyResponseFields(taxPolicy),
      }, { status: 400 });
    }

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
    const requiresBillingAddressForTax = taxPolicyRequiresStripeTaxCalculation(taxPolicy);

    if (requiresBillingAddressForTax && !savedBillingAddress) {
      return NextResponse.json({
        error: 'Billing address is required before calculating tax.',
        billingAddressRequired: true,
      }, { status: 400 });
    }

    let billingAddress: BillingAddress | null = null;
    if (savedBillingAddress) {
      try {
        billingAddress = validateUsBillingAddress(savedBillingAddress);
      } catch (error) {
        if (requiresBillingAddressForTax) {
          const message = error instanceof Error ? error.message : 'Invalid billing address.';
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }
    }
    const stripe = new Stripe(secretKey);
    const eventId = taxContext.eventId ?? extractEntityId(payload.event);
    const timeSlotId = taxContext.timeSlotId ?? extractEntityId(payload.timeSlot);
    const organizationId =
      taxContext.organizationId
      ?? extractEntityId(payload.organization)
      ?? resolvedPurchase.organizationId
      ?? normalizeString(payload.event?.organizationId)
      ?? null;
    const taxQuote = taxPolicy.mode === 'ZERO_TAX'
      ? buildZeroTaxQuote({
        subtotalCents: resolvedPurchase.amountCents,
        purchaseType: resolvedPurchase.purchaseType,
        taxCategory: resolvedPurchase.taxCategory,
        eventType: resolvedPurchase.eventType,
      })
      : taxPolicyUsesOrganizerManualTax(taxPolicy)
        ? buildOrganizerManualTaxQuote({
          subtotalCents: resolvedPurchase.amountCents,
          organizerManualTaxRateBps,
          purchaseType: resolvedPurchase.purchaseType,
          taxCategory: resolvedPurchase.taxCategory,
          eventType: resolvedPurchase.eventType,
        })
      : await calculateTaxQuote({
        stripe,
        userId: session.userId,
        organizationId,
        email: billingEmail,
        billingAddress: billingAddress as BillingAddress,
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
      taxCalculationId: taxQuote.calculationId || undefined,
      taxCategory: taxQuote.taxCategory,
      ...taxPolicyResponseFields(taxPolicy),
      feeBreakdown: buildFeeBreakdown(taxQuote),
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate tax preview.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
