import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const refundSchema = z.object({
  billPaymentId: z.string(),
  amountCents: z.number(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const normalizeStripeSecretKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized.length) {
    return null;
  }
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'undefined' || normalizedLower === 'null') {
    return null;
  }
  return normalized;
};

const isAlreadyRefundedStripeError = (error: unknown): boolean => {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  if (code === 'charge_already_refunded') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already refunded');
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; teamId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, teamId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = refundSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamIds: true,
      userIds: true,
      teamSignup: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedTeamId = normalizeId(teamId);
  if (!normalizedTeamId) {
    return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
  }

  const requestedAmountCents = Math.round(parsed.data.amountCents);
  if (!Number.isFinite(requestedAmountCents) || requestedAmountCents <= 0) {
    return NextResponse.json({ error: 'amountCents must be greater than 0' }, { status: 400 });
  }

  const billPaymentId = normalizeId(parsed.data.billPaymentId);
  if (!billPaymentId) {
    return NextResponse.json({ error: 'billPaymentId is required' }, { status: 400 });
  }

  const payment = await prisma.billPayments.findUnique({
    where: { id: billPaymentId },
    select: {
      id: true,
      billId: true,
      amountCents: true,
      status: true,
      paymentIntentId: true,
      refundedAmountCents: true,
    },
  });
  if (!payment) {
    return NextResponse.json({ error: 'Bill payment not found for this event.' }, { status: 404 });
  }
  const bill = await prisma.bills.findUnique({
    where: { id: payment.billId },
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      eventId: true,
    },
  });
  if (!bill || bill.eventId !== eventId) {
    return NextResponse.json({ error: 'Bill payment not found for this event.' }, { status: 404 });
  }
  if (payment.status !== 'PAID') {
    return NextResponse.json({ error: 'Only paid bill payments can be refunded.' }, { status: 400 });
  }

  const paymentIntentId = normalizeId(payment.paymentIntentId);
  if (!paymentIntentId) {
    return NextResponse.json({ error: 'Bill payment does not have a Stripe payment intent.' }, { status: 400 });
  }

  if (!event.teamSignup) {
    const participantUserIds = normalizeIdList(event.userIds);
    if (!participantUserIds.includes(normalizedTeamId)) {
      return NextResponse.json({ error: 'User is not a participant of this event.' }, { status: 404 });
    }
    const ownerMatchesUser = bill.ownerType === 'USER' && bill.ownerId === normalizedTeamId;
    if (!ownerMatchesUser) {
      return NextResponse.json({ error: 'Bill payment does not belong to this participant user.' }, { status: 400 });
    }
  } else {
    const eventTeamIds = normalizeIdList(event.teamIds);
    if (!eventTeamIds.includes(normalizedTeamId)) {
      return NextResponse.json({ error: 'Team is not a participant of this event.' }, { status: 404 });
    }

    const team = await prisma.teams.findUnique({
      where: { id: normalizedTeamId },
      select: {
        id: true,
        playerIds: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        parentTeamId: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const teamOwnerIds = Array.from(
      new Set(
        [team.id, normalizeId(team.parentTeamId)].filter((value): value is string => Boolean(value)),
      ),
    );
    const teamMemberIds = Array.from(
      new Set([
        ...normalizeIdList(team.playerIds),
        ...normalizeIdList([team.captainId, team.managerId, team.headCoachId]),
      ]),
    );
    const ownerIsOnTeam = bill.ownerType === 'TEAM'
      ? teamOwnerIds.includes(bill.ownerId)
      : teamMemberIds.includes(bill.ownerId);
    if (!ownerIsOnTeam) {
      return NextResponse.json({ error: 'Bill payment does not belong to this participant team.' }, { status: 400 });
    }
  }

  const refundedAmountCents = Math.max(0, Number(payment.refundedAmountCents ?? 0));
  const refundableAmountCents = Math.max(0, payment.amountCents - refundedAmountCents);
  if (refundableAmountCents <= 0) {
    return NextResponse.json({ error: 'This bill payment has no refundable balance left.' }, { status: 400 });
  }
  if (requestedAmountCents > refundableAmountCents) {
    return NextResponse.json(
      {
        error: 'Requested refund exceeds refundable balance.',
        refundableAmountCents,
      },
      { status: 400 },
    );
  }

  const stripeSecretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Stripe is not configured for refunds.' }, { status: 500 });
  }
  const stripe = new Stripe(stripeSecretKey);

  let refundId: string | null = null;
  let appliedRefundAmountCents = requestedAmountCents;
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: requestedAmountCents,
      reason: 'requested_by_customer',
      metadata: {
        event_id: eventId,
        team_id: normalizedTeamId,
        bill_id: bill.id,
        bill_payment_id: payment.id,
        host_user_id: session.userId,
      },
    });
    refundId = normalizeId(refund.id);
  } catch (error) {
    if (isAlreadyRefundedStripeError(error)) {
      appliedRefundAmountCents = refundableAmountCents;
    } else {
      console.error('Stripe refund failed', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create refund.' },
        { status: 502 },
      );
    }
  }

  const now = new Date();
  const nextRefundedAmountCents = Math.min(
    payment.amountCents,
    refundedAmountCents + appliedRefundAmountCents,
  );
  const updatedPayment = await prisma.billPayments.update({
    where: { id: payment.id },
    data: {
      refundedAmountCents: nextRefundedAmountCents,
      updatedAt: now,
    },
  });

  const remainingRefundableAmountCents = Math.max(
    0,
    updatedPayment.amountCents - (updatedPayment.refundedAmountCents ?? 0),
  );

  return NextResponse.json(
    {
      payment: withLegacyFields(updatedPayment),
      refundedAmountCents: appliedRefundAmountCents,
      remainingRefundableAmountCents,
      refundId,
    },
    { status: 200 },
  );
}
