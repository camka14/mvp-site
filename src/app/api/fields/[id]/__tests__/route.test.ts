/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  fields: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  events: {
    findFirst: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageOrganizationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageOrganization: (...args: any[]) => canManageOrganizationMock(...args),
}));

import { PATCH } from '@/app/api/fields/[id]/route';

const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/fields/field_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('PATCH /api/fields/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageOrganizationMock.mockResolvedValue(true);
  });

  it('rejects immutable organization ownership updates', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
    });

    const response = await PATCH(
      patchRequest({
        field: {
          organizationId: 'org_2',
          name: 'Court A',
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Immutable field fields cannot be updated.',
      fields: ['organizationId'],
    });
    expect(prismaMock.fields.update).not.toHaveBeenCalled();
  });

  it('updates mutable field properties', async () => {
    prismaMock.fields.findUnique.mockResolvedValueOnce({
      id: 'field_1',
      organizationId: null,
      createdBy: 'user_1',
    });
    prismaMock.fields.update.mockResolvedValueOnce({
      id: 'field_1',
      name: 'Court A',
      organizationId: null,
      rentalSlotIds: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const response = await PATCH(
      patchRequest({
        field: {
          name: 'Court A',
        },
      }),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.fields.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.fields.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'field_1' },
        data: expect.objectContaining({
          name: 'Court A',
          updatedAt: expect.any(Date),
        }),
      }),
    );
    const json = await response.json();
    expect(json.$id).toBe('field_1');
  });
});
