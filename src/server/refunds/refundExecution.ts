import Stripe from 'stripe';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { buildRefundCreateParamsForPaymentIntent } from '@/lib/stripeConnectAccounts';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type RefundRequestRow = {
  id: string;
  eventId: string;
  teamId: string | null;
  userId: string;
  hostId: string | null;
  organizationId: string | null;
  reason: string;
  status: 'WAITING' | 'APPROVED' | 'REJECTED' | null;
};

type RefundablePaymentRow = {
  id: string;
  billId: string;
  amountCents: number;
  refundedAmountCents: number | null;
  paymentIntentId: string | null;
};

export type StripeRefundAttempt = {
  paymentId: string;
  billId: string;
  appliedRefundAmountCents: number;
  refundId: string | null;
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

const dedupeById = <T extends { id: string }>(rows: T[]): T[] => {
  const byId = new Map<string, T>();
  rows.forEach((row) => byId.set(row.id, row));
  return Array.from(byId.values());
};

export const resolveRefundablePaymentsForRequest = async (
  client: PrismaLike,
  request: RefundRequestRow,
): Promise<Array<RefundablePaymentRow & { refundableAmountCents: number }>> => {
  let bills: Array<{ id: string }> = [];
  const normalizedTeamId = normalizeId(request.teamId);

  if (normalizedTeamId) {
    const team = await client.teams.findUnique({
      where: { id: normalizedTeamId },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
        playerIds: true,
        parentTeamId: true,
      },
    });
    if (team) {
      const teamOwnerIds = normalizeIdList([team.id, team.parentTeamId]);
      const participantUserIds = Array.from(
        new Set([
          ...normalizeIdList(team.playerIds),
          ...normalizeIdList(team.coachIds),
          ...normalizeIdList([team.captainId, team.managerId, team.headCoachId]),
        ]),
      );

      const teamBills = teamOwnerIds.length
        ? await client.bills.findMany({
          where: {
            eventId: request.eventId,
            ownerType: 'TEAM',
            ownerId: { in: teamOwnerIds },
          },
          select: { id: true },
        })
        : [];
      const teamBillIds = teamBills.map((bill) => bill.id);
      const splitUserBills = teamBillIds.length
        ? await client.bills.findMany({
          where: {
            eventId: request.eventId,
            ownerType: 'USER',
            parentBillId: { in: teamBillIds },
          },
          select: { id: true },
        })
        : [];
      const directUserBills = participantUserIds.length
        ? await client.bills.findMany({
          where: {
            eventId: request.eventId,
            ownerType: 'USER',
            ownerId: { in: participantUserIds },
          },
          select: { id: true },
        })
        : [];

      bills = dedupeById([
        ...teamBills,
        ...splitUserBills,
        ...directUserBills,
      ]);
    }
  } else {
    bills = await client.bills.findMany({
      where: {
        eventId: request.eventId,
        ownerType: 'USER',
        ownerId: request.userId,
      },
      select: { id: true },
    });
  }

  const billIds = bills.map((bill) => bill.id);
  if (!billIds.length) {
    return [];
  }

  const payments = await client.billPayments.findMany({
    where: {
      billId: { in: billIds },
      status: 'PAID',
      paymentIntentId: { not: null },
    },
    select: {
      id: true,
      billId: true,
      amountCents: true,
      refundedAmountCents: true,
      paymentIntentId: true,
    },
  });

  return payments
    .map((payment) => {
      const amountCents = Number.isFinite(Number(payment.amountCents))
        ? Math.max(0, Number(payment.amountCents))
        : 0;
      const refundedAmountCents = Number.isFinite(Number(payment.refundedAmountCents))
        ? Math.max(0, Number(payment.refundedAmountCents))
        : 0;
      const refundableAmountCents = Math.max(0, amountCents - refundedAmountCents);
      return {
        ...payment,
        amountCents,
        refundedAmountCents,
        refundableAmountCents,
      };
    })
    .filter((payment) => payment.refundableAmountCents > 0 && normalizeId(payment.paymentIntentId));
};

export const createStripeRefundAttempts = async (params: {
  request: RefundRequestRow;
  payments: Array<RefundablePaymentRow & { refundableAmountCents: number }>;
  approvedByUserId: string;
}): Promise<StripeRefundAttempt[]> => {
  if (!params.payments.length) {
    return [];
  }

  const stripeSecretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey) {
    throw new Error('Stripe is not configured for refunds.');
  }

  const stripe = new Stripe(stripeSecretKey);
  const attempts: StripeRefundAttempt[] = [];

  for (const payment of params.payments) {
    const paymentIntentId = normalizeId(payment.paymentIntentId);
    if (!paymentIntentId) {
      continue;
    }

    let refundId: string | null = null;
    try {
      const refundParams = await buildRefundCreateParamsForPaymentIntent({
        stripe,
        paymentIntentId,
        amountCents: payment.refundableAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          event_id: params.request.eventId,
          refund_request_id: params.request.id,
          team_id: params.request.teamId ?? '',
          user_id: params.request.userId,
          bill_id: payment.billId,
          bill_payment_id: payment.id,
          approved_by_user_id: params.approvedByUserId,
        },
      });
      const refund = await stripe.refunds.create(
        refundParams,
        {
          idempotencyKey: `refund-request:${params.request.id}:payment:${payment.id}`,
        },
      );
      refundId = normalizeId(refund.id);
    } catch (error) {
      if (!isAlreadyRefundedStripeError(error)) {
        throw error;
      }
    }

    attempts.push({
      paymentId: payment.id,
      billId: payment.billId,
      appliedRefundAmountCents: payment.refundableAmountCents,
      refundId,
    });
  }

  return attempts;
};

export const applyRefundAttempts = async (
  client: PrismaLike,
  attempts: StripeRefundAttempt[],
  now: Date,
) => {
  const updatedPayments = [];

  for (const refundAttempt of attempts) {
    const currentPayment = await client.billPayments.findUnique({
      where: { id: refundAttempt.paymentId },
      select: {
        id: true,
        amountCents: true,
        refundedAmountCents: true,
      },
    });
    if (!currentPayment) {
      throw new Error(`Bill payment ${refundAttempt.paymentId} not found during refund finalization.`);
    }

    const currentRefundedAmountCents = Number.isFinite(Number(currentPayment.refundedAmountCents))
      ? Math.max(0, Number(currentPayment.refundedAmountCents))
      : 0;
    const nextRefundedAmountCents = Math.min(
      Math.max(0, Number(currentPayment.amountCents)),
      currentRefundedAmountCents + refundAttempt.appliedRefundAmountCents,
    );

    const updatedPayment = await client.billPayments.update({
      where: { id: refundAttempt.paymentId },
      data: {
        refundedAmountCents: nextRefundedAmountCents,
        updatedAt: now,
      },
    });
    updatedPayments.push(updatedPayment);
  }

  return updatedPayments;
};

export const summarizeRefundAttempts = (attempts: StripeRefundAttempt[]) => ({
  refundedAmountCents: attempts.reduce((total, attempt) => total + attempt.appliedRefundAmountCents, 0),
  stripeRefundIds: attempts
    .map((attempt) => attempt.refundId)
    .filter((refundId): refundId is string => Boolean(refundId)),
  refundedPaymentIds: attempts.map((attempt) => attempt.paymentId),
});
