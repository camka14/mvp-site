import Stripe from 'stripe';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { extractStripePaymentIntentId } from '@/lib/stripeClientSecret';
import { buildRefundCreateParamsForPaymentIntent } from '@/lib/stripeConnectAccounts';
import type { AuthContext } from '@/lib/permissions';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import {
  buildTeamRegistrationId,
  cancelPendingTeamRegistration,
} from '@/server/teams/teamOpenRegistration';

type BillActionRow = {
  id: string;
  ownerType: 'USER' | 'TEAM' | 'ORGANIZATION';
  ownerId: string;
  organizationId: string | null;
  eventId: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  totalAmountCents: number;
  status: 'OPEN' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | null;
  paymentPlanEnabled: boolean | null;
  lineItems: unknown;
};

type BillPaymentActionRow = {
  id: string;
  billId: string;
  amountCents: number;
  status: 'PENDING' | 'PARTIAL' | 'PROCESSING' | 'FAILED' | 'DISPUTED' | 'PAID' | 'VOID' | null;
  paymentIntentId: string | null;
  payerUserId: string | null;
  paidAmountCents?: number | null;
  refundedAmountCents: number | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const getLineItemMetadata = (bill: Pick<BillActionRow, 'lineItems'>): Record<string, unknown> => {
  if (!Array.isArray(bill.lineItems)) return {};
  const firstObject = bill.lineItems.find((item): item is Record<string, unknown> => (
    Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  ));
  return firstObject ?? {};
};

const getPaymentPaidAmountCents = (payment: {
  amountCents: number;
  status: string | null;
  paidAmountCents?: number | null;
}): number => {
  const paidAmount = normalizeAmountCents(payment.paidAmountCents);
  if (paidAmount > 0) {
    return Math.min(normalizeAmountCents(payment.amountCents), paidAmount);
  }
  return payment.status === 'PAID' ? normalizeAmountCents(payment.amountCents) : 0;
};

const sumPaid = (payments: Array<{ amountCents: number; status: string | null; paidAmountCents?: number | null }>) => (
  payments.reduce((total, payment) => (
    total + getPaymentPaidAmountCents(payment)
  ), 0)
);

const normalizeAmountCents = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

const normalizeStripeSecretKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized.length) return null;
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'undefined' || normalizedLower === 'null') return null;
  return normalized;
};

const isAlreadyRefundedStripeError = (error: unknown): boolean => {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  if (code === 'charge_already_refunded') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already refunded');
};

const isUnpaidBillPaymentStatus = (status: BillPaymentActionRow['status']): boolean => (
  status !== 'PAID' && status !== 'VOID'
);

const resolveManualPaymentStatus = (
  paidAmountCents: number,
  amountCents: number,
): 'PENDING' | 'PARTIAL' | 'PAID' => {
  const paidAmount = normalizeAmountCents(paidAmountCents);
  const amount = normalizeAmountCents(amountCents);
  if (amount > 0 && paidAmount >= amount) {
    return 'PAID';
  }
  return paidAmount > 0 ? 'PARTIAL' : 'PENDING';
};

export const loadBillForAction = async (billId: string) => (
  prisma.bills.findUnique({
    where: { id: billId },
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      organizationId: true,
      eventId: true,
      sourceType: true,
      sourceId: true,
      totalAmountCents: true,
      status: true,
      paymentPlanEnabled: true,
      lineItems: true,
    },
  }) as Promise<BillActionRow | null>
);

export const loadBillPaymentForAction = async (billId: string, billPaymentId: string) => {
  const [bill, payment] = await Promise.all([
    prisma.bills.findUnique({
      where: { id: billId },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        organizationId: true,
        eventId: true,
        sourceType: true,
        sourceId: true,
        totalAmountCents: true,
        status: true,
        paymentPlanEnabled: true,
        lineItems: true,
      },
    }) as Promise<BillActionRow | null>,
    prisma.billPayments.findUnique({
      where: { id: billPaymentId },
      select: {
        id: true,
        billId: true,
        amountCents: true,
        status: true,
        paymentIntentId: true,
        payerUserId: true,
        paidAmountCents: true,
        refundedAmountCents: true,
      },
    }) as Promise<BillPaymentActionRow | null>,
  ]);

  if (!bill || !payment || payment.billId !== bill.id) {
    return null;
  }
  return { bill, payment };
};

export const canManageBillPayment = async (
  session: AuthContext,
  bill: BillActionRow,
): Promise<boolean> => {
  if (session.isAdmin) return true;

  if (bill.ownerType === 'USER' && bill.ownerId === session.userId) {
    return true;
  }

  if (bill.ownerType === 'TEAM') {
    const team = await prisma.teams.findUnique({
      where: { id: bill.ownerId },
      select: {
        captainId: true,
        managerId: true,
        headCoachId: true,
      },
    });
    const managerIds = [
      normalizeId(team?.captainId),
      normalizeId(team?.managerId),
      normalizeId(team?.headCoachId),
    ].filter(Boolean);
    if (managerIds.includes(session.userId)) {
      return true;
    }
  }

  if (bill.ownerType === 'ORGANIZATION') {
    const organization = await prisma.organizations.findUnique({
      where: { id: bill.ownerId },
      select: { id: true, ownerId: true },
    });
    if (organization && await canManageOrganization(session, organization)) {
      return true;
    }
  }

  if (bill.eventId) {
    const event = await prisma.events.findUnique({
      where: { id: bill.eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });
    if (event && await canManageEvent(session, event)) {
      return true;
    }
  }

  if (bill.organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: bill.organizationId },
      select: { id: true, ownerId: true },
    });
    if (organization && await canManageOrganization(session, organization)) {
      return true;
    }
  }

  return false;
};

export const canAdministerBillPayment = async (
  session: AuthContext,
  bill: BillActionRow,
): Promise<boolean> => {
  if (session.isAdmin) return true;

  if (bill.eventId) {
    const event = await prisma.events.findUnique({
      where: { id: bill.eventId },
      select: {
        id: true,
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });
    if (event && await canManageEvent(session, event)) {
      return true;
    }
  }

  if (bill.ownerType === 'ORGANIZATION') {
    const ownerOrganization = await prisma.organizations.findUnique({
      where: { id: bill.ownerId },
      select: { id: true, ownerId: true },
    });
    if (ownerOrganization && await canManageOrganization(session, ownerOrganization)) {
      return true;
    }
  }

  if (bill.organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: bill.organizationId },
      select: { id: true, ownerId: true },
    });
    if (organization && await canManageOrganization(session, organization)) {
      return true;
    }
  }

  return false;
};

export const reconcileBillForPendingPayment = async (billId: string, now: Date) => {
  const bill = await prisma.bills.findUnique({
    where: { id: billId },
    select: {
      id: true,
      totalAmountCents: true,
      status: true,
    },
  });
  if (!bill) return null;

  const payments = await prisma.billPayments.findMany({
    where: { billId },
    orderBy: { sequence: 'asc' },
    select: {
      amountCents: true,
      status: true,
      paidAmountCents: true,
      dueDate: true,
    },
  });

  const paidAmountCents = Math.min(bill.totalAmountCents, sumPaid(payments));
  const processingPayment = payments.find((payment) => payment.status === 'PROCESSING') ?? null;
  const failedPayment = payments.find((payment) => payment.status === 'FAILED' || payment.status === 'DISPUTED') ?? null;
  const pendingPayment = payments.find((payment) => payment.status === 'PENDING' || payment.status === null) ?? null;
  const nextPayment = processingPayment ?? failedPayment ?? pendingPayment;
  const status = paidAmountCents >= bill.totalAmountCents
    ? 'PAID'
    : processingPayment
      ? 'PENDING'
      : bill.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'OPEN';

  return prisma.bills.update({
    where: { id: billId },
    data: {
      paidAmountCents,
      status,
      nextPaymentDue: nextPayment?.dueDate ?? null,
      nextPaymentAmountCents: nextPayment?.amountCents ?? null,
      updatedAt: now,
    },
  });
};

export const markBillPaymentProcessingForAction = async ({
  bill,
  payment,
  paymentIntent,
  userId,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  paymentIntent: string;
  userId: string;
  now: Date;
}) => {
  if (payment.status === 'PAID') {
    throw new Error('Bill payment is already paid.');
  }
  if (payment.status === 'VOID') {
    throw new Error('Bill payment has been cancelled.');
  }

  const paymentIntentId = extractStripePaymentIntentId(paymentIntent) ?? normalizeId(paymentIntent);
  if (!paymentIntentId?.startsWith('pi_')) {
    throw new Error('Invalid payment intent.');
  }
  if (payment.paymentIntentId && payment.paymentIntentId !== paymentIntentId) {
    throw new Error('Payment intent does not match this bill payment.');
  }

  await prisma.billPayments.update({
    where: { id: payment.id },
    data: {
      status: 'PROCESSING',
      paymentIntentId,
      payerUserId: payment.payerUserId ?? userId,
      paidAmountCents: 0,
      paidAt: null,
      updatedAt: now,
    },
  });

  const reconciledBill = await reconcileBillForPendingPayment(bill.id, now);
  if (bill.sourceType === 'EVENT_REGISTRATION' && bill.sourceId) {
    await prisma.eventRegistrations.updateMany({
      where: {
        id: bill.sourceId,
        status: { in: ['PENDING', 'STARTED'] as any[] },
      },
      data: {
        status: reconciledBill?.status === 'PAID' ? 'ACTIVE' as any : 'PENDING' as any,
        updatedAt: now,
      },
    });
  }

  return reconciledBill;
};

const isStripeCancelableStatus = (status: Stripe.PaymentIntent.Status): boolean => (
  status === 'requires_payment_method'
  || status === 'requires_confirmation'
  || status === 'requires_action'
  || status === 'requires_capture'
  || status === 'processing'
);

const cancelStripePaymentIntent = async (paymentIntentId: string | null): Promise<void> => {
  if (!paymentIntentId) return;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return;

  const stripe = new Stripe(secretKey);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === 'succeeded') {
    throw new Error('Stripe already completed this payment.');
  }
  if (intent.status === 'canceled') {
    return;
  }
  if (!isStripeCancelableStatus(intent.status)) {
    throw new Error(`Stripe payment cannot be cancelled while it is ${intent.status}.`);
  }
  await stripe.paymentIntents.cancel(paymentIntentId, {
    cancellation_reason: 'requested_by_customer',
  });
};

const cancelRelatedRegistration = async ({
  bill,
  payment,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  now: Date;
}) => {
  const metadata = getLineItemMetadata(bill);
  const purchaseType = normalizeId(metadata.purchaseType)?.toLowerCase();
  const payerUserId = normalizeId(metadata.userId) ?? normalizeId(payment.payerUserId);
  const registrationId = normalizeId(metadata.registrationId);

  if (purchaseType === 'team_registration') {
    if (!payerUserId) return;
    const teamId = normalizeId(metadata.teamId) ?? bill.ownerId;
    await cancelPendingTeamRegistration({
      teamId,
      userId: payerUserId,
      registrationId: registrationId ?? buildTeamRegistrationId(teamId, payerUserId),
      now,
    });
    return;
  }

  const eventId = bill.eventId;
  if (!eventId) return;

  await prisma.$transaction(async (tx) => {
    if (bill.ownerType === 'USER') {
      await tx.eventRegistrations.updateMany({
        where: {
          eventId,
          registrantId: bill.ownerId,
          registrantType: { in: ['SELF', 'CHILD'] },
          status: { in: ['STARTED', 'PENDING'] },
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });
      return;
    }

    const childTeams = await tx.teams.findMany({
      where: { parentTeamId: bill.ownerId },
      select: { id: true },
    });
    const teamIds = Array.from(new Set([bill.ownerId, ...childTeams.map((team) => team.id)]));
    await tx.eventRegistrations.updateMany({
      where: {
        eventId,
        registrantType: 'TEAM',
        OR: [
          { registrantId: { in: teamIds } },
          { eventTeamId: { in: teamIds } },
        ],
        status: { in: ['STARTED', 'PENDING'] },
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });
    await tx.eventRegistrations.updateMany({
      where: {
        eventId,
        eventTeamId: { in: teamIds },
        registrantType: { not: 'TEAM' },
        status: { in: ['STARTED', 'PENDING'] },
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });
  });
};

export const cancelProcessingBillPaymentForAction = async ({
  bill,
  payment,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  now: Date;
}) => {
  if (payment.status !== 'PROCESSING') {
    throw new Error('Bill payment is not pending with Stripe.');
  }

  await cancelStripePaymentIntent(payment.paymentIntentId);

  if (bill.paymentPlanEnabled) {
    await prisma.billPayments.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING',
        paymentIntentId: null,
        payerUserId: null,
        paidAmountCents: 0,
        paidAt: null,
        updatedAt: now,
      },
    });
    return reconcileBillForPendingPayment(bill.id, now);
  }

  await prisma.$transaction(async (tx) => {
    await tx.billPayments.update({
      where: { id: payment.id },
      data: {
        status: 'VOID',
        paymentIntentId: null,
        payerUserId: null,
        paidAmountCents: 0,
        paidAt: null,
        updatedAt: now,
      },
    });
    await tx.bills.update({
      where: { id: bill.id },
      data: {
        paidAmountCents: 0,
        status: 'CANCELLED',
        nextPaymentDue: null,
        nextPaymentAmountCents: null,
        updatedAt: now,
      },
    });
  });

  await cancelRelatedRegistration({ bill, payment, now });
  return prisma.bills.findUnique({ where: { id: bill.id } });
};

export const refundBillPaymentForAction = async ({
  bill,
  payment,
  amountCents,
  actorUserId,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  amountCents: number;
  actorUserId: string;
  now: Date;
}) => {
  if (payment.status !== 'PAID') {
    throw new Error('Only paid bill payments can be refunded.');
  }

  const paymentIntentId = normalizeId(payment.paymentIntentId);
  if (!paymentIntentId) {
    throw new Error('Bill payment does not have a Stripe payment intent.');
  }

  const requestedAmountCents = normalizeAmountCents(amountCents);
  if (requestedAmountCents <= 0) {
    throw new Error('amountCents must be greater than 0.');
  }

  const paymentAmountCents = normalizeAmountCents(payment.amountCents);
  const refundedAmountCents = normalizeAmountCents(payment.refundedAmountCents);
  const refundableAmountCents = Math.max(0, paymentAmountCents - refundedAmountCents);
  if (refundableAmountCents <= 0) {
    throw new Error('This bill payment has no refundable balance left.');
  }
  if (requestedAmountCents > refundableAmountCents) {
    throw new Error('Requested refund exceeds refundable balance.');
  }

  const stripeSecretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecretKey) {
    throw new Error('Stripe is not configured for refunds.');
  }

  const stripe = new Stripe(stripeSecretKey);
  let refundId: string | null = null;
  let appliedRefundAmountCents = requestedAmountCents;
  try {
    const refund = await stripe.refunds.create(
      await buildRefundCreateParamsForPaymentIntent({
        stripe,
        paymentIntentId,
        amountCents: requestedAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          bill_id: bill.id,
          bill_payment_id: payment.id,
          actor_user_id: actorUserId,
          ...(bill.eventId ? { event_id: bill.eventId } : {}),
          ...(bill.organizationId ? { organization_id: bill.organizationId } : {}),
        },
      }),
      {
        idempotencyKey: `bill-payment-refund:${payment.id}:${refundedAmountCents}:${requestedAmountCents}`,
      },
    );
    refundId = normalizeId(refund.id);
  } catch (error) {
    if (!isAlreadyRefundedStripeError(error)) {
      throw error;
    }
    appliedRefundAmountCents = refundableAmountCents;
  }

  const nextRefundedAmountCents = Math.min(
    paymentAmountCents,
    refundedAmountCents + appliedRefundAmountCents,
  );
  const updatedPayment = await prisma.billPayments.update({
    where: { id: payment.id },
    data: {
      refundedAmountCents: nextRefundedAmountCents,
      updatedAt: now,
    },
  });

  await prisma.bills.update({
    where: { id: bill.id },
    data: { updatedAt: now },
  });

  return {
    payment: updatedPayment,
    refundedAmountCents: appliedRefundAmountCents,
    remainingRefundableAmountCents: Math.max(0, paymentAmountCents - nextRefundedAmountCents),
    refundId,
  };
};

export const cancelBillPaymentPlanForAction = async ({
  bill,
  now,
}: {
  bill: BillActionRow;
  now: Date;
}) => {
  if (!bill.paymentPlanEnabled) {
    throw new Error('Bill does not have an active payment plan.');
  }

  const payments = await prisma.billPayments.findMany({
    where: { billId: bill.id },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      billId: true,
      amountCents: true,
      status: true,
      paymentIntentId: true,
      payerUserId: true,
      refundedAmountCents: true,
      paidAmountCents: true,
    },
  }) as BillPaymentActionRow[];

  const unpaidPayments = payments.filter((payment) => isUnpaidBillPaymentStatus(payment.status));
  if (!unpaidPayments.length) {
    throw new Error('Payment plan has no unpaid installments to cancel.');
  }

  for (const payment of unpaidPayments) {
    if (payment.status === 'PROCESSING') {
      await cancelStripePaymentIntent(payment.paymentIntentId);
    }
  }

  const paidAmountCents = Math.min(bill.totalAmountCents, sumPaid(payments));
  const nextStatus = paidAmountCents >= bill.totalAmountCents ? 'PAID' : 'CANCELLED';
  const unpaidPaymentIds = unpaidPayments.map((payment) => payment.id);

  return prisma.$transaction(async (tx) => {
    await tx.billPayments.updateMany({
      where: { id: { in: unpaidPaymentIds } },
      data: {
        status: 'VOID',
        paymentIntentId: null,
        payerUserId: null,
        paidAmountCents: 0,
        paidAt: null,
        updatedAt: now,
      },
    });
    return tx.bills.update({
      where: { id: bill.id },
      data: {
        paidAmountCents,
        status: nextStatus,
        paymentPlanEnabled: false,
        nextPaymentDue: null,
        nextPaymentAmountCents: null,
        updatedAt: now,
      },
    });
  });
};

export const submitManualBillPaymentProofForAction = async ({
  bill,
  payment,
  fileId,
  userId,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  fileId: string;
  userId: string;
  now: Date;
}) => {
  if (payment.status === 'PAID') {
    throw new Error('Bill payment is already paid.');
  }
  if (payment.status === 'VOID') {
    throw new Error('Bill payment has been cancelled.');
  }

  const normalizedFileId = normalizeId(fileId);
  if (!normalizedFileId) {
    throw new Error('fileId is required.');
  }

  const file = await prisma.file.findUnique({
    where: { id: normalizedFileId },
    select: {
      id: true,
      uploaderId: true,
      organizationId: true,
      mimeType: true,
    },
  });
  if (!file) {
    throw new Error('Proof image not found.');
  }
  if (file.uploaderId && file.uploaderId !== userId) {
    throw new Error('Proof image was uploaded by another user.');
  }
  if (file.mimeType && !file.mimeType.toLowerCase().startsWith('image/')) {
    throw new Error('Proof must be an image upload.');
  }

  return (prisma as any).billPaymentProofs.create({
    data: {
      id: crypto.randomUUID(),
      billId: bill.id,
      billPaymentId: payment.id,
      eventId: bill.eventId,
      organizationId: bill.organizationId,
      fileId: normalizedFileId,
      uploadedByUserId: userId,
      status: 'SUBMITTED',
      createdAt: now,
      updatedAt: now,
    },
  });
};

export const reviewManualBillPaymentProofForAction = async ({
  bill,
  payment,
  proofId,
  accepted,
  amountAcceptedCents,
  reviewedByUserId,
  reviewNote,
  now,
}: {
  bill: BillActionRow;
  payment: BillPaymentActionRow;
  proofId: string;
  accepted: boolean;
  amountAcceptedCents?: number | null;
  reviewedByUserId: string;
  reviewNote?: string | null;
  now: Date;
}) => {
  const normalizedProofId = normalizeId(proofId);
  if (!normalizedProofId) {
    throw new Error('proofId is required.');
  }
  const proof = await (prisma as any).billPaymentProofs.findUnique({
    where: { id: normalizedProofId },
  });
  if (!proof || proof.billId !== bill.id || proof.billPaymentId !== payment.id) {
    throw new Error('Payment proof not found.');
  }
  if (proof.status !== 'SUBMITTED') {
    throw new Error('Payment proof has already been reviewed.');
  }
  if (payment.status === 'VOID') {
    throw new Error('Bill payment has been cancelled.');
  }

  const acceptedAmount = accepted
    ? Math.min(normalizeAmountCents(payment.amountCents), normalizeAmountCents(amountAcceptedCents))
    : 0;
  const nextStatus = accepted
    ? resolveManualPaymentStatus(acceptedAmount, payment.amountCents)
    : payment.status;

  await prisma.$transaction(async (tx) => {
    await (tx as any).billPaymentProofs.update({
      where: { id: proof.id },
      data: {
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        amountAcceptedCents: accepted ? acceptedAmount : null,
        reviewedByUserId,
        reviewedAt: now,
        reviewNote: normalizeId(reviewNote) ?? null,
        updatedAt: now,
      },
    });

    if (accepted) {
      await tx.billPayments.update({
        where: { id: payment.id },
        data: {
          paidAmountCents: acceptedAmount,
          status: nextStatus,
          payerUserId: payment.payerUserId ?? proof.uploadedByUserId,
          paidAt: nextStatus === 'PAID' ? now : null,
          updatedAt: now,
        },
      });
    }
  });

  return reconcileBillForPendingPayment(bill.id, now);
};
