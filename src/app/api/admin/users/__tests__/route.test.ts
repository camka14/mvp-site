/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const prismaMock = {
  authUser: {
    findMany: jest.fn(),
  },
  userData: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET as adminUsersGet } from '@/app/api/admin/users/route';

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when caller is not an allowed admin', async () => {
    requireRazumlyAdminMock.mockRejectedValue(new Response('Forbidden', { status: 403 }));
    const res = await adminUsersGet(new NextRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns paginated users and includes email metadata', async () => {
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@razumly.com' });
    prismaMock.authUser.findMany
      .mockResolvedValueOnce([{ id: 'user_1' }])
      .mockResolvedValueOnce([{ id: 'user_1', email: 'user@example.com', emailVerifiedAt: new Date('2026-03-10T10:00:00Z') }]);
    prismaMock.userData.count.mockResolvedValue(1);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'user_1',
        firstName: 'sam',
        lastName: 'player',
        userName: 'sam_player',
        dateOfBirth: new Date('2000-01-01T00:00:00Z'),
        teamIds: [],
        friendIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        followingIds: [],
        uploadedImages: [],
      },
    ]);

    const res = await adminUsersGet(new NextRequest('http://localhost/api/admin/users?query=user@example.com'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.users).toHaveLength(1);
    expect(json.users[0].email).toBe('user@example.com');
    expect(json.users[0].firstName).toBe('Sam');
  });
});
