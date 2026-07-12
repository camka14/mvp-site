/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  fields: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  facilities: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  organizations: {
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

import { GET, POST } from '@/app/api/fields/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('field routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.facilities.findFirst.mockResolvedValue({
      id: 'facility_org_1',
      organizationId: 'org_1',
      name: 'Test',
      isDefault: true,
    });
    prismaMock.facilities.findUnique.mockResolvedValue(null);
    prismaMock.facilities.findMany.mockResolvedValue([]);
    prismaMock.facilities.create.mockResolvedValue({
      id: 'facility_org_1',
      organizationId: 'org_1',
      name: 'Test',
      isDefault: true,
    });
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
  });

  it('creates a field for an organization when owner', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });

    prismaMock.fields.create.mockResolvedValue({
      id: 'field_1',
      name: 'Court A',
      location: null,
      lat: null,
      long: null,
      heading: null,
      inUse: null,
      organizationId: 'org_1',
      facilityId: 'facility_org_1',
      divisions: [],
      rentalSlotIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await POST(jsonRequest({
      id: 'field_1',
      name: 'Court A',
      organizationId: 'org_1',
      sportIds: ['Basketball', 'Indoor Soccer', 'Basketball', ''],
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.$id).toBe('field_1');
    expect(prismaMock.fields.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org_1',
          facilityId: 'facility_org_1',
          sportIds: ['Basketball', 'Indoor Soccer'],
        }),
      }),
    );
  });

  it('rejects field creation when the provided facility is outside the organization', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.facilities.findFirst.mockResolvedValueOnce(null);

    const res = await POST(jsonRequest({
      id: 'field_1',
      name: 'Court A',
      organizationId: 'org_1',
      facilityId: 'facility_other',
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Facility not found for organization');
    expect(prismaMock.fields.create).not.toHaveBeenCalled();
  });

  it('rejects field creation with a typed location but no selected coordinates', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });

    const res = await POST(jsonRequest({
      id: 'field_1',
      name: 'Court A',
      location: 'Main Gym',
      organizationId: 'org_1',
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Resource location must be selected from suggestions or the map');
    expect(prismaMock.organizations.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.fields.create).not.toHaveBeenCalled();
  });

  it('creates a field with a selected resource location', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.fields.create.mockResolvedValue({
      id: 'field_1',
      name: 'Court A',
      location: 'Main Gym',
      lat: 45.582,
      long: -122.353,
      heading: null,
      inUse: null,
      organizationId: 'org_1',
      facilityId: 'facility_org_1',
      divisions: [],
      rentalSlotIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(jsonRequest({
      id: 'field_1',
      name: 'Court A',
      location: 'Main Gym',
      lat: 45.582,
      long: -122.353,
      organizationId: 'org_1',
    }));

    expect(res.status).toBe(201);
    expect(prismaMock.fields.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: 'Main Gym',
          lat: 45.582,
          long: -122.353,
        }),
      }),
    );
  });

  it('rejects field creation for non-owners when organization is provided', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_2', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });

    const res = await POST(jsonRequest({ id: 'field_1', organizationId: 'org_1' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(prismaMock.fields.create).not.toHaveBeenCalled();
  });

  it('returns facility metadata with listed fields', async () => {
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Court A',
        organizationId: 'org_1',
        facilityId: 'facility_org_1',
        rentalSlotIds: [],
      },
    ]);
    prismaMock.facilities.findMany.mockResolvedValue([
      {
        id: 'facility_org_1',
        organizationId: 'org_1',
        name: 'River City Sports Complex',
      },
    ]);

    const res = await GET(new NextRequest('http://localhost/api/fields?ids=field_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.facilities.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['facility_org_1'] } },
    });
    expect(json.fields[0].$id).toBe('field_1');
    expect(json.fields[0].facility).toMatchObject({
      $id: 'facility_org_1',
      name: 'River City Sports Complex',
    });
  });

  it('filters fields by sport ids', async () => {
    prismaMock.fields.findMany.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost/api/fields?organizationId=org_1&sportId=Basketball&sportIds=Indoor%20Soccer,Pickleball'));

    expect(res.status).toBe(200);
    expect(prismaMock.fields.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          organizationId: 'org_1',
          sportIds: { hasSome: ['Basketball', 'Indoor Soccer', 'Pickleball'] },
        },
        take: 101,
        skip: 0,
      }),
    );
  });

  it('rejects an anonymous unscoped fields request before querying inventory', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const response = await GET(new NextRequest('http://localhost/api/fields'));

    expect(response.status).toBe(401);
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
  });

  it('rejects anonymous field ID hydration outside a public organization scope', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const response = await GET(new NextRequest('http://localhost/api/fields?ids=field_private'));

    expect(response.status).toBe(401);
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
  });

  it('does not treat public-page flags as anonymous access to an unlisted organization', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_unlisted',
      status: 'UNLISTED',
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
    });
    prismaMock.facilities.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/fields?organizationId=org_unlisted'));

    expect(response.status).toBe(404);
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
    expect(prismaMock.facilities.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_unlisted',
        status: 'ACTIVE',
        affiliateUrl: { not: null },
      },
      select: { id: true, affiliateUrl: true },
    });
  });

  it('limits the documented anonymous affiliate exception to affiliate-facility fields', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_affiliate', status: 'UNLISTED' });
    prismaMock.facilities.findMany
      .mockResolvedValueOnce([{ id: 'facility_affiliate', affiliateUrl: 'https://partner.example.com' }])
      .mockResolvedValueOnce([{ id: 'facility_affiliate', name: 'Partner Facility' }]);
    prismaMock.fields.findMany.mockResolvedValueOnce([{
      id: 'field_affiliate',
      facilityId: 'facility_affiliate',
      name: 'Partner Court',
      rentalSlotIds: [],
    }]);

    const response = await GET(new NextRequest('http://localhost/api/fields?organizationId=org_affiliate'));

    expect(response.status).toBe(200);
    expect(prismaMock.fields.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        archivedAt: null,
        organizationId: 'org_affiliate',
        facilityId: { in: ['facility_affiliate'] },
      },
    }));
  });

  it('returns a capped public projection for anonymous listed-organization discovery', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));
    prismaMock.organizations.findUnique.mockResolvedValue({ id: 'org_public', status: 'LISTED' });
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_public',
        name: 'Court A',
        location: 'River City',
        lat: 45.52,
        long: -122.67,
        inUse: true,
        organizationId: 'org_public',
        createdBy: 'owner_1',
        facilityId: 'facility_public',
        rentalSlotIds: ['slot_public'],
        sportIds: ['Volleyball'],
      },
    ]);
    prismaMock.facilities.findMany.mockResolvedValue([
      {
        id: 'facility_public',
        organizationId: 'org_public',
        name: 'River City Sports Complex',
        location: 'River City',
        address: '123 Main St',
        operatingHours: { monday: 'closed' },
        affiliateUrl: 'https://internal.example.com',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/fields?organizationId=org_public&limit=1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.fields.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { archivedAt: null, organizationId: 'org_public' },
      take: 2,
      skip: 0,
    }));
    expect(payload.pagination).toEqual({
      limit: 1,
      offset: 0,
      nextOffset: 1,
      hasMore: false,
    });
    expect(payload.fields[0]).toEqual(expect.objectContaining({
      $id: 'field_public',
      name: 'Court A',
      rentalSlotIds: ['slot_public'],
    }));
    expect(payload.fields[0]).not.toHaveProperty('organizationId');
    expect(payload.fields[0]).not.toHaveProperty('createdAt');
    expect(payload.fields[0]).not.toHaveProperty('updatedAt');
    expect(payload.fields[0]).not.toHaveProperty('createdBy');
    expect(payload.fields[0]).not.toHaveProperty('inUse');
    expect(payload.fields[0].facility).not.toHaveProperty('organizationId');
    expect(payload.fields[0].facility).not.toHaveProperty('operatingHours');
    expect(payload.fields[0].facility).not.toHaveProperty('affiliateUrl');
  });
});
