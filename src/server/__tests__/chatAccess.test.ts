const getCurrentTeamChatMemberIdsMock = jest.fn();
const getCanonicalTeamIdsByUserIdsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/teamChatSync', () => ({
  getCurrentTeamChatMemberIds: (...args: unknown[]) => getCurrentTeamChatMemberIdsMock(...args),
}));
jest.mock('@/server/teams/teamMembership', () => ({
  getCanonicalTeamIdsByUserIds: (...args: unknown[]) => getCanonicalTeamIdsByUserIdsMock(...args),
}));

import { getChatGroupMemberIds, isChatGroupMember } from '@/server/chatAccess';

describe('team chat access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies a stale attacker and forged host when the current roster excludes them', async () => {
    const client = { marker: 'client' };
    getCurrentTeamChatMemberIdsMock.mockResolvedValue(['manager_1', 'player_1']);
    const group = {
      id: 'team:team_1',
      teamId: 'team_1',
      hostId: 'attacker_1',
      userIds: ['manager_1', 'attacker_1'],
    };

    await expect(isChatGroupMember(
      { userId: 'attacker_1', isAdmin: false },
      group,
      client,
    )).resolves.toBe(false);
    await expect(isChatGroupMember(
      { userId: 'manager_1', isAdmin: false },
      group,
      client,
    )).resolves.toBe(true);

    expect(getCurrentTeamChatMemberIdsMock).toHaveBeenCalledWith(client, 'team_1');
  });

  it('fails closed rather than using persisted team-chat membership when roster resolution is unavailable', async () => {
    getCurrentTeamChatMemberIdsMock.mockResolvedValue(null);

    await expect(isChatGroupMember(
      { userId: 'attacker_1', isAdmin: false },
      { id: 'team:team_1', userIds: ['attacker_1'], hostId: 'attacker_1' },
      {},
    )).resolves.toBe(false);
  });

  it('continues to use stored membership for ordinary non-team groups', async () => {
    const group = { id: 'chat_1', userIds: ['member_1', 'member_1', '  member_2  '] };

    await expect(getChatGroupMemberIds(group, {})).resolves.toEqual(['member_1', 'member_2']);
    await expect(isChatGroupMember(
      { userId: 'member_2', isAdmin: false },
      group,
      {},
    )).resolves.toBe(true);
    await expect(isChatGroupMember(
      { userId: 'outsider_1', isAdmin: false },
      group,
      {},
    )).resolves.toBe(false);
    expect(getCurrentTeamChatMemberIdsMock).not.toHaveBeenCalled();
  });
});
