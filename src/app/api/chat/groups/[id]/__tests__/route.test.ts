/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const chatGroupFindUniqueMock = jest.fn();
const chatGroupUpdateMock = jest.fn();
const userDataFindManyMock = jest.fn();
const archiveChatGroupMock = jest.fn();
const withLegacyFieldsMock = jest.fn((row: any) => ({ ...row, $id: row.id }));

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
      update: (...args: any[]) => chatGroupUpdateMock(...args),
    },
    userData: {
      findMany: (...args: any[]) => userDataFindManyMock(...args),
    },
  },
}));

jest.mock('@/server/legacyFormat', () => ({
  stripLegacyFieldsDeep: (value: any) => value,
  withLegacyFields: (row: any) => withLegacyFieldsMock(row),
}));

jest.mock('@/server/moderation', () => ({
  archiveChatGroup: (...args: any[]) => archiveChatGroupMock(...args),
}));

import { DELETE, PATCH } from '@/app/api/chat/groups/[id]/route';

const patchRequest = (body: unknown) => new NextRequest('http://localhost/api/chat/groups/chat_1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const existingGroup = (overrides: Record<string, unknown> = {}) => ({
  id: 'chat_1',
  name: null,
  userIds: ['user_1', 'user_2'],
  hostId: 'user_1',
  teamId: null,
  archivedAt: null,
  ...overrides,
});

describe('/api/chat/groups/[id] PATCH', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
  });

  it('rejects adding a minor participant to a non-team chat', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup());
    userDataFindManyMock.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'user_2', dateOfBirth: new Date('1991-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'user_2', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('team chats');
    expect(chatGroupUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects a team-chat host attempting to mutate roster-managed membership', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({ teamId: 'team_1' }));

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('roster');
    expect(chatGroupUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects a team-chat host attempting to archive the deterministic team chat', async () => {
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({
      id: 'team:team_1',
      teamId: null,
    }));

    const response = await DELETE(
      new NextRequest('http://localhost/api/chat/groups/team:team_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'team:team_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('roster');
    expect(archiveChatGroupMock).not.toHaveBeenCalled();
  });

  it('allows an administrator to repair a roster-managed team chat', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'admin_1', isAdmin: true });
    const updatedGroup = existingGroup({
      teamId: 'team_1',
      userIds: ['user_1', 'minor_1'],
    });
    chatGroupFindUniqueMock.mockResolvedValue(existingGroup({ teamId: 'team_1' }));
    chatGroupUpdateMock.mockResolvedValue(updatedGroup);
    userDataFindManyMock.mockResolvedValue([
      { id: 'user_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z'), blockedUserIds: [] },
      { id: 'minor_1', dateOfBirth: new Date('2012-01-01T00:00:00.000Z'), blockedUserIds: [] },
    ]);

    const response = await PATCH(patchRequest({
      group: { userIds: ['user_1', 'minor_1'] },
    }), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(200);
    expect(chatGroupUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat_1' },
      data: expect.objectContaining({ userIds: ['user_1', 'minor_1'] }),
    }));
  });
});
