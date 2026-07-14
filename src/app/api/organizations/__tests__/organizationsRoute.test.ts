/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const facilitiesFindManyMock = jest.fn();
const organizationTagsFindManyMock = jest.fn();
const organizationTagAssignmentsFindManyMock = jest.fn();
const createMock = jest.fn();
const authUserFindUniqueMock = jest.fn();
const staffMembersFindManyMock = jest.fn();
const productsFindManyMock = jest.fn();
const prismaMock = {
  authUser: {
    findUnique: (...args: any[]) => authUserFindUniqueMock(...args),
  },
  facilities: {
    findMany: (...args: any[]) => facilitiesFindManyMock(...args),
  },
  organizationTags: {
    findMany: (...args: any[]) => organizationTagsFindManyMock(...args),
  },
  organizationTagAssignments: {
    findMany: (...args: any[]) => organizationTagAssignmentsFindManyMock(...args),
  },
  staffMembers: {
    findMany: (...args: any[]) => staffMembersFindManyMock(...args),
  },
  organizations: {
    findMany: (...args: any[]) => findManyMock(...args),
    create: (...args: any[]) => createMock(...args),
  },
  products: {
    findMany: (...args: any[]) => productsFindManyMock(...args),
  },
};

const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));
const requireSessionMock = jest.fn();
const sendAdminOrganizationCreatedNotificationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
}));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminOrganizationCreatedNotification: (...args: any[]) => sendAdminOrganizationCreatedNotificationMock(...args),
}));

import { GET as organizationsGet, POST as organizationsPost } from '@/app/api/organizations/route';

const ORIGIN_ENV_KEYS = ['PUBLIC_WEB_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_WEB_BASE_URL'] as const;

const clearOriginEnv = () => {
  for (const key of ORIGIN_ENV_KEYS) {
    delete process.env[key];
  }
};

describe('/api/organizations', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearOriginEnv();
    jest.clearAllMocks();
    authUserFindUniqueMock.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z') });
    organizationTagsFindManyMock.mockResolvedValue([]);
    organizationTagAssignmentsFindManyMock.mockResolvedValue([]);
    staffMembersFindManyMock.mockResolvedValue([]);
    productsFindManyMock.mockResolvedValue([]);
    sendAdminOrganizationCreatedNotificationMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('supports query mode with relevance-ranked results', async () => {
    findManyMock.mockResolvedValue([
      { id: 'org_5', name: 'Community Club', location: 'Indoor soccer district', description: null },
      { id: 'org_4', name: 'Playindoor', location: null, description: null },
      { id: 'org_3', name: 'The Indoor Arena', location: null, description: null },
      { id: 'org_2', name: 'Indoor Soccer Arena', location: null, description: null },
      { id: 'org_1', name: 'Indoor', location: null, description: null },
    ]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?query=indoor&limit=4'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { status: 'LISTED' },
          { OR: expect.any(Array) },
        ],
      },
      take: 40,
    }));
    expect(json.organizations.map((organization: any) => organization.name)).toEqual([
      'Indoor',
      'Indoor Soccer Arena',
      'The Indoor Arena',
      'Playindoor',
    ]);
  });

  it('keeps default list mode when query is absent', async () => {
    findManyMock.mockResolvedValue([]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?limit=25'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { status: 'LISTED' },
      take: 26,
      skip: 0,
      orderBy: { name: 'asc' },
    });
    expect(json.organizations).toEqual([]);
    expect(json.pagination).toEqual({
      limit: 25,
      offset: 0,
      nextOffset: 0,
      hasMore: false,
    });
  });

  it('filters discover organization lists by curated system tag slugs', async () => {
    organizationTagsFindManyMock.mockResolvedValueOnce([{ id: 'tag_facility' }]);
    organizationTagAssignmentsFindManyMock
      .mockResolvedValueOnce([
        { organizationId: 'org_facility' },
        { organizationId: 'org_facility' },
      ])
      .mockResolvedValueOnce([]);
    findManyMock.mockResolvedValue([
      { id: 'org_facility', name: 'Facility Org', status: 'LISTED' },
    ]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?tags=facility&limit=25'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(organizationTagsFindManyMock).toHaveBeenCalledWith({
      where: {
        slug: { in: ['facility'] },
        isSystem: true,
      },
      select: { id: true },
    });
    expect(organizationTagAssignmentsFindManyMock).toHaveBeenNthCalledWith(1, {
      where: { tagId: { in: ['tag_facility'] } },
      select: { organizationId: true },
    });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { status: 'LISTED' },
          { id: { in: ['org_facility'] } },
        ],
      },
    }));
    expect(json.organizations).toEqual([
      expect.objectContaining({ $id: 'org_facility', name: 'Facility Org' }),
    ]);
  });

  it('can include private organizations that have active affiliate rental facilities', async () => {
    facilitiesFindManyMock.mockResolvedValueOnce([
      { organizationId: 'org_affiliate_rental' },
      { organizationId: 'org_affiliate_rental' },
    ]);
    facilitiesFindManyMock.mockResolvedValueOnce([
      {
        id: 'facility_affiliate',
        organizationId: 'org_affiliate_rental',
        name: 'Affiliate Rental Court',
        location: 'Gresham, OR',
        coordinates: [-122.4314, 45.5001],
        status: 'ACTIVE',
        affiliateUrl: 'https://example.com/book',
      },
    ]);
    findManyMock.mockResolvedValue([
      { id: 'org_affiliate_rental', name: 'Affiliate Rental Org', status: 'UNLISTED' },
    ]);

    const res = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?limit=25&includeAffiliateRentals=true',
    ));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(facilitiesFindManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        affiliateUrl: { not: null },
        status: 'ACTIVE',
      },
      select: { organizationId: true },
    });
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: 'LISTED' },
          { id: { in: ['org_affiliate_rental'] } },
        ],
      },
      take: 26,
      skip: 0,
      orderBy: { name: 'asc' },
    });
    expect(facilitiesFindManyMock).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: { in: ['org_affiliate_rental'] },
        affiliateUrl: { not: null },
        status: 'ACTIVE',
      },
      orderBy: { name: 'asc' },
    });
    expect(json.organizations).toEqual([
      expect.objectContaining({
        $id: 'org_affiliate_rental',
        logoUrl: 'http://localhost/api/avatars/initials?name=Affiliate%20Rental%20Org&size=96&format=png',
        imageUrl: 'http://localhost/api/avatars/initials?name=Affiliate%20Rental%20Org&size=96&format=png',
        status: 'UNLISTED',
        facilities: [
          expect.objectContaining({
            $id: 'facility_affiliate',
            name: 'Affiliate Rental Court',
            coordinates: [-122.4314, 45.5001],
            affiliateUrl: 'https://example.com/book',
          }),
        ],
      }),
    ]);
  });

  it('keeps unlisted organizations available for the authenticated owner management list', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    findManyMock.mockResolvedValue([
      { id: 'org_hidden', name: 'Demo Org', ownerId: 'owner_1', status: 'UNLISTED', productIds: ['legacy_only'] },
    ]);
    productsFindManyMock.mockResolvedValue([
      { id: 'product_current', organizationId: 'org_hidden' },
    ]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?ownerId=owner_1&limit=25'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { ownerId: 'owner_1' },
      take: 26,
      skip: 0,
      orderBy: { name: 'asc' },
    });
    expect(json.organizations).toEqual([
      expect.objectContaining({
        $id: 'org_hidden',
        status: 'UNLISTED',
        productIds: ['product_current'],
      }),
    ]);
    expect(productsFindManyMock).toHaveBeenCalledTimes(1);
  });

  it('rejects anonymous owner-scoped organization lists before querying organizations', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const response = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?ownerId=owner_1&limit=25',
    ));

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user who requests another owner\'s private organization list', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });

    const response = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?ownerId=owner_1&limit=25',
    ));

    expect(response.status).toBe(403);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('rejects anonymous organization ID lookups before querying organizations', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const response = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?ids=org_hidden&limit=25',
    ));

    expect(response.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('allows an authenticated ID lookup while returning only the public organization projection', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'viewer_1', isAdmin: false });
    findManyMock.mockResolvedValue([{
      id: 'org_hidden',
      name: 'Hidden Organization',
      ownerId: 'owner_1',
      status: 'UNLISTED',
      hasStripeAccount: true,
      verificationReviewNotes: 'Internal review note',
    }]);

    const response = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?ids=org_hidden&limit=25',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['org_hidden'] } },
    }));
    expect(payload.organizations[0]).toEqual(expect.objectContaining({
      $id: 'org_hidden',
      name: 'Hidden Organization',
      status: 'UNLISTED',
    }));
    expect(payload.organizations[0]).not.toHaveProperty('ownerId');
    expect(payload.organizations[0]).not.toHaveProperty('hasStripeAccount');
    expect(payload.organizations[0]).not.toHaveProperty('verificationReviewNotes');
    expect(payload.organizations[0]).not.toHaveProperty('productIds');
  });

  it('allows a pending staff invitee to resolve an unlisted organization by ID without exposing internal fields', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'invitee_1', isAdmin: false });
    findManyMock.mockResolvedValue([{
      id: 'org_hidden',
      name: 'Hidden Organization',
      ownerId: 'owner_1',
      status: 'UNLISTED',
      hasStripeAccount: true,
      verificationReviewNotes: 'Internal review note',
      taxResponsibilityAcceptedByUserId: 'owner_1',
      embedAllowedDomains: ['internal.example.com'],
    }]);

    const response = await organizationsGet(new NextRequest(
      'http://localhost/api/organizations?ids=org_hidden&limit=25',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organizations).toEqual([
      expect.objectContaining({
        $id: 'org_hidden',
        name: 'Hidden Organization',
        status: 'UNLISTED',
      }),
    ]);
    expect(payload.organizations[0]).not.toHaveProperty('ownerId');
    expect(payload.organizations[0]).not.toHaveProperty('hasStripeAccount');
    expect(payload.organizations[0]).not.toHaveProperty('verificationReviewNotes');
    expect(payload.organizations[0]).not.toHaveProperty('taxResponsibilityAcceptedByUserId');
    expect(payload.organizations[0]).not.toHaveProperty('embedAllowedDomains');
  });

  it('returns an anonymous listed discovery result without internal organization fields', async () => {
    findManyMock.mockResolvedValue([{
      id: 'org_public',
      name: 'Public Organization',
      status: 'LISTED',
      ownerId: 'owner_1',
      hasStripeAccount: true,
      verificationReviewNotes: 'Internal review note',
      taxResponsibilityAcceptedByUserId: 'owner_1',
      embedAllowedDomains: ['internal.example.com'],
    }]);

    const response = await organizationsGet(new NextRequest('http://localhost/api/organizations?limit=25'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organizations).toEqual([
      expect.objectContaining({ $id: 'org_public', name: 'Public Organization', status: 'LISTED' }),
    ]);
    expect(payload.organizations[0]).not.toHaveProperty('ownerId');
    expect(payload.organizations[0]).not.toHaveProperty('hasStripeAccount');
    expect(payload.organizations[0]).not.toHaveProperty('verificationReviewNotes');
    expect(payload.organizations[0]).not.toHaveProperty('taxResponsibilityAcceptedByUserId');
    expect(payload.organizations[0]).not.toHaveProperty('embedAllowedDomains');
  });

  it('ignores client hasStripeAccount and derived productIds values when creating organizations', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    createMock.mockResolvedValue({
      id: 'org_1',
      name: 'New Org',
      ownerId: 'user_1',
      hasStripeAccount: false,
    });

    const response = await organizationsPost(new NextRequest('http://localhost/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        hasStripeAccount: true,
        productIds: ['legacy_only'],
        status: 'UNLISTED',
        taxResponsibilityAgreementAccepted: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        status: 'UNLISTED',
        hasStripeAccount: false,
        taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
        operatesAthleticFacility: false,
        defaultEventTaxHandling: 'STRIPE_TAX',
        defaultRentalTaxHandling: 'STRIPE_TAX',
        taxResponsibilityAcceptedAt: expect.any(Date),
        taxResponsibilityAcceptedByUserId: 'user_1',
        taxResponsibilityAgreementVersion: '2026-05-07',
      }),
    });
    expect(sendAdminOrganizationCreatedNotificationMock).toHaveBeenCalledWith({
      organization: expect.objectContaining({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
      }),
      baseUrl: 'http://localhost',
    });
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('productIds');
    expect(payload.hasStripeAccount).toBe(false);
    expect(payload.productIds).toEqual([]);
  });

  it('uses the canonical origin for creation notifications when request host headers are hostile', async () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://bracket-iq.com';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    createMock.mockResolvedValue({
      id: 'org_1',
      name: 'New Org',
      ownerId: 'user_1',
      hasStripeAccount: false,
    });

    const response = await organizationsPost(new NextRequest('https://internal.service.local/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        taxResponsibilityAgreementAccepted: true,
      }),
      headers: {
        'content-type': 'application/json',
        host: 'poisoned-host.example.com',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'attacker.example.com',
      },
    }));

    expect(response.status).toBe(201);
    expect(sendAdminOrganizationCreatedNotificationMock).toHaveBeenCalledWith({
      organization: expect.objectContaining({ id: 'org_1' }),
      baseUrl: 'https://bracket-iq.com',
    });
    expect(JSON.stringify(sendAdminOrganizationCreatedNotificationMock.mock.calls)).not.toContain('attacker.example.com');
    expect(JSON.stringify(sendAdminOrganizationCreatedNotificationMock.mock.calls)).not.toContain('poisoned-host.example.com');
  });

  it('fails closed when Prisma rejects a requested organization field', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    createMock.mockRejectedValueOnce(
      new Error('Unknown argument `defaultEventTaxHandling` for type OrganizationsCreateInput.'),
    );

    const response = await organizationsPost(new NextRequest('http://localhost/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        taxResponsibilityAgreementAccepted: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ defaultEventTaxHandling: 'STRIPE_TAX' }),
    }));
    expect(sendAdminOrganizationCreatedNotificationMock).not.toHaveBeenCalled();
    expect(payload).toEqual(expect.objectContaining({
      code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH',
      field: 'defaultEventTaxHandling',
    }));
  });

  it('blocks organization creation when the session user has not verified email', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    authUserFindUniqueMock.mockResolvedValueOnce({ emailVerifiedAt: null });

    const response = await organizationsPost(new NextRequest('http://localhost/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        taxResponsibilityAgreementAccepted: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Verify your email before creating an organization.',
    }));
    expect(createMock).not.toHaveBeenCalled();
  });

  it('requires the organization tax responsibility agreement on create', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });

    const response = await organizationsPost(new NextRequest('http://localhost/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('tax responsibility agreement');
    expect(createMock).not.toHaveBeenCalled();
  });
});
