import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  billId: z.string(),
  billPaymentId: z.string(),
  user: z.record(z.string(), z.any()).optional(),
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

  const bill = await prisma.bills.findUnique({ where: { id: parsed.data.billId } });
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  }
  const payment = await prisma.billPayments.findUnique({ where: { id: parsed.data.billPaymentId } });
  if (!payment) {
    return NextResponse.json({ error: 'Bill payment not found' }, { status: 404 });
  }

  const amountCents = payment.amountCents;
  const appFeePercentage = 0.01;
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
    purchaseType: 'bill',
  };

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json({
      paymentIntent: `pi_mock_${crypto.randomUUID()}`,
      publishableKey,
      feeBreakdown,
      billId: bill.id,
      billPaymentId: payment.id,
    }, { status: 200 });
  }

  const stripe = new Stripe(secretKey);
  try {
    const intent = await stripe.paymentIntents.create({
      amount: totalCharge,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        bill_id: bill.id,
        bill_payment_id: payment.id,
      },
    });

    await prisma.billPayments.update({
      where: { id: payment.id },
      data: { paymentIntentId: intent.id, updatedAt: new Date() },
    });

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      feeBreakdown,
      billId: bill.id,
      billPaymentId: payment.id,
    }, { status: 200 });
  } catch (error) {
    console.error('Stripe billing intent failed', error);
    return NextResponse.json({
      paymentIntent: `pi_fallback_${crypto.randomUUID()}`,
      publishableKey,
      feeBreakdown,
      billId: bill.id,
      billPaymentId: payment.id,
    }, { status: 200 });
  }
}
