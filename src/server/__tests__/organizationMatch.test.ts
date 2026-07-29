/** @jest-environment node */

import {
  assertOrganizationCreationAllowed,
  findOrganizationMatches,
  OrganizationMatchError,
} from '@/server/organizationMatch';

const makeClient = () => ({
  organizationDomains: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  affiliateImportCandidates: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  affiliateScrapeSources: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  organizations: {
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const organizationRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'org_existing',
  name: 'River City Sports Club',
  location: 'Portland, OR',
  logoId: 'logo_1',
  website: 'https://rivercitysports.com/',
  coordinates: [-122.6765, 45.5231],
  publicSlug: null,
  publicPageEnabled: false,
  originType: 'AFFILIATE_IMPORTED',
  ownershipStatus: 'UNCLAIMED',
  claimVerificationLevel: 'NONE',
  ...overrides,
});

describe('organization matching', () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeAll(() => {
    process.env.AUTH_SECRET = 'organization-match-test-secret';
  });

  afterAll(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it('returns a privacy-safe exact match for an unlisted affiliate profile and recommends claiming it', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://rivercitysports.com/',
      host: 'rivercitysports.com',
      registrableDomain: 'rivercitysports.com',
      isPrimary: true,
      isSharedPlatform: false,
      verifiedAt: null,
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({ publicPageEnabled: false }),
    ]);

    const result = await findOrganizationMatches({
      name: 'River City Sports Club',
      website: 'rivercitysports.com',
      location: 'Portland, Oregon',
    }, { userId: 'user_1' }, client as any);

    expect(result.matches).toEqual([
      expect.objectContaining({
        organizationId: 'org_existing',
        name: 'River City Sports Club',
        approximateLocation: 'Portland, OR',
        confidence: 'EXACT',
        ownershipStatus: 'UNCLAIMED',
        recommendedAction: 'CLAIM_PROFILE',
        availableActions: ['CLAIM_PROFILE', 'OPEN_PROFILE'],
        blocksCreation: true,
      }),
    ]);
    expect(result.matches[0]).not.toHaveProperty('ownerId');
    expect(result.matches[0]).not.toHaveProperty('address');
    expect(result.matches[0]).not.toHaveProperty('description');
    expect(result.matches[0]).not.toHaveProperty('staff');
    expect(result.canContinue).toBe(false);
  });

  it('offers profile, transfer, and dispute paths for an already claimed exact match', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://rivercitysports.com/',
      host: 'rivercitysports.com',
      registrableDomain: 'rivercitysports.com',
      isPrimary: true,
      isSharedPlatform: false,
      verifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({
        ownershipStatus: 'CLAIMED',
        claimVerificationLevel: 'SITE_CONTROL',
      }),
    ]);

    const result = await findOrganizationMatches({
      name: 'River City Sports Club',
      website: 'https://rivercitysports.com',
      location: 'Portland, OR',
    }, { userId: 'user_1' }, client as any);

    expect(result.matches[0]).toEqual(expect.objectContaining({
      ownershipStatus: 'CLAIMED',
      recommendedAction: 'OPEN_PROFILE',
      availableActions: [
        'OPEN_PROFILE',
        'REQUEST_OWNERSHIP_TRANSFER',
        'REPORT_OWNERSHIP_ISSUE',
      ],
    }));
  });

  it('does not treat a shared-platform domain as an exact match by itself', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://www.facebook.com/river-city-sports',
      host: 'facebook.com',
      registrableDomain: 'facebook.com',
      isPrimary: true,
      isSharedPlatform: true,
      verifiedAt: null,
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({
        name: 'River City Sports Club',
        website: 'https://www.facebook.com/river-city-sports',
      }),
    ]);

    const result = await findOrganizationMatches({
      name: 'Northside Soccer',
      website: 'https://facebook.com/northside-soccer',
      location: 'Seattle, WA',
    }, { userId: 'user_1' }, client as any);

    expect(result.matches[0]).toEqual(expect.objectContaining({
      confidence: 'RELATED',
      blocksCreation: false,
      reasonCodes: expect.arrayContaining([
        'REGISTRABLE_DOMAIN_MATCH',
        'SHARED_PLATFORM_DOMAIN',
      ]),
    }));
  });

  it('blocks a distinct-looking profile from reusing a domain verified for another organization', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://parentclub.com/portland',
      host: 'parentclub.com',
      registrableDomain: 'parentclub.com',
      isPrimary: true,
      isSharedPlatform: false,
      verifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({
        name: 'Parent Club Seattle',
        website: 'https://parentclub.com/seattle',
        location: 'Seattle, WA',
      }),
    ]);

    const result = await findOrganizationMatches({
      name: 'Parent Club Portland',
      website: 'https://parentclub.com/portland-program',
      location: 'Portland, OR',
    }, { userId: 'user_1' }, client as any);

    expect(result.matches[0]).toEqual(expect.objectContaining({
      confidence: 'RELATED',
      blocksCreation: true,
      reasonCodes: expect.arrayContaining(['VERIFIED_DOMAIN_CONFLICT']),
    }));
  });

  it('uses affiliate candidate name and location evidence for an exact match without a website', async () => {
    const client = makeClient();
    client.affiliateImportCandidates.findMany.mockResolvedValue([{
      publishedOrganizationId: 'org_existing',
      title: 'River City Sports Club',
      organizerName: 'River City Sports Club',
      city: 'Portland',
      address: 'Portland, OR',
      officialActionUrl: 'https://register.example.com/river-city',
      sourceUrl: 'https://directory.example.com/river-city',
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({ website: null, location: 'Portland, OR' }),
    ]);

    const result = await findOrganizationMatches({
      name: 'River City Sports Club, LLC',
      location: 'Portland, OR',
    }, { userId: 'user_1' }, client as any);

    expect(result.matches[0]).toEqual(expect.objectContaining({
      confidence: 'EXACT',
      reasonCodes: expect.arrayContaining([
        'NORMALIZED_NAME_MATCH',
        'LOCATION_MATCH',
        'AFFILIATE_SOURCE_MATCH',
      ]),
    }));
  });

  it('requires soft matches to be acknowledged in a current signed token', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://parentclub.com/seattle',
      host: 'parentclub.com',
      registrableDomain: 'parentclub.com',
      isPrimary: true,
      isSharedPlatform: false,
      verifiedAt: null,
    }]);
    client.organizations.findMany.mockResolvedValue([
      organizationRow({
        name: 'Parent Club Seattle',
        website: 'https://parentclub.com/seattle',
        location: 'Seattle, WA',
      }),
    ]);
    const input = {
      name: 'Parent Club Portland',
      website: 'https://parentclub.com/portland',
      location: 'Portland, OR',
    };
    const initial = await findOrganizationMatches(input, { userId: 'user_1' }, client as any);

    await expect(assertOrganizationCreationAllowed({
      ...input,
      organizationMatchToken: initial.matchToken,
    }, { userId: 'user_1' }, client as any)).rejects.toEqual(expect.objectContaining({
      code: 'ORGANIZATION_MATCH_ACKNOWLEDGEMENT_REQUIRED',
    }));

    const acknowledged = await findOrganizationMatches({
      ...input,
      acknowledgedMatchIds: ['org_existing'],
    }, { userId: 'user_1' }, client as any);
    await expect(assertOrganizationCreationAllowed({
      ...input,
      organizationMatchToken: acknowledged.matchToken,
      acknowledgedMatchIds: ['org_existing'],
    }, { userId: 'user_1' }, client as any)).resolves.toEqual(expect.objectContaining({
      canContinue: true,
      acknowledgedMatchIds: ['org_existing'],
    }));
  });

  it('rejects stale or cross-input match tokens', async () => {
    const client = makeClient();
    const initial = await findOrganizationMatches({
      name: 'New Portland Club',
      location: 'Portland, OR',
    }, { userId: 'user_1' }, client as any);

    await expect(assertOrganizationCreationAllowed({
      name: 'Different Portland Club',
      location: 'Portland, OR',
      organizationMatchToken: initial.matchToken,
    }, { userId: 'user_1' }, client as any)).rejects.toBeInstanceOf(OrganizationMatchError);
    await expect(assertOrganizationCreationAllowed({
      name: 'New Portland Club',
      location: 'Portland, OR',
      organizationMatchToken: initial.matchToken,
    }, { userId: 'user_2' }, client as any)).rejects.toEqual(expect.objectContaining({
      code: 'ORGANIZATION_MATCH_REQUIRED',
    }));
  });

  it('allows a reviewed administrator override only with a meaningful reason', async () => {
    const client = makeClient();
    client.organizationDomains.findMany.mockResolvedValue([{
      organizationId: 'org_existing',
      url: 'https://rivercitysports.com/',
      host: 'rivercitysports.com',
      registrableDomain: 'rivercitysports.com',
      isPrimary: true,
      isSharedPlatform: false,
      verifiedAt: null,
    }]);
    client.organizations.findMany.mockResolvedValue([organizationRow()]);

    await expect(assertOrganizationCreationAllowed({
      name: 'River City Sports Club',
      website: 'https://rivercitysports.com',
      location: 'Portland, OR',
      organizationMatchOverrideReason: 'Confirmed distinct legal program after manual review.',
    }, { userId: 'admin_1', isAdmin: true }, client as any)).resolves.toEqual(expect.objectContaining({
      overrideReason: 'Confirmed distinct legal program after manual review.',
    }));
  });
});
