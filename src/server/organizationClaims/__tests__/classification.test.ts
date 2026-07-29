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

  it('makes an affiliate organization claimable when provenance is direct', () => {
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
      reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
    });
  });

  it('does not infer ownership from a preexisting non-admin owner ID', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: false,
      externalManagementUserIds: [],
      directRegistrableDomains: ['club.example'],
    })).toEqual(expect.objectContaining({
      originType: 'AFFILIATE_IMPORTED',
      ownershipStatus: 'UNCLAIMED',
      legacyClaimMethod: null,
      reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
    }));
  });

  it('does not make existing management rows a substitute for claiming', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: true,
      externalManagementUserIds: ['user_2'],
      directRegistrableDomains: ['rivercitysports.org'],
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'UNCLAIMED',
      reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
    }));
  });

  it.each([
    [[]],
    [['rivercitysports.org', 'different-club.org']],
  ])('keeps ambiguous domain provenance unclaimed', (domains) => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: true,
      ownerIsRazumlyAdmin: true,
      externalManagementUserIds: [],
      directRegistrableDomains: domains,
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'UNCLAIMED',
      primaryDomain: null,
      reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
    }));
  });

  it('keeps the profile unclaimed when the recorded owner account is unavailable', () => {
    expect(classifyOrganizationClaimState({
      isAffiliate: true,
      ownerAccountExists: false,
      ownerIsRazumlyAdmin: false,
      externalManagementUserIds: [],
      directRegistrableDomains: ['rivercitysports.org'],
    })).toEqual(expect.objectContaining({
      ownershipStatus: 'UNCLAIMED',
      primaryDomain: 'rivercitysports.org',
      reasons: ['AFFILIATE_PROFILE_DEFAULT_UNCLAIMED'],
    }));
  });
});
