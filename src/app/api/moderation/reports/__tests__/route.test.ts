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
    CHAT_GROUP: 'CHAT_GROUP',
    EVENT: 'EVENT',
    BLOCK_USER: 'BLOCK_USER',
  },
  Prisma: { JsonNull: null },
}));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/server/moderation', () => ({
  createModerationReport: (...args: any[]) => createModerationReportMock(...args),
  removeUserFromChatGroup: (...args: any[]) => removeUserFromChatGroupMock(...args),
  sendModerationAlert: (...args: any[]) => sendModerationAlertMock(...args),
}));

import { POST } from '@/app/api/moderation/reports/route';

describe('POST /api/moderation/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    sendModerationAlertMock.mockResolvedValue(undefined);
    removeUserFromChatGroupMock.mockResolvedValue(undefined);
  });

  it('creates an event report and hides the event for the reporting user', async () => {
    createModerationReportMock.mockResolvedValue({
      id: 'report_1',
      reporterUserId: 'user_1',
      targetType: 'EVENT',
      targetId: 'event_1',
      category: 'report_event',
      notes: 'spam event',
      dueAt: new Date('2026-04-15T12:00:00.000Z'),
      createdAt: new Date('2026-04-14T12:00:00.000Z'),
      updatedAt: new Date('2026-04-14T12:00:00.000Z'),
      metadata: null,
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        events: {
          findUnique: jest.fn().mockResolvedValue({ id: 'event_1' }),
        },
        userData: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user_1',
            hiddenEventIds: ['event_9'],
          }),
          update: jest.fn().mockResolvedValue({
            hiddenEventIds: ['event_9', 'event_1'],
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(new NextRequest('http://localhost/api/moderation/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType: 'EVENT',
        targetId: 'event_1',
        notes: 'spam event',
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(createModerationReportMock).toHaveBeenCalledWith(expect.objectContaining({
      reporterUserId: 'user_1',
      targetType: 'EVENT',
      targetId: 'event_1',
      category: 'report_event',
      notes: 'spam event',
    }));
    expect(json.hiddenEventIds).toEqual(['event_9', 'event_1']);
    expect(json.removedChatIds).toEqual([]);
    expect(sendModerationAlertMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'report_1' }));
  });

  it('creates a chat report and removes the reporter when leaveChat is requested', async () => {
    createModerationReportMock.mockResolvedValue({
      id: 'report_2',
      reporterUserId: 'user_1',
      targetType: 'CHAT_GROUP',
      targetId: 'chat_1',
      category: 'report_chat',
      notes: 'abusive messages',
      dueAt: new Date('2026-04-15T12:00:00.000Z'),
      createdAt: new Date('2026-04-14T12:00:00.000Z'),
      updatedAt: new Date('2026-04-14T12:00:00.000Z'),
      metadata: { leaveChat: true },
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        chatGroup: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'chat_1',
            userIds: ['user_1', 'user_2'],
            hostId: 'user_1',
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(new NextRequest('http://localhost/api/moderation/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType: 'CHAT_GROUP',
        targetId: 'chat_1',
        notes: 'abusive messages',
        metadata: { leaveChat: true },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(removeUserFromChatGroupMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'chat_1' }),
      'user_1',
      expect.objectContaining({
        actorUserId: 'user_1',
        reason: 'CHAT_REPORT_EXIT',
      }),
    );
    expect(createModerationReportMock).toHaveBeenCalledWith(expect.objectContaining({
      reporterUserId: 'user_1',
      targetType: 'CHAT_GROUP',
      targetId: 'chat_1',
      metadata: { leaveChat: true },
    }));
    expect(json.removedChatIds).toEqual(['chat_1']);
    expect(json.hiddenEventIds).toEqual([]);
  });
});
