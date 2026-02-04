import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

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

const calculateChargeAmount = (goalAmountCents: number, fixedFeeCents = 30, percentFee = 0.029) => {
  const numerator = goalAmountCents + fixedFeeCents;
  const denominator = 1 - percentFee;
  return Math.round(numerator / denominator);
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

  if (payload.productId) {
    const product = await prisma.products.findUnique({ where: { id: payload.productId } });
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
  const appFeePercentage = eventType === 'LEAGUE' || eventType === 'TOURNAMENT' ? 0.03 : 0.01;
  const applicationFee = Math.round(amountCents * appFeePercentage);
  const totalCharge = calculateChargeAmount(amountCents + applicationFee);
  const stripeFee = totalCharge - amountCents - applicationFee;

  const feeBreakdown = {
    eventPrice: amountCents,
    stripeFee,
    processingFee: applicationFee,
    totalCharge,
    hostReceives: amountCents,
    feePercentage: appFeePercentage * 100,
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
    const intent = await stripe.paymentIntents.create({
      amount: totalCharge,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        purchase_type: purchaseType,
      },
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
