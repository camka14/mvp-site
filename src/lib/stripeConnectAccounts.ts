import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { deriveManagedOrganizationVerificationStatus } from '@/lib/organizationVerification';

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeTransferAmount = (value: number): number => Math.max(0, Math.round(value));

const managedStripeAccountRowIsVerified = (row: {
  detailsSubmitted?: boolean | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  requirementsCurrentlyDue?: string[] | null;
  requirementsPastDue?: string[] | null;
  requirementsDisabledReason?: string | null;
}): boolean => deriveManagedOrganizationVerificationStatus({
  detailsSubmitted: row.detailsSubmitted,
  chargesEnabled: row.chargesEnabled,
  payoutsEnabled: row.payoutsEnabled,
  requirementsCurrentlyDue: row.requirementsCurrentlyDue ?? [],
  requirementsPastDue: row.requirementsPastDue ?? [],
  requirementsDisabledReason: row.requirementsDisabledReason ?? null,
}) === 'VERIFIED';

const selectLatestConnectedAccountId = async (where: { organizationId?: string; userId?: string }) => {
  const row = await prisma.stripeAccounts.findFirst({
    where: {
      ...where,
      accountId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: { accountId: true },
  });
  return normalizeString(row?.accountId);
};

const selectOrganizationConnectedAccountId = async (organizationId: string): Promise<string | null> => {
  if (typeof (prisma.stripeAccounts as { findMany?: unknown }).findMany !== 'function') {
    return selectLatestConnectedAccountId({ organizationId });
  }

  const rows = await prisma.stripeAccounts.findMany({
    where: {
      organizationId,
      accountId: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      accountId: true,
      accountOrigin: true,
      isActiveForBilling: true,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: true,
      requirementsPastDue: true,
      requirementsDisabledReason: true,
    },
  });

  const activeManagedAccount = rows.find((row) =>
    row.accountOrigin === 'PLATFORM_ONBOARDING'
    && row.isActiveForBilling
    && managedStripeAccountRowIsVerified(row),
  );
  if (activeManagedAccount) {
    return normalizeString(activeManagedAccount.accountId);
  }

  const activeLegacyAccount = rows.find((row) =>
    row.isActiveForBilling
    && row.accountOrigin !== 'PLATFORM_ONBOARDING',
  );
  if (activeLegacyAccount) {
    return normalizeString(activeLegacyAccount.accountId);
  }

  const legacyAccount = rows.find((row) =>
    row.accountOrigin === 'LEGACY_OAUTH' || row.accountOrigin == null,
  );
  if (legacyAccount) {
    return normalizeString(legacyAccount.accountId);
  }

  return null;
};

export const resolveConnectedAccountId = async ({
  organizationId,
  hostUserId,
}: {
  organizationId?: string | null;
  hostUserId?: string | null;
}): Promise<string | null> => {
  const normalizedOrganizationId = normalizeString(organizationId);
  if (normalizedOrganizationId) {
    const organizationAccountId = await selectOrganizationConnectedAccountId(
      normalizedOrganizationId,
    );
    if (organizationAccountId) {
      return organizationAccountId;
    }
  }

  const normalizedHostUserId = normalizeString(hostUserId);
  if (!normalizedHostUserId) {
    return null;
  }

  return selectLatestConnectedAccountId({ userId: normalizedHostUserId });
};

export const buildDestinationTransferData = async ({
  organizationId,
  hostUserId,
  transferAmountCents,
}: {
  organizationId?: string | null;
  hostUserId?: string | null;
  transferAmountCents: number;
}): Promise<Stripe.PaymentIntentCreateParams.TransferData | null> => {
  const normalizedTransferAmount = normalizeTransferAmount(transferAmountCents);
  if (normalizedTransferAmount <= 0) {
    return null;
  }

  const destination = await resolveConnectedAccountId({
    organizationId,
    hostUserId,
  });
  if (!destination) {
    return null;
  }

  return {
    destination,
    amount: normalizedTransferAmount,
  };
};

export const paymentIntentHasDestinationTransfer = (
  paymentIntent: Pick<Stripe.PaymentIntent, 'transfer_data'> | null | undefined,
): boolean => {
  const destination = paymentIntent?.transfer_data?.destination;
  if (typeof destination === 'string') {
    return destination.trim().length > 0;
  }
  if (destination && typeof destination === 'object') {
    return normalizeString((destination as { id?: string | null }).id) !== null;
  }
  return false;
};

export const calculatePlatformApplicationFeeAmount = ({
  totalChargeCents,
  connectedAccountAmountCents,
}: {
  totalChargeCents: number;
  connectedAccountAmountCents: number;
}): number => Math.max(
  0,
  normalizeTransferAmount(totalChargeCents) - normalizeTransferAmount(connectedAccountAmountCents),
);

export const findSubscriptionProductBaseAmountCents = (
  subscription: Pick<Stripe.Subscription, 'items'>,
): number | null => {
  const baseItem = subscription.items.data.find((item) => item.metadata?.line_type === 'product_base')
    ?? subscription.items.data[0]
    ?? null;
  const unitAmount = baseItem?.price?.unit_amount;
  return typeof unitAmount === 'number' ? normalizeTransferAmount(unitAmount) : null;
};

export const buildRefundCreateParamsForPaymentIntent = async ({
  stripe,
  paymentIntentId,
  amountCents,
  reason,
  metadata,
}: {
  stripe: Stripe;
  paymentIntentId: string;
  amountCents?: number;
  reason: Stripe.RefundCreateParams.Reason;
  metadata?: Record<string, string>;
}): Promise<Stripe.RefundCreateParams> => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reason,
    ...(metadata ? { metadata } : {}),
  };

  if (amountCents !== undefined) {
    params.amount = normalizeTransferAmount(amountCents);
  }

  if (paymentIntentHasDestinationTransfer(paymentIntent)) {
    params.reverse_transfer = true;
  }

  return params;
};
