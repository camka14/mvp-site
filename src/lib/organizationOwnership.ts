import type {
  OrganizationClaimVerificationLevel,
  OrganizationOriginType,
  OrganizationOwnershipAction,
  OrganizationOwnershipStatus,
} from '@/types';

type OrganizationOwnershipSource = {
  $id?: string | null;
  id?: string | null;
  originType?: unknown;
  ownershipStatus?: unknown;
  claimVerificationLevel?: unknown;
};

const ORIGIN_TYPES = new Set<OrganizationOriginType>(['FIRST_PARTY', 'AFFILIATE_IMPORTED']);
const OWNERSHIP_STATUSES = new Set<OrganizationOwnershipStatus>([
  'UNCLAIMED',
  'CLAIM_PENDING',
  'CLAIMED',
  'REVIEW_REQUIRED',
  'DISPUTED',
  'SUSPENDED',
]);
const VERIFICATION_LEVELS = new Set<OrganizationClaimVerificationLevel>([
  'NONE',
  'AFFILIATION',
  'SITE_CONTROL',
  'MANUAL_REVIEW',
]);

export const normalizeOrganizationOriginType = (value: unknown): OrganizationOriginType => (
  typeof value === 'string' && ORIGIN_TYPES.has(value as OrganizationOriginType)
    ? value as OrganizationOriginType
    : 'FIRST_PARTY'
);

export const normalizeOrganizationOwnershipStatus = (value: unknown): OrganizationOwnershipStatus => (
  typeof value === 'string' && OWNERSHIP_STATUSES.has(value as OrganizationOwnershipStatus)
    ? value as OrganizationOwnershipStatus
    : 'CLAIMED'
);

export const normalizeOrganizationClaimVerificationLevel = (
  value: unknown,
): OrganizationClaimVerificationLevel => (
  typeof value === 'string' && VERIFICATION_LEVELS.has(value as OrganizationClaimVerificationLevel)
    ? value as OrganizationClaimVerificationLevel
    : 'NONE'
);

export const getOrganizationOwnershipAction = (
  status: OrganizationOwnershipStatus,
): OrganizationOwnershipAction => {
  if (status === 'UNCLAIMED') return 'CLAIM';
  if (status === 'CLAIM_PENDING') return 'VIEW_PENDING_CLAIM';
  if (status === 'CLAIMED') return 'REPORT_OWNERSHIP_ISSUE';
  if (status === 'REVIEW_REQUIRED' || status === 'DISPUTED' || status === 'SUSPENDED') {
    return 'CONTACT_SUPPORT';
  }
  return 'NONE';
};

export const getOrganizationOwnershipPresentation = (
  organization: OrganizationOwnershipSource,
) => {
  const organizationId = String(organization.$id ?? organization.id ?? '').trim();
  const originType = normalizeOrganizationOriginType(organization.originType);
  const ownershipStatus = normalizeOrganizationOwnershipStatus(organization.ownershipStatus);
  const claimVerificationLevel = normalizeOrganizationClaimVerificationLevel(
    organization.claimVerificationLevel,
  );
  return {
    originType,
    ownershipStatus,
    claimVerificationLevel,
    claimable: ownershipStatus === 'UNCLAIMED',
    claimUrl: organizationId
      ? `/organizations/${encodeURIComponent(organizationId)}/claim`
      : '',
    ownershipAction: getOrganizationOwnershipAction(ownershipStatus),
  };
};
