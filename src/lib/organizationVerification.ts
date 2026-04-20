export const ORGANIZATION_VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'LEGACY_CONNECTED',
  'PENDING',
  'ACTION_REQUIRED',
  'VERIFIED',
] as const;

export type OrganizationVerificationStatus =
  typeof ORGANIZATION_VERIFICATION_STATUSES[number];

export const ORGANIZATION_VERIFICATION_REVIEW_STATUSES = [
  'NONE',
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
] as const;

export type OrganizationVerificationReviewStatus =
  typeof ORGANIZATION_VERIFICATION_REVIEW_STATUSES[number];

export const STRIPE_ACCOUNT_ORIGINS = [
  'LEGACY_OAUTH',
  'PLATFORM_ONBOARDING',
] as const;

export type StripeAccountOrigin = typeof STRIPE_ACCOUNT_ORIGINS[number];

type RequirementSnapshot = {
  detailsSubmitted?: boolean | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  requirementsCurrentlyDue?: readonly string[] | null;
  requirementsPastDue?: readonly string[] | null;
  requirementsDisabledReason?: string | null;
};

type OrganizationVerificationLike = {
  verificationStatus?: unknown;
  hasStripeAccount?: boolean | null;
};

const hasItems = (value: readonly string[] | null | undefined): boolean =>
  Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim().length > 0);

export const isOrganizationVerificationStatus = (
  value: unknown,
): value is OrganizationVerificationStatus =>
  typeof value === 'string'
  && (ORGANIZATION_VERIFICATION_STATUSES as readonly string[]).includes(value);

export const isOrganizationVerificationReviewStatus = (
  value: unknown,
): value is OrganizationVerificationReviewStatus =>
  typeof value === 'string'
  && (ORGANIZATION_VERIFICATION_REVIEW_STATUSES as readonly string[]).includes(value);

export const isStripeAccountOrigin = (
  value: unknown,
): value is StripeAccountOrigin =>
  typeof value === 'string'
  && (STRIPE_ACCOUNT_ORIGINS as readonly string[]).includes(value);

export const deriveManagedOrganizationVerificationStatus = (
  snapshot: RequirementSnapshot,
): Extract<OrganizationVerificationStatus, 'PENDING' | 'ACTION_REQUIRED' | 'VERIFIED'> => {
  const hasBlockingRequirements =
    typeof snapshot.requirementsDisabledReason === 'string' && snapshot.requirementsDisabledReason.trim().length > 0
    || hasItems(snapshot.requirementsCurrentlyDue)
    || hasItems(snapshot.requirementsPastDue);

  if (
    snapshot.detailsSubmitted === true
    && snapshot.chargesEnabled === true
    && snapshot.payoutsEnabled === true
    && !hasBlockingRequirements
  ) {
    return 'VERIFIED';
  }

  if (hasBlockingRequirements) {
    return 'ACTION_REQUIRED';
  }

  return 'PENDING';
};

export const resolveOrganizationVerificationStatus = (
  organization: OrganizationVerificationLike | null | undefined,
): OrganizationVerificationStatus => {
  if (isOrganizationVerificationStatus(organization?.verificationStatus)) {
    return organization.verificationStatus;
  }
  return organization?.hasStripeAccount ? 'LEGACY_CONNECTED' : 'UNVERIFIED';
};

export const isOrganizationVerified = (
  organization: OrganizationVerificationLike | null | undefined,
): boolean => resolveOrganizationVerificationStatus(organization) === 'VERIFIED';

export const canOrganizationUsePaidBilling = (
  organization: OrganizationVerificationLike | null | undefined,
): boolean => {
  const status = resolveOrganizationVerificationStatus(organization);
  return status === 'VERIFIED' || status === 'LEGACY_CONNECTED';
};

export const organizationVerificationStatusLabel = (
  status: OrganizationVerificationStatus,
): string => {
  switch (status) {
    case 'VERIFIED':
      return 'Verified';
    case 'ACTION_REQUIRED':
      return 'Action required';
    case 'PENDING':
      return 'Pending verification';
    case 'LEGACY_CONNECTED':
      return 'Connected';
    case 'UNVERIFIED':
    default:
      return 'Unverified';
  }
};
