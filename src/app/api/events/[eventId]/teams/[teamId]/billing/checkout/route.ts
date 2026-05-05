import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { calculateMvpAndStripeFees } from '@/lib/billingFees';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { buildDestinationTransferData } from '@/lib/stripeConnectAccounts';
import { canManageEvent } from '@/server/accessControl';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';

export const dynamic = 'force-dynamic';

const checkoutSchema = z.object({
  ownerType: z.enum(['TEAM', 'USER']),
  ownerId: z.string().optional(),
  eventAmountCents: z.number(),
  taxAmountCents: z.number().optional(),
  divisionId: z.string().optional(),
  label: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const appendMetadata = (
  metadata: Record<string, string>,
  key: string,
  value: unknown,
): void => {
  const normalized = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : normalizeId(value);
  if (normalized) {
    metadata[key] = normalized;
  }
};

const buildQrCodeUrl = (req: NextRequest, checkoutUrl: string): string => {
  const origin = getRequestOrigin(req);
  const qrUrl = new URL('/api/billing/checkout-qr', origin);
  qrUrl.searchParams.set('url', checkoutUrl);
  return qrUrl.toString();
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; teamId: string }> },
) {
  const session = await requireSession(req);
  const { eventId, teamId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      teamSignup: true,
      eventType: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedParticipantId = normalizeId(teamId);
  if (!normalizedParticipantId) {
    return NextResponse.json({ error: 'Invalid participant id' }, { status: 400 });
  }

  const eventAmountCents = Math.round(parsed.data.eventAmountCents);
  if (!Number.isFinite(eventAmountCents) || eventAmountCents <= 0) {
    return NextResponse.json({ error: 'eventAmountCents must be greater than 0' }, { status: 400 });
  }
  const taxAmountCents = parsed.data.taxAmountCents !== undefined
    ? Math.max(0, Math.round(parsed.data.taxAmountCents))
    : 0;

  const requestedOwnerId = normalizeId(parsed.data.ownerId);
  const participantIds = await getEventParticipantIdsForEvent(event.id);

  let billOwnerType: 'TEAM' | 'USER';
  let billOwnerId: string;
  let payerUserId: string | null;
  let teamName: string | null = null;

  if (event.teamSignup) {
    if (parsed.data.ownerType !== 'TEAM') {
      return NextResponse.json({ error: 'Team events can only receive payment for teams.' }, { status: 400 });
    }
    if (requestedOwnerId && requestedOwnerId !== normalizedParticipantId) {
      return NextResponse.json({ error: 'Team bill owner must match the participant team.' }, { status: 400 });
    }
    if (!participantIds.teamIds.includes(normalizedParticipantId)) {
      return NextResponse.json({ error: 'Team is not a participant of this event.' }, { status: 404 });
    }

    const team = await prisma.teams.findUnique({
      where: { id: normalizedParticipantId },
      select: {
        id: true,
        name: true,
        managerId: true,
        captainId: true,
        headCoachId: true,
      },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    billOwnerType = 'TEAM';
    billOwnerId = team.id;
    payerUserId = normalizeId(team.managerId)
      ?? normalizeId(team.captainId)
      ?? normalizeId(team.headCoachId)
      ?? session.userId;
    teamName = team.name?.trim() || team.id;
  } else {
    if (parsed.data.ownerType !== 'USER') {
      return NextResponse.json({ error: 'Non-team events can only receive payment for users.' }, { status: 400 });
    }
    if (requestedOwnerId && requestedOwnerId !== normalizedParticipantId) {
      return NextResponse.json({ error: 'User bill owner must match the participant user.' }, { status: 400 });
    }
    if (!participantIds.userIds.includes(normalizedParticipantId)) {
      return NextResponse.json({ error: 'User is not a participant of this event.' }, { status: 404 });
    }

    billOwnerType = 'USER';
    billOwnerId = normalizedParticipantId;
    payerUserId = normalizedParticipantId;
  }

  const {
    mvpFeeCents,
    stripeFeeCents,
    mvpFeePercentage,
  } = calculateMvpAndStripeFees({
    eventAmountCents,
    eventType: event.eventType,
  });
  const totalChargeCents = eventAmountCents + mvpFeeCents + stripeFeeCents + taxAmountCents;
  const normalizedLabel = parsed.data.label?.trim() || 'Event registration';
  const eventName = event.name?.trim() || normalizedLabel;
  const origin = getRequestOrigin(req);
  const checkoutSuccessUrl = new URL('/profile', origin);
  checkoutSuccessUrl.searchParams.set('payment', 'success');
  checkoutSuccessUrl.searchParams.set('eventId', event.id);
  const checkoutCancelUrl = new URL('/profile', origin);
  checkoutCancelUrl.searchParams.set('payment', 'cancelled');
  checkoutCancelUrl.searchParams.set('eventId', event.id);

  const feeBreakdown = {
    eventPrice: eventAmountCents,
    stripeFee: stripeFeeCents,
    processingFee: mvpFeeCents,
    mvpFee: mvpFeeCents,
    taxAmount: taxAmountCents,
    totalCharge: totalChargeCents,
    hostReceives: eventAmountCents,
    feePercentage: mvpFeePercentage * 100,
    purchaseType: 'event_payment',
  };

  const metadata: Record<string, string> = {
    purchase_type: 'event_payment',
    bill_owner_type: billOwnerType,
    bill_owner_id: billOwnerId,
    event_id: event.id,
    event_name: eventName,
    amount_cents: String(eventAmountCents),
    total_charge_cents: String(totalChargeCents),
    processing_fee_cents: String(mvpFeeCents),
    mvp_fee_cents: String(mvpFeeCents),
    stripe_fee_cents: String(stripeFeeCents),
    tax_cents: String(taxAmountCents),
    fee_percentage: (mvpFeePercentage * 100).toFixed(4),
  };
  appendMetadata(metadata, 'user_id', payerUserId);
  appendMetadata(metadata, 'team_id', billOwnerType === 'TEAM' ? billOwnerId : null);
  appendMetadata(metadata, 'team_name', teamName);
  appendMetadata(metadata, 'organization_id', event.organizationId);
  appendMetadata(metadata, 'division_id', parsed.data.divisionId);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const checkoutUrl = new URL('/billing/mock-checkout', origin);
    checkoutUrl.searchParams.set('eventId', event.id);
    checkoutUrl.searchParams.set('ownerType', billOwnerType);
    checkoutUrl.searchParams.set('ownerId', billOwnerId);
    return NextResponse.json({
      checkoutUrl: checkoutUrl.toString(),
      qrCodeUrl: buildQrCodeUrl(req, checkoutUrl.toString()),
      amountCents: totalChargeCents,
      eventAmountCents,
      billOwnerType,
      billOwnerId,
      payerUserId,
      feeBreakdown,
    }, { status: 200 });
  }

  const stripe = new Stripe(secretKey);
  const transferData = await buildDestinationTransferData({
    organizationId: event.organizationId,
    hostUserId: event.hostId,
    transferAmountCents: eventAmountCents,
  });

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: normalizedLabel,
              description: eventName,
            },
            unit_amount: totalChargeCents,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
        ...(transferData ? { transfer_data: transferData } : {}),
      },
      success_url: checkoutSuccessUrl.toString(),
      cancel_url: checkoutCancelUrl.toString(),
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      qrCodeUrl: buildQrCodeUrl(req, checkoutSession.url),
      amountCents: totalChargeCents,
      eventAmountCents,
      billOwnerType,
      billOwnerId,
      payerUserId,
      feeBreakdown,
      checkoutSessionId: checkoutSession.id,
    }, { status: 200 });
  } catch (error) {
    console.error('Stripe event participant checkout failed', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session.';
    return NextResponse.json({ error: message, feeBreakdown }, { status: 502 });
  }
}
