/** @jest-environment node */

import { NextRequest } from 'next/server';

const chatGroupFindUniqueMock = jest.fn();
const chatGroupUpdateMock = jest.fn();
const requireRazumlyAdminMock = jest.fn();
const archiveChatGroupMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: unknown[]) => chatGroupFindUniqueMock(...args),
      update: (...args: unknown[]) => chatGroupUpdateMock(...args),
    },
  },
}));
jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: unknown[]) => requireRazumlyAdminMock(...args),
}));
jest.mock('@/server/moderation', () => ({
  archiveChatGroup: (...args: unknown[]) => archiveChatGroupMock(...args),
}));

import { PATCH } from '@/app/api/admin/chat-groups/[id]/route';

const restoreRequest = () => new NextRequest('http://localhost/api/admin/chat-groups/chat_archived', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ archived: false }),
});

describe('/api/admin/chat-groups/[id] PATCH restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
  });

  it('restores an archived direct chat with its canonical pair', async () => {
    const archivedGroup = {
      id: 'chat_archived',
      teamId: null,
      userIds: ['user_b', 'user_a'],
      hostId: 'user_a',
      archivedAt: new Date('2026-07-01T00:00:00.000Z'),
      directUserIdA: null,
      directUserIdB: null,
    };
    chatGroupFindUniqueMock
      .mockResolvedValueOnce(archivedGroup)
      .mockResolvedValueOnce(null);
    chatGroupUpdateMock.mockImplementation(async ({ data }: any) => ({ ...archivedGroup, ...data }));

    const response = await PATCH(restoreRequest(), {
      params: Promise.resolve({ id: archivedGroup.id }),
    });

    expect(response.status).toBe(200);
    expect(chatGroupFindUniqueMock).toHaveBeenLastCalledWith({
      where: {
        directUserIdA_directUserIdB: {
          directUserIdA: 'user_a',
          directUserIdB: 'user_b',
        },
      },
    });
    expect(chatGroupUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        archivedAt: null,
        directUserIdA: 'user_a',
        directUserIdB: 'user_b',
      }),
    }));
  });

  it('rejects restoring a second active direct chat for the same pair', async () => {
    const archivedGroup = {
      id: 'chat_archived',
      teamId: null,
      userIds: ['user_a', 'user_b'],
      hostId: 'user_a',
      archivedAt: new Date('2026-07-01T00:00:00.000Z'),
      directUserIdA: null,
      directUserIdB: null,
    };
    chatGroupFindUniqueMock
      .mockResolvedValueOnce(archivedGroup)
      .mockResolvedValueOnce({ id: 'chat_active' });

    const response = await PATCH(restoreRequest(), {
      params: Promise.resolve({ id: archivedGroup.id }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({
      code: 'DIRECT_MESSAGE_ALREADY_ACTIVE',
      canonicalChatGroupId: 'chat_active',
    });
    expect(chatGroupUpdateMock).not.toHaveBeenCalled();
  });
});
