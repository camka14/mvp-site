export type OrganizationClaimClassificationInput = {
  isAffiliate: boolean;
  ownerAccountExists: boolean;
  ownerIsRazumlyAdmin: boolean;
  externalManagementUserIds: string[];
  directRegistrableDomains: string[];
};

export type OrganizationClaimClassification = {
  originType: 'FIRST_PARTY' | 'AFFILIATE_IMPORTED';
  ownershipStatus: 'UNCLAIMED' | 'CLAIMED' | 'REVIEW_REQUIRED';
  legacyClaimMethod: 'LEGACY_OWNER' | null;
  primaryDomain: string | null;
  reasons: string[];
};

const uniqueSorted = (values: string[]): string[] => (
  Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort()
);

export const classifyOrganizationClaimState = (
  input: OrganizationClaimClassificationInput,
): OrganizationClaimClassification => {
  if (!input.isAffiliate) {
    return {
      originType: 'FIRST_PARTY',
      ownershipStatus: 'CLAIMED',
      legacyClaimMethod: null,
      primaryDomain: null,
      reasons: ['FIRST_PARTY_ORGANIZATION'],
    };
  }

  const directDomains = uniqueSorted(input.directRegistrableDomains);

  // Affiliate owner and staff IDs predate verified organization claims and may
  // point at import infrastructure. They do not establish public ownership.
  return {
    originType: 'AFFILIATE_IMPORTED',
    ownershipStatus: 'UNCLAIMED',
    legacyClaimMethod: null,
    primaryDomain: directDomains.length === 1 ? directDomains[0] : null,
    reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
  };
};
