import { canManageTeamBilling, selectBillOwnerTeams } from '@/lib/profileBilling';
import type { Team } from '@/types';

const buildTeam = (
  id: string,
  overrides: Partial<Team> = {},
): Team => ({
  $id: id,
  name: `Team ${id}`,
  division: 'Open',
  sport: 'Soccer',
  playerIds: [],
  captainId: 'captain_default',
  managerId: 'manager_default',
  headCoachId: null,
  assistantCoachIds: [],
  coachIds: [],
  parentTeamId: null,
  pending: [],
  teamSize: 10,
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
  ...overrides,
});

describe('profileBilling', () => {
  describe('canManageTeamBilling', () => {
    it('returns true when user is the team manager', () => {
      const result = canManageTeamBilling(
        { managerId: 'manager_1' },
        'manager_1',
      );

      expect(result).toBe(true);
    });

    it('returns false when user is only the team captain', () => {
      const result = canManageTeamBilling(
        { managerId: 'manager_1' },
        'captain_1',
      );

      expect(result).toBe(false);
    });

    it('returns false when user is neither manager nor captain', () => {
      const result = canManageTeamBilling(
        { managerId: 'manager_1' },
        'player_1',
      );

      expect(result).toBe(false);
    });
  });

  describe('selectBillOwnerTeams', () => {
    it('includes only teams managed by the user', () => {
      const teams = [
        buildTeam('manager_team', { captainId: 'captain_2', managerId: 'user_1' }),
        buildTeam('captain_only_team', { captainId: 'user_1', managerId: 'manager_2' }),
        buildTeam('not_owned_team', { captainId: 'captain_3', managerId: 'manager_3' }),
      ];

      const result = selectBillOwnerTeams(teams, 'user_1');

      expect(result.map((team) => team.$id)).toEqual(['manager_team']);
    });
  });
});
