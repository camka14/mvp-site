import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { extractStripePaymentIntentId } from '@/lib/stripeClientSecret';
import type { AuthContext } from '@/lib/permissions';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import {
  buildTeamRegistrationId,
  cancelPendingTeamRegistration,
} from '@/server/teams/teamOpenRegistration';

type BillActionRow = {
  id: string;
  ownerType: 'USER' | 'TEAM';
  ownerId: string;
  organizationId: string | null;
  eventId: string | null;
  totalAmountCents: number;
  paymentPlanEnabled: boolean | null;
  lineItems: unknown;
};

type BillPaymentActionRow = {
  id: string;
  billId: string;
  amountCents: number;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'VOID' | null;
  paymentIntentId: string | null;
  payerUserId: string | null;
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

const sumPaid = (payments: Array<{ amountCents: number; status: string | null }>) => (
  payments.reduce((total, payment) => (
    payment.status === 'PAID' ? total + payment.amountCents : total
  ), 0)
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
        totalAmountCents: true,
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
      select: { id: true, ownerId: true, hostIds: true, officialIds: true },
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
      dueDate: true,
    },
  });

  const paidAmountCents = Math.min(bill.totalAmountCents, sumPaid(payments));
  const processingPayment = payments.find((payment) => payment.status === 'PROCESSING') ?? null;
  const pendingPayment = payments.find((payment) => payment.status === 'PENDING' || payment.status === null) ?? null;
  const nextPayment = processingPayment ?? pendingPayment;
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
      paidAt: null,
      updatedAt: now,
    },
  });

  return reconcileBillForPendingPayment(bill.id, now);
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
