/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  userData: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const assertUserAccessMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  requireSession: requireSessionMock,
  assertUserAccess: assertUserAccessMock,
}));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));

import { PATCH as patchUserById } from '@/app/api/users/[id]/route';

const buildJsonRequest = (url: string, body: unknown, method = 'PATCH'): NextRequest => (
  new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
);

describe('PATCH /api/users/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('returns 409 when requested username already exists for a different user', async () => {
    prismaMock.userData.findFirst.mockResolvedValue({ id: 'user_other' });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { userName: 'TakenName' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe('Username already in use.');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });

  it('updates profile when username is available', async () => {
    prismaMock.userData.findFirst.mockResolvedValue(null);
    prismaMock.userData.update.mockResolvedValue({
      id: 'user_1',
      firstName: 'Test',
      lastName: 'User',
      userName: 'updated_name',
    });

    const response = await patchUserById(
      buildJsonRequest('http://localhost/api/users/user_1', { data: { userName: 'updated_name' } }),
      { params: Promise.resolve({ id: 'user_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.user.$id).toBe('user_1');
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({ userName: 'updated_name' }),
    }));
  });
});
