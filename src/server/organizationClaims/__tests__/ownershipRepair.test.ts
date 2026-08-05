/** @jest-environment node */

import {
  classifyOwnershipRepair,
  type OwnershipRepairInput,
} from '@/server/organizationClaims/ownershipRepair';

const falseDefaultClaim: OwnershipRepairInput = {
  hasAffiliateEvidence: true,
  originType: 'FIRST_PARTY',
  ownershipStatus: 'CLAIMED',
  claimedAt: null,
  claimedByUserId: null,
  claimVerificationLevel: 'NONE',
  ownershipVerifiedAt: null,
  ownershipVerificationLastCheckedAt: null,
  ownerIsRazumlyAdmin: true,
  claimCount: 0,
  ownershipClaimEventCount: 0,
};

describe('affiliate ownership repair classification', () => {
  it('repairs only the false migration-default claim signature', () => {
    expect(classifyOwnershipRepair(falseDefaultClaim)).toEqual({
      action: 'REPAIR_FALSE_DEFAULT_CLAIM',
      reasons: ['FALSE_DEFAULT_CLAIM_SIGNATURE'],
    });
  });

  it.each([
    ['UNCLAIMED'],
    ['CLAIM_PENDING'],
    ['REVIEW_REQUIRED'],
    ['DISPUTED'],
    ['SUSPENDED'],
  ])('preserves the %s ownership state', (ownershipStatus) => {
    expect(classifyOwnershipRepair({
      ...falseDefaultClaim,
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus,
    })).toEqual({
      action: 'PRESERVE',
      reasons: ['OWNERSHIP_STATE_ALREADY_SAFE'],
    });
  });

  it.each([
    ['claimedAt', { claimedAt: new Date('2026-08-05T00:00:00.000Z') }],
    ['claimedByUserId', { claimedByUserId: 'user_claimant' }],
    ['verification level', { claimVerificationLevel: 'DOMAIN_CONTROL' }],
    ['verified timestamp', { ownershipVerifiedAt: new Date('2026-08-05T00:00:00.000Z') }],
  ])('preserves a row with %s evidence', (_label, change) => {
    expect(classifyOwnershipRepair({ ...falseDefaultClaim, ...change })).toEqual({
      action: 'PRESERVE',
      reasons: ['CLAIM_EVIDENCE_PRESENT'],
    });
  });

  it('preserves any claim history', () => {
    expect(classifyOwnershipRepair({ ...falseDefaultClaim, claimCount: 1 })).toEqual({
      action: 'PRESERVE',
      reasons: ['CLAIM_HISTORY_PRESENT'],
    });
  });

  it('preserves any ownership claim event history', () => {
    expect(classifyOwnershipRepair({
      ...falseDefaultClaim,
      ownershipClaimEventCount: 1,
    })).toEqual({
      action: 'PRESERVE',
      reasons: ['CLAIM_EVENT_HISTORY_PRESENT'],
    });
  });

  it('sends a non-placeholder owner to manual review', () => {
    expect(classifyOwnershipRepair({
      ...falseDefaultClaim,
      ownerIsRazumlyAdmin: false,
    })).toEqual({
      action: 'MANUAL_REVIEW',
      reasons: ['OWNER_IS_NOT_RAZUMLY_PLACEHOLDER'],
    });
  });

  it('never repairs a row without durable affiliate provenance', () => {
    expect(classifyOwnershipRepair({
      ...falseDefaultClaim,
      hasAffiliateEvidence: false,
    })).toEqual({
      action: 'PRESERVE',
      reasons: ['NO_AFFILIATE_PROVENANCE'],
    });
  });
});
