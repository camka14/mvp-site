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
  const externalManagers = uniqueSorted(input.externalManagementUserIds);
  if (!input.ownerAccountExists) {
    return {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'REVIEW_REQUIRED',
      legacyClaimMethod: null,
      primaryDomain: directDomains.length === 1 ? directDomains[0] : null,
      reasons: ['OWNER_ACCOUNT_MISSING'],
    };
  }

  if (!input.ownerIsRazumlyAdmin) {
    return {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'CLAIMED',
      legacyClaimMethod: 'LEGACY_OWNER',
      primaryDomain: directDomains.length === 1 ? directDomains[0] : null,
      reasons: ['LEGACY_EXTERNAL_OWNER'],
    };
  }

  if (externalManagers.length > 0) {
    return {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'REVIEW_REQUIRED',
      legacyClaimMethod: null,
      primaryDomain: directDomains.length === 1 ? directDomains[0] : null,
      reasons: ['INTERNAL_OWNER_WITH_EXTERNAL_MANAGEMENT'],
    };
  }

  if (directDomains.length === 0) {
    return {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'REVIEW_REQUIRED',
      legacyClaimMethod: null,
      primaryDomain: null,
      reasons: ['MISSING_DIRECT_DOMAIN_PROVENANCE'],
    };
  }

  if (directDomains.length > 1) {
    return {
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'REVIEW_REQUIRED',
      legacyClaimMethod: null,
      primaryDomain: null,
      reasons: ['CONFLICTING_DIRECT_DOMAINS'],
    };
  }

  return {
    originType: 'AFFILIATE_IMPORTED',
    ownershipStatus: 'UNCLAIMED',
    legacyClaimMethod: null,
    primaryDomain: directDomains[0],
    reasons: ['INTERNAL_ADMIN_PLACEHOLDER_OWNER'],
  };
};
