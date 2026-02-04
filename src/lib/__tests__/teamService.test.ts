import { teamService } from '@/lib/teamService';
import { apiRequest } from '@/lib/apiClient';
import type { UserData } from '@/types';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
    updateUser: jest.fn(),
    addTeamInvitation: jest.fn(),
    removeTeamInvitation: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  getUserById: jest.Mock;
  getUsersByIds: jest.Mock;
  updateUser: jest.Mock;
  addTeamInvitation: jest.Mock;
  removeTeamInvitation: jest.Mock;
};

const buildUser = (id: string, overrides: Partial<UserData> = {}): UserData => ({
  $id: id,
  firstName: overrides.firstName ?? 'First',
  lastName: overrides.lastName ?? 'Last',
  teamIds: overrides.teamIds ?? [],
  friendIds: overrides.friendIds ?? [],
  friendRequestIds: overrides.friendRequestIds ?? [],
  friendRequestSentIds: overrides.friendRequestSentIds ?? [],
  followingIds: overrides.followingIds ?? [],
  userName: overrides.userName ?? id,
  hasStripeAccount: overrides.hasStripeAccount,
  uploadedImages: overrides.uploadedImages ?? [],
  profileImageId: overrides.profileImageId,
  $createdAt: overrides.$createdAt,
  $updatedAt: overrides.$updatedAt,
  fullName: overrides.fullName ?? `${overrides.firstName ?? 'First'} ${overrides.lastName ?? 'Last'}`.trim(),
  avatarUrl: overrides.avatarUrl ?? '',
});

describe('teamService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    userServiceMock.getUserById.mockReset();
    userServiceMock.getUsersByIds.mockReset();
    userServiceMock.updateUser.mockReset();
    userServiceMock.addTeamInvitation.mockReset();
    userServiceMock.removeTeamInvitation.mockReset();
  });

  describe('getTeamById', () => {
    it('hydrates players, pending players, and captain when requested', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_1',
        name: 'Spikers',
        sport: 'Volleyball',
        division: 'Open',
        wins: 3,
        losses: 1,
        playerIds: ['user_1'],
        pending: ['user_2'],
        teamSize: 6,
        captainId: 'user_1',
      });

      userServiceMock.getUsersByIds
        .mockResolvedValueOnce([buildUser('user_1', { firstName: 'Jane', lastName: 'Doe' })])
        .mockResolvedValueOnce([buildUser('user_2', { firstName: 'John', lastName: 'Smith' })]);
      userServiceMock.getUserById.mockResolvedValue(undefined);

      const team = await teamService.getTeamById('team_1', true);

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1');
      expect(userServiceMock.getUsersByIds).toHaveBeenNthCalledWith(1, ['user_1']);
      expect(userServiceMock.getUsersByIds).toHaveBeenNthCalledWith(2, ['user_2']);
      expect(userServiceMock.getUserById).not.toHaveBeenCalled();
      expect(team?.players?.[0].$id).toBe('user_1');
      expect(team?.pendingPlayers?.[0].$id).toBe('user_2');
      expect(team?.captain?.$id).toBe('user_1');
    });

    it('fetches missing captain when not returned in initial hydration', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_missing_captain',
        name: 'Setters',
        sport: 'Volleyball',
        division: 'Open',
        wins: 2,
        losses: 0,
        playerIds: ['captain_missing'],
        pending: [],
        teamSize: 6,
        captainId: 'captain_missing',
      });

      userServiceMock.getUsersByIds.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      userServiceMock.getUserById.mockResolvedValue(buildUser('captain_missing', { firstName: 'Casey', lastName: 'Ace' }));

      const team = await teamService.getTeamById('team_missing_captain', true);

      expect(userServiceMock.getUserById).toHaveBeenCalledWith('captain_missing');
      expect(team?.captain?.$id).toBe('captain_missing');
    });
  });

  describe('createTeam', () => {
    it('creates a team and updates captain team memberships', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_new',
        name: 'New Team',
        sport: 'Volleyball',
        division: 'Open',
        wins: 0,
        losses: 0,
        playerIds: ['captain_1'],
        pending: [],
        teamSize: 6,
        captainId: 'captain_1',
      });

      userServiceMock.getUserById.mockResolvedValue(buildUser('captain_1'));

      const team = await teamService.createTeam('New Team', 'captain_1');

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            name: 'New Team',
            playerIds: ['captain_1'],
            captainId: 'captain_1',
          }),
        }),
      );
      expect(userServiceMock.updateUser).toHaveBeenCalledWith('captain_1', {
        teamIds: ['team_new'],
      });
      expect(team.$id).toBe('team_new');
    });
  });

  describe('invitePlayerToTeam', () => {
    it('adds pending invitation and notifies user service', async () => {
      userServiceMock.addTeamInvitation.mockResolvedValue(true);
      apiRequestMock.mockResolvedValue({});

      const team = {
        $id: 'team_1',
        playerIds: ['captain_1'],
        pending: [],
        teamSize: 6,
      } as any;
      const user = buildUser('user_2');

      const result = await teamService.invitePlayerToTeam(team, user);

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams/team_1',
        expect.objectContaining({
          method: 'PATCH',
          body: { team: { pending: ['user_2'] } },
        }),
      );
      expect(userServiceMock.addTeamInvitation).toHaveBeenCalledWith('user_2', 'team_1');
      expect(result).toBe(true);
    });
  });
});
