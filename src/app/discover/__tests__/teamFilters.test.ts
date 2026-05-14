import {
  buildTeamDivisionFilterOptions,
  filterOpenRegistrationTeams,
} from '@/app/discover/utils/teamFilters';
import type { Team } from '@/types';

const makeTeam = (overrides: Partial<Team>): Team => ({
  $id: overrides.$id ?? 'team-id',
  name: overrides.name ?? 'Test Team',
  division: overrides.division ?? 'Open',
  divisionTypeId: overrides.divisionTypeId,
  sport: overrides.sport ?? 'Soccer',
  playerIds: [],
  captainId: 'captain-id',
  pending: [],
  teamSize: 10,
  openRegistration: true,
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
  ...overrides,
});

describe('teamFilters', () => {
  it('orders division options by selected sport order', () => {
    const options = buildTeamDivisionFilterOptions(['Soccer', 'Volleyball']);
    const lastSoccerIndex = options.map((option) => option.sport).lastIndexOf('Soccer');
    const firstVolleyballIndex = options.findIndex((option) => option.sport === 'Volleyball');

    expect(firstVolleyballIndex).toBeGreaterThan(0);
    expect(lastSoccerIndex).toBeGreaterThanOrEqual(0);
    expect(firstVolleyballIndex).toBeGreaterThan(lastSoccerIndex);
  });

  it('labels sport-dependent skill divisions by sport when multiple sports are selected', () => {
    const options = buildTeamDivisionFilterOptions(['Soccer', 'Volleyball']);

    expect(options.find((option) => option.sport === 'Soccer' && option.divisionTypeId === 'open')?.label)
      .toBe('Soccer: Open');
    expect(options.find((option) => option.sport === 'Volleyball' && option.divisionTypeId === 'open')?.label)
      .toBe('Volleyball: Open');
    expect(options.find((option) => option.sport === 'Soccer' && option.divisionTypeId === 'u12')?.label)
      .toBe('U12');
  });

  it('keeps skill division labels unscoped for a single selected sport', () => {
    const options = buildTeamDivisionFilterOptions(['Volleyball']);

    expect(options.find((option) => option.divisionTypeId === 'open')?.label).toBe('Open');
  });

  it('filters open-registration teams by selected sport and sport-specific division values', () => {
    const options = buildTeamDivisionFilterOptions(['Soccer', 'Volleyball']);
    const volleyballU12 = options.find((option) => option.sport === 'Volleyball' && option.divisionTypeId === '12u');
    const soccerU12 = options.find((option) => option.sport === 'Soccer' && option.divisionTypeId === 'u12');

    expect(volleyballU12).toBeDefined();
    expect(soccerU12).toBeDefined();

    const teams = [
      makeTeam({
        $id: 'soccer-u12',
        name: 'Soccer U12',
        sport: 'Soccer',
        divisionTypeId: 'skill_open_age_u12',
      }),
      makeTeam({
        $id: 'volleyball-u12',
        name: 'Volleyball U12',
        sport: 'Volleyball',
        divisionTypeId: 'skill_open_age_12u',
      }),
      makeTeam({
        $id: 'closed-volleyball-u12',
        name: 'Closed Volleyball U12',
        sport: 'Volleyball',
        divisionTypeId: 'skill_open_age_12u',
        openRegistration: false,
      }),
    ];

    const filtered = filterOpenRegistrationTeams(teams, {
      selectedSports: ['Soccer', 'Volleyball'],
      selectedDivisionTypeValues: [volleyballU12!.value],
      divisionTypeOptions: options,
    });

    expect(filtered.map((team) => team.$id)).toEqual(['volleyball-u12']);
  });

  it('matches a selected sport skill level against legacy division labels', () => {
    const options = buildTeamDivisionFilterOptions(['Soccer']);
    const soccerOpen = options.find((option) => option.divisionTypeId === 'open');

    expect(soccerOpen).toBeDefined();

    const filtered = filterOpenRegistrationTeams([
      makeTeam({
        $id: 'legacy-open',
        sport: 'Soccer',
        division: 'Open',
        divisionTypeId: undefined,
      }),
    ], {
      selectedSports: ['Soccer'],
      selectedDivisionTypeValues: [soccerOpen!.value],
      divisionTypeOptions: options,
    });

    expect(filtered.map((team) => team.$id)).toEqual(['legacy-open']);
  });
});
