import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import {
  calculatePlatformApplicationFeeAmount,
  findSubscriptionProductBaseAmountCents,
  resolveConnectedAccountId,
} from '@/lib/stripeConnectAccounts';
import { syncManagedOrganizationStripeAccount } from '@/server/organizationStripeVerification';
import { sendPaymentFailureEmail, sendPurchaseReceiptEmail } from '@/server/purchaseReceipts';
import {
  releaseDiscountCodeReservation,
  recordDiscountCodeRedemption,
  type DiscountPurchaseType,
  type ResolvedDiscountApplication,
} from '@/server/discounts/discountCodeResolver';
import { upsertStripeSubscriptionMirror } from '@/lib/stripeSubscriptions';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';
import {
  activateFailedTeamRegistration,
  activateStartedTeamRegistration,
  cancelPendingTeamRegistration,
  markTeamRegistrationPaymentPending,
} from '@/server/teams/teamOpenRegistration';

export const dynamic = 'force-dynamic';

const safeJsonParse = (value: string): any => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const sumPaid = (payments: Array<{ amountCents: number; status: string | null }>) => {
  return payments.reduce((total, payment) => {
    if (payment.status === 'PAID') return total + payment.amountCents;
    return total;
  }, 0);
};

const BILL_PAYMENT_ISSUE_STATUSES = new Set(['FAILED', 'DISPUTED']);

const isBillPaymentIssueStatus = (status: unknown): boolean => (
  BILL_PAYMENT_ISSUE_STATUSES.has(String(status ?? '').trim().toUpperCase())
);

const BILL_APP_FEE_PERCENTAGE = 0.01;
const STRIPE_FIXED_FEE_CENTS = 30;
const STRIPE_PERCENT_FEE = 0.029;

const calculateChargeAmount = (goalAmountCents: number) => {
  const numerator = goalAmountCents + STRIPE_FIXED_FEE_CENTS;
  const denominator = 1 - STRIPE_PERCENT_FEE;
  return Math.round(numerator / denominator);
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const toIntOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toExpandableId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return toStringOrNull(value);
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return toStringOrNull((value as { id?: unknown }).id);
  }
  return null;
};

const normalizeDiscountPurchaseType = (purchaseType: string | null): DiscountPurchaseType | null => {
  if (purchaseType === 'event' || purchaseType === 'product' || purchaseType === 'team_registration') {
    return purchaseType;
  }
  if (purchaseType === 'product_subscription') {
    return 'product';
  }
  return null;
};

const buildDiscountApplicationFromMetadata = (
  metadata: Record<string, unknown>,
): ResolvedDiscountApplication | null => {
  const code = toStringOrNull(metadata.discount_code ?? metadata.discountCode);
  const discountId = toStringOrNull(metadata.discount_id ?? metadata.discountId);
  const discountCodeId = toStringOrNull(metadata.discount_code_id ?? metadata.discountCodeId);
  const reservationId = toStringOrNull(metadata.discount_reservation_id ?? metadata.discountReservationId);
  const originalAmountCents = toIntOrNull(metadata.original_amount_cents ?? metadata.originalAmountCents);
  const discountedAmountCents = toIntOrNull(metadata.discounted_amount_cents ?? metadata.discountedAmountCents);
  if (
    !code
    || !discountId
    || !discountCodeId
    || originalAmountCents === null
    || discountedAmountCents === null
  ) {
    return null;
  }
  return {
    code,
    discountId,
    discountCodeId,
    reservationId,
    originalAmountCents,
    discountedAmountCents,
  };
};

const SUPPORTED_EVENT_TYPES = new Set([
  'account.updated',
  'charge.dispute.closed',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'invoice.created',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

const extractStripeSubscriptionIdFromInvoice = (
  invoice: (Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
    subscription?: string | Stripe.Subscription | null;
  }) | null,
): string | null => {
  const parentSubscription = invoice?.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === 'string') {
    return parentSubscription;
  }
  if (parentSubscription?.id) {
    return parentSubscription.id;
  }
  const invoiceSubscription = invoice?.subscription;
  if (typeof invoiceSubscription === 'string') {
    return invoiceSubscription;
  }
  return invoiceSubscription?.id ?? null;
};

const getInvoicePaymentIntentId = (
  invoice: Pick<Stripe.Invoice, 'payments'> | null | undefined,
): string | null => {
  const payments = invoice?.payments?.data ?? [];
  for (const invoicePayment of payments) {
    if (invoicePayment.payment.type !== 'payment_intent') {
      continue;
    }
    const paymentIntent = invoicePayment.payment.payment_intent;
    if (typeof paymentIntent === 'string') {
      return paymentIntent;
    }
    if (paymentIntent?.id) {
      return paymentIntent.id;
    }
  }
  return null;
};

const applySubscriptionInvoiceConnectConfiguration = async ({
  stripe,
  invoice,
}: {
  stripe: Stripe;
  invoice: (Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
    subscription?: string | Stripe.Subscription | null;
  });
}) => {
  if (!invoice.id || invoice.status !== 'draft') {
    return;
  }

  const stripeSubscriptionId = extractStripeSubscriptionIdFromInvoice(invoice);
  if (!stripeSubscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price'],
  });
  await upsertStripeSubscriptionMirror({ subscription });

  if ((subscription.metadata?.purchase_type ?? '').trim().toLowerCase() !== 'product_subscription') {
    return;
  }

  const organizationId = toStringOrNull(subscription.metadata?.organization_id ?? null);
  if (!organizationId) {
    return;
  }

  const connectedAccountId = await resolveConnectedAccountId({ organizationId });
  if (!connectedAccountId) {
    return;
  }

  const baseAmountCents = findSubscriptionProductBaseAmountCents(subscription);
  const totalChargeCents = toIntOrNull(invoice.total);
  if (baseAmountCents == null || totalChargeCents == null) {
    return;
  }

  await stripe.invoices.update(invoice.id, {
    application_fee_amount: calculatePlatformApplicationFeeAmount({
      totalChargeCents,
      connectedAccountAmountCents: baseAmountCents,
    }),
    transfer_data: {
      destination: connectedAccountId,
    },
  });
};

const ensureEventRegistrationFromPurchase = async ({
  purchaseType,
  eventId,
  teamId,
  userId,
  registrationId,
  occurrenceSlotId,
  occurrenceDate,
  now,
  targetStatus = 'ACTIVE',
}: {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  now: Date;
  targetStatus?: 'ACTIVE' | 'PENDING';
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'event') {
    return { applied: false, reason: 'not_event_purchase' };
  }
  if (!eventId) {
    return { applied: false, reason: 'missing_event_id' };
  }
  if (!teamId && !userId) {
    return { applied: false, reason: 'missing_participant' };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const lockedEvents = await tx.$queryRaw<Array<{
        id: string;
        eventType: string | null;
        teamSignup: boolean | null;
      }>>`
        SELECT
          "id",
          "eventType",
          "teamSignup"
        FROM "Events"
        WHERE "id" = ${eventId}
        FOR UPDATE
      `;
      const event = lockedEvents[0] ?? null;
      if (!event) {
        return { applied: false, reason: 'event_not_found' };
      }

      if (teamId) {
        if (!event.teamSignup) {
          return { applied: false, reason: 'team_signup_disabled' };
        }
        const normalizedEventType = String(event.eventType ?? '').toUpperCase();
        if (normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT') {
          return { applied: false, reason: 'schedulable_team_event_requires_participant_route' };
        }

        const expectedRegistrationId = buildEventRegistrationId({
          eventId,
          registrantType: 'TEAM',
          registrantId: teamId,
          slotId: occurrenceSlotId,
          occurrenceDate,
        });
        const normalizedRegistrationId = toStringOrNull(registrationId);
        if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
          return { applied: false, reason: 'registration_id_mismatch' };
        }
        const effectiveRegistrationId = normalizedRegistrationId ?? expectedRegistrationId;
        const existingRegistration = await tx.eventRegistrations.findUnique({
          where: { id: effectiveRegistrationId },
          select: { status: true },
        });
        if (!existingRegistration && normalizedRegistrationId) {
          return { applied: false, reason: 'reservation_missing' };
        }

        if (!existingRegistration) {
          await tx.eventRegistrations.create({
            data: {
              id: effectiveRegistrationId,
              eventId,
              registrantId: teamId,
              registrantType: 'TEAM',
              rosterRole: 'PARTICIPANT',
              status: targetStatus,
              slotId: occurrenceSlotId,
              occurrenceDate,
              ageAtEvent: null,
              divisionId: null,
              divisionTypeId: null,
              divisionTypeKey: null,
              createdBy: userId ?? 'system:webhook',
              createdAt: now,
              updatedAt: now,
            },
          });
        } else if (
          existingRegistration.status !== targetStatus
          && !(targetStatus === 'PENDING' && existingRegistration.status === 'ACTIVE')
        ) {
          await tx.eventRegistrations.update({
            where: { id: effectiveRegistrationId },
            data: {
              status: targetStatus,
              updatedAt: now,
            },
          });
        }
        await tx.eventRegistrations.updateMany({
          where: {
            eventId,
            registrantId: teamId,
            registrantType: 'TEAM',
            rosterRole: 'WAITLIST',
            status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
            slotId: occurrenceSlotId,
            occurrenceDate,
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        });

        return { applied: true };
      }

      if (event.teamSignup) {
        return { applied: false, reason: 'team_signup_event_requires_team' };
      }

      const participantUserId = userId as string;
      const expectedRegistrationId = buildEventRegistrationId({
        eventId,
        registrantType: 'SELF',
        registrantId: participantUserId,
        slotId: occurrenceSlotId,
        occurrenceDate,
      });
      const normalizedRegistrationId = toStringOrNull(registrationId);
      if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
        return { applied: false, reason: 'registration_id_mismatch' };
      }
      const effectiveRegistrationId = normalizedRegistrationId ?? expectedRegistrationId;
      const existingRegistration = await tx.eventRegistrations.findUnique({
        where: { id: effectiveRegistrationId },
        select: { status: true },
      });
      if (!existingRegistration && normalizedRegistrationId) {
        return { applied: false, reason: 'reservation_missing' };
      }
      if (!existingRegistration) {
        await tx.eventRegistrations.create({
          data: {
            id: effectiveRegistrationId,
            eventId,
            registrantId: participantUserId,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: targetStatus,
            slotId: occurrenceSlotId,
            occurrenceDate,
            ageAtEvent: null,
            divisionId: null,
            divisionTypeId: null,
            divisionTypeKey: null,
            createdBy: userId ?? 'system:webhook',
            createdAt: now,
            updatedAt: now,
          },
        });
      } else if (
        existingRegistration.status !== targetStatus
        && !(targetStatus === 'PENDING' && existingRegistration.status === 'ACTIVE')
      ) {
        await tx.eventRegistrations.update({
          where: { id: effectiveRegistrationId },
          data: {
            status: targetStatus,
            updatedAt: now,
          },
        });
      }
      await tx.eventRegistrations.updateMany({
        where: {
          eventId,
          registrantId: participantUserId,
          registrantType: { in: ['SELF', 'CHILD'] },
          rosterRole: { in: ['WAITLIST', 'FREE_AGENT'] },
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          slotId: occurrenceSlotId,
          occurrenceDate,
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });

      return { applied: true };
    });
  } catch (error) {
    console.error('Failed to apply webhook event registration', {
      purchaseType,
      eventId,
      teamId,
      userId,
      error,
    });
    return { applied: false, reason: 'error' };
  }
};

const ensureTeamRegistrationFromPurchase = async ({
  purchaseType,
  teamId,
  userId,
  registrationId,
  now,
}: {
  purchaseType: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'team_registration') {
    return { applied: false, reason: 'not_team_registration_purchase' };
  }
  return activateStartedTeamRegistration({
    teamId,
    userId,
    registrationId,
    now,
  });
};

const markEventRegistrationPaymentPendingFromPurchase = (params: {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => (
  ensureEventRegistrationFromPurchase({
    ...params,
    targetStatus: 'PENDING',
  })
);

const markTeamRegistrationPaymentPendingFromPurchase = async ({
  purchaseType,
  teamId,
  userId,
  registrationId,
  now,
}: {
  purchaseType: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'team_registration') {
    return { applied: false, reason: 'not_team_registration_purchase' };
  }
  return markTeamRegistrationPaymentPending({
    teamId,
    userId,
    registrationId,
    now,
  });
};

const cancelEventRegistrationFromFailedPayment = async ({
  purchaseType,
  eventId,
  teamId,
  userId,
  registrationId,
  occurrenceSlotId,
  occurrenceDate,
  now,
}: {
  purchaseType: string | null;
  eventId: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  occurrenceSlotId: string | null;
  occurrenceDate: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'event') {
    return { applied: false, reason: 'not_event_purchase' };
  }
  if (!eventId) {
    return { applied: false, reason: 'missing_event_id' };
  }
  if (!teamId && !userId) {
    return { applied: false, reason: 'missing_participant' };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const lockedEvents = await tx.$queryRaw<Array<{
        id: string;
        eventType: string | null;
        teamSignup: boolean | null;
      }>>`
        SELECT
          "id",
          "eventType",
          "teamSignup"
        FROM "Events"
        WHERE "id" = ${eventId}
        FOR UPDATE
      `;
      const event = lockedEvents[0] ?? null;
      if (!event) {
        return { applied: false, reason: 'event_not_found' };
      }

      const registrantType = teamId ? 'TEAM' : 'SELF';
      const registrantId = teamId ?? userId as string;
      if (registrantType === 'TEAM') {
        if (!event.teamSignup) {
          return { applied: false, reason: 'team_signup_disabled' };
        }
        const normalizedEventType = String(event.eventType ?? '').toUpperCase();
        if (normalizedEventType === 'LEAGUE' || normalizedEventType === 'TOURNAMENT') {
          return { applied: false, reason: 'schedulable_team_event_requires_participant_route' };
        }
      } else if (event.teamSignup) {
        return { applied: false, reason: 'team_signup_event_requires_team' };
      }

      const expectedRegistrationId = buildEventRegistrationId({
        eventId,
        registrantType,
        registrantId,
        slotId: occurrenceSlotId,
        occurrenceDate,
      });
      const normalizedRegistrationId = toStringOrNull(registrationId);
      if (normalizedRegistrationId && normalizedRegistrationId !== expectedRegistrationId) {
        return { applied: false, reason: 'registration_id_mismatch' };
      }

      const result = await tx.eventRegistrations.updateMany({
        where: {
          id: normalizedRegistrationId ?? expectedRegistrationId,
          status: { in: ['STARTED', 'PENDING'] },
        },
        data: {
          status: 'PAYMENT_FAILED',
          updatedAt: now,
        },
      });
      return result.count > 0
        ? { applied: true }
        : { applied: false, reason: 'reservation_not_pending' };
    });
  } catch (error) {
    console.error('Failed to cancel webhook event registration after payment failure', {
      purchaseType,
      eventId,
      teamId,
      userId,
      error,
    });
    return { applied: false, reason: 'error' };
  }
};

const cancelTeamRegistrationFromFailedPayment = async ({
  purchaseType,
  teamId,
  userId,
  registrationId,
  now,
}: {
  purchaseType: string | null;
  teamId: string | null;
  userId: string | null;
  registrationId: string | null;
  now: Date;
}): Promise<{ applied: boolean; reason?: string }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (normalizedPurchaseType !== 'team_registration') {
    return { applied: false, reason: 'not_team_registration_purchase' };
  }
  return cancelPendingTeamRegistration({
    teamId,
    userId,
    registrationId,
    now,
  });
};

const isUpdatablePaymentIntentStatus = (status: Stripe.PaymentIntent.Status): boolean =>
  status === 'requires_payment_method'
  || status === 'requires_confirmation'
  || status === 'requires_action';

const isCancellablePaymentIntentStatus = (status: Stripe.PaymentIntent.Status): boolean =>
  isUpdatablePaymentIntentStatus(status) || status === 'requires_capture';

const resolveBillStatus = (
  currentStatus: string | null,
  paidAmountCents: number,
  totalAmountCents: number,
  hasProcessingPayment = false,
): 'OPEN' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' => {
  if (paidAmountCents >= totalAmountCents) return 'PAID';
  if (currentStatus === 'CANCELLED') return 'CANCELLED';
  if (hasProcessingPayment) return 'PENDING';
  if (currentStatus === 'OVERDUE') return 'OVERDUE';
  return 'OPEN';
};

const syncPendingPaymentIntent = async ({
  stripe,
  paymentIntentId,
  targetAmountCents,
}: {
  stripe: Stripe | null;
  paymentIntentId: string | null;
  targetAmountCents: number;
}): Promise<string | null> => {
  if (!paymentIntentId) return null;
  if (!stripe) return paymentIntentId;

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (targetAmountCents <= 0) {
      if (isCancellablePaymentIntentStatus(intent.status)) {
        await stripe.paymentIntents.cancel(paymentIntentId);
      }
      return null;
    }

    const appFee = Math.round(targetAmountCents * BILL_APP_FEE_PERCENTAGE);
    const totalCharge = calculateChargeAmount(targetAmountCents + appFee);
    if (intent.amount === totalCharge) {
      return paymentIntentId;
    }

    if (isUpdatablePaymentIntentStatus(intent.status)) {
      await stripe.paymentIntents.update(paymentIntentId, { amount: totalCharge });
      return paymentIntentId;
    }

    if (isCancellablePaymentIntentStatus(intent.status)) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    }
    return null;
  } catch (error) {
    console.warn(`Failed to sync Stripe PaymentIntent ${paymentIntentId}.`, error);
    return null;
  }
};

const reconcileBill = async ({
  billId,
  now,
  stripe,
}: {
  billId: string;
  now: Date;
  stripe: Stripe | null;
}): Promise<{ parentBillId: string | null } | null> => {
  const bill = await prisma.bills.findUnique({
    where: { id: billId },
    select: {
      id: true,
      totalAmountCents: true,
      status: true,
      parentBillId: true,
    },
  });
  if (!bill) return null;

  const [payments, childBills] = await Promise.all([
    prisma.billPayments.findMany({
      where: { billId: bill.id },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        amountCents: true,
        status: true,
        dueDate: true,
        paymentIntentId: true,
      },
    }),
    prisma.bills.findMany({
      where: { parentBillId: bill.id },
      select: { paidAmountCents: true },
    }),
  ]);

  const ownPaidAmountCents = sumPaid(payments);
  const childrenPaidAmountCents = childBills.reduce((total, child) => total + (child.paidAmountCents ?? 0), 0);
  const paidAmountCents = Math.min(
    bill.totalAmountCents,
    ownPaidAmountCents + childrenPaidAmountCents,
  );
  const remainingAmountCents = Math.max(bill.totalAmountCents - paidAmountCents, 0);
  const processingPayment = payments.find((entry) => entry.status === 'PROCESSING') ?? null;
  const failedPayment = payments.find((entry) => isBillPaymentIssueStatus(entry.status)) ?? null;
  const pendingPayment = payments.find((entry) => entry.status === 'PENDING' || entry.status === null) ?? null;

  let nextPaymentDue: Date | null = null;
  let nextPaymentAmountCents: number | null = null;

  if (processingPayment) {
    nextPaymentDue = processingPayment.dueDate;
    nextPaymentAmountCents = processingPayment.amountCents;
  } else if (failedPayment) {
    nextPaymentDue = failedPayment.dueDate;
    nextPaymentAmountCents = failedPayment.amountCents;
  } else if (pendingPayment) {
    if (remainingAmountCents <= 0) {
      const syncedIntentId = await syncPendingPaymentIntent({
        stripe,
        paymentIntentId: pendingPayment.paymentIntentId ?? null,
        targetAmountCents: 0,
      });
      await prisma.billPayments.update({
        where: { id: pendingPayment.id },
        data: {
          amountCents: 0,
          status: 'VOID',
          paymentIntentId: syncedIntentId,
          updatedAt: now,
        },
      });
    } else {
      let syncedIntentId = pendingPayment.paymentIntentId ?? null;
      if (syncedIntentId && pendingPayment.amountCents !== remainingAmountCents) {
        syncedIntentId = await syncPendingPaymentIntent({
          stripe,
          paymentIntentId: syncedIntentId,
          targetAmountCents: remainingAmountCents,
        });
      }

      const paymentUpdate: {
        amountCents?: number;
        paymentIntentId?: string | null;
        updatedAt: Date;
      } = { updatedAt: now };
      if (pendingPayment.amountCents !== remainingAmountCents) {
        paymentUpdate.amountCents = remainingAmountCents;
      }
      if (syncedIntentId !== (pendingPayment.paymentIntentId ?? null)) {
        paymentUpdate.paymentIntentId = syncedIntentId;
      }
      if (Object.keys(paymentUpdate).length > 1) {
        await prisma.billPayments.update({
          where: { id: pendingPayment.id },
          data: paymentUpdate,
        });
      }

      nextPaymentDue = pendingPayment.dueDate;
      nextPaymentAmountCents = remainingAmountCents;
    }
  }

  const status = resolveBillStatus(
    bill.status,
    paidAmountCents,
    bill.totalAmountCents,
    Boolean(processingPayment),
  );
  await prisma.bills.update({
    where: { id: bill.id },
    data: {
      paidAmountCents,
      status,
      nextPaymentDue,
      nextPaymentAmountCents,
      updatedAt: now,
    },
  });

  return { parentBillId: bill.parentBillId ?? null };
};

const resolveWebhookSecrets = (): string[] => {
  const primary = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const additional = (process.env.STRIPE_WEBHOOK_SECRETS ?? '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const all = [primary, ...additional].filter((value): value is string => Boolean(value));
  return Array.from(new Set(all));
};

const resolveAmountCents = ({
  metadata,
  paymentIntent,
}: {
  metadata: Record<string, unknown>;
  paymentIntent: Stripe.PaymentIntent & Record<string, unknown>;
}): number | null => {
  const metadataAmount = toIntOrNull(metadata.amount_cents ?? metadata.amountCents);
  if (metadataAmount && metadataAmount > 0) {
    return metadataAmount;
  }

  const amountReceived = toIntOrNull(paymentIntent.amount_received);
  if (amountReceived && amountReceived > 0) {
    return amountReceived;
  }

  const amount = toIntOrNull(paymentIntent.amount);
  if (amount && amount > 0) {
    return amount;
  }

  return null;
};

const resolveInstantLineItemLabel = (purchaseType: string | null): string => {
  const normalized = (purchaseType ?? '').trim().toLowerCase();
  if (normalized === 'product') return 'Product purchase';
  if (normalized === 'rental') return 'Field rental';
  if (normalized === 'event' || normalized === 'event_payment') return 'Event registration';
  if (normalized === 'team_registration') return 'Team registration';
  return 'Purchase';
};

const buildInstantLineItems = ({
  purchaseType,
  metadata,
  fallbackAmountCents,
  totalChargeCents,
}: {
  purchaseType: string | null;
  metadata: Record<string, unknown>;
  fallbackAmountCents: number;
  totalChargeCents: number | null;
}): {
  lineItems: Array<{
    id: string;
    type: 'EVENT' | 'FEE' | 'TAX' | 'PRODUCT' | 'RENTAL' | 'OTHER';
    label: string;
    amountCents: number;
  }>;
  effectiveAmountCents: number;
} => {
  const purchaseAmountCents = toIntOrNull(metadata.amount_cents ?? metadata.amountCents);
  const mvpFeeCents = toIntOrNull(
    metadata.mvp_fee_cents
    ?? metadata.mvpFeeCents
    ?? metadata.processing_fee_cents
    ?? metadata.processingFeeCents,
  ) ?? 0;
  const stripeFeeCents = toIntOrNull(metadata.stripe_fee_cents ?? metadata.stripeFeeCents) ?? 0;
  const taxCents = toIntOrNull(metadata.tax_cents ?? metadata.taxCents) ?? 0;
  const productName = toStringOrNull(metadata.product_name ?? metadata.productName);
  const eventName = toStringOrNull(metadata.event_name ?? metadata.eventName);
  const teamName = toStringOrNull(metadata.team_name ?? metadata.teamName);
  const feesIncludedInPrice = toStringOrNull(
    metadata.fees_included_in_price
    ?? metadata.feesIncludedInPrice,
  ) === 'true';

  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  const primaryType: 'EVENT' | 'PRODUCT' | 'RENTAL' | 'OTHER' =
    normalizedPurchaseType === 'product'
      ? 'PRODUCT'
      : normalizedPurchaseType === 'rental'
        ? 'RENTAL'
        : (normalizedPurchaseType === 'event' ||
            normalizedPurchaseType === 'event_payment' ||
            normalizedPurchaseType === 'team_registration')
          ? 'EVENT'
          : 'OTHER';
  const baseLabel = productName ?? eventName ?? teamName ?? resolveInstantLineItemLabel(purchaseType);

  const initialBaseAmount = purchaseAmountCents && purchaseAmountCents > 0
    ? purchaseAmountCents
    : Math.max(
      fallbackAmountCents - (feesIncludedInPrice ? 0 : mvpFeeCents + stripeFeeCents) - taxCents,
      0,
    );

  const lineItems: Array<{
    id: string;
    type: 'EVENT' | 'FEE' | 'TAX' | 'PRODUCT' | 'RENTAL' | 'OTHER';
    label: string;
    amountCents: number;
  }> = [];

  if (initialBaseAmount > 0) {
    lineItems.push({
      id: 'line_1',
      type: primaryType,
      label: baseLabel,
      amountCents: initialBaseAmount,
    });
  }
  if (!feesIncludedInPrice && mvpFeeCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'FEE',
      label: 'BracketIQ fee',
      amountCents: mvpFeeCents,
    });
  }
  if (!feesIncludedInPrice && stripeFeeCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'FEE',
      label: 'Stripe fee',
      amountCents: stripeFeeCents,
    });
  }
  if (taxCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'TAX',
      label: 'Tax',
      amountCents: taxCents,
    });
  }

  const computedTotal = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  let effectiveAmountCents = totalChargeCents && totalChargeCents > 0
    ? totalChargeCents
    : (computedTotal > 0 ? computedTotal : fallbackAmountCents);
  if (effectiveAmountCents <= 0) {
    effectiveAmountCents = fallbackAmountCents;
  }

  if (lineItems.length === 0 && effectiveAmountCents > 0) {
    lineItems.push({
      id: 'line_1',
      type: primaryType,
      label: baseLabel,
      amountCents: effectiveAmountCents,
    });
    return { lineItems, effectiveAmountCents };
  }

  const delta = effectiveAmountCents - computedTotal;
  if (delta > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'OTHER',
      label: 'Additional charges',
      amountCents: delta,
    });
  } else if (delta < 0) {
    effectiveAmountCents = computedTotal;
  }

  return { lineItems, effectiveAmountCents };
};

const markBillPaymentProcessing = async ({
  billId,
  billPaymentId,
  paymentIntentId,
  userId,
  metadata,
  now,
  stripe,
}: {
  billId: string | null;
  billPaymentId: string | null;
  paymentIntentId: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
  now: Date;
  stripe: Stripe | null;
}): Promise<{ billId: string | null; billPaymentId: string | null; updated: boolean }> => {
  if (!billId || !billPaymentId) {
    return { billId, billPaymentId, updated: false };
  }

  const payment = await prisma.billPayments.findUnique({
    where: { id: billPaymentId },
    select: { id: true, billId: true, status: true },
  });

  if (!payment || payment.billId !== billId) {
    console.warn(
      `Stripe webhook bill metadata mismatch while marking payment processing (billId=${billId}, billPaymentId=${billPaymentId}).`,
    );
    return { billId, billPaymentId, updated: false };
  }

  if (payment.status === 'PAID') {
    return { billId, billPaymentId, updated: false };
  }

  await prisma.billPayments.update({
    where: { id: billPaymentId },
    data: {
      status: 'PROCESSING',
      paidAt: null,
      paymentIntentId: paymentIntentId ?? undefined,
      payerUserId: userId ?? undefined,
      taxCalculationId: toStringOrNull(metadata.tax_calculation_id ?? metadata.taxCalculationId ?? null),
      taxAmountCents: toIntOrNull(metadata.tax_cents ?? metadata.taxCents) ?? 0,
      stripeProcessingFeeCents: toIntOrNull(
        metadata.stripe_processing_fee_cents ?? metadata.stripeProcessingFeeCents ?? null,
      ) ?? 0,
      stripeTaxServiceFeeCents: toIntOrNull(
        metadata.stripe_tax_service_fee_cents ?? metadata.stripeTaxServiceFeeCents ?? null,
      ) ?? 0,
      updatedAt: now,
    },
  });

  const reconciledBill = await reconcileBill({ billId, now, stripe });
  if (reconciledBill?.parentBillId) {
    await reconcileBill({ billId: reconciledBill.parentBillId, now, stripe });
  }

  return { billId, billPaymentId, updated: payment.status !== 'PROCESSING' };
};

const releaseBillPaymentProcessing = async ({
  billId,
  billPaymentId,
  paymentIntentId,
  now,
  stripe,
}: {
  billId: string | null;
  billPaymentId: string | null;
  paymentIntentId: string | null;
  now: Date;
  stripe: Stripe | null;
}): Promise<{ billId: string | null; billPaymentId: string | null; updated: boolean }> => {
  const payment = billPaymentId
    ? await prisma.billPayments.findUnique({
        where: { id: billPaymentId },
        select: { id: true, billId: true, status: true, amountCents: true, paymentIntentId: true },
      })
    : paymentIntentId
      ? await prisma.billPayments.findFirst({
          where: { paymentIntentId },
          select: { id: true, billId: true, status: true, amountCents: true, paymentIntentId: true },
        })
      : null;

  if (!payment) {
    return { billId, billPaymentId, updated: false };
  }
  if (billId && payment.billId !== billId) {
    console.warn(
      `Stripe webhook bill metadata mismatch while releasing payment processing (billId=${billId}, billPaymentId=${payment.id}).`,
    );
    return { billId, billPaymentId: payment.id, updated: false };
  }
  if (paymentIntentId && payment.paymentIntentId && payment.paymentIntentId !== paymentIntentId) {
    console.warn(
      `Stripe webhook payment intent mismatch while releasing payment processing (paymentIntentId=${paymentIntentId}, billPaymentId=${payment.id}).`,
    );
    return { billId: payment.billId, billPaymentId: payment.id, updated: false };
  }
  if (isBillPaymentIssueStatus(payment.status)) {
    return { billId: payment.billId, billPaymentId: payment.id, updated: false };
  }
  if (payment.status === 'PAID' && !paymentIntentId) {
    return { billId: payment.billId, billPaymentId: payment.id, updated: false };
  }

  const bill = await prisma.bills.findUnique({
    where: { id: payment.billId },
    select: { id: true, paymentPlanEnabled: true },
  });
  if (!bill) {
    return { billId: payment.billId, billPaymentId: payment.id, updated: false };
  }

  await prisma.billPayments.update({
    where: { id: payment.id },
    data: {
      status: 'FAILED',
      paidAt: null,
      paymentIntentId: paymentIntentId ?? payment.paymentIntentId,
      updatedAt: now,
    },
  });

  if (bill.paymentPlanEnabled) {
    await reconcileBill({ billId: bill.id, now, stripe });
  } else {
    await prisma.bills.update({
      where: { id: bill.id },
      data: {
        paidAmountCents: 0,
        status: 'OPEN',
        nextPaymentDue: now,
        nextPaymentAmountCents: payment.amountCents,
        updatedAt: now,
      },
    });
  }

  return { billId: bill.id, billPaymentId: payment.id, updated: true };
};

const resolvePaymentIntentIdFromDispute = async ({
  dispute,
  stripe,
}: {
  dispute: Stripe.Dispute & { payment_intent?: unknown; charge?: unknown };
  stripe: Stripe | null;
}): Promise<string | null> => {
  const directPaymentIntentId = toExpandableId(dispute.payment_intent);
  if (directPaymentIntentId) {
    return directPaymentIntentId;
  }

  const chargeId = toExpandableId(dispute.charge);
  if (!chargeId || !stripe) {
    return null;
  }

  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return toExpandableId(charge.payment_intent);
  } catch (error) {
    console.warn(`Failed to resolve disputed charge ${chargeId} to a PaymentIntent.`, error);
    return null;
  }
};

const markBillPaymentDisputed = async ({
  paymentIntentId,
  now,
  stripe,
}: {
  paymentIntentId: string | null;
  now: Date;
  stripe: Stripe | null;
}): Promise<{ billId: string | null; billPaymentId: string | null; updated: boolean }> => {
  if (!paymentIntentId) {
    return { billId: null, billPaymentId: null, updated: false };
  }

  const payment = await prisma.billPayments.findFirst({
    where: { paymentIntentId },
    select: { id: true, billId: true, status: true },
  });
  if (!payment) {
    return { billId: null, billPaymentId: null, updated: false };
  }
  if (payment.status === 'VOID') {
    return { billId: payment.billId, billPaymentId: payment.id, updated: false };
  }

  if (payment.status !== 'DISPUTED') {
    await prisma.billPayments.update({
      where: { id: payment.id },
      data: {
        status: 'DISPUTED',
        paidAt: null,
        updatedAt: now,
      },
    });
  }

  const reconciledBill = await reconcileBill({ billId: payment.billId, now, stripe });
  if (reconciledBill?.parentBillId) {
    await reconcileBill({ billId: reconciledBill.parentBillId, now, stripe });
  }

  return {
    billId: payment.billId,
    billPaymentId: payment.id,
    updated: payment.status !== 'DISPUTED',
  };
};

const createInstantBillAndPayment = async ({
  purchaseType,
  paymentIntentId,
  userId,
  teamId,
  eventId,
  organizationId,
  registrationId,
  amountCents,
  totalChargeCents,
  metadata,
  now,
  targetPaymentStatus = 'PAID',
  stripe,
}: {
  purchaseType: string | null;
  paymentIntentId: string | null;
  userId: string | null;
  teamId: string | null;
  eventId: string | null;
  organizationId: string | null;
  registrationId: string | null;
  amountCents: number | null;
  totalChargeCents: number | null;
  metadata: Record<string, unknown>;
  now: Date;
  targetPaymentStatus?: 'PAID' | 'PROCESSING' | 'FAILED';
  stripe: Stripe | null;
}): Promise<{
  billId: string | null;
  billPaymentId: string | null;
  created: boolean;
  transitionedToPaid: boolean;
}> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (!paymentIntentId || !amountCents || amountCents <= 0 || normalizedPurchaseType === 'bill') {
    return { billId: null, billPaymentId: null, created: false, transitionedToPaid: false };
  }

  const rentalBookingId = toStringOrNull(
    metadata.rental_booking_id
    ?? metadata.rentalBookingId
    ?? (normalizedPurchaseType === 'rental' ? eventId : null),
  );
  const renterOrganizationId = toStringOrNull(
    metadata.renter_organization_id
    ?? metadata.renterOrganizationId
    ?? null,
  );
  const ownerId = normalizedPurchaseType === 'rental' && renterOrganizationId
    ? renterOrganizationId
    : teamId ?? userId;
  const ownerType: 'TEAM' | 'USER' | 'ORGANIZATION' =
    normalizedPurchaseType === 'rental' && renterOrganizationId
      ? 'ORGANIZATION'
      : teamId
        ? 'TEAM'
        : 'USER';
  if (!ownerId) {
    return { billId: null, billPaymentId: null, created: false, transitionedToPaid: false };
  }
  const billSourceType = normalizedPurchaseType === 'rental' ? 'RENTAL_BOOKING' : null;
  const billSourceId = normalizedPurchaseType === 'rental' ? rentalBookingId : null;

  const instantBreakdown = buildInstantLineItems({
    purchaseType,
    metadata,
    fallbackAmountCents: amountCents,
    totalChargeCents,
  });
  const taxCalculationId = toStringOrNull(metadata.tax_calculation_id ?? metadata.taxCalculationId ?? null);
  const taxAmountCents = toIntOrNull(metadata.tax_cents ?? metadata.taxCents) ?? 0;
  const stripeProcessingFeeCents = toIntOrNull(
    metadata.stripe_processing_fee_cents ?? metadata.stripeProcessingFeeCents ?? null,
  ) ?? 0;
  const stripeTaxServiceFeeCents = toIntOrNull(
    metadata.stripe_tax_service_fee_cents ?? metadata.stripeTaxServiceFeeCents ?? null,
  ) ?? 0;
  const effectiveAmountCents = instantBreakdown.effectiveAmountCents;
  if (effectiveAmountCents <= 0) {
    return { billId: null, billPaymentId: null, created: false, transitionedToPaid: false };
  }

  const existingPayment = await prisma.billPayments.findFirst({
    where: { paymentIntentId },
    select: { id: true, billId: true, status: true },
  });
  if (existingPayment) {
    if (targetPaymentStatus === 'PAID' && existingPayment.status !== 'PAID') {
      await prisma.billPayments.update({
        where: { id: existingPayment.id },
        data: {
          status: 'PAID',
          paidAt: now,
          payerUserId: userId ?? undefined,
          taxCalculationId,
          taxAmountCents,
          stripeProcessingFeeCents,
          stripeTaxServiceFeeCents,
          updatedAt: now,
        },
      });
      await reconcileBill({ billId: existingPayment.billId, now, stripe });
      return {
        billId: existingPayment.billId,
        billPaymentId: existingPayment.id,
        created: false,
        transitionedToPaid: true,
      };
    }
    if (targetPaymentStatus === 'PROCESSING' && existingPayment.status !== 'PAID' && existingPayment.status !== 'PROCESSING') {
      await markBillPaymentProcessing({
        billId: existingPayment.billId,
        billPaymentId: existingPayment.id,
        paymentIntentId,
        userId,
        metadata,
        now,
        stripe,
      });
    }
    if (targetPaymentStatus === 'FAILED' && !isBillPaymentIssueStatus(existingPayment.status)) {
      await prisma.billPayments.update({
        where: { id: existingPayment.id },
        data: {
          status: 'FAILED',
          paidAt: null,
          paymentIntentId,
          payerUserId: userId ?? undefined,
          taxCalculationId,
          taxAmountCents,
          stripeProcessingFeeCents,
          stripeTaxServiceFeeCents,
          updatedAt: now,
        },
      });
      await prisma.bills.update({
        where: { id: existingPayment.billId },
        data: {
          status: 'OPEN',
          paidAmountCents: 0,
          nextPaymentDue: now,
          nextPaymentAmountCents: effectiveAmountCents,
          updatedAt: now,
        },
      });
    }
    return {
      billId: existingPayment.billId,
      billPaymentId: existingPayment.id,
      created: false,
      transitionedToPaid: false,
    };
  }

  return prisma.$transaction(async (tx) => {
    const duplicatePayment = await tx.billPayments.findFirst({
      where: { paymentIntentId },
      select: { id: true, billId: true, status: true },
    });
    if (duplicatePayment) {
      return {
        billId: duplicatePayment.billId,
        billPaymentId: duplicatePayment.id,
        created: false,
        transitionedToPaid: false,
      };
    }

    const isPaid = targetPaymentStatus === 'PAID';
    const isProcessing = targetPaymentStatus === 'PROCESSING';
    const purchaseMetadata = {
      purchaseType: normalizedPurchaseType || null,
      userId,
      teamId,
      eventId: normalizedPurchaseType === 'rental' ? null : eventId,
      organizationId,
      registrationId,
      rentalBookingId,
      occurrenceSlotId: toStringOrNull(metadata.occurrence_slot_id ?? metadata.occurrenceSlotId ?? null),
      occurrenceDate: toStringOrNull(metadata.occurrence_date ?? metadata.occurrenceDate ?? null),
      productId: toStringOrNull(metadata.product_id ?? metadata.productId ?? null),
    };
    const lineItems = instantBreakdown.lineItems.map((item, index) => (
      !isPaid && index === 0
        ? {
            ...item,
            ...Object.fromEntries(
              Object.entries(purchaseMetadata).filter(([, value]) => value !== null && value !== undefined),
            ),
          }
        : item
    ));

    const bill = await tx.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType,
        ownerId,
        organizationId: organizationId ?? null,
        eventId: normalizedPurchaseType === 'rental' ? null : eventId ?? null,
        slotId: purchaseMetadata.occurrenceSlotId,
        occurrenceDate: purchaseMetadata.occurrenceDate,
        sourceType: billSourceType,
        sourceId: billSourceId,
        totalAmountCents: effectiveAmountCents,
        paidAmountCents: isPaid ? effectiveAmountCents : 0,
        nextPaymentDue: isPaid ? null : now,
        nextPaymentAmountCents: isPaid ? null : effectiveAmountCents,
        parentBillId: null,
        allowSplit: false,
        status: isPaid ? 'PAID' : isProcessing ? 'PENDING' : 'OPEN',
        paymentPlanEnabled: false,
        createdBy: userId ?? null,
        lineItems,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    const payment = await tx.billPayments.create({
      data: {
        id: crypto.randomUUID(),
        billId: bill.id,
        sequence: 1,
        dueDate: now,
        amountCents: effectiveAmountCents,
        status: targetPaymentStatus,
        paidAt: isPaid ? now : null,
        paymentIntentId,
        payerUserId: userId ?? null,
        taxCalculationId,
        taxAmountCents,
        stripeProcessingFeeCents,
        stripeTaxServiceFeeCents,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    return {
      billId: bill.id,
      billPaymentId: payment.id,
      created: true,
      transitionedToPaid: isPaid,
    };
  });
};

const loadBillPurchaseMetadata = async (billId: string | null): Promise<Record<string, unknown> | null> => {
  if (!billId) return null;
  const bill = await prisma.bills.findUnique({
    where: { id: billId },
    select: {
      ownerType: true,
      ownerId: true,
      eventId: true,
      organizationId: true,
      slotId: true,
      occurrenceDate: true,
      lineItems: true,
    },
  });
  if (!bill || !Array.isArray(bill.lineItems)) {
    return bill
      ? {
          eventId: bill.eventId,
          organizationId: bill.organizationId,
          occurrenceSlotId: bill.slotId,
          occurrenceDate: bill.occurrenceDate,
          userId: bill.ownerType === 'USER' ? bill.ownerId : null,
          teamId: bill.ownerType === 'TEAM' ? bill.ownerId : null,
        }
      : null;
  }

  const purchaseLineItem = bill.lineItems.find((item) => (
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).purchaseType === 'string'
  )) as Record<string, unknown> | undefined;

  return {
    ...(purchaseLineItem ?? {}),
    eventId: toStringOrNull(purchaseLineItem?.eventId) ?? bill.eventId,
    organizationId: toStringOrNull(purchaseLineItem?.organizationId) ?? bill.organizationId,
    occurrenceSlotId: toStringOrNull(purchaseLineItem?.occurrenceSlotId) ?? bill.slotId,
    occurrenceDate: toStringOrNull(purchaseLineItem?.occurrenceDate) ?? bill.occurrenceDate,
    userId: toStringOrNull(purchaseLineItem?.userId) ?? (bill.ownerType === 'USER' ? bill.ownerId : null),
    teamId: toStringOrNull(purchaseLineItem?.teamId) ?? (bill.ownerType === 'TEAM' ? bill.ownerId : null),
  };
};

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const stripeForPaymentIntentSync = secretKey ? new Stripe(secretKey) : null;
  const webhookSecrets = resolveWebhookSecrets();
  const signature = req.headers.get('stripe-signature') ?? '';
  const payload = await req.text();

  let event: any = safeJsonParse(payload);

  if (webhookSecrets.length > 0 && signature) {
    const stripe = stripeForPaymentIntentSync ?? new Stripe(secretKey ?? '');
    let verifiedEvent: any = null;
    let verificationError: unknown = null;

    for (const secret of webhookSecrets) {
      try {
        verifiedEvent = stripe.webhooks.constructEvent(payload, signature, secret);
        break;
      } catch (error) {
        verificationError = error;
      }
    }

    if (verifiedEvent) {
      event = verifiedEvent;
    } else {
      const allowUnverifiedInDev =
        process.env.NODE_ENV !== 'production' &&
        process.env.STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV === 'true' &&
        event &&
        typeof event === 'object';

      if (allowUnverifiedInDev) {
        console.warn(
          'Stripe webhook signature failed in development; continuing with unverified payload because ' +
            'STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV=true.',
        );
      } else {
        console.error(
          `Stripe webhook signature failed for all configured secrets (count=${webhookSecrets.length}).`,
          verificationError,
        );
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    }
  }

  if (!event || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const eventType = typeof event.type === 'string' ? event.type : '';
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  if (
    eventType === 'account.updated'
    && stripeForPaymentIntentSync
  ) {
    const account = (event.data?.object ?? null) as Stripe.Account | null;
    const accountId = toStringOrNull(account?.id);
    if (accountId) {
      const organizationStripeAccount = await prisma.stripeAccounts.findFirst({
        where: {
          accountId,
          accountOrigin: 'PLATFORM_ONBOARDING',
          organizationId: { not: null },
        },
        select: { organizationId: true },
      });
      if (organizationStripeAccount?.organizationId) {
        await syncManagedOrganizationStripeAccount({
          stripe: stripeForPaymentIntentSync,
          organizationId: organizationStripeAccount.organizationId,
          accountId,
        });
      }
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (
    eventType === 'customer.subscription.created'
    || eventType === 'customer.subscription.updated'
    || eventType === 'customer.subscription.deleted'
  ) {
    const subscription = (event.data?.object ?? null) as Stripe.Subscription | null;
    if (subscription?.id) {
      await upsertStripeSubscriptionMirror({ subscription });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (eventType === 'invoice.created') {
    const invoice = (event.data?.object ?? null) as (Stripe.Invoice & {
      parent?: {
        subscription_details?: {
          subscription?: string | Stripe.Subscription | null;
        } | null;
      } | null;
      subscription?: string | Stripe.Subscription | null;
    }) | null;

    if (invoice && stripeForPaymentIntentSync) {
      await applySubscriptionInvoiceConnectConfiguration({
        stripe: stripeForPaymentIntentSync,
        invoice,
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
    const invoice = (event.data?.object ?? null) as (Stripe.Invoice & {
      parent?: {
        subscription_details?: {
          subscription?: string | Stripe.Subscription | null;
          metadata?: Stripe.Metadata | null;
        } | null;
      } | null;
      subscription?: string | Stripe.Subscription | null;
    }) | null;
    const stripeSubscriptionId = extractStripeSubscriptionIdFromInvoice(invoice);
    let subscription: Stripe.Subscription | null = null;

    if (stripeSubscriptionId && stripeForPaymentIntentSync) {
      subscription = await stripeForPaymentIntentSync.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ['items.data.price'],
      });
      await upsertStripeSubscriptionMirror({ subscription });
    }

    const metadata = {
      ...((invoice?.metadata ?? {}) as Record<string, unknown>),
      ...(((invoice?.parent?.subscription_details as { metadata?: Stripe.Metadata | null } | null)?.metadata ?? {}) as Record<string, unknown>),
      ...((subscription?.metadata ?? {}) as Record<string, unknown>),
    };
    const discountApplication = buildDiscountApplicationFromMetadata(metadata);
    const paymentIntentId = getInvoicePaymentIntentId(invoice)
      ?? (invoice?.id ? `invoice:${invoice.id}` : null);

    if (discountApplication) {
      if (eventType === 'invoice.payment_failed') {
        await releaseDiscountCodeReservation({
          reservationId: discountApplication.reservationId,
          paymentIntentId,
        });
      } else {
        const discountPurchaseType = normalizeDiscountPurchaseType(toStringOrNull(metadata.purchase_type ?? null));
        const productId = toStringOrNull(metadata.product_id ?? null);
        if (discountPurchaseType && productId) {
          try {
            await recordDiscountCodeRedemption({
              discount: discountApplication,
              purchaseType: discountPurchaseType,
              targetId: productId,
              userId: toStringOrNull(metadata.user_id ?? null),
              guestEmail: toStringOrNull(metadata.receipt_email ?? metadata.receiptEmail ?? null),
              paymentIntentId,
              productId,
              organizationId: toStringOrNull(metadata.organization_id ?? null),
            });
          } catch (error) {
            console.error('Stripe invoice webhook failed to record discount redemption.', {
              invoiceId: invoice?.id,
              stripeSubscriptionId,
              discountCodeId: discountApplication.discountCodeId,
              error,
            });
          }
        }
      }
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (eventType === 'charge.dispute.closed') {
    const dispute = (event.data?.object ?? null) as (Stripe.Dispute & {
      payment_intent?: unknown;
      charge?: unknown;
    }) | null;
    const disputeStatus = String(dispute?.status ?? '').trim().toLowerCase();
    if (!dispute || disputeStatus !== 'lost') {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    try {
      const now = new Date();
      const paymentIntentId = await resolvePaymentIntentIdFromDispute({
        dispute,
        stripe: stripeForPaymentIntentSync,
      });
      const disputedPayment = await markBillPaymentDisputed({
        paymentIntentId,
        now,
        stripe: stripeForPaymentIntentSync,
      });
      if (!disputedPayment.billPaymentId) {
        console.warn('Stripe webhook did not mark a bill payment disputed.', {
          disputeId: dispute.id,
          paymentIntentId,
          billId: disputedPayment.billId,
          billPaymentId: disputedPayment.billPaymentId,
        });
      }
    } catch (error) {
      console.error('Stripe dispute webhook handling failed', error);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  }

  const dataObject = (event.data?.object ?? {}) as Stripe.PaymentIntent & Record<string, unknown>;
  const metadata =
    dataObject.metadata && typeof dataObject.metadata === 'object'
      ? (dataObject.metadata as Record<string, unknown>)
      : {};
  const billId = toStringOrNull(metadata.bill_id ?? metadata.billId ?? dataObject.billId ?? null);
  const billPaymentId = toStringOrNull(
    metadata.bill_payment_id ?? metadata.billPaymentId ?? dataObject.billPaymentId ?? null,
  );
  const purchaseType = toStringOrNull(metadata.purchase_type ?? metadata.purchaseType ?? null);
  const userId = toStringOrNull(metadata.user_id ?? metadata.userId ?? null);
  const teamId = toStringOrNull(metadata.team_id ?? metadata.teamId ?? null);
  const eventId = toStringOrNull(metadata.event_id ?? metadata.eventId ?? null);
  const registrationId = toStringOrNull(metadata.registration_id ?? metadata.registrationId ?? null);
  const occurrenceSlotId = toStringOrNull(
    metadata.occurrence_slot_id ?? metadata.occurrenceSlotId ?? metadata.slot_id ?? metadata.slotId ?? null,
  );
  const occurrenceDate = toStringOrNull(metadata.occurrence_date ?? metadata.occurrenceDate ?? null);
  const productId = toStringOrNull(metadata.product_id ?? metadata.productId ?? null);
  const organizationId = toStringOrNull(metadata.organization_id ?? metadata.organizationId ?? null);
  const paymentIntentId = toStringOrNull(dataObject.id);
  const discountApplication = buildDiscountApplicationFromMetadata(metadata);
  const receiptEmail = toStringOrNull(
    dataObject.receipt_email ?? metadata.receipt_email ?? metadata.receiptEmail ?? null,
  );
  const amountCents = resolveAmountCents({ metadata, paymentIntent: dataObject });
  const totalChargeCents = toIntOrNull(
    dataObject.amount_received
    ?? dataObject.amount
    ?? metadata.total_charge_cents
    ?? metadata.totalChargeCents,
  );

  try {
    const now = new Date();
    let resolvedBillId = billId;
    let resolvedBillPaymentId = billPaymentId;
    let shouldSendReceipt = false;

    if (eventType === 'payment_intent.processing') {
      if (billId || billPaymentId) {
        const pendingBill = await markBillPaymentProcessing({
          billId,
          billPaymentId,
          paymentIntentId,
          userId,
          metadata,
          now,
          stripe: stripeForPaymentIntentSync,
        });
        resolvedBillId = pendingBill.billId;
        resolvedBillPaymentId = pendingBill.billPaymentId;
      } else {
        const instantBill = await createInstantBillAndPayment({
          purchaseType,
          paymentIntentId,
          userId,
          teamId,
          eventId,
          organizationId,
          registrationId,
          amountCents,
          totalChargeCents,
          metadata,
          now,
          targetPaymentStatus: 'PROCESSING',
          stripe: stripeForPaymentIntentSync,
        });
        resolvedBillId = instantBill.billId ?? resolvedBillId;
        resolvedBillPaymentId = instantBill.billPaymentId ?? resolvedBillPaymentId;
      }

      const registrationResult = await markEventRegistrationPaymentPendingFromPurchase({
        purchaseType,
        eventId,
        teamId,
        userId,
        registrationId,
        occurrenceSlotId,
        occurrenceDate,
        now,
      });
      if (
        !registrationResult.applied &&
        registrationResult.reason &&
        registrationResult.reason !== 'not_event_purchase' &&
        registrationResult.reason !== 'missing_event_id' &&
        registrationResult.reason !== 'missing_participant'
      ) {
        console.warn('Stripe webhook skipped pending event registration sync.', {
          paymentIntentId,
          purchaseType,
          userId,
          teamId,
          eventId,
          registrationId,
          reason: registrationResult.reason,
        });
      }

      const teamRegistrationResult = await markTeamRegistrationPaymentPendingFromPurchase({
        purchaseType,
        teamId,
        userId,
        registrationId,
        now,
      });
      if (
        !teamRegistrationResult.applied &&
        teamRegistrationResult.reason &&
        teamRegistrationResult.reason !== 'not_team_registration_purchase'
      ) {
        console.warn('Stripe webhook skipped pending team registration sync.', {
          paymentIntentId,
          purchaseType,
          userId,
          teamId,
          registrationId,
          reason: teamRegistrationResult.reason,
        });
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (eventType === 'payment_intent.payment_failed') {
      if (discountApplication) {
        await releaseDiscountCodeReservation({
          reservationId: discountApplication.reservationId,
          paymentIntentId,
        });
      }

      const releasedBill = await releaseBillPaymentProcessing({
        billId,
        billPaymentId,
        paymentIntentId,
        now,
        stripe: stripeForPaymentIntentSync,
      });
      resolvedBillId = releasedBill.billId ?? resolvedBillId;
      resolvedBillPaymentId = releasedBill.billPaymentId ?? resolvedBillPaymentId;

      if (!resolvedBillId && !resolvedBillPaymentId) {
        const failedBill = await createInstantBillAndPayment({
          purchaseType,
          paymentIntentId,
          userId,
          teamId,
          eventId,
          organizationId,
          registrationId,
          amountCents,
          totalChargeCents,
          metadata,
          now,
          targetPaymentStatus: 'FAILED',
          stripe: stripeForPaymentIntentSync,
        });
        resolvedBillId = failedBill.billId ?? resolvedBillId;
        resolvedBillPaymentId = failedBill.billPaymentId ?? resolvedBillPaymentId;
      }

      const registrationResult = await cancelEventRegistrationFromFailedPayment({
        purchaseType,
        eventId,
        teamId,
        userId,
        registrationId,
        occurrenceSlotId,
        occurrenceDate,
        now,
      });
      if (
        !registrationResult.applied &&
        registrationResult.reason &&
        registrationResult.reason !== 'not_event_purchase' &&
        registrationResult.reason !== 'missing_event_id' &&
        registrationResult.reason !== 'missing_participant' &&
        registrationResult.reason !== 'reservation_not_pending'
      ) {
        console.warn('Stripe webhook skipped failed event registration cleanup.', {
          paymentIntentId,
          purchaseType,
          userId,
          teamId,
          eventId,
          registrationId,
          reason: registrationResult.reason,
        });
      }

      const teamRegistrationResult = await cancelTeamRegistrationFromFailedPayment({
        purchaseType,
        teamId,
        userId,
        registrationId,
        now,
      });
      if (
        !teamRegistrationResult.applied &&
        teamRegistrationResult.reason &&
        teamRegistrationResult.reason !== 'not_team_registration_purchase' &&
        teamRegistrationResult.reason !== 'reservation_not_pending'
      ) {
        console.warn('Stripe webhook skipped failed team registration cleanup.', {
          paymentIntentId,
          purchaseType,
          userId,
          teamId,
          registrationId,
          reason: teamRegistrationResult.reason,
        });
      }

      void sendPaymentFailureEmail({
        purchaseType,
        paymentIntentId,
        userId,
        teamId,
        eventId,
        productId,
        organizationId,
        billId: resolvedBillId,
        billPaymentId: resolvedBillPaymentId,
        amountCents,
        totalChargeCents,
        receiptEmail,
        metadata,
        failedAt: now,
      }).catch((error) => {
        console.error('Failed to send payment failure email', {
          paymentIntentId,
          userId,
          error,
        });
      });

      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (billId || billPaymentId) {
      if (!billId || !billPaymentId) {
        console.warn(
          `Stripe webhook bill metadata incomplete (billId=${billId ?? 'null'}, billPaymentId=${billPaymentId ?? 'null'}).`,
        );
      } else {
        const payment = await prisma.billPayments.findUnique({
          where: { id: billPaymentId },
          select: { id: true, billId: true, status: true },
        });

        if (!payment || payment.billId !== billId) {
          console.warn(
            `Stripe webhook bill metadata mismatch (billId=${billId}, billPaymentId=${billPaymentId}).`,
          );
        } else {
          if (payment.status !== 'PAID') {
            await prisma.billPayments.update({
              where: { id: billPaymentId },
              data: {
                status: 'PAID',
                paidAt: now,
                payerUserId: userId ?? undefined,
                taxCalculationId: toStringOrNull(metadata.tax_calculation_id ?? metadata.taxCalculationId ?? null),
                taxAmountCents: toIntOrNull(metadata.tax_cents ?? metadata.taxCents) ?? 0,
                stripeProcessingFeeCents: toIntOrNull(
                  metadata.stripe_processing_fee_cents ?? metadata.stripeProcessingFeeCents ?? null,
                ) ?? 0,
                stripeTaxServiceFeeCents: toIntOrNull(
                  metadata.stripe_tax_service_fee_cents ?? metadata.stripeTaxServiceFeeCents ?? null,
                ) ?? 0,
                updatedAt: now,
              },
            });
            shouldSendReceipt = true;
          }

          const reconciledBill = await reconcileBill({
            billId,
            now,
            stripe: stripeForPaymentIntentSync,
          });
          if (reconciledBill?.parentBillId) {
            await reconcileBill({
              billId: reconciledBill.parentBillId,
              now,
              stripe: stripeForPaymentIntentSync,
            });
          }

          const billPurchaseMetadata = await loadBillPurchaseMetadata(billId);
          const billPurchaseType = toStringOrNull(billPurchaseMetadata?.purchaseType) ?? purchaseType;
          const billEventId = toStringOrNull(billPurchaseMetadata?.eventId) ?? eventId;
          const billTeamId = toStringOrNull(billPurchaseMetadata?.teamId) ?? teamId;
          const billUserId = toStringOrNull(billPurchaseMetadata?.userId) ?? userId;
          const billRegistrationId = toStringOrNull(billPurchaseMetadata?.registrationId) ?? registrationId;
          const billOccurrenceSlotId = toStringOrNull(billPurchaseMetadata?.occurrenceSlotId) ?? occurrenceSlotId;
          const billOccurrenceDate = toStringOrNull(billPurchaseMetadata?.occurrenceDate) ?? occurrenceDate;

          const registrationResult = await ensureEventRegistrationFromPurchase({
            purchaseType: billPurchaseType,
            eventId: billEventId,
            teamId: billTeamId,
            userId: billUserId,
            registrationId: billRegistrationId,
            occurrenceSlotId: billOccurrenceSlotId,
            occurrenceDate: billOccurrenceDate,
            now,
            targetStatus: 'ACTIVE',
          });
          if (
            !registrationResult.applied &&
            registrationResult.reason &&
            registrationResult.reason !== 'not_event_purchase' &&
            registrationResult.reason !== 'missing_event_id' &&
            registrationResult.reason !== 'missing_participant'
          ) {
            console.warn('Stripe webhook skipped paid bill event registration sync.', {
              paymentIntentId,
              purchaseType: billPurchaseType,
              userId: billUserId,
              teamId: billTeamId,
              eventId: billEventId,
              registrationId: billRegistrationId,
              reason: registrationResult.reason,
            });
          }

          const teamRegistrationResult = billPurchaseType === 'team_registration'
            ? await activateFailedTeamRegistration({
                teamId: billTeamId,
                userId: billUserId,
                registrationId: billRegistrationId,
                now,
              })
            : { applied: false, reason: 'not_team_registration_purchase' };
          if (
            !teamRegistrationResult.applied &&
            teamRegistrationResult.reason &&
            teamRegistrationResult.reason !== 'not_team_registration_purchase'
          ) {
            console.warn('Stripe webhook skipped paid bill team registration sync.', {
              paymentIntentId,
              purchaseType: billPurchaseType,
              userId: billUserId,
              teamId: billTeamId,
              registrationId: billRegistrationId,
              reason: teamRegistrationResult.reason,
            });
          }
        }
      }
    } else {
      const instantBill = await createInstantBillAndPayment({
        purchaseType,
        paymentIntentId,
        userId,
        teamId,
        eventId,
        organizationId,
        registrationId,
        amountCents,
        totalChargeCents,
        metadata,
        now,
        targetPaymentStatus: 'PAID',
        stripe: stripeForPaymentIntentSync,
      });
      if (instantBill.billId) {
        resolvedBillId = instantBill.billId;
      }
      if (instantBill.billPaymentId) {
        resolvedBillPaymentId = instantBill.billPaymentId;
      }
      shouldSendReceipt = instantBill.transitionedToPaid;
    }

    const receiptLogContext = {
      paymentIntentId,
      purchaseType,
      userId,
      teamId,
      eventId,
      productId,
      organizationId,
      billId: resolvedBillId,
      billPaymentId: resolvedBillPaymentId,
    };

    const registrationResult = await ensureEventRegistrationFromPurchase({
      purchaseType,
      eventId,
      teamId,
      userId,
      registrationId,
      occurrenceSlotId,
      occurrenceDate,
      now,
    });
    if (
      !registrationResult.applied &&
      registrationResult.reason &&
      registrationResult.reason !== 'not_event_purchase' &&
      registrationResult.reason !== 'missing_event_id' &&
      registrationResult.reason !== 'missing_participant'
    ) {
      console.warn('Stripe webhook skipped event registration sync.', {
        ...receiptLogContext,
        reason: registrationResult.reason,
      });
    }

    const teamRegistrationResult = await ensureTeamRegistrationFromPurchase({
      purchaseType,
      teamId,
      userId,
      registrationId,
      now,
    });
    if (
      !teamRegistrationResult.applied &&
      teamRegistrationResult.reason &&
      teamRegistrationResult.reason !== 'not_team_registration_purchase'
    ) {
      console.warn('Stripe webhook skipped team registration sync.', {
        ...receiptLogContext,
        reason: teamRegistrationResult.reason,
      });
    }

    const discountPurchaseType = normalizeDiscountPurchaseType(purchaseType);
    const discountTargetId = discountPurchaseType === 'event'
      ? eventId
      : discountPurchaseType === 'product'
        ? productId
        : discountPurchaseType === 'team_registration'
          ? teamId
          : null;
    if (discountApplication && discountPurchaseType && discountTargetId) {
      try {
        await recordDiscountCodeRedemption({
          discount: discountApplication,
          purchaseType: discountPurchaseType,
          targetId: discountTargetId,
          userId,
          guestEmail: receiptEmail,
          paymentIntentId,
          registrationId,
          productId,
          organizationId,
        });
      } catch (error) {
        console.error('Stripe webhook failed to record discount redemption.', {
          paymentIntentId,
          purchaseType,
          discountCodeId: discountApplication.discountCodeId,
          error,
        });
      }
    }

    if (shouldSendReceipt) {
      void sendPurchaseReceiptEmail({
        purchaseType,
        paymentIntentId,
        userId,
        teamId,
        eventId,
        productId,
        organizationId,
        billId: resolvedBillId,
        billPaymentId: resolvedBillPaymentId,
        amountCents,
        totalChargeCents,
        paidAt: now,
        receiptEmail,
        metadata,
      })
        .then((result) => {
          if (result.sent) {
            console.info('Purchase receipt flow completed: email sent.', receiptLogContext);
            return;
          }
          console.warn('Purchase receipt flow completed: email skipped.', {
            ...receiptLogContext,
            reason: result.reason ?? 'unknown',
          });
        })
        .catch((error) => {
          console.warn('Failed to send purchase receipt email', {
            ...receiptLogContext,
            error,
          });
        });
    } else {
      console.info('Purchase receipt flow skipped: no newly paid bill payment detected.', receiptLogContext);
    }
  } catch (error) {
    console.error('Stripe webhook handling failed', error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
