/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  fields: {
    create: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/fields/route';

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('field routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  });

  it('creates a field and links it to an organization when owner', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      fieldIds: ['field_existing'],
    });

    prismaMock.fields.create.mockResolvedValue({
      id: 'field_1',
      name: 'Court A',
      type: 'INDOOR',
      location: null,
      lat: null,
      long: null,
      fieldNumber: 1,
      heading: null,
      inUse: null,
      organizationId: 'org_1',
      divisions: [],
      rentalSlotIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.organizations.update.mockResolvedValue({ id: 'org_1' });

    const res = await POST(jsonRequest({ id: 'field_1', name: 'Court A', fieldNumber: 1, organizationId: 'org_1' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.$id).toBe('field_1');
    expect(prismaMock.fields.create).toHaveBeenCalled();
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
        data: expect.objectContaining({ fieldIds: ['field_existing', 'field_1'] }),
      }),
    );
  });

  it('rejects field creation for non-owners when organization is provided', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_2', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      fieldIds: [],
    });

    const res = await POST(jsonRequest({ id: 'field_1', fieldNumber: 1, organizationId: 'org_1' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(prismaMock.fields.create).not.toHaveBeenCalled();
    expect(prismaMock.organizations.update).not.toHaveBeenCalled();
  });
});

