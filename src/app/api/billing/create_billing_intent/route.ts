import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateIncludedFeesFromTotalPrice, getPaymentMethodFeeLabel, normalizePaymentMethodFeeType } from '@/lib/billingFees';
import { isManualRegistrationPaymentMode } from '@/lib/manualRegistrationPayments';
import { canManageBillPayment } from '@/server/billing/billPaymentActions';
import { acquireBillSplitLock } from '@/server/billing/billSplitLock';
import { getConfiguredStripeSecretKey, STRIPE_UNAVAILABLE_ERROR } from '@/server/stripeConfiguration';

export const dynamic = 'force-dynamic';

const schema = z.object({
  billId: z.string(),
  billPaymentId: z.string(),
  // Retained for legacy clients, but never trusted as actor or payer identity.
  user: z.record(z.string(), z.any()).optional(),
}).passthrough();

const ACTIONABLE_PAYMENT_STATUSES = ['PENDING', 'FAILED', 'DISPUTED'] as const;

const isActionablePaymentStatus = (status: string | null): boolean => (
  status === null || ACTIONABLE_PAYMENT_STATUSES.includes(status as typeof ACTIONABLE_PAYMENT_STATUSES[number])
);

const cancelFreshPaymentIntent = async (stripe: Stripe, paymentIntentId: string): Promise<void> => {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: 'requested_by_customer',
    });
  } catch (error) {
    console.error('Failed to cancel a billing payment intent invalidated before checkout.', {
      paymentIntentId,
      error,
    });
  }
};

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

type TeamPaymentClaimClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  'teamRegistrations' | 'teams'
>;

const teamRowContainsUser = (
  team: {
    playerIds?: unknown;
    captainId?: string | null;
    managerId?: string | null;
    headCoachId?: string | null;
  } | null,
  userId: string,
): boolean => {
  if (!team) return false;
  const memberIds = new Set([
    ...normalizeIdList(team.playerIds),
    ...[
      normalizeId(team.captainId),
      normalizeId(team.managerId),
      normalizeId(team.headCoachId),
    ].filter((entry): entry is string => Boolean(entry)),
  ]);
  return memberIds.has(userId);
};

const canClaimUnassignedTeamBillPayment = async (
  teamId: string,
  userId: string,
  client: TeamPaymentClaimClient = prisma,
): Promise<boolean> => {
  const directRegistration = await client.teamRegistrations.findFirst({
    where: {
      teamId,
      userId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (directRegistration) {
    return true;
  }

  const eventTeam = await client.teams.findUnique({
    where: { id: teamId },
    select: {
      parentTeamId: true,
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
    },
  });
  if (teamRowContainsUser(eventTeam, userId)) {
    return true;
  }

  const parentTeamId = normalizeId(eventTeam?.parentTeamId);
  if (parentTeamId) {
    const parentRegistration = await client.teamRegistrations.findFirst({
      where: {
        teamId: parentTeamId,
        userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (parentRegistration) {
      return true;
    }
  }

  const childEventTeams = await client.teams.findMany({
    where: { parentTeamId: teamId },
    select: {
      playerIds: true,
      captainId: true,
      managerId: true,
      headCoachId: true,
    },
  });
  return childEventTeams.some((team) => teamRowContainsUser(team, userId));
};

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const secretKey = getConfiguredStripeSecretKey();
  if (!secretKey) {
    return NextResponse.json({ error: STRIPE_UNAVAILABLE_ERROR }, { status: 503 });
  }

  const bill = await prisma.bills.findUnique({ where: { id: parsed.data.billId } });
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  }
  const payment = await prisma.billPayments.findUnique({ where: { id: parsed.data.billPaymentId } });
  if (!payment) {
    return NextResponse.json({ error: 'Bill payment not found' }, { status: 404 });
  }
  if (payment.billId !== bill.id) {
    return NextResponse.json({ error: 'Bill payment does not belong to the bill' }, { status: 400 });
  }
  if (bill.eventId) {
    const event = await prisma.events.findUnique({
      where: { id: bill.eventId },
      select: { registrationPaymentMode: true },
    });
    if (isManualRegistrationPaymentMode((event as any)?.registrationPaymentMode)) {
      return NextResponse.json(
        { error: 'This bill is paid outside BracketIQ. Upload proof of payment instead.' },
        { status: 400 },
      );
    }
  }
  const isAssignedPayer = payment.payerUserId === session.userId;
  const canClaimTeamPayment = !payment.payerUserId
    && bill.ownerType === 'TEAM'
    && await canClaimUnassignedTeamBillPayment(bill.ownerId, session.userId);
  if (!isAssignedPayer && !canClaimTeamPayment && !(await canManageBillPayment(session, bill as any))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (payment.status === 'PROCESSING') {
    return NextResponse.json({ error: 'This bill payment is already pending with Stripe.' }, { status: 409 });
  }
  if (
    !isActionablePaymentStatus(payment.status)
  ) {
    return NextResponse.json({ error: 'Bill payment is not pending' }, { status: 400 });
  }
  if (payment.paymentIntentId && payment.status !== 'FAILED') {
    return NextResponse.json({ error: 'This bill payment is already pending with Stripe.' }, { status: 409 });
  }

  const amountCents = payment.amountCents;
  const includedFees = calculateIncludedFeesFromTotalPrice({ totalPriceCents: amountCents });
  const applicationFee = includedFees.platformFeeCents;
  const totalCharge = includedFees.totalPriceCents;
  const stripeFee = includedFees.processingFeeCents;
  const paymentMethodType = normalizePaymentMethodFeeType('card');

  const feeBreakdown = {
    eventPrice: amountCents,
    stripeFee,
    stripeProcessingFee: stripeFee,
    stripeTaxServiceFee: 0,
    processingFee: applicationFee,
    mvpFee: applicationFee,
    totalCharge,
    hostReceives: includedFees.hostReceivesCents,
    feePercentage: includedFees.platformFeePercentage * 100,
    paymentMethodType,
    paymentMethodLabel: getPaymentMethodFeeLabel(paymentMethodType),
    purchaseType: 'bill',
  };

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  const stripe = new Stripe(secretKey);
  let freshIntentId: string | null = null;
  let didBindIntent = false;
  try {
    const payerUserId = payment.payerUserId ?? session.userId;
    const intent = await stripe.paymentIntents.create({
      amount: totalCharge,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        purchase_type: 'bill',
        fees_included_in_price: 'true',
        bill_id: bill.id,
        bill_payment_id: payment.id,
        amount_cents: String(amountCents),
        total_charge_cents: String(totalCharge),
        processing_fee_cents: String(applicationFee),
        mvp_fee_cents: String(applicationFee),
        stripe_fee_cents: String(stripeFee),
        stripe_processing_fee_cents: String(stripeFee),
        stripe_tax_service_fee_cents: '0',
        payment_method_fee_type: paymentMethodType,
        payment_method_fee_label: getPaymentMethodFeeLabel(paymentMethodType),
        ...(bill.eventId ? { event_id: bill.eventId } : {}),
        ...(bill.organizationId ? { organization_id: bill.organizationId } : {}),
        user_id: payerUserId,
      },
    });
    freshIntentId = intent.id;

    didBindIntent = await prisma.$transaction(async (tx) => {
      await acquireBillSplitLock(tx, bill.id);

      const [currentBill, currentPayment] = await Promise.all([
        tx.bills.findUnique({
          where: { id: bill.id },
          select: { id: true, ownerType: true, ownerId: true, status: true },
        }),
        tx.billPayments.findUnique({
          where: { id: payment.id },
          select: {
            id: true,
            billId: true,
            status: true,
            paymentIntentId: true,
            payerUserId: true,
          },
        }),
      ]);

      if (
        !currentBill
        || !currentPayment
        || currentPayment.billId !== currentBill.id
        || currentBill.status === 'PAID'
        || currentBill.status === 'CANCELLED'
        || !isActionablePaymentStatus(currentPayment.status)
        || currentPayment.payerUserId !== payment.payerUserId
        || (
          currentPayment.paymentIntentId !== null
          && !(currentPayment.status === 'FAILED' && currentPayment.paymentIntentId === payment.paymentIntentId)
        )
      ) {
        return false;
      }

      if (
        canClaimTeamPayment
        && currentBill.ownerType === 'TEAM'
        && currentPayment.payerUserId === null
        && !(await canClaimUnassignedTeamBillPayment(currentBill.ownerId, session.userId, tx))
      ) {
        return false;
      }

      if (currentBill.ownerType === 'TEAM') {
        const existingSplitChild = await tx.bills.findFirst({
          where: { parentBillId: currentBill.id },
          select: { id: true },
        });
        if (existingSplitChild) {
          return false;
        }
      }

      const boundPayment = await tx.billPayments.updateMany({
        where: {
          id: currentPayment.id,
          billId: currentBill.id,
          status: currentPayment.status,
          paymentIntentId: currentPayment.paymentIntentId,
          payerUserId: currentPayment.payerUserId,
        },
        data: {
          paymentIntentId: intent.id,
          payerUserId,
          updatedAt: new Date(),
        },
      });
      return boundPayment.count === 1;
    });

    if (!didBindIntent) {
      await cancelFreshPaymentIntent(stripe, intent.id);
      freshIntentId = null;
      return NextResponse.json(
        { error: 'Bill payment is no longer available. Refresh and try again.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      paymentIntent: intent.client_secret ?? intent.id,
      publishableKey,
      feeBreakdown,
      billId: bill.id,
      billPaymentId: payment.id,
    }, { status: 200 });
  } catch (error) {
    if (freshIntentId && !didBindIntent) {
      await cancelFreshPaymentIntent(stripe, freshIntentId);
    }
    console.error('Stripe billing intent failed', error);
    const message = error instanceof Error ? error.message : 'Failed to create billing payment intent.';
    return NextResponse.json({
      error: message,
      publishableKey,
      feeBreakdown,
      billId: bill.id,
      billPaymentId: payment.id,
    }, { status: 502 });
  }
}
