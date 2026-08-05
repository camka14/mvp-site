export type OwnershipRepairAction =
  | 'REPAIR_FALSE_DEFAULT_CLAIM'
  | 'PRESERVE'
  | 'MANUAL_REVIEW';

export type OwnershipRepairReason =
  | 'FALSE_DEFAULT_CLAIM_SIGNATURE'
  | 'NO_AFFILIATE_PROVENANCE'
  | 'OWNERSHIP_STATE_ALREADY_SAFE'
  | 'CLAIM_HISTORY_PRESENT'
  | 'CLAIM_EVENT_HISTORY_PRESENT'
  | 'CLAIM_EVIDENCE_PRESENT'
  | 'OWNER_IS_NOT_RAZUMLY_PLACEHOLDER'
  | 'UNEXPECTED_AFFILIATE_OWNERSHIP_STATE';

export type OwnershipRepairInput = {
  hasAffiliateEvidence: boolean;
  originType: string;
  ownershipStatus: string;
  claimedAt: Date | string | null;
  claimedByUserId: string | null;
  claimVerificationLevel: string;
  ownershipVerifiedAt: Date | string | null;
  ownershipVerificationLastCheckedAt: Date | string | null;
  ownerIsRazumlyAdmin: boolean;
  claimCount: number;
  ownershipClaimEventCount: number;
};

export type OwnershipRepairDecision = {
  action: OwnershipRepairAction;
  reasons: OwnershipRepairReason[];
};

const hasOwnershipEvidence = (input: OwnershipRepairInput): boolean => Boolean(
  input.claimedAt
  || input.claimedByUserId
  || input.claimVerificationLevel !== 'NONE'
  || input.ownershipVerifiedAt
  || input.ownershipVerificationLastCheckedAt,
);

export const classifyOwnershipRepair = (
  input: OwnershipRepairInput,
): OwnershipRepairDecision => {
  if (!input.hasAffiliateEvidence) {
    return { action: 'PRESERVE', reasons: ['NO_AFFILIATE_PROVENANCE'] };
  }

  const preservationReasons: OwnershipRepairReason[] = [];
  if (input.claimCount > 0) preservationReasons.push('CLAIM_HISTORY_PRESENT');
  if (input.ownershipClaimEventCount > 0) preservationReasons.push('CLAIM_EVENT_HISTORY_PRESENT');
  if (hasOwnershipEvidence(input)) preservationReasons.push('CLAIM_EVIDENCE_PRESENT');
  if (preservationReasons.length > 0) {
    return { action: 'PRESERVE', reasons: preservationReasons };
  }

  const isFalseDefaultState = input.originType === 'FIRST_PARTY'
    && input.ownershipStatus === 'CLAIMED';
  if (isFalseDefaultState && input.ownerIsRazumlyAdmin) {
    return {
      action: 'REPAIR_FALSE_DEFAULT_CLAIM',
      reasons: ['FALSE_DEFAULT_CLAIM_SIGNATURE'],
    };
  }
  if (isFalseDefaultState) {
    return {
      action: 'MANUAL_REVIEW',
      reasons: ['OWNER_IS_NOT_RAZUMLY_PLACEHOLDER'],
    };
  }

  if (
    input.ownershipStatus === 'UNCLAIMED'
    || input.ownershipStatus === 'CLAIM_PENDING'
    || input.ownershipStatus === 'REVIEW_REQUIRED'
    || input.ownershipStatus === 'DISPUTED'
    || input.ownershipStatus === 'SUSPENDED'
  ) {
    return { action: 'PRESERVE', reasons: ['OWNERSHIP_STATE_ALREADY_SAFE'] };
  }

  return {
    action: 'MANUAL_REVIEW',
    reasons: ['UNEXPECTED_AFFILIATE_OWNERSHIP_STATE'],
  };
};
