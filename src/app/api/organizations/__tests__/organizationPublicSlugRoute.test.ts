/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/organizations/public-slug/route';

describe('/api/organizations/public-slug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      hostIds: [],
      officialIds: [],
      publicSlug: null,
    });
  });

  it('returns available for an unused slug', async () => {
    prismaMock.organizations.findFirst.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/organizations/public-slug?slug=south-county-soccer&organizationId=org_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      slug: 'south-county-soccer',
      available: true,
      valid: true,
      current: false,
    });
    expect(prismaMock.organizations.findFirst).toHaveBeenCalledWith({
      where: {
        publicSlug: 'south-county-soccer',
        id: { not: 'org_1' },
      },
      select: { id: true },
    });
  });

  it('returns unavailable for a slug owned by another organization', async () => {
    prismaMock.organizations.findFirst.mockResolvedValue({ id: 'org_2' });

    const response = await GET(new NextRequest('http://localhost/api/organizations/public-slug?slug=south-county-soccer&organizationId=org_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.available).toBe(false);
    expect(payload.valid).toBe(true);
    expect(payload.error).toBe('This public slug is already in use.');
  });

  it('returns current without checking other organizations when the slug is unchanged', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      hostIds: [],
      officialIds: [],
      publicSlug: 'south-county-soccer',
    });

    const response = await GET(new NextRequest('http://localhost/api/organizations/public-slug?slug=south-county-soccer&organizationId=org_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      slug: 'south-county-soccer',
      available: true,
      valid: true,
      current: true,
    });
    expect(prismaMock.organizations.findFirst).not.toHaveBeenCalled();
  });

  it('returns invalid for reserved slugs', async () => {
    const response = await GET(new NextRequest('http://localhost/api/organizations/public-slug?slug=admin&organizationId=org_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.available).toBe(false);
    expect(payload.valid).toBe(false);
    expect(payload.error).toContain('reserved');
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
  });
});
