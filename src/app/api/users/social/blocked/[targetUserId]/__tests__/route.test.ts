/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const clearBlockReportsMock = jest.fn();
const prismaMock = {
  $transaction: jest.fn(),
};

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/server/moderation', () => ({
  clearBlockReports: (...args: any[]) => clearBlockReportsMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { DELETE } from '@/app/api/users/social/blocked/[targetUserId]/route';

describe('DELETE /api/users/social/blocked/[targetUserId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes the block relation and clears matching block reports', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        userData: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user_1',
            blockedUserIds: ['user_2', 'user_3'],
          }),
          update: jest.fn().mockResolvedValue({
            id: 'user_1',
            firstName: 'sam',
            lastName: 'player',
            userName: 'sam_player',
            blockedUserIds: ['user_3'],
            teamIds: [],
            friendIds: [],
            friendRequestIds: [],
            friendRequestSentIds: [],
            followingIds: [],
            uploadedImages: [],
          }),
        },
      };
      return callback(tx);
    });

    const res = await DELETE(
      new NextRequest('http://localhost/api/users/social/blocked/user_2', { method: 'DELETE' }),
      { params: Promise.resolve({ targetUserId: 'user_2' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(clearBlockReportsMock).toHaveBeenCalledWith(expect.anything(), 'user_1', 'user_2');
    expect(json.user.blockedUserIds).toEqual(['user_3']);
  });
});
