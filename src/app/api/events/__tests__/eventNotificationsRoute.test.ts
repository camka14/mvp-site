/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  events: {
    findUnique: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
  },
  pushDeviceTarget: {
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const sendPushToUsersMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const getRequestOriginMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args) }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: (...args: any[]) => getRequestOriginMock(...args) }));

import { POST } from '@/app/api/events/[eventId]/notifications/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    isEmailEnabledMock.mockReturnValue(true);
    getRequestOriginMock.mockReturnValue('http://localhost');
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 3,
      tokenCount: 3,
      successCount: 3,
      failureCount: 0,
      prunedTokenCount: 0,
    });
    sendEmailMock.mockResolvedValue(undefined);

    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Summer League',
      hostId: 'host_1',
      assistantHostIds: ['assistant_host_1'],
      organizationId: null,
      teamIds: ['team_1'],
      userIds: ['free_player_1'],
      officialIds: ['official_1'],
    });
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'team_1',
        managerId: 'manager_1',
        playerIds: ['player_1', 'player_2'],
      },
    ]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([
      { parentId: 'parent_1' },
      { parentId: 'parent_1' },
    ]);
    prismaMock.pushDeviceTarget.findMany.mockResolvedValue([
      { userId: 'manager_1' },
      { userId: 'official_1' },
      { userId: 'assistant_host_1' },
    ]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([
      { userId: 'host_1', email: 'host1@example.com' },
      { userId: 'player_1', email: 'player1@example.com' },
      { userId: 'parent_1', email: 'parent1@example.com' },
      { userId: 'player_2', email: '' },
      { userId: 'free_player_1', email: null },
    ]);
  });

  it('sends push first and falls back to email for users without a device target', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/notifications', {
        title: 'Practice update',
        message: 'Practice starts 30 minutes earlier today.',
        audience: {
          managers: true,
          players: true,
          parents: true,
          officials: true,
          hosts: true,
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sendPushToUsersMock).toHaveBeenCalledTimes(1);
    expect(new Set(sendPushToUsersMock.mock.calls[0][0].userIds)).toEqual(
      new Set(['manager_1', 'official_1', 'assistant_host_1']),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(new Set(sendEmailMock.mock.calls.map((call) => call[0].to))).toEqual(
      new Set(['host1@example.com', 'player1@example.com', 'parent1@example.com']),
    );

    expect(payload.recipients).toEqual({
      selectedCount: 8,
      pushRecipients: 3,
      emailFallbackRecipients: 3,
      noChannelRecipients: 2,
    });
    expect(payload.delivery.emailSentCount).toBe(3);
  });

  it('rejects requests with no audience selected', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/notifications', {
        title: 'Practice update',
        message: 'Practice starts 30 minutes earlier today.',
        audience: {
          managers: false,
          players: false,
          parents: false,
          officials: false,
          hosts: false,
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input');
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('forbids non-managers from sending notifications', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/notifications', {
        title: 'Practice update',
        message: 'Practice starts 30 minutes earlier today.',
        audience: {
          players: true,
        },
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(403);
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});


