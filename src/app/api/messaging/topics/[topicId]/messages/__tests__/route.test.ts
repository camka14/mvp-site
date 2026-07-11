/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const sendPushToUsersMock = jest.fn();
const getChatGroupMemberIdsMock = jest.fn();
const isChatGroupMemberMock = jest.fn();
const isTeamChatGroupMock = jest.fn((group: { id?: string | null; teamId?: string | null }) => (
  Boolean(group.teamId) || Boolean(group.id?.startsWith('team:'))
));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args) }));
jest.mock('@/server/chatAccess', () => ({
  getChatGroupMemberIds: (...args: any[]) => getChatGroupMemberIdsMock(...args),
  isChatGroupMember: (...args: any[]) => isChatGroupMemberMock(...args),
  isTeamChatGroup: (...args: any[]) => isTeamChatGroupMock(...args),
}));

import { POST } from '@/app/api/messaging/topics/[topicId]/messages/route';

const requestFor = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics/topic_1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/messaging/topics/[topicId]/messages POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isChatGroupMemberMock.mockResolvedValue(true);
    getChatGroupMemberIdsMock.mockImplementation(async (group: { userIds?: string[] | null }) => group.userIds ?? []);
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 2,
      tokenCount: 2,
      successCount: 2,
      failureCount: 0,
      prunedTokenCount: 0,
    });
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_3', dateOfBirth: new Date('1992-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);
  });

  it('resolves recipients from topic membership and excludes sender', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      userIds: ['user_1', 'user_2', 'user_3'],
      mutedUserIds: [],
    });

    const res = await POST(requestFor({ title: 'New message', body: 'Hello' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_2', 'user_3'],
      title: 'New message',
      body: 'Hello',
    }));
    expect(json.recipientUserIds).toEqual(['user_2', 'user_3']);
  });

  it('uses the authoritative team roster rather than stale persisted members for recipients', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'captain_1', isAdmin: false });
    const staleTeamTopic = {
      id: 'team:team_1',
      teamId: 'team_1',
      userIds: ['captain_1', 'player_1', 'stale_attacker'],
      mutedUserIds: [],
    };
    prismaMock.chatGroup.findUnique.mockResolvedValue(staleTeamTopic);
    getChatGroupMemberIdsMock.mockResolvedValue(['captain_1', 'player_1', 'guardian_1']);

    const res = await POST(requestFor({ title: 'Roster update', body: 'Practice is moved.' }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(getChatGroupMemberIdsMock).toHaveBeenCalledWith(staleTeamTopic);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['player_1', 'guardian_1'],
      title: 'Roster update',
      body: 'Practice is moved.',
    }));
    expect(json.recipientUserIds).toEqual(['player_1', 'guardian_1']);
  });

  it('excludes muted users from recipients', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      userIds: ['user_1', 'user_2', 'user_3'],
      mutedUserIds: ['user_3'],
    });

    const res = await POST(requestFor({ title: 'New message', body: 'Hello' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_2'],
      title: 'New message',
      body: 'Hello',
    }));
    expect(json.recipientUserIds).toEqual(['user_2']);
  });

  it('rejects reserved sender fields and never relays caller-controlled identity', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });

    const res = await POST(requestFor({ title: 'x', body: 'y', senderId: 'user_999' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });

    expect(res.status).toBe(400);
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });

  it('rejects callers who are not topic members', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'attacker_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      userIds: ['user_1', 'user_2'],
      mutedUserIds: [],
      hostId: 'user_1',
      teamId: 'team_1',
    });
    isChatGroupMemberMock.mockResolvedValue(false);

    const res = await POST(requestFor({ body: 'Injected message' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });

    expect(res.status).toBe(403);
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });

  it('rejects a stale attacker even when the persisted team topic still lists them', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'stale_attacker', isAdmin: false });
    const staleTeamTopic = {
      id: 'team:team_1',
      userIds: ['captain_1', 'stale_attacker'],
      mutedUserIds: [],
      hostId: 'captain_1',
      teamId: 'team_1',
    };
    prismaMock.chatGroup.findUnique.mockResolvedValue(staleTeamTopic);
    isChatGroupMemberMock.mockResolvedValue(false);

    const res = await POST(requestFor({ body: 'Injected message' }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(res.status).toBe(403);
    expect(isChatGroupMemberMock).toHaveBeenCalledWith(
      { userId: 'stale_attacker', isAdmin: false },
      staleTeamTopic,
    );
    expect(getChatGroupMemberIdsMock).not.toHaveBeenCalled();
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });

  it('prevents data fields from overriding canonical sender and topic ids', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      userIds: ['user_1', 'user_2'], mutedUserIds: [], hostId: 'user_1', teamId: null,
    });

    const res = await POST(requestFor({
      body: 'Hello',
      data: { senderId: 'spoofed', topicId: 'other', inviteId: 'invite_1' },
    }), { params: Promise.resolve({ topicId: 'topic_1' }) });

    expect(res.status).toBe(200);
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { inviteId: 'invite_1', topicId: 'topic_1', senderId: 'user_1' },
    }));
  });

  it('does not relay a message across a blocked relationship in a non-team topic', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      userIds: ['user_1', 'user_2'], mutedUserIds: [], hostId: 'user_1', teamId: null,
    });
    prismaMock.userData.findMany.mockResolvedValueOnce([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: ['user_1'] },
    ]);

    const res = await POST(requestFor({ body: 'Blocked delivery' }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain('blocked');
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });
});
