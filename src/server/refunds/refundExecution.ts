import Stripe from 'stripe';
import { createHash } from 'crypto';
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
  slotId?: string | null;
  occurrenceDate?: string | null;
  requestedByUserId?: string | null;
  billIds?: string[];
  paymentIds?: string[];
  paymentScope?: unknown;
  requestedAmountCents?: number;
  currency?: string;
  policyDecision?: string | null;
  scopeVersion?: number;
  scopeHash?: string | null;
  /**
   * Transient authorization context used while the immutable payment scope is
   * created. It is intentionally not persisted: the resulting bill/payment
   * snapshot is the durable authorization boundary for later approval.
   */
  authorizedPayerUserIds?: string[];
};

const TEAM_REGISTRATION_REFUND_EVENT_PREFIX = 'team_registration:';

export const buildTeamRegistrationRefundEventId = (teamId: string): string => (
  `${TEAM_REGISTRATION_REFUND_EVENT_PREFIX}${teamId}`
);

type RefundablePaymentRow = {
  id: string;
  billId: string;
  amountCents: number;
  refundedAmountCents: number | null;
  paymentIntentId: string | null;
  payerUserId: string | null;
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

export type RefundScopePayment = {
  paymentId: string;
  billId: string;
  refundableAmountCents: number;
  currency: string;
};

export type RefundScopeSnapshot = {
  billIds: string[];
  paymentIds: string[];
  paymentScope: RefundScopePayment[];
  requestedAmountCents: number;
  currency: string;
  policyDecision: string;
  scopeVersion: number;
  scopeHash: string;
};

export const REFUND_SCOPE_VERSION = 2;

const normalizeCurrency = (value: unknown): string => (
  normalizeId(value)?.toLowerCase() ?? 'usd'
);

/**
 * Refund payment rows are stored verbatim in the request scope.  The host sees
 * these exact rows before approving, and a later payment mutation must not be
 * silently substituted into the Stripe refund.
 */
export const normalizeRefundScopePayments = (value: unknown): RefundScopePayment[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const payments = new Map<string, RefundScopePayment>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const candidate = entry as Record<string, unknown>;
    const paymentId = normalizeId(candidate.paymentId);
    const billId = normalizeId(candidate.billId);
    const refundableAmountCents = Number(candidate.refundableAmountCents);
    if (!paymentId || !billId || !Number.isFinite(refundableAmountCents)) {
      return;
    }
    const normalizedAmount = Math.max(0, Math.round(refundableAmountCents));
    if (normalizedAmount <= 0 || payments.has(paymentId)) {
      return;
    }
    payments.set(paymentId, {
      paymentId,
      billId,
      refundableAmountCents: normalizedAmount,
      currency: normalizeCurrency(candidate.currency),
    });
  });

  return Array.from(payments.values()).sort((left, right) => (
    left.paymentId.localeCompare(right.paymentId)
  ));
};

const buildRefundScopePayments = (
  payments: Array<RefundablePaymentRow & { refundableAmountCents: number }>,
  currency: string,
): RefundScopePayment[] => normalizeRefundScopePayments(payments.map((payment) => ({
  paymentId: payment.id,
  billId: payment.billId,
  refundableAmountCents: payment.refundableAmountCents,
  currency,
})));

const calculateRefundScopeHash = (input: {
  requestId: string;
  eventId: string;
  userId: string;
  requestedByUserId?: string | null;
  teamId?: string | null;
  slotId?: string | null;
  occurrenceDate?: string | null;
  billIds: string[];
  paymentIds: string[];
  paymentScope: RefundScopePayment[];
  requestedAmountCents: number;
  currency: string;
  policyDecision: string;
  scopeVersion: number;
}): string => createHash('sha256').update(JSON.stringify({
  ...input,
  billIds: [...input.billIds].sort(),
  paymentIds: [...input.paymentIds].sort(),
  paymentScope: [...input.paymentScope]
    .map((payment) => ({
      paymentId: payment.paymentId,
      billId: payment.billId,
      refundableAmountCents: payment.refundableAmountCents,
      currency: payment.currency,
    }))
    .sort((left, right) => left.paymentId.localeCompare(right.paymentId)),
})).digest('hex');

export const buildRefundScopeSnapshot = (
  request: RefundRequestRow,
  payments: Array<RefundablePaymentRow & { refundableAmountCents: number }>,
  policyDecision: string,
): RefundScopeSnapshot => {
  const currency = 'usd';
  const paymentScope = buildRefundScopePayments(payments, currency);
  const billIds = normalizeIdList(paymentScope.map((payment) => payment.billId));
  const paymentIds = normalizeIdList(paymentScope.map((payment) => payment.paymentId));
  const requestedAmountCents = paymentScope.reduce(
    (total, payment) => total + Math.max(0, Math.round(payment.refundableAmountCents)),
    0,
  );
  const scopeVersion = REFUND_SCOPE_VERSION;
  return {
    billIds,
    paymentIds,
    paymentScope,
    requestedAmountCents,
    currency,
    policyDecision,
    scopeVersion,
    scopeHash: calculateRefundScopeHash({
      requestId: request.id,
      eventId: request.eventId,
      userId: request.userId,
      requestedByUserId: request.requestedByUserId,
      teamId: request.teamId,
      slotId: request.slotId,
      occurrenceDate: request.occurrenceDate,
      billIds,
      paymentIds,
      paymentScope,
      requestedAmountCents,
      currency,
      policyDecision,
      scopeVersion,
    }),
  };
};

export const isRefundScopeSnapshotValid = (request: RefundRequestRow): boolean => {
  const billIds = normalizeIdList(request.billIds);
  const paymentIds = normalizeIdList(request.paymentIds);
  const paymentScope = normalizeRefundScopePayments(request.paymentScope);
  const requestedAmountCents = Math.max(0, Math.round(Number(request.requestedAmountCents) || 0));
  const currency = normalizeCurrency(request.currency);
  const policyDecision = normalizeId(request.policyDecision) ?? '';
  const scopeVersion = Number(request.scopeVersion);
  const scopedBillIds = normalizeIdList(paymentScope.map((payment) => payment.billId));
  const scopedPaymentIds = normalizeIdList(paymentScope.map((payment) => payment.paymentId));
  const scopedAmountCents = paymentScope.reduce(
    (total, payment) => total + payment.refundableAmountCents,
    0,
  );
  if (
    !billIds.length
    || !paymentIds.length
    || !paymentScope.length
    || requestedAmountCents <= 0
    || !policyDecision
    || scopeVersion !== REFUND_SCOPE_VERSION
    || requestedAmountCents !== scopedAmountCents
    || billIds.join('|') !== scopedBillIds.join('|')
    || paymentIds.join('|') !== scopedPaymentIds.join('|')
    || paymentScope.some((payment) => payment.currency !== currency)
  ) {
    return false;
  }
  return request.scopeHash === calculateRefundScopeHash({
    requestId: request.id,
    eventId: request.eventId,
    userId: request.userId,
    requestedByUserId: request.requestedByUserId,
    teamId: request.teamId,
    slotId: request.slotId,
    occurrenceDate: request.occurrenceDate,
    billIds,
    paymentIds,
    paymentScope,
    requestedAmountCents,
    currency,
    policyDecision,
    scopeVersion,
  });
};

/**
 * Compare current payment state to the immutable request snapshot immediately
 * before refunding.  Any previous partial refund, removed payment, or amount
 * change requires a newly reviewed request instead of silently changing what
 * the host approved.
 */
export const hasRefundScopeDrift = (
  request: RefundRequestRow,
  payments: Array<RefundablePaymentRow & { refundableAmountCents: number }>,
): boolean => {
  const snapshot = normalizeRefundScopePayments(request.paymentScope);
  const current = buildRefundScopePayments(payments, normalizeCurrency(request.currency));
  if (snapshot.length !== current.length) {
    return true;
  }
  return snapshot.some((payment, index) => {
    const resolved = current[index];
    return !resolved
      || payment.paymentId !== resolved.paymentId
      || payment.billId !== resolved.billId
      || payment.refundableAmountCents !== resolved.refundableAmountCents
      || payment.currency !== resolved.currency;
  });
};

export const buildRefundApprovalPreview = (request: RefundRequestRow) => {
  const paymentScope = normalizeRefundScopePayments(request.paymentScope);
  const currency = normalizeCurrency(request.currency);
  return {
    paymentScope,
    paymentCount: paymentScope.length,
    billIds: normalizeIdList(request.billIds),
    paymentIds: normalizeIdList(request.paymentIds),
    refundableAmountCents: Math.max(0, Math.round(Number(request.requestedAmountCents) || 0)),
    currency,
    occurrence: {
      slotId: normalizeId(request.slotId),
      occurrenceDate: normalizeId(request.occurrenceDate),
    },
    policyDecision: normalizeId(request.policyDecision),
    scopeVersion: Number(request.scopeVersion) || 0,
    scopeHash: normalizeId(request.scopeHash),
    isValid: isRefundScopeSnapshotValid(request),
  };
};

export const resolveRefundablePaymentsForRequest = async (
  client: PrismaLike,
  request: RefundRequestRow,
): Promise<Array<RefundablePaymentRow & { refundableAmountCents: number }>> => {
  const snapshotPaymentIds = normalizeIdList(request.paymentIds);
  const snapshotBillIds = normalizeIdList(request.billIds);
  if (snapshotPaymentIds.length > 0) {
    const snapshotPayments = await client.billPayments.findMany({
      where: {
        id: { in: snapshotPaymentIds },
        ...(snapshotBillIds.length ? { billId: { in: snapshotBillIds } } : {}),
        status: 'PAID',
        paymentIntentId: { not: null },
      },
      select: {
        id: true,
        billId: true,
        amountCents: true,
        refundedAmountCents: true,
        paymentIntentId: true,
        payerUserId: true,
      },
    });
    return snapshotPayments.map((payment) => ({
      ...payment,
      amountCents: Math.max(0, Number(payment.amountCents) || 0),
      refundedAmountCents: Math.max(0, Number(payment.refundedAmountCents) || 0),
      refundableAmountCents: Math.max(
        0,
        (Number(payment.amountCents) || 0) - (Number(payment.refundedAmountCents) || 0),
      ),
    })).filter((payment) => payment.refundableAmountCents > 0);
  }

  let bills: Array<{ id: string }> = [];
  let teamOwnedBillIds = new Set<string>();
  const normalizedTeamId = normalizeId(request.teamId);
  const normalizedSlotId = normalizeId(request.slotId);
  const normalizedOccurrenceDate = normalizeId(request.occurrenceDate);
  const occurrenceBillWhere = normalizedSlotId && normalizedOccurrenceDate
    ? {
      slotId: normalizedSlotId,
      occurrenceDate: normalizedOccurrenceDate,
    }
    : {};
  const isTeamRegistrationRefund = Boolean(
    normalizedTeamId
      && request.eventId === buildTeamRegistrationRefundEventId(normalizedTeamId),
  );
  const authorizedPayerUserIds = normalizeIdList([
    request.userId,
    request.requestedByUserId,
    ...(request.authorizedPayerUserIds ?? []),
  ]);

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
      const teamBills = teamOwnerIds.length
        ? await client.bills.findMany({
          where: {
            eventId: isTeamRegistrationRefund ? null : request.eventId,
            ownerType: 'TEAM',
            ownerId: { in: teamOwnerIds },
            ...occurrenceBillWhere,
          },
          select: { id: true },
        })
        : [];
      const teamBillIds = teamBills.map((bill) => bill.id);
      teamOwnedBillIds = new Set(teamBillIds);
      const splitUserBills = teamBillIds.length
        ? await client.bills.findMany({
          where: {
            eventId: isTeamRegistrationRefund ? null : request.eventId,
            ownerType: 'USER',
            parentBillId: { in: teamBillIds },
            ownerId: authorizedPayerUserIds.length === 1
              ? authorizedPayerUserIds[0]
              : { in: authorizedPayerUserIds },
            ...occurrenceBillWhere,
          },
          select: { id: true },
        })
        : [];
      const directUserBills = authorizedPayerUserIds.length
        ? await client.bills.findMany({
          where: {
            eventId: isTeamRegistrationRefund ? null : request.eventId,
            ownerType: 'USER',
            ownerId: authorizedPayerUserIds.length === 1
              ? authorizedPayerUserIds[0]
              : { in: authorizedPayerUserIds },
            ...occurrenceBillWhere,
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
        ...occurrenceBillWhere,
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
      ...(isTeamRegistrationRefund ? { payerUserId: request.userId } : {}),
    },
    select: {
      id: true,
      billId: true,
      amountCents: true,
      refundedAmountCents: true,
      paymentIntentId: true,
      payerUserId: true,
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
    .filter((payment) => {
      if (payment.refundableAmountCents <= 0 || !normalizeId(payment.paymentIntentId)) return false;
      if (!teamOwnedBillIds.has(payment.billId)) return true;
      return Boolean(payment.payerUserId && authorizedPayerUserIds.includes(payment.payerUserId));
    });
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
