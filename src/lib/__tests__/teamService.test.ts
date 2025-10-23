import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { AppwriteModuleMock } from '../../../test/mocks/appwrite';

jest.mock('@/lib/userService', () => ({
  userService: {
    getUserById: jest.fn(),
    getUsersByIds: jest.fn(),
    updateUser: jest.fn(),
    addTeamInvitation: jest.fn(),
  },
}));

jest.mock('@/app/appwrite', () => {
  const { createAppwriteModuleMock } = require('../../../test/mocks/appwrite');
  return createAppwriteModuleMock();
});

const appwriteModuleMock = jest.requireMock('@/app/appwrite') as AppwriteModuleMock;

const DATABASE_ID = 'test-db';
const TEAMS_TABLE_ID = 'teams-table';

const setEnv = () => {
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = DATABASE_ID;
  process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID = TEAMS_TABLE_ID;
};

describe('teamService', () => {
  beforeEach(() => {
    setEnv();
    jest.clearAllMocks();
  });

  describe('getTeamWithRelations', () => {
    it('fetches team with expanded relations', async () => {
      appwriteModuleMock.databases.getRow.mockResolvedValue({
        $id: 'team_1',
        name: 'Spikers',
        sport: 'Volleyball',
        division: 'Open',
        wins: 3,
        losses: 1,
        playerIds: ['user_1'],
        pending: [],
        teamSize: 6,
        players: [
          { $id: 'user_1', firstName: 'Jane', lastName: 'Doe' },
        ],
        captain: { $id: 'user_1', firstName: 'Jane', lastName: 'Doe' },
      });

      const team = await teamService.getTeamWithRelations('team_1');

      expect(appwriteModuleMock.databases.getRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: TEAMS_TABLE_ID,
        rowId: 'team_1',
        queries: expect.any(Array),
      });
      expect(team?.players?.[0].fullName).toBe('Jane Doe');
      expect(team?.captain?.fullName).toBe('Jane Doe');
    });
  });

  describe('createTeam', () => {
    it('creates team and updates captain memberships', async () => {
      appwriteModuleMock.databases.createRow.mockResolvedValue({
        $id: 'team_new',
        name: 'New Team',
        sport: 'Volleyball',
        division: 'Open',
        wins: 0,
        losses: 0,
        playerIds: ['captain_1'],
        pending: [],
        teamSize: 6,
      });

      (userService.getUserById as jest.Mock).mockResolvedValue({
        $id: 'captain_1',
        teamIds: [],
      });

      const team = await teamService.createTeam('New Team', 'captain_1');

      expect(appwriteModuleMock.databases.createRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: TEAMS_TABLE_ID,
        rowId: expect.any(String),
        data: expect.objectContaining({
          name: 'New Team',
          playerIds: ['captain_1'],
          captainId: 'captain_1',
        }),
      });

      expect(userService.updateUser).toHaveBeenCalledWith('captain_1', {
        teamIds: ['team_new'],
      });

      expect(team.$id).toBe('team_new');
    });
  });

  describe('invitePlayerToTeam', () => {
    it('adds pending invitation and notifies user service', async () => {
      (userService.addTeamInvitation as jest.Mock).mockResolvedValue(true);
      const team = {
        $id: 'team_1',
        playerIds: ['captain_1'],
        pending: [],
      } as any;

      const user = { $id: 'user_2' } as any;

      appwriteModuleMock.databases.updateRow.mockResolvedValue({});

      const result = await teamService.invitePlayerToTeam(team, user);

      expect(appwriteModuleMock.databases.updateRow).toHaveBeenCalledWith({
        databaseId: DATABASE_ID,
        tableId: TEAMS_TABLE_ID,
        rowId: 'team_1',
        data: { pending: ['user_2'] },
      });
      expect(userService.addTeamInvitation).toHaveBeenCalledWith('user_2', 'team_1');
      expect(result).toBe(true);
    });
  });
});
