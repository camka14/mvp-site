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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTeamById', () => {
    it('hydrates players, pending players, and captain when requested', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_1',
        name: 'Spikers',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['user_1'],
        playerRegistrations: [{
          id: 'registration_1',
          teamId: 'team_1',
          userId: 'user_1',
          status: 'ACTIVE',
          jerseyNumber: '12',
        }],
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
      expect(userServiceMock.getUsersByIds).toHaveBeenNthCalledWith(
        1,
        ['user_1'],
        expect.objectContaining({ teamId: 'team_1' }),
      );
      expect(userServiceMock.getUsersByIds).toHaveBeenNthCalledWith(
        2,
        ['user_2'],
        expect.objectContaining({ teamId: 'team_1' }),
      );
      expect(userServiceMock.getUserById).not.toHaveBeenCalled();
      expect(team?.players?.[0].$id).toBe('user_1');
      expect(team?.pendingPlayers?.[0].$id).toBe('user_2');
      expect(team?.captain?.$id).toBe('user_1');
      expect(team?.playerRegistrations?.[0]).toEqual(expect.objectContaining({
        id: 'registration_1',
        userId: 'user_1',
        jerseyNumber: '12',
      }));
    });

    it('maps open registration billing and ownership fields', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_open',
        name: 'Open Team',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: [],
        pending: [],
        teamSize: 6,
        captainId: 'captain_1',
        organizationId: 'org_1',
        createdBy: 'owner_1',
        openRegistration: true,
        registrationPriceCents: 2500,
      });

      const team = await teamService.getTeamById('team_open');

      expect(team).toEqual(expect.objectContaining({
        $id: 'team_open',
        organizationId: 'org_1',
        createdBy: 'owner_1',
        openRegistration: true,
        registrationPriceCents: 2500,
      }));
    });

    it('fetches missing captain when not returned in initial hydration', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_missing_captain',
        name: 'Setters',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['captain_missing'],
        pending: [],
        teamSize: 6,
        captainId: 'captain_missing',
      });

      userServiceMock.getUsersByIds.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      userServiceMock.getUserById.mockResolvedValue(buildUser('captain_missing', { firstName: 'Casey', lastName: 'Ace' }));

      const team = await teamService.getTeamById('team_missing_captain', true);

      expect(userServiceMock.getUserById).toHaveBeenCalledWith(
        'captain_missing',
        expect.objectContaining({ teamId: 'team_missing_captain' }),
      );
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
      expect(userServiceMock.updateUser).not.toHaveBeenCalled();
      expect(team.$id).toBe('team_new');
    });

    it('creates a manager-only team when addSelfAsPlayer is false', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_manager_only',
        name: 'Managed Team',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: [],
        pending: [],
        teamSize: 6,
        captainId: '',
        managerId: 'captain_1',
      });

      userServiceMock.getUserById.mockResolvedValue(buildUser('captain_1'));

      await teamService.createTeam(
        'Managed Team',
        'captain_1',
        'Open',
        'Volleyball',
        6,
        undefined,
        { addSelfAsPlayer: false },
      );

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            name: 'Managed Team',
            addSelfAsPlayer: false,
            playerIds: [],
            captainId: '',
            managerId: 'captain_1',
          }),
        }),
      );
      expect(userServiceMock.updateUser).not.toHaveBeenCalled();
    });

    it('does not serialize a null player id when the captain id is unavailable', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_missing_user_id',
        name: 'Missing User Id Team',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: [],
        pending: [],
        teamSize: 6,
        captainId: '',
        managerId: '',
      });

      await teamService.createTeam(
        'Missing User Id Team',
        undefined as unknown as string,
      );

      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            name: 'Missing User Id Team',
            playerIds: [],
            captainId: '',
            managerId: '',
          }),
        }),
      );
    });
  });

  describe('getTeamsByUserId', () => {
    it('requests teams where the user is either a player or a manager', async () => {
      apiRequestMock.mockResolvedValue({ teams: [] });

      await teamService.getTeamsByUserId('user_1');

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams?playerId=user_1&managerId=user_1&limit=100');
    });
  });

  describe('getTeamsByIds', () => {
    it('passes event context to the teams API when provided', async () => {
      apiRequestMock.mockResolvedValue({ teams: [] });

      await teamService.getTeamsByIds(['team_1'], false, { eventId: 'event_1' });

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams?ids=team_1&eventId=event_1');
    });
  });

  describe('searchOpenRegistrationTeams', () => {
    it('requests open-registration teams with the search query and drops closed teams defensively', async () => {
      apiRequestMock.mockResolvedValue({
        teams: [
          {
            $id: 'team_open',
            name: 'Open Aces',
            sport: 'Volleyball',
            division: 'Open',
            playerIds: [],
            pending: [],
            teamSize: 6,
            captainId: 'captain_1',
            openRegistration: true,
          },
          {
            $id: 'team_closed',
            name: 'Closed Aces',
            sport: 'Volleyball',
            division: 'Open',
            playerIds: [],
            pending: [],
            teamSize: 6,
            captainId: 'captain_2',
            openRegistration: false,
          },
        ],
      });

      const teams = await teamService.searchOpenRegistrationTeams(' aces ', 25);

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams?query=aces&openRegistration=true&limit=25');
      expect(teams).toHaveLength(1);
      expect(teams[0]).toMatchObject({
        $id: 'team_open',
        name: 'Open Aces',
        openRegistration: true,
      });
    });
  });

  describe('updateTeamRosterAndRoles', () => {
    it('patches captain and roster updates through the teams API', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_1',
        name: 'Roster Team',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['user_2'],
        pending: [],
        teamSize: 6,
        captainId: 'user_2',
      });

      const updated = await teamService.updateTeamRosterAndRoles('team_1', {
        captainId: 'user_2',
        playerIds: ['user_2'],
      });

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1', {
        method: 'PATCH',
        body: { team: { captainId: 'user_2', playerIds: ['user_2'] } },
      });
      expect(updated?.captainId).toBe('user_2');
      expect(updated?.playerIds).toEqual(['user_2']);
    });
  });

  describe('updateTeamDetails', () => {
    it('sends open registration cost and jersey registration edits', async () => {
      apiRequestMock.mockResolvedValue({
        $id: 'team_1',
        name: 'Roster Team',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['user_1'],
        pending: [],
        teamSize: 6,
        captainId: 'user_1',
        openRegistration: true,
        registrationPriceCents: 3000,
        playerRegistrations: [{
          id: 'registration_1',
          teamId: 'team_1',
          userId: 'user_1',
          status: 'ACTIVE',
          jerseyNumber: '7',
        }],
      });

      await teamService.updateTeamDetails('team_1', {
        openRegistration: true,
        registrationPriceCents: 3000,
        playerRegistrations: [{
          id: 'registration_1',
          teamId: 'team_1',
          userId: 'user_1',
          status: 'ACTIVE',
          jerseyNumber: '7',
        }],
      });

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1', {
        method: 'PATCH',
        body: {
          team: {
            openRegistration: true,
            registrationPriceCents: 3000,
            playerRegistrations: [{
              id: 'registration_1',
              teamId: 'team_1',
              userId: 'user_1',
              status: 'ACTIVE',
              jerseyNumber: '7',
            }],
          },
        },
      });
    });
  });

  describe('self-service registration', () => {
    it('calls the free team registration endpoint', async () => {
      apiRequestMock.mockResolvedValue({
        registrationId: 'registration_1',
        status: 'ACTIVE',
        team: {
          $id: 'team_1',
          name: 'Open Team',
          sport: 'Volleyball',
          division: 'Open',
          playerIds: ['user_1'],
          pending: [],
          teamSize: 6,
          captainId: 'captain_1',
        },
      });

      const team = await teamService.registerForTeam('team_1');

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1/registrations/self', {
        method: 'POST',
      });
      expect(team?.playerIds).toEqual(['user_1']);
    });

    it('calls the leave endpoint', async () => {
      apiRequestMock.mockResolvedValue({
        left: true,
        team: {
          $id: 'team_1',
          name: 'Open Team',
          sport: 'Volleyball',
          division: 'Open',
          playerIds: [],
          pending: [],
          teamSize: 6,
          captainId: 'captain_1',
        },
      });

      const team = await teamService.leaveTeam('team_1');

      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1/registrations/self', {
        method: 'DELETE',
      });
      expect(team?.playerIds).toEqual([]);
    });
  });

  describe('invitePlayerToTeam', () => {
    it('posts a player member invite request', async () => {
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
        '/api/teams/team_1/member-invites',
        expect.objectContaining({
          method: 'POST',
          body: {
            userId: 'user_2',
            role: 'player',
            eventTeamIds: [],
          },
        }),
      );
      expect(userServiceMock.addTeamInvitation).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('membership updates', () => {
    it('accepts a player invitation without patching the user profile teamIds', async () => {
      apiRequestMock.mockResolvedValue({});
      userServiceMock.removeTeamInvitation.mockResolvedValue(true);
      jest.spyOn(teamService, 'getTeamById').mockResolvedValueOnce({
        $id: 'team_1',
        name: 'Team One',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['captain_1'],
        pending: ['user_2'],
        teamSize: 6,
        captainId: 'captain_1',
      } as any);

      const result = await teamService.acceptTeamInvitation('team_1', 'user_2');

      expect(result).toBe(true);
      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1', {
        method: 'PATCH',
        body: { team: { playerIds: ['captain_1', 'user_2'], pending: [] } },
      });
      expect(userServiceMock.updateUser).not.toHaveBeenCalled();
      expect(userServiceMock.removeTeamInvitation).toHaveBeenCalledWith('user_2', 'team_1');
    });

    it('removes a player without patching the removed user profile', async () => {
      apiRequestMock.mockResolvedValue({});
      jest.spyOn(teamService, 'getTeamById').mockResolvedValueOnce({
        $id: 'team_1',
        name: 'Team One',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['captain_1', 'user_2'],
        pending: [],
        teamSize: 6,
        captainId: 'captain_1',
      } as any);

      const result = await teamService.removePlayerFromTeam('team_1', 'user_2');

      expect(result).toBe(true);
      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1', {
        method: 'PATCH',
        body: { team: { playerIds: ['captain_1'] } },
      });
      expect(userServiceMock.updateUser).not.toHaveBeenCalled();
    });

    it('deletes a team without patching each player profile teamIds', async () => {
      apiRequestMock.mockResolvedValue({});
      userServiceMock.removeTeamInvitation.mockResolvedValue(true);
      jest.spyOn(teamService, 'getTeamById').mockResolvedValueOnce({
        $id: 'team_1',
        name: 'Team One',
        sport: 'Volleyball',
        division: 'Open',
        playerIds: ['captain_1', 'user_2'],
        pending: ['user_3'],
        teamSize: 6,
        captainId: 'captain_1',
      } as any);

      const result = await teamService.deleteTeam('team_1');

      expect(result).toBe(true);
      expect(apiRequestMock).toHaveBeenCalledWith('/api/teams/team_1', { method: 'DELETE' });
      expect(userServiceMock.updateUser).not.toHaveBeenCalled();
      expect(userServiceMock.removeTeamInvitation).toHaveBeenCalledWith('user_3', 'team_1');
    });
  });
});

