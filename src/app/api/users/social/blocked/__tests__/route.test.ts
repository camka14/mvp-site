/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const createModerationReportMock = jest.fn();
const removeUserFromChatGroupMock = jest.fn();
const sendModerationAlertMock = jest.fn();
const prismaMock = {
  $transaction: jest.fn(),
};

jest.mock('@/generated/prisma/client', () => ({
  ModerationReportTargetTypeEnum: {
    BLOCK_USER: 'BLOCK_USER',
  },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/server/moderation', () => ({
  buildBlockReportMetadata: (...args: any[]) => ({
    blockedUserId: args[0].blockedUserId,
    leaveSharedChats: args[0].leaveSharedChats,
    removedChatIds: args[0].removedChatIds,
  }),
  createModerationReport: (...args: any[]) => createModerationReportMock(...args),
  removeUserFromChatGroup: (...args: any[]) => removeUserFromChatGroupMock(...args),
  sendModerationAlert: (...args: any[]) => sendModerationAlertMock(...args),
}));

import { POST } from '@/app/api/users/social/blocked/route';

describe('POST /api/users/social/blocked', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    removeUserFromChatGroupMock.mockResolvedValue(undefined);
    sendModerationAlertMock.mockResolvedValue(undefined);
    createModerationReportMock.mockResolvedValue({
      id: 'report_1',
      reporterUserId: 'user_1',
      targetType: 'BLOCK_USER',
      targetId: 'user_2',
      dueAt: new Date('2026-04-15T12:00:00.000Z'),
    });
  });

  it('adds the block relation, removes shared chats, and opens a moderation report', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        userData: {
          findUnique: jest.fn()
            .mockResolvedValueOnce({
              id: 'user_1',
              firstName: 'Sam',
              lastName: 'Player',
              userName: 'sam_player',
              blockedUserIds: [],
              friendIds: ['user_2'],
              followingIds: ['user_2'],
              friendRequestIds: ['user_2'],
              friendRequestSentIds: ['user_2'],
              teamIds: [],
              uploadedImages: [],
            })
            .mockResolvedValueOnce({
              id: 'user_2',
              firstName: 'Taylor',
              lastName: 'Player',
              userName: 'taylor_player',
              blockedUserIds: [],
              friendIds: ['user_1'],
              followingIds: ['user_1'],
              friendRequestIds: ['user_1'],
              friendRequestSentIds: ['user_1'],
              teamIds: [],
              uploadedImages: [],
            }),
          update: jest.fn()
            .mockResolvedValueOnce({
              id: 'user_1',
              firstName: 'Sam',
              lastName: 'Player',
              userName: 'sam_player',
              blockedUserIds: ['user_2'],
              friendIds: [],
              followingIds: [],
              friendRequestIds: [],
              friendRequestSentIds: [],
              teamIds: [],
              uploadedImages: [],
            })
            .mockResolvedValueOnce({
              id: 'user_2',
              firstName: 'Taylor',
              lastName: 'Player',
              userName: 'taylor_player',
              blockedUserIds: [],
              friendIds: [],
              followingIds: [],
              friendRequestIds: [],
              friendRequestSentIds: [],
              teamIds: [],
              uploadedImages: [],
            }),
        },
        chatGroup: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'chat_1', userIds: ['user_1', 'user_2'], hostId: 'user_1', archivedAt: null },
          ]),
        },
      };
      return callback(tx);
    });

    const response = await POST(new NextRequest('http://localhost/api/users/social/blocked', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: 'user_2', leaveSharedChats: true }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(removeUserFromChatGroupMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'chat_1' }),
      'user_1',
      expect.objectContaining({
        actorUserId: 'user_1',
        reason: 'BLOCK_USER_SHARED_CHAT_EXIT',
      }),
    );
    expect(createModerationReportMock).toHaveBeenCalledWith(expect.objectContaining({
      reporterUserId: 'user_1',
      targetType: 'BLOCK_USER',
      targetId: 'user_2',
      metadata: {
        blockedUserId: 'user_2',
        leaveSharedChats: true,
        removedChatIds: ['chat_1'],
      },
    }));
    expect(sendModerationAlertMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'report_1' }));
    expect(json.removedChatIds).toEqual(['chat_1']);
    expect(json.user.blockedUserIds).toEqual(['user_2']);
    expect(json.user.friendIds).toEqual([]);
    expect(json.user.followingIds).toEqual([]);
  });
});
