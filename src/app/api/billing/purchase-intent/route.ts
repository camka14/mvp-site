import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateMvpAndStripeFees } from '@/lib/billingFees';

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

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  let amountCents = 0;
  let purchaseType = 'event';
  let product: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    period: string;
    organizationId: string;
  } | null = null;

  if (payload.productId) {
    product = await prisma.products.findUnique({
      where: { id: payload.productId },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        period: true,
        organizationId: true,
      },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    amountCents = product.priceCents;
    purchaseType = 'product';
  } else if (payload.timeSlot && typeof payload.timeSlot.price === 'number') {
    amountCents = payload.timeSlot.price;
    purchaseType = 'rental';
  } else if (payload.event && typeof payload.event.price === 'number') {
    amountCents = payload.event.price;
    purchaseType = 'event';
  }

  if (amountCents <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const eventType = payload.event?.eventType;
  const {
    mvpFeeCents,
    stripeFeeCents,
    totalChargeCents,
    mvpFeePercentage,
  } = calculateMvpAndStripeFees({
    eventAmountCents: amountCents,
    eventType,
  });

  const feeBreakdown = {
    eventPrice: amountCents,
    stripeFee: stripeFeeCents,
    processingFee: mvpFeeCents,
    mvpFee: mvpFeeCents,
    totalCharge: totalChargeCents,
    hostReceives: amountCents,
    feePercentage: mvpFeePercentage * 100,
    purchaseType,
  };

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json({
      paymentIntent: `pi_mock_${crypto.randomUUID()}`,
      publishableKey,
      feeBreakdown,
    }, { status: 200 });
  }

  const stripe = new Stripe(secretKey);
  try {
    const userId = extractEntityId(payload.user);
    const teamId = extractEntityId(payload.team);
    const eventId = extractEntityId(payload.event);
    const organizationId =
      extractEntityId(payload.organization)
      ?? normalizeString(payload.event?.organizationId)
      ?? (product?.organizationId ?? null);

    const metadata: Record<string, string> = {
      purchase_type: purchaseType,
    };

    appendMetadata(metadata, 'user_id', userId);
    appendMetadata(metadata, 'team_id', teamId);
    appendMetadata(metadata, 'event_id', eventId);
    appendMetadata(metadata, 'product_id', payload.productId ?? product?.id);
    appendMetadata(metadata, 'organization_id', organizationId);
    appendMetadata(metadata, 'organization_name', payload.organization?.name);
    appendMetadata(metadata, 'team_name', payload.team?.name);
    appendMetadata(metadata, 'amount_cents', amountCents);
    appendMetadata(metadata, 'total_charge_cents', totalChargeCents);
    appendMetadata(metadata, 'processing_fee_cents', mvpFeeCents);
    appendMetadata(metadata, 'mvp_fee_cents', mvpFeeCents);
    appendMetadata(metadata, 'stripe_fee_cents', stripeFeeCents);
    appendMetadata(metadata, 'event_name', payload.event?.name);
    appendMetadata(metadata, 'event_location', payload.event?.location);
    appendMetadata(metadata, 'event_start', payload.event?.start);
    appendMetadata(metadata, 'host_id', payload.event?.hostId);
    appendMetadata(metadata, 'time_slot_id', extractEntityId(payload.timeSlot));
    appendMetadata(metadata, 'time_slot_start', payload.timeSlot?.startDate);
    appendMetadata(metadata, 'time_slot_end', payload.timeSlot?.endDate);
    appendMetadata(metadata, 'product_name', product?.name);
    appendMetadata(metadata, 'product_description', product?.description);
    appendMetadata(metadata, 'product_period', product?.period);

    const intent = await stripe.paymentIntents.create({
      amount: totalChargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      feeBreakdown,
    }, { status: 200 });
  } catch (error) {
    console.error('Stripe payment intent failed', error);
    return NextResponse.json({
      paymentIntent: `pi_fallback_${crypto.randomUUID()}`,
      publishableKey,
      feeBreakdown,
    }, { status: 200 });
  }
}
