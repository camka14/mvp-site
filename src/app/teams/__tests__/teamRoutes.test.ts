import {
  buildTeamManagementPath,
  resolveTeamDetailTabFromPath,
  teamDetailTabFromPathSegment,
} from '../teamRoutes';

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

  it('resolves team tabs from shareable paths', () => {
    expect(resolveTeamDetailTabFromPath('/teams/team%201', 'team 1')).toBe('roster');
    expect(resolveTeamDetailTabFromPath('/teams/team%201/schedule', 'team 1')).toBe('schedule');
    expect(resolveTeamDetailTabFromPath('/teams/team%201/finance', 'team 1')).toBe('finance');
    expect(resolveTeamDetailTabFromPath('/teams/other/schedule', 'team 1')).toBeNull();
    expect(resolveTeamDetailTabFromPath('/organizations/org_1/teams', 'team 1')).toBeNull();
  });
});
