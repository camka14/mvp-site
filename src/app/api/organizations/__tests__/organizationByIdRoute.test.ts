/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  staffMembers: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  organizationRoles: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  organizationRolePermissions: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET, PATCH } from '@/app/api/organizations/[id]/route';

describe('/api/organizations/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.staffMembers.findMany.mockResolvedValue([]);
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.organizationRoles.findFirst.mockResolvedValue(null);
    prismaMock.organizationRoles.findMany.mockResolvedValue([]);
    prismaMock.organizationRolePermissions.findFirst.mockResolvedValue(null);
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.products.findMany.mockResolvedValue([]);
  });

  it('does not expose an unlisted organization to an anonymous detail request', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Hidden Org',
      status: 'UNLISTED',
      publicPageEnabled: false,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(404);
    expect(prismaMock.staffMembers.findMany).not.toHaveBeenCalled();
  });

  it('returns only the public organization summary to a signed-in outsider', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      hasStripeAccount: true,
      verificationReviewNotes: 'Internal review note',
      taxResponsibilityAcceptedByUserId: 'owner_1',
      embedAllowedDomains: ['internal.example.com'],
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      id: 'org_1',
      name: 'Test Org',
    }));
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('hasStripeAccount');
    expect(payload).not.toHaveProperty('verificationReviewNotes');
    expect(payload).not.toHaveProperty('taxResponsibilityAcceptedByUserId');
    expect(payload).not.toHaveProperty('embedAllowedDomains');
    expect(payload).not.toHaveProperty('staffMembers');
    expect(payload).not.toHaveProperty('productIds');
    expect(payload).not.toHaveProperty('$id');
    expect(prismaMock.staffMembers.findMany).not.toHaveBeenCalled();
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
  });

  it('returns the curated summary for a listed organization when its custom public page is disabled', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Public Org',
      status: 'LISTED',
      publicSlug: 'public-org',
      publicPageEnabled: false,
      hasStripeAccount: true,
      verificationReviewNotes: 'Internal review note',
      taxResponsibilityAcceptedByUserId: 'owner_1',
      embedAllowedDomains: ['internal.example.com'],
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      id: 'org_1',
      name: 'Public Org',
      publicSlug: null,
      publicPageEnabled: false,
    }));
    expect(payload).not.toHaveProperty('$id');
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('hasStripeAccount');
    expect(payload).not.toHaveProperty('verificationReviewNotes');
    expect(payload).not.toHaveProperty('taxResponsibilityAcceptedByUserId');
    expect(payload).not.toHaveProperty('embedAllowedDomains');
    expect(payload).not.toHaveProperty('staffMembers');
    expect(prismaMock.staffMembers.findMany).not.toHaveBeenCalled();
  });

  it('returns full organization management flags for verified razumly admins', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'raz_admin_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'admin@razumly.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      productIds: ['legacy_only'],
    });
    prismaMock.products.findMany.mockResolvedValue([
      { id: 'product_current', organizationId: 'org_1' },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerCanManageOrganization).toBe(true);
    expect(payload.viewerCanAccessUsers).toBe(true);
    expect(payload.productIds).toEqual(['product_current']);
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalled();
  });

  it('returns custom role permissions and staff roster data for staff managers', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'staff_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
    });
    prismaMock.staffMembers.findMany.mockResolvedValue([{
      id: 'staff_member_1',
      organizationId: 'org_1',
      userId: 'staff_1',
      types: ['STAFF'],
      roleId: 'role_1',
    }]);
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      organizationId: 'org_1',
      userId: 'staff_1',
      types: ['STAFF'],
      roleId: 'role_1',
    });
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_1',
      organizationId: 'org_1',
    });
    prismaMock.organizationRolePermissions.findFirst.mockImplementation(async ({ where }: any) => (
      ['staff.manage', 'events.manage'].includes(where.permission)
        ? { permission: where.permission }
        : null
    ));

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerCanManageOrganization).toBe(false);
    expect(payload.viewerPermissions).toEqual(expect.arrayContaining(['staff.manage', 'events.manage']));
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalled();
    expect(payload.staffMembers).toEqual([
      expect.objectContaining({
        userId: 'staff_1',
        role: null,
      }),
    ]);
  });

  it('rejects direct hasStripeAccount patch attempts', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            hasStripeAccount: true,
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Unknown organization patch fields.');
    expect(payload.unknownKeys).toEqual(['hasStripeAccount']);
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });

  it('rejects direct productIds patch attempts without writing the organization', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({ organization: { productIds: ['product_1'] } }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('productIds is derived from products and cannot be updated directly.');
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });

  it('fails closed when Prisma rejects a requested organization patch field', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      publicSlug: null,
    });
    prismaMock.organizations.update.mockRejectedValueOnce(
      new Error('Unknown argument `name` for type OrganizationsUpdateInput.'),
    );

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({ organization: { name: 'Renamed Org' } }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(prismaMock.organizations.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org_1' },
      data: expect.objectContaining({ name: 'Renamed Org' }),
    }));
    expect(payload).toEqual(expect.objectContaining({
      code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH',
      field: 'name',
    }));
  });

  it('normalizes and persists public page settings for organization managers', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });
    prismaMock.organizations.findFirst.mockResolvedValue(null);
    prismaMock.organizations.update.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      publicSlug: 'test-org',
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
      brandPrimaryColor: '#0f766e',
      brandAccentColor: '#f59e0b',
      publicHeadline: 'Play here',
      publicIntroText: 'Find events and rentals.',
      embedAllowedDomains: ['example.com'],
      publicCompletionRedirectUrl: 'https://client.example.com/thanks',
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            publicSlug: ' Test-Org ',
            publicPageEnabled: true,
            publicWidgetsEnabled: true,
            brandPrimaryColor: '#0F766E',
            brandAccentColor: '#F59E0B',
            publicHeadline: ' Play here ',
            publicIntroText: ' Find events and rentals. ',
            embedAllowedDomains: ['https://example.com/path'],
            publicCompletionRedirectUrl: ' https://client.example.com/thanks ',
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organizations.findFirst).toHaveBeenCalledWith({
      where: {
        publicSlug: 'test-org',
        id: { not: 'org_1' },
      },
      select: { id: true },
    });
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org_1' },
      data: expect.objectContaining({
        publicSlug: 'test-org',
        publicPageEnabled: true,
        publicWidgetsEnabled: true,
        brandPrimaryColor: '#0f766e',
        brandAccentColor: '#f59e0b',
        publicHeadline: 'Play here',
        publicIntroText: 'Find events and rentals.',
        embedAllowedDomains: ['example.com'],
        publicCompletionRedirectUrl: 'https://client.example.com/thanks',
      }),
    }));
  });

  it('allows organization managers to mark an organization unlisted', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });
    prismaMock.organizations.update.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      status: 'UNLISTED',
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            status: 'unlisted',
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('UNLISTED');
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org_1' },
      data: expect.objectContaining({
        status: 'UNLISTED',
      }),
    }));
  });

  it('rejects invalid organization status values', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            status: 'hidden',
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('LISTED or UNLISTED');
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });

  it('normalizes tax settings and stamps the tax responsibility agreement', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
      taxResponsibilityAcceptedAt: null,
    });
    prismaMock.organizations.update.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      name: 'Test Org',
      taxOrganizationType: 'FACILITY_OPERATOR',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
      defaultRentalTaxHandling: 'STRIPE_TAX',
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            taxOrganizationType: 'facility operator',
            operatesAthleticFacility: true,
            defaultEventTaxHandling: 'exempt participant sports',
            defaultRentalTaxHandling: 'stripe tax',
            taxResponsibilityAgreementAccepted: true,
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'org_1' },
      data: expect.objectContaining({
        taxOrganizationType: 'FACILITY_OPERATOR',
        operatesAthleticFacility: true,
        defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
        defaultRentalTaxHandling: 'STRIPE_TAX',
        taxResponsibilityAcceptedAt: expect.any(Date),
        taxResponsibilityAcceptedByUserId: 'owner_1',
        taxResponsibilityAgreementVersion: '2026-05-07',
      }),
    }));
  });

  it('rejects invalid public completion redirect URLs', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            publicCompletionRedirectUrl: 'javascript:alert(1)',
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('http or https');
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });

  it('rejects reserved public slugs', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      publicSlug: null,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1', {
        method: 'PATCH',
        body: JSON.stringify({
          organization: {
            publicSlug: 'admin',
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('reserved');
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });
});
