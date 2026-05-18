import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  calculateChargeAmountForPaymentMethod,
  getPaymentMethodFeeLabel,
  normalizePaymentMethodFeeType,
} from '@/lib/billingFees';
import { requireSession } from '@/lib/permissions';
import { extractStripePaymentIntentId } from '@/lib/stripeClientSecret';

export const dynamic = 'force-dynamic';

const schema = z.object({
  paymentIntent: z.string(),
  paymentMethodType: z.string().optional(),
});

const toIntOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const parseFeePercentage = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isUpdatablePaymentIntentStatus = (status: Stripe.PaymentIntent.Status): boolean =>
  status === 'requires_payment_method'
  || status === 'requires_confirmation'
  || status === 'requires_action';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payment intent fee payload.' }, { status: 400 });
  }

  const paymentIntentId = extractStripePaymentIntentId(parsed.data.paymentIntent);
  if (!paymentIntentId) {
    return NextResponse.json({ error: 'Invalid payment intent.' }, { status: 400 });
  }

  const paymentMethodType = normalizePaymentMethodFeeType(parsed.data.paymentMethodType);
  const paymentMethodLabel = getPaymentMethodFeeLabel(paymentMethodType);
  const stripe = new Stripe(secretKey);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = intent.metadata ?? {};

  const buyerUserId = toStringOrNull(metadata.buyer_user_id ?? metadata.buyerUserId);
  const checkoutUserId = toStringOrNull(metadata.user_id ?? metadata.userId);
  if (!session.isAdmin && session.userId !== buyerUserId && session.userId !== checkoutUserId) {
    return NextResponse.json({ error: 'You cannot update this payment intent.' }, { status: 403 });
  }
  if (!isUpdatablePaymentIntentStatus(intent.status)) {
    return NextResponse.json({ error: 'Payment method fees cannot be changed after payment starts.' }, { status: 409 });
  }

  const subtotalCents = toIntOrNull(metadata.amount_cents ?? metadata.amountCents);
  const mvpFeeCents = toIntOrNull(
    metadata.mvp_fee_cents
    ?? metadata.mvpFeeCents
    ?? metadata.processing_fee_cents
    ?? metadata.processingFeeCents,
  ) ?? 0;
  const taxAmountCents = toIntOrNull(metadata.tax_cents ?? metadata.taxCents) ?? 0;
  const stripeTaxServiceFeeCents = toIntOrNull(
    metadata.stripe_tax_service_fee_cents ?? metadata.stripeTaxServiceFeeCents,
  ) ?? 0;
  if (!subtotalCents || subtotalCents <= 0) {
    return NextResponse.json({ error: 'Payment intent is missing checkout amount metadata.' }, { status: 400 });
  }

  const goalAmountCents = subtotalCents + mvpFeeCents + taxAmountCents + stripeTaxServiceFeeCents;
  const methodFees = calculateChargeAmountForPaymentMethod({
    goalAmountCents,
    paymentMethodType,
  });
  const stripeFeeCents = methodFees.stripeProcessingFeeCents + stripeTaxServiceFeeCents;

  await stripe.paymentIntents.update(paymentIntentId, {
    amount: methodFees.totalChargeCents,
    metadata: {
      total_charge_cents: String(methodFees.totalChargeCents),
      stripe_fee_cents: String(stripeFeeCents),
      stripe_processing_fee_cents: String(methodFees.stripeProcessingFeeCents),
      payment_method_fee_type: methodFees.paymentMethodType,
      payment_method_fee_label: paymentMethodLabel,
    },
  });

  return NextResponse.json({
    feeBreakdown: {
      eventPrice: subtotalCents,
      stripeFee: stripeFeeCents,
      stripeProcessingFee: methodFees.stripeProcessingFeeCents,
      stripeTaxServiceFee: stripeTaxServiceFeeCents,
      processingFee: mvpFeeCents,
      mvpFee: mvpFeeCents,
      taxAmount: taxAmountCents,
      totalCharge: methodFees.totalChargeCents,
      hostReceives: toIntOrNull(metadata.transfer_amount_cents ?? metadata.transferAmountCents) ?? subtotalCents,
      feePercentage: parseFeePercentage(metadata.fee_percentage ?? metadata.feePercentage),
      paymentMethodType: methodFees.paymentMethodType,
      paymentMethodLabel,
      purchaseType: toStringOrNull(metadata.purchase_type ?? metadata.purchaseType) ?? undefined,
    },
  });
}
