import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { syncStripeSubscriptionMirrorById } from '@/lib/stripeSubscriptions';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stripeSubscriptionId = subscription.stripeSubscriptionId?.trim();
  if (!stripeSubscriptionId) {
    await prisma.subscriptions.update({
      where: { id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
    });
    return NextResponse.json({ restarted: true }, { status: 200 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await syncStripeSubscriptionMirrorById({
    stripe,
    stripeSubscriptionId,
  });

  return NextResponse.json({ restarted: true }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stripeSubscriptionId = subscription.stripeSubscriptionId?.trim();
  if (!stripeSubscriptionId) {
    await prisma.subscriptions.update({
      where: { id },
      data: { status: 'CANCELLED', updatedAt: new Date() },
    });
    return NextResponse.json({ cancelled: true }, { status: 200 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  await syncStripeSubscriptionMirrorById({
    stripe,
    stripeSubscriptionId,
  });

  return NextResponse.json({ cancelled: true }, { status: 200 });
}
