export type AffiliateOrganizationInitialOwnership = {
  originType: 'AFFILIATE_IMPORTED';
  ownershipStatus: 'UNCLAIMED';
  claimVerificationLevel: 'NONE';
  claimedAt: null;
  claimedByUserId: null;
  ownershipVerifiedAt: null;
  ownershipVerificationLastCheckedAt: null;
};

export const affiliateOrganizationInitialOwnership = (): AffiliateOrganizationInitialOwnership => ({
  originType: 'AFFILIATE_IMPORTED',
  ownershipStatus: 'UNCLAIMED',
  claimVerificationLevel: 'NONE',
  claimedAt: null,
  claimedByUserId: null,
  ownershipVerifiedAt: null,
  ownershipVerificationLastCheckedAt: null,
});
