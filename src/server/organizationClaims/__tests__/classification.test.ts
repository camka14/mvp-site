/** @jest-environment node */

import { classifyOrganizationClaimState } from '@/server/organizationClaims/classification';

describe('affiliate organization ownership classification', () => {
  it('keeps ordinary organizations first-party and claimed', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: false,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: false,
      externalManagementUserIds: [],
      directRegistrableDomains: [],
    })).toEqual({
      originType: 'FIRST_PARTY',
      ownershipStatus: 'CLAIMED',
      legacyClaimMethod: null,
      primaryDomain: null,
      reasons: ['FIRST_PARTY_ORGANIZATION'],
    });
  });

  it('makes an internally owned affiliate organization claimable when provenance is direct', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: true,
      externalManagementUserIds: [],
      directRegistrableDomains: ['rivercitysports.org', 'rivercitysports.org'],
    })).toEqual({
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'UNCLAIMED',
      legacyClaimMethod: null,
      primaryDomain: 'rivercitysports.org',
      reasons: ['INTERNAL_ADMIN_PLACEHOLDER_OWNER'],
    });
  });

  it('preserves a non-admin affiliate owner as a legacy claim', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: false,
      externalManagementUserIds: [],
      directRegistrableDomains: ['club.example'],
    })).toEqual(expect.objectContaining({
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'CLAIMED',
      legacyClaimMethod: 'LEGACY_OWNER',
      reasons: ['LEGACY_EXTERNAL_OWNER'],
    }));
  });

  it('requires review when an internal placeholder organization has external managers', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: true,
      externalManagementUserIds: ['user_2'],
      directRegistrableDomains: ['rivercitysports.org'],
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'REVIEW_REQUIRED',
      reasons: ['INTERNAL_OWNER_WITH_EXTERNAL_MANAGEMENT'],
    }));
  });

  it.each([
    [[], 'MISSING_DIRECT_DOMAIN_PROVENANCE'],
    [['rivercitysports.org', 'different-club.org'], 'CONFLICTING_DIRECT_DOMAINS'],
  ])('requires review for ambiguous domain provenance', (domains, reason) => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: true,
      externalManagementUserIds: [],
      directRegistrableDomains: domains,
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'REVIEW_REQUIRED',
      primaryDomain: null,
      reasons: [reason],
    }));
  });

  it('requires review when the recorded owner account is unavailable', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: false,
      ownerIsRazumlyAdmin: false,
      externalManagementUserIds: [],
      directRegistrableDomains: ['rivercitysports.org'],
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'REVIEW_REQUIRED',
      primaryDomain: 'rivercitysports.org',
      reasons: ['OWNER_ACCOUNT_MISSING'],
    }));
  });
});
