/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  chatGroup: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const withLegacyFieldsMock = jest.fn((row: any) => ({ ...row, $id: row.id }));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => withLegacyFieldsMock(row),
}));

import { POST as postTopic } from '@/app/api/messaging/topics/route';
import { DELETE as deleteTopicById, POST as postTopicById } from '@/app/api/messaging/topics/[topicId]/route';

const postRequest = (body: unknown) => new NextRequest('http://localhost/api/messaging/topics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const deleteRequest = () => new NextRequest('http://localhost/api/messaging/topics/topic_1', {
  method: 'DELETE',
});

describe('/api/messaging/topics POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('rejects creating a non-team topic with a minor participant', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue(null);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await postTopic(postRequest({
      topicId: 'topic_1',
      userIds: [' user_1 ', 'minor_1'],
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('team chats');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });

  it('rejects creating a non-team topic across a blocked relationship', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue(null);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: ['user_1'] },
    ]);

    const response = await postTopic(postRequest({
      topicId: 'topic_1',
      userIds: ['user_1', 'user_2'],
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('blocked');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });

  it('reserves deterministic team topic ids for roster synchronization', async () => {
    const response = await postTopic(postRequest({
      topicId: 'team:team_1',
      userIds: ['user_1', 'user_2'],
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('reserved');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });

  it('rejects direct updates to roster-managed team topics', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'team_chat_1',
      name: null,
      userIds: ['user_1'],
      hostId: 'user_1',
      teamId: 'team_1',
    });
    prismaMock.chatGroup.update.mockResolvedValue({
      id: 'team_chat_1',
      name: null,
      userIds: ['user_1', 'minor_1'],
      hostId: 'user_1',
      teamId: 'team_1',
    });

    const response = await postTopic(postRequest({
      topicId: 'team_chat_1',
      userIds: ['user_1', 'minor_1'],
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.userData.findMany).not.toHaveBeenCalled();
    expect(prismaMock.chatGroup.update).not.toHaveBeenCalled();
  });
});

describe('/api/messaging/topics/[topicId] POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('rejects creating a non-team topic with a placeholder-DOB participant', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue(null);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'placeholder_1', dateOfBirth: new Date('1970-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await postTopicById(postRequest({
      userIds: ['user_1', 'placeholder_1'],
    }), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('team chats');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });

  it('reserves deterministic team topic ids on the path alias too', async () => {
    const response = await postTopicById(postRequest({
      userIds: ['user_1', 'user_2'],
    }), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('reserved');
    expect(prismaMock.chatGroup.create).not.toHaveBeenCalled();
  });
});

describe('/api/messaging/topics/[topicId] DELETE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'attacker_1', isAdmin: false });
  });

  it('rejects an outsider trying to delete another user\'s topic', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'topic_1',
      hostId: 'owner_1',
      teamId: null,
      userIds: ['owner_1', 'member_1'],
    });

    const response = await deleteTopicById(deleteRequest(), {
      params: Promise.resolve({ topicId: 'topic_1' }),
    });

    expect(response.status).toBe(403);
    expect(prismaMock.chatGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects direct deletion of roster-managed team topics', async () => {
    prismaMock.chatGroup.findUnique.mockResolvedValue({
      id: 'team:team_1',
      hostId: 'attacker_1',
      teamId: 'team_1',
      userIds: ['attacker_1', 'minor_1'],
    });

    const response = await deleteTopicById(deleteRequest(), {
      params: Promise.resolve({ topicId: 'team:team_1' }),
    });

    expect(response.status).toBe(403);
    expect(prismaMock.chatGroup.deleteMany).not.toHaveBeenCalled();
  });
});
