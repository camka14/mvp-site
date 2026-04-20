import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import {
  deriveManagedOrganizationVerificationStatus,
  type OrganizationVerificationStatus,
} from '@/lib/organizationVerification';

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const managedOrganizationStripeAccountRowId = (organizationId: string): string =>
  `org_platform_${organizationId}`;

const legacyOrganizationStripeAccountRowId = (organizationId: string): string =>
  `org_${organizationId}`;

const resolveStripeAccountType = (account: Stripe.Account): string | null => {
  if (typeof account.type === 'string' && account.type.trim().length > 0) {
    return account.type;
  }
  const dashboardType = account.controller?.stripe_dashboard?.type;
  return typeof dashboardType === 'string' && dashboardType.trim().length > 0
    ? dashboardType
    : null;
};

const buildManagedStatusFromAccount = (account: Stripe.Account) =>
  deriveManagedOrganizationVerificationStatus({
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? null,
    requirementsPastDue: account.requirements?.past_due ?? null,
    requirementsDisabledReason: account.requirements?.disabled_reason ?? null,
  });

const nextReviewStatusForVerification = ({
  previousReviewStatus,
  verificationStatus,
}: {
  previousReviewStatus: string | null | undefined;
  verificationStatus: OrganizationVerificationStatus;
}): { reviewStatus?: 'NONE' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; reviewUpdatedAt?: Date } => {
  const now = new Date();

  if (verificationStatus === 'VERIFIED') {
    if (previousReviewStatus === 'RESOLVED') {
      return {};
    }
    return {
      reviewStatus: 'RESOLVED',
      reviewUpdatedAt: now,
    };
  }

  if (verificationStatus === 'ACTION_REQUIRED') {
    if (previousReviewStatus === 'OPEN' || previousReviewStatus === 'IN_PROGRESS') {
      return {};
    }
    return {
      reviewStatus: 'OPEN',
      reviewUpdatedAt: now,
    };
  }

  return {};
};

export const getManagedOrganizationStripeAccountRowId = managedOrganizationStripeAccountRowId;

export const getLegacyOrganizationStripeAccountRowId = legacyOrganizationStripeAccountRowId;

export const findManagedOrganizationStripeAccount = async (organizationId: string) =>
  prisma.stripeAccounts.findUnique({
    where: { id: managedOrganizationStripeAccountRowId(organizationId) },
  });

export const markLegacyOrganizationStripeAccountConnected = async ({
  organizationId,
  accountId,
  email,
}: {
  organizationId: string;
  accountId: string;
  email?: string | null;
}) => {
  const now = new Date();
  const normalizedEmail = normalizeString(email);
  const legacyRowId = legacyOrganizationStripeAccountRowId(organizationId);

  await prisma.$transaction(async (tx) => {
    await tx.organizations.update({
      where: { id: organizationId },
      data: {
        hasStripeAccount: true,
        verificationStatus: 'LEGACY_CONNECTED',
        updatedAt: now,
      },
    });

    await tx.stripeAccounts.upsert({
      where: { id: legacyRowId },
      create: {
        id: legacyRowId,
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'LEGACY_OAUTH',
        isActiveForBilling: true,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'LEGACY_OAUTH',
        isActiveForBilling: true,
        updatedAt: now,
      },
    });
  });
};

export const markManagedOrganizationStripeAccountMockVerified = async ({
  organizationId,
  accountId,
  email,
}: {
  organizationId: string;
  accountId: string;
  email?: string | null;
}) => {
  const now = new Date();
  const managedRowId = managedOrganizationStripeAccountRowId(organizationId);
  const normalizedEmail = normalizeString(email);

  await prisma.$transaction(async (tx) => {
    await tx.stripeAccounts.upsert({
      where: { id: managedRowId },
      create: {
        id: managedRowId,
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: 'express',
        isActiveForBilling: true,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsEventuallyDue: [],
        requirementsDisabledReason: null,
        verificationLastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: 'express',
        isActiveForBilling: true,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsEventuallyDue: [],
        requirementsDisabledReason: null,
        verificationLastSyncedAt: now,
        updatedAt: now,
      },
    });

    await tx.stripeAccounts.updateMany({
      where: {
        organizationId,
        id: { not: managedRowId },
      },
      data: {
        isActiveForBilling: false,
        updatedAt: now,
      },
    });

    await tx.organizations.update({
      where: { id: organizationId },
      data: {
        hasStripeAccount: true,
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
        verificationReviewStatus: 'RESOLVED',
        verificationReviewUpdatedAt: now,
        updatedAt: now,
      },
    });
  });
};

export const createOrReuseManagedOrganizationStripeAccount = async ({
  organizationId,
  email,
  accountId,
}: {
  organizationId: string;
  email?: string | null;
  accountId: string;
}) => {
  const now = new Date();
  const managedRowId = managedOrganizationStripeAccountRowId(organizationId);
  const normalizedEmail = normalizeString(email);

  await prisma.$transaction(async (tx) => {
    await tx.stripeAccounts.upsert({
      where: { id: managedRowId },
      create: {
        id: managedRowId,
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: 'express',
        isActiveForBilling: false,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsEventuallyDue: [],
        createdAt: now,
        updatedAt: now,
      },
      update: {
        organizationId,
        accountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: 'express',
        isActiveForBilling: false,
        updatedAt: now,
      },
    });

    await tx.organizations.update({
      where: { id: organizationId },
      data: {
        verificationStatus: 'PENDING',
        verifiedAt: null,
        updatedAt: now,
      },
    });
  });
};

export const syncManagedOrganizationStripeAccount = async ({
  stripe,
  organizationId,
  accountId,
}: {
  stripe: Stripe;
  organizationId: string;
  accountId?: string | null;
}) => {
  const managedRowId = managedOrganizationStripeAccountRowId(organizationId);
  const existingManagedAccount = await prisma.stripeAccounts.findUnique({
    where: { id: managedRowId },
    select: {
      id: true,
      accountId: true,
    },
  });

  const targetAccountId = normalizeString(accountId) ?? normalizeString(existingManagedAccount?.accountId);
  if (!targetAccountId) {
    return null;
  }

  const [account, organization] = await Promise.all([
    stripe.accounts.retrieve(targetAccountId),
    prisma.organizations.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        verificationReviewStatus: true,
      },
    }),
  ]);

  if (!organization) {
    return null;
  }

  const now = new Date();
  const verificationStatus = buildManagedStatusFromAccount(account);
  const reviewUpdate = nextReviewStatusForVerification({
    previousReviewStatus: organization.verificationReviewStatus ?? null,
    verificationStatus,
  });
  const normalizedEmail = normalizeString(account.email);
  const normalizedAccountType = resolveStripeAccountType(account);
  const requirementsCurrentlyDue = normalizeStringList(account.requirements?.currently_due);
  const requirementsPastDue = normalizeStringList(account.requirements?.past_due);
  const requirementsEventuallyDue = normalizeStringList(account.requirements?.eventually_due);
  const requirementsDisabledReason = normalizeString(account.requirements?.disabled_reason);
  const managedAccountIsActiveForBilling = verificationStatus === 'VERIFIED';

  await prisma.$transaction(async (tx) => {
    await tx.stripeAccounts.upsert({
      where: { id: managedRowId },
      create: {
        id: managedRowId,
        organizationId,
        accountId: targetAccountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: normalizedAccountType,
        isActiveForBilling: managedAccountIsActiveForBilling,
        detailsSubmitted: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        requirementsCurrentlyDue,
        requirementsPastDue,
        requirementsEventuallyDue,
        requirementsDisabledReason,
        verificationLastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        organizationId,
        accountId: targetAccountId,
        email: normalizedEmail,
        accountOrigin: 'PLATFORM_ONBOARDING',
        accountType: normalizedAccountType,
        isActiveForBilling: managedAccountIsActiveForBilling,
        detailsSubmitted: account.details_submitted ?? false,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        requirementsCurrentlyDue,
        requirementsPastDue,
        requirementsEventuallyDue,
        requirementsDisabledReason,
        verificationLastSyncedAt: now,
        updatedAt: now,
      },
    });

    if (managedAccountIsActiveForBilling) {
      await tx.stripeAccounts.updateMany({
        where: {
          organizationId,
          id: { not: managedRowId },
        },
        data: {
          isActiveForBilling: false,
          updatedAt: now,
        },
      });
    } else {
      await tx.stripeAccounts.updateMany({
        where: {
          id: legacyOrganizationStripeAccountRowId(organizationId),
        },
        data: {
          isActiveForBilling: true,
          updatedAt: now,
        },
      });
    }

    await tx.organizations.update({
      where: { id: organizationId },
      data: {
        hasStripeAccount: true,
        verificationStatus,
        verifiedAt: verificationStatus === 'VERIFIED' ? now : null,
        ...(reviewUpdate.reviewStatus ? { verificationReviewStatus: reviewUpdate.reviewStatus } : {}),
        ...(reviewUpdate.reviewUpdatedAt ? { verificationReviewUpdatedAt: reviewUpdate.reviewUpdatedAt } : {}),
        updatedAt: now,
      },
    });
  });

  return {
    account,
    verificationStatus,
  };
};
