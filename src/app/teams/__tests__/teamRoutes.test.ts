import { buildTeamManagementPath, teamDetailTabFromPathSegment } from '../teamRoutes';

describe('teamRoutes', () => {
  it('parses supported team detail tab path segments', () => {
    expect(teamDetailTabFromPathSegment('roster')).toBe('roster');
    expect(teamDetailTabFromPathSegment('schedule')).toBe('schedule');
    expect(teamDetailTabFromPathSegment('finance')).toBe('finance');
    expect(teamDetailTabFromPathSegment('unknown')).toBe('roster');
    expect(teamDetailTabFromPathSegment(null)).toBe('roster');
  });

  it('builds shareable management paths for each team tab', () => {
    expect(buildTeamManagementPath('team 1', 'roster')).toBe('/teams/team%201');
    expect(buildTeamManagementPath('team 1', 'schedule')).toBe('/teams/team%201/schedule');
    expect(buildTeamManagementPath('team 1', 'finance')).toBe('/teams/team%201/finance');
  });
});
