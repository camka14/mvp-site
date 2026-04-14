import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import {
  calculatePlatformApplicationFeeAmount,
  findSubscriptionProductBaseAmountCents,
  resolveConnectedAccountId,
} from '@/lib/stripeConnectAccounts';
import { syncManagedOrganizationStripeAccount } from '@/server/organizationStripeVerification';
import { sendPurchaseReceiptEmail } from '@/server/purchaseReceipts';
import { syncStripeSubscriptionMirrorById, upsertStripeSubscriptionMirror } from '@/lib/stripeSubscriptions';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';

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

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => toStringOrNull(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(normalized));
};

const sameOrderedIds = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const SUPPORTED_EVENT_TYPES = new Set([
  'account.updated',
  'payment_intent.succeeded',
  'invoice.created',
  'invoice.paid',
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
        teamIds: unknown;
        userIds: unknown;
        waitListIds: unknown;
        freeAgentIds: unknown;
      }>>`
        SELECT
          "id",
          "eventType",
          "teamSignup",
          "teamIds",
          "userIds",
          "waitListIds",
          "freeAgentIds"
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

        const currentTeamIds = normalizeIdList(event.teamIds);
        const currentWaitListIds = normalizeIdList(event.waitListIds);
        const nextTeamIds = currentTeamIds.includes(teamId) ? currentTeamIds : [...currentTeamIds, teamId];
        const nextWaitListIds = currentWaitListIds.filter((value) => value !== teamId);

        if (
          !sameOrderedIds(currentTeamIds, nextTeamIds) ||
          !sameOrderedIds(currentWaitListIds, nextWaitListIds)
        ) {
          await tx.events.update({
            where: { id: eventId },
            data: {
              teamIds: nextTeamIds,
              waitListIds: nextWaitListIds,
              updatedAt: now,
            },
          });
        }

        if (!existingRegistration) {
          await tx.eventRegistrations.create({
            data: {
              id: effectiveRegistrationId,
              eventId,
              registrantId: teamId,
              registrantType: 'TEAM',
              rosterRole: 'PARTICIPANT',
              status: 'ACTIVE',
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
        } else if (existingRegistration.status !== 'ACTIVE') {
          await tx.eventRegistrations.update({
            where: { id: effectiveRegistrationId },
            data: {
              status: 'ACTIVE',
              updatedAt: now,
            },
          });
        }

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
      const currentUserIds = normalizeIdList(event.userIds);
      const currentWaitListIds = normalizeIdList(event.waitListIds);
      const currentFreeAgentIds = normalizeIdList(event.freeAgentIds);
      const nextUserIds = currentUserIds.includes(participantUserId)
        ? currentUserIds
        : [...currentUserIds, participantUserId];
      const nextWaitListIds = currentWaitListIds.filter((value) => value !== participantUserId);
      const nextFreeAgentIds = currentFreeAgentIds.filter((value) => value !== participantUserId);

      if (
        !sameOrderedIds(currentUserIds, nextUserIds) ||
        !sameOrderedIds(currentWaitListIds, nextWaitListIds) ||
        !sameOrderedIds(currentFreeAgentIds, nextFreeAgentIds)
      ) {
        await tx.events.update({
          where: { id: eventId },
          data: {
            userIds: nextUserIds,
            waitListIds: nextWaitListIds,
            freeAgentIds: nextFreeAgentIds,
            updatedAt: now,
          },
        });
      }

      if (!existingRegistration) {
        await tx.eventRegistrations.create({
          data: {
            id: effectiveRegistrationId,
            eventId,
            registrantId: participantUserId,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
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
      } else if (existingRegistration.status !== 'ACTIVE') {
        await tx.eventRegistrations.update({
          where: { id: effectiveRegistrationId },
          data: {
            status: 'ACTIVE',
            updatedAt: now,
          },
        });
      }

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
): 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELLED' => {
  if (paidAmountCents >= totalAmountCents) return 'PAID';
  if (currentStatus === 'CANCELLED') return 'CANCELLED';
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
  const pendingPayment = payments.find((entry) => entry.status === 'PENDING' || entry.status === null) ?? null;

  let nextPaymentDue: Date | null = null;
  let nextPaymentAmountCents: number | null = null;

  if (pendingPayment) {
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

  const status = resolveBillStatus(bill.status, paidAmountCents, bill.totalAmountCents);
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
  if (normalized === 'event') return 'Event registration';
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

  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  const primaryType: 'EVENT' | 'PRODUCT' | 'RENTAL' | 'OTHER' =
    normalizedPurchaseType === 'product'
      ? 'PRODUCT'
      : normalizedPurchaseType === 'rental'
        ? 'RENTAL'
        : normalizedPurchaseType === 'event'
          ? 'EVENT'
          : 'OTHER';
  const baseLabel = productName ?? eventName ?? resolveInstantLineItemLabel(purchaseType);

  const initialBaseAmount = purchaseAmountCents && purchaseAmountCents > 0
    ? purchaseAmountCents
    : Math.max(fallbackAmountCents - mvpFeeCents - stripeFeeCents - taxCents, 0);

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
  if (mvpFeeCents > 0) {
    lineItems.push({
      id: `line_${lineItems.length + 1}`,
      type: 'FEE',
      label: 'BracketIQ fee',
      amountCents: mvpFeeCents,
    });
  }
  if (stripeFeeCents > 0) {
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

const createInstantBillAndPayment = async ({
  purchaseType,
  paymentIntentId,
  userId,
  teamId,
  eventId,
  organizationId,
  amountCents,
  totalChargeCents,
  metadata,
  now,
}: {
  purchaseType: string | null;
  paymentIntentId: string | null;
  userId: string | null;
  teamId: string | null;
  eventId: string | null;
  organizationId: string | null;
  amountCents: number | null;
  totalChargeCents: number | null;
  metadata: Record<string, unknown>;
  now: Date;
}): Promise<{ billId: string | null; billPaymentId: string | null; created: boolean }> => {
  const normalizedPurchaseType = (purchaseType ?? '').trim().toLowerCase();
  if (!paymentIntentId || !amountCents || amountCents <= 0 || normalizedPurchaseType === 'bill') {
    return { billId: null, billPaymentId: null, created: false };
  }

  const ownerId = teamId ?? userId;
  const ownerType: 'TEAM' | 'USER' = teamId ? 'TEAM' : 'USER';
  if (!ownerId) {
    return { billId: null, billPaymentId: null, created: false };
  }

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
    return { billId: null, billPaymentId: null, created: false };
  }

  const existingPayment = await prisma.billPayments.findFirst({
    where: { paymentIntentId },
    select: { id: true, billId: true },
  });
  if (existingPayment) {
    return { billId: existingPayment.billId, billPaymentId: existingPayment.id, created: false };
  }

  return prisma.$transaction(async (tx) => {
    const duplicatePayment = await tx.billPayments.findFirst({
      where: { paymentIntentId },
      select: { id: true, billId: true },
    });
    if (duplicatePayment) {
      return { billId: duplicatePayment.billId, billPaymentId: duplicatePayment.id, created: false };
    }

    const bill = await tx.bills.create({
      data: {
        id: crypto.randomUUID(),
        ownerType,
        ownerId,
        organizationId: organizationId ?? null,
        eventId: eventId ?? null,
        totalAmountCents: effectiveAmountCents,
        paidAmountCents: effectiveAmountCents,
        nextPaymentDue: null,
        nextPaymentAmountCents: null,
        parentBillId: null,
        allowSplit: false,
        status: 'PAID',
        paymentPlanEnabled: false,
        createdBy: userId ?? null,
        lineItems: instantBreakdown.lineItems,
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
        status: 'PAID',
        paidAt: now,
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

    return { billId: bill.id, billPaymentId: payment.id, created: true };
  });
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

  if (eventType === 'invoice.paid') {
    const invoice = (event.data?.object ?? null) as (Stripe.Invoice & {
      parent?: {
        subscription_details?: {
          subscription?: string | Stripe.Subscription | null;
        } | null;
      } | null;
      subscription?: string | Stripe.Subscription | null;
    }) | null;
    const stripeSubscriptionId = extractStripeSubscriptionIdFromInvoice(invoice);

    if (stripeSubscriptionId && stripeForPaymentIntentSync) {
      await syncStripeSubscriptionMirrorById({
        stripe: stripeForPaymentIntentSync,
        stripeSubscriptionId,
      });
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
        amountCents,
        totalChargeCents,
        metadata,
        now,
      });
      if (instantBill.billId) {
        resolvedBillId = instantBill.billId;
      }
      if (instantBill.billPaymentId) {
        resolvedBillPaymentId = instantBill.billPaymentId;
      }
      shouldSendReceipt = instantBill.created;
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
