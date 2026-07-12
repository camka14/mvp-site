/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  pushDeviceTarget: {
    count: jest.fn(),
    findUnique: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const registerPushDeviceTargetMock = jest.fn();
const unregisterPushDeviceTargetMock = jest.fn();
const canManageChatGroupMock = jest.fn();
const getChatGroupMemberIdsMock = jest.fn();
const isChatGroupMemberMock = jest.fn();
const isReservedTeamChatGroupIdMock = jest.fn((id: string) => id.startsWith('team:'));
const isTeamChatGroupMock = jest.fn((group: { id?: string | null; teamId?: string | null }) => (
  Boolean(group.teamId) || Boolean(group.id?.startsWith('team:'))
));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/pushNotifications', () => ({
  registerPushDeviceTarget: (...args: any[]) => registerPushDeviceTargetMock(...args),
  unregisterPushDeviceTarget: (...args: any[]) => unregisterPushDeviceTargetMock(...args),
}));
jest.mock('@/server/chatAccess', () => ({
  canManageChatGroup: (...args: any[]) => canManageChatGroupMock(...args),
  getChatGroupMemberIds: (...args: any[]) => getChatGroupMemberIdsMock(...args),
  isChatGroupMember: (...args: any[]) => isChatGroupMemberMock(...args),
  isReservedTeamChatGroupId: (...args: any[]) => isReservedTeamChatGroupIdMock(...args),
  isTeamChatGroup: (...args: any[]) => isTeamChatGroupMock(...args),
}));

import { DELETE, GET, POST } from '@/app/api/messaging/topics/[topicId]/subscriptions/route';

const postRequest = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/user_user_1/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const deleteRequest = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/user_user_1/subscriptions', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const getRequest = (query = '') => new NextRequest(`http://localhost/api/messaging/topics/user_user_1/subscriptions${query}`, {
  method: 'GET',
});

describe('/api/messaging/topics/[topicId]/subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageChatGroupMock.mockImplementation((session: { isAdmin: boolean; userId: string }, group: { hostId?: string | null; teamId?: string | null }) => (
      session.isAdmin || (!group.teamId && group.hostId === session.userId)
    ));
    isChatGroupMemberMock.mockResolvedValue(true);
    getChatGroupMemberIdsMock.mockResolvedValue(['user_1', 'user_2']);
    registerPushDeviceTargetMock.mockResolvedValue(undefined);
    unregisterPushDeviceTargetMock.mockResolvedValue(undefined);
    prismaMock.pushDeviceTarget.count.mockResolvedValue(0);
    prismaMock.pushDeviceTarget.findUnique.mockResolvedValue(null);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);
  });

  it('registers push token metadata when subscribing', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'user_user_1', userIds: ['user_2', 'user_1'], hostId: 'user_2', teamId: null,
    });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_2', 'user_1'],
      hostId: 'user_2',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await POST(postRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    expect(registerPushDeviceTargetMock).toHaveBeenCalledWith({
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    });
  });

  it('does not create a one-user unnamed chat when topic does not exist', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue(null);
    prismaMock.chatGroup.create.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_1'],
      hostId: 'user_1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await POST(postRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topicId: 'user_user_1',
      topic: null,
    });
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
    expect(registerPushDeviceTargetMock).toHaveBeenCalledWith({
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
    });
    expect(prismaMock.userData.findMany).not.toHaveBeenCalled();
  });

  it('does not create a generic group at a reserved team topic id', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue(null);

    const res = await POST(postRequest({ userIds: ['user_1', 'user_2'] }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain('reserved');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });

  it('does not subscribe a minor account into a non-team chat', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'user_user_1', userIds: ['user_1', 'user_2'], hostId: 'user_1', teamId: null,
    });
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const res = await POST(postRequest({
      userIds: ['minor_1'],
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain('team chats');
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
    expect(registerPushDeviceTargetMock).not.toHaveBeenCalled();
  });

  it('does not add a blocked user to a non-team chat', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'user_user_1', userIds: ['user_1'], hostId: 'user_1', teamId: null,
    });
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: ['user_1'] },
    ]);

    const res = await POST(postRequest({ userIds: ['user_2'] }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain('blocked');
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
  });

  it('removes push token metadata when unsubscribing', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'user_user_1', userIds: ['user_1', 'user_2'], hostId: 'user_1', teamId: null,
    });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_2'],
      hostId: 'user_1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await DELETE(deleteRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    expect(unregisterPushDeviceTargetMock).toHaveBeenCalledWith({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    });
  });

  it('surfaces a push target cleanup failure instead of reporting an unsubscribe success', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'user_user_1', userIds: ['user_1', 'user_2'], hostId: 'user_1', teamId: null,
    });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'user_user_1',
      name: null,
      userIds: ['user_2'],
      hostId: 'user_1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    unregisterPushDeviceTargetMock.mockRejectedValue(new Error('database unavailable'));

    const res = await DELETE(deleteRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    }), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.code).toBe('PUSH_TARGET_CLEANUP_FAILED');
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
    expect(unregisterPushDeviceTargetMock).toHaveBeenCalledWith({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
    });
  });

  it('keeps team-chat membership roster-managed while removing the current device target', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'team:team_1',
      userIds: ['user_1', 'user_2'],
      hostId: 'user_1',
      teamId: 'team_1',
    });

    const res = await DELETE(deleteRequest({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'team:team_1',
    }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(res.status).toBe(200);
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
    expect(unregisterPushDeviceTargetMock).toHaveBeenCalledWith({
      userIds: ['user_1'],
      pushToken: 'push_token_1',
      pushTarget: 'team:team_1',
    });
  });

  it('returns push target debug status for the current user', async () => {
    prismaMock.pushDeviceTarget.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prismaMock.pushDeviceTarget.findUnique.mockResolvedValue({
      id: 'target_1',
      userId: 'user_1',
      pushToken: 'push_token_1',
      pushTarget: 'user_user_1',
      pushPlatform: 'android',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      lastSeenAt: new Date('2024-01-03T00:00:00.000Z'),
    });

    const res = await GET(getRequest('?userId=user_1&pushToken=push_token_1'), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topicId: 'user_user_1',
      userId: 'user_1',
      hasAnyTargetForUser: true,
      hasTopicTargetForUser: true,
      hasProvidedTokenForUser: true,
      hasProvidedTokenOnTopic: true,
      tokenRecordPushTarget: 'user_user_1',
      tokenRecordPushPlatform: 'android',
    });
  });

  it('rejects non-admin user debug checks for another user id', async () => {
    const res = await GET(getRequest('?userId=another_user'), {
      params: Promise.resolve({ topicId: 'user_user_1' }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects a non-member trying to add themselves to a team chat', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'team:team_1',
      userIds: ['captain_1', 'minor_1'],
      hostId: 'captain_1',
      teamId: 'team_1',
    });
    isChatGroupMemberMock.mockResolvedValue(false);

    const res = await POST(postRequest({ userIds: ['user_1'] }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(res.status).toBe(403);
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
    expect(registerPushDeviceTargetMock).not.toHaveBeenCalled();
  });

  it('rejects a stale attacker from subscription operations on a team chat', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'stale_attacker', isAdmin: false });
    const staleTeamTopic = {
      id: 'team:team_1',
      teamId: 'team_1',
      hostId: 'captain_1',
      userIds: ['captain_1', 'stale_attacker'],
    };
    prismaMock.chatGroup.findUnique.mockResolvedValue(staleTeamTopic);
    isChatGroupMemberMock.mockResolvedValue(false);

    const res = await POST(postRequest({
      userIds: ['stale_attacker'],
      pushToken: 'attacker_push_token',
    }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(res.status).toBe(403);
    expect(isChatGroupMemberMock).toHaveBeenCalledWith(
      { userId: 'stale_attacker', isAdmin: false },
      staleTeamTopic,
    );
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
    expect(registerPushDeviceTargetMock).not.toHaveBeenCalled();
  });

  it('lets a current roster member subscribe even when a legacy team row lacks that member', async () => {
    const staleTeamTopic = {
      id: 'team:team_1',
      teamId: null,
      hostId: 'captain_1',
      userIds: ['captain_1', 'stale_attacker'],
    };
    prismaMock.chatGroup.findUnique.mockResolvedValue(staleTeamTopic);
    isChatGroupMemberMock.mockResolvedValue(true);
    getChatGroupMemberIdsMock.mockResolvedValue(['captain_1', 'user_1']);

    const res = await POST(postRequest({
      userIds: ['user_1'],
      pushToken: 'current_roster_push_token',
    }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(res.status).toBe(200);
    expect(registerPushDeviceTargetMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      pushToken: 'current_roster_push_token',
      pushTarget: 'team:team_1',
    }));
    expect(prismaMock.userData.findMany).not.toHaveBeenCalled();
  });
});
