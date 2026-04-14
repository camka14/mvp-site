jest.mock('@/generated/prisma/client', () => ({
  Prisma: { JsonNull: null },
  ModerationReportStatusEnum: { OPEN: 'OPEN' },
  ModerationReportTargetTypeEnum: { BLOCK_USER: 'BLOCK_USER' },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

jest.mock('@/lib/id', () => ({
  createId: () => 'report_1',
}));

jest.mock('@/server/email', () => ({
  isEmailEnabled: () => false,
  sendEmail: jest.fn(),
}));

import {
  clearBlockReports,
  computeModerationDueAt,
  removeUserFromChatGroup,
} from '@/server/moderation';

describe('moderation helpers', () => {
  it('sets moderation due dates 24 hours after creation', () => {
    const createdAt = new Date('2026-04-14T12:00:00.000Z');
    expect(computeModerationDueAt(createdAt).toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });

  it('archives chats when removing a user drops membership below two users', async () => {
    const update = jest.fn(async (args: any) => ({ id: args.where.id, ...args.data }));
    const client = {
      chatGroup: { update },
    } as any;

    await removeUserFromChatGroup(
      client,
      { id: 'chat_1', userIds: ['user_1', 'user_2'], hostId: 'user_1' },
      'user_1',
      { actorUserId: 'admin_1', reason: 'BLOCK_USER_SHARED_CHAT_EXIT' },
    );

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat_1' },
      data: expect.objectContaining({
        userIds: ['user_2'],
        hostId: 'user_2',
        archivedReason: 'BLOCK_USER_SHARED_CHAT_EXIT',
        archivedByUserId: 'admin_1',
      }),
    }));
  });

  it('keeps chats active when at least two users remain', async () => {
    const update = jest.fn(async (args: any) => ({ id: args.where.id, ...args.data }));
    const client = {
      chatGroup: { update },
    } as any;

    await removeUserFromChatGroup(
      client,
      { id: 'chat_1', userIds: ['user_1', 'user_2', 'user_3'], hostId: 'user_1' },
      'user_1',
      { actorUserId: 'admin_1', reason: 'CHAT_REPORT_EXIT' },
    );

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat_1' },
      data: expect.objectContaining({
        userIds: ['user_2', 'user_3'],
        hostId: 'user_2',
      }),
    }));
    expect(update.mock.calls[0][0].data.archivedAt).toBeUndefined();
  });

  it('deletes only block-generated reports for the blocker pair on unblock', async () => {
    const deleteMany = jest.fn(async () => ({ count: 2 }));
    const client = {
      moderationReport: { deleteMany },
    } as any;

    await clearBlockReports(client, 'reporter_1', 'blocked_1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        reporterUserId: 'reporter_1',
        targetType: 'BLOCK_USER',
        targetId: 'blocked_1',
      },
    });
  });
});
