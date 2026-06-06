import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateChargeAmountForPaymentMethod, getPaymentMethodFeeLabel } from '@/lib/billingFees';
import { canManageBillPayment } from '@/server/billing/billPaymentActions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  billId: z.string(),
  billPaymentId: z.string(),
  user: z.record(z.string(), z.any()).optional(),
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

const canClaimUnassignedTeamBillPayment = async (teamId: string, userId: string): Promise<boolean> => {
  const directRegistration = await prisma.teamRegistrations.findFirst({
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

  const eventTeam = await prisma.teams.findUnique({
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
    const parentRegistration = await prisma.teamRegistrations.findFirst({
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

  const childEventTeams = await prisma.teams.findMany({
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
    payment.status
    && payment.status !== 'PENDING'
    && payment.status !== 'FAILED'
    && payment.status !== 'DISPUTED'
  ) {
    return NextResponse.json({ error: 'Bill payment is not pending' }, { status: 400 });
  }

  const amountCents = payment.amountCents;
  const billLineItems = Array.isArray(bill.lineItems) ? bill.lineItems : [];
  const billIncludesFeeLineItems = billLineItems.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const type = typeof (item as { type?: unknown }).type === 'string'
      ? (item as { type: string }).type.trim().toUpperCase()
      : '';
    return type === 'FEE' || type === 'TAX';
  });
  const appFeePercentage = billIncludesFeeLineItems ? 0 : 0.01;
  const applicationFee = Math.round(amountCents * appFeePercentage);
  const paymentMethodFees = calculateChargeAmountForPaymentMethod({
    goalAmountCents: amountCents + applicationFee,
  });
  const totalCharge = paymentMethodFees.totalChargeCents;
  const stripeFee = paymentMethodFees.stripeProcessingFeeCents;

  const feeBreakdown = {
    eventPrice: amountCents,
    stripeFee,
    stripeProcessingFee: stripeFee,
    stripeTaxServiceFee: 0,
    processingFee: applicationFee,
    mvpFee: applicationFee,
    totalCharge,
    hostReceives: amountCents,
    feePercentage: appFeePercentage * 100,
    paymentMethodType: paymentMethodFees.paymentMethodType,
    paymentMethodLabel: getPaymentMethodFeeLabel(paymentMethodFees.paymentMethodType),
    purchaseType: 'bill',
  };

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    if (canClaimTeamPayment) {
      await prisma.billPayments.update({
        where: { id: payment.id },
        data: {
          payerUserId: session.userId,
          updatedAt: new Date(),
        },
      });
    }
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
    const userId = parsed.data.user?.$id ?? parsed.data.user?.id ?? null;
    const intent = await stripe.paymentIntents.create({
      amount: totalCharge,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        purchase_type: 'bill',
        bill_id: bill.id,
        bill_payment_id: payment.id,
        amount_cents: String(amountCents),
        total_charge_cents: String(totalCharge),
        processing_fee_cents: String(applicationFee),
        mvp_fee_cents: String(applicationFee),
        stripe_fee_cents: String(stripeFee),
        stripe_processing_fee_cents: String(stripeFee),
        stripe_tax_service_fee_cents: '0',
        payment_method_fee_type: paymentMethodFees.paymentMethodType,
        payment_method_fee_label: getPaymentMethodFeeLabel(paymentMethodFees.paymentMethodType),
        ...(bill.eventId ? { event_id: bill.eventId } : {}),
        ...(bill.organizationId ? { organization_id: bill.organizationId } : {}),
        ...(userId ? { user_id: String(userId) } : {}),
      },
    });

    await prisma.billPayments.update({
      where: { id: payment.id },
      data: {
        paymentIntentId: intent.id,
        ...(canClaimTeamPayment ? { payerUserId: session.userId } : {}),
        updatedAt: new Date(),
      },
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
