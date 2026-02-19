/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const prismaMock = {
  userData: {
    findMany: (...args: any[]) => findManyMock(...args),
  },
};

const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (...args: any[]) => withLegacyListMock(...args),
}));

import { GET as usersGet } from '@/app/api/users/route';

describe('users list route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns users by ids in requested order', async () => {
    findManyMock.mockResolvedValue([
      { id: 'user_2', userName: 'user2' },
      { id: 'user_1', userName: 'user1' },
    ]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?ids=user_1,user_2,user_1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['user_1', 'user_2'] } },
      take: 2,
    }));
    expect(json.users.map((user: any) => user.$id)).toEqual(['user_1', 'user_2']);
  });

  it('supports search query mode when ids are not provided', async () => {
    findManyMock.mockResolvedValue([{ id: 'user_3', userName: 'player_three' }]);

    const res = await usersGet(new NextRequest('http://localhost/api/users?query=player'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
      take: 20,
    }));
    expect(json.users).toHaveLength(1);
  });

  it('returns an empty list for invalid search payload', async () => {
    const res = await usersGet(new NextRequest('http://localhost/api/users'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(json.users).toEqual([]);
  });
});
