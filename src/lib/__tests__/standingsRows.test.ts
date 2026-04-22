import {
  shouldUseServerStandingsRows,
  teamBelongsToSelectedStandingsDivision,
} from '@/lib/standingsRows';

describe('standingsRows', () => {
  describe('shouldUseServerStandingsRows', () => {
    it('prefers local rows when the page can already derive teams for the selected division', () => {
      expect(shouldUseServerStandingsRows({
        selectedDivisionId: 'division_open',
        loadedDivisionId: 'division_open',
        localRowCount: 6,
        serverRowCount: 0,
      })).toBe(false);
    });

    it('uses server rows when the local snapshot is empty for the selected division', () => {
      expect(shouldUseServerStandingsRows({
        selectedDivisionId: 'division_open',
        loadedDivisionId: 'division_open',
        localRowCount: 0,
        serverRowCount: 6,
      })).toBe(true);
    });

    it('ignores server rows from a different division', () => {
      expect(shouldUseServerStandingsRows({
        selectedDivisionId: 'division_open',
        loadedDivisionId: 'division_premier',
        localRowCount: 0,
        serverRowCount: 6,
      })).toBe(false);
    });
  });

  describe('teamBelongsToSelectedStandingsDivision', () => {
    it('accepts a team listed directly on the selected division even without a team-side division object', () => {
      expect(teamBelongsToSelectedStandingsDivision({
        selectedDivisionId: 'division_open',
        selectedDivisionTeamIds: ['team_1', 'team_2'],
        teamId: 'team_1',
        teamDivisionId: null,
      })).toBe(true);
    });

    it('falls back to the team division when the selected division does not list team ids', () => {
      expect(teamBelongsToSelectedStandingsDivision({
        selectedDivisionId: 'division_open',
        selectedDivisionTeamIds: [],
        teamId: 'team_9',
        teamDivisionId: 'division_open',
      })).toBe(true);
    });

    it('rejects teams that belong to a different division', () => {
      expect(teamBelongsToSelectedStandingsDivision({
        selectedDivisionId: 'division_open',
        selectedDivisionTeamIds: ['team_1'],
        teamId: 'team_9',
        teamDivisionId: 'division_premier',
      })).toBe(false);
    });
  });
});
