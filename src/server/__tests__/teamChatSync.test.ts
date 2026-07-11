const loadCanonicalTeamByIdMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: unknown[]) => loadCanonicalTeamByIdMock(...args),
}));

import { getCurrentTeamChatMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';

describe('syncTeamChatInTx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adopts a forged deterministic row as a roster-managed team chat and removes unknown members', async () => {
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'River City FC',
      managerId: 'manager_1',
      captainId: 'captain_1',
      headCoachId: null,
      coachIds: [],
      playerIds: ['player_1'],
    });
    const chatGroup = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'team:team_1',
        teamId: null,
        userIds: ['manager_1', 'attacker_1'],
      }),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
    };
    const tx = {
      chatGroup,
      messages: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userData: { findMany: jest.fn().mockResolvedValue([]) },
      parentChildLinks: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await syncTeamChatInTx(tx, 'team_1', {
      previousMemberIds: ['manager_1', 'attacker_1'],
    });

    expect(tx.messages.deleteMany).toHaveBeenCalledWith({ where: { chatId: 'team:team_1' } });
    expect(chatGroup.update).toHaveBeenCalledWith({
      where: { id: 'team:team_1' },
      data: expect.objectContaining({
        teamId: 'team_1',
        hostId: 'manager_1',
        userIds: ['manager_1', 'captain_1', 'player_1'],
      }),
    });
    expect(chatGroup.create).not.toHaveBeenCalled();
  });
});

describe('getCurrentTeamChatMemberIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes active guardians of current minor roster members', async () => {
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'River City FC',
      managerId: 'manager_1',
      captainId: 'captain_1',
      headCoachId: 'coach_1',
      coachIds: ['assistant_1'],
      playerIds: ['minor_1', 'player_1'],
    });
    const userDataFindMany = jest.fn().mockResolvedValue([
      { id: 'manager_1', dateOfBirth: new Date('1980-01-01T00:00:00.000Z') },
      { id: 'captain_1', dateOfBirth: new Date('1981-01-01T00:00:00.000Z') },
      { id: 'coach_1', dateOfBirth: new Date('1982-01-01T00:00:00.000Z') },
      { id: 'assistant_1', dateOfBirth: new Date('1983-01-01T00:00:00.000Z') },
      { id: 'minor_1', dateOfBirth: new Date('2013-01-01T00:00:00.000Z') },
      { id: 'player_1', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
    ]);
    const parentChildLinksFindMany = jest.fn().mockResolvedValue([
      { parentId: 'guardian_1' },
    ]);

    const memberIds = await getCurrentTeamChatMemberIds({
      userData: { findMany: userDataFindMany },
      parentChildLinks: { findMany: parentChildLinksFindMany },
    }, 'team_1');

    expect(memberIds).toEqual([
      'manager_1',
      'captain_1',
      'coach_1',
      'assistant_1',
      'minor_1',
      'player_1',
      'guardian_1',
    ]);
    expect(parentChildLinksFindMany).toHaveBeenCalledWith({
      where: { childId: { in: ['minor_1'] }, status: 'ACTIVE' },
      select: { parentId: true },
    });
  });

  it('fails closed when the team no longer exists', async () => {
    loadCanonicalTeamByIdMock.mockResolvedValue(null);

    await expect(getCurrentTeamChatMemberIds({}, 'missing_team')).resolves.toBeNull();
  });

  it('fails closed when the canonical roster cannot be fully resolved', async () => {
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      name: 'River City FC',
      managerId: 'manager_1',
      captainId: 'captain_1',
      headCoachId: null,
      coachIds: [],
      playerIds: ['player_1'],
    });

    await expect(getCurrentTeamChatMemberIds({
      userData: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'manager_1', dateOfBirth: new Date('1980-01-01T00:00:00.000Z') },
        ]),
      },
      parentChildLinks: { findMany: jest.fn() },
    }, 'team_1')).resolves.toBeNull();
  });
});
