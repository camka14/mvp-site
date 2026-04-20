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
  fields: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
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
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
  });

  it('returns viewerCanAccessUsers=false for signed-in outsiders', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      hostIds: [],
      officialIds: [],
      name: 'Test Org',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerCanManageOrganization).toBe(false);
    expect(payload.viewerCanAccessUsers).toBe(false);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
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
      hostIds: [],
      officialIds: [],
      name: 'Test Org',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.viewerCanManageOrganization).toBe(true);
    expect(payload.viewerCanAccessUsers).toBe(true);
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalled();
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
