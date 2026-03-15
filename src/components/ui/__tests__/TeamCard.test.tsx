import { screen } from '@testing-library/react';

import TeamCard from '../TeamCard';
import { Team } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const createTeam = (overrides: Partial<Team> = {}): Team => ({
  $id: 'team_1',
  name: 'Falcons',
  division: 'event_1__division__c_skill_open',
  divisionTypeId: undefined,
  divisionTypeName: undefined,
  sport: 'Indoor Volleyball',
  playerIds: [],
  captainId: 'captain_1',
  managerId: 'manager_1',
  headCoachId: null,
  assistantCoachIds: [],
  coachIds: [],
  parentTeamId: null,
  pending: [],
  teamSize: 6,
  profileImageId: undefined,
  players: [],
  captain: undefined,
  manager: undefined,
  headCoach: undefined,
  assistantCoaches: [],
  coaches: [],
  pendingPlayers: [],
  matches: [],
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
  ...overrides,
});

const createPlayer = (id: string, overrides: Partial<NonNullable<Team['players']>[number]> = {}): NonNullable<Team['players']>[number] => ({
  $id: id,
  firstName: 'Jane',
  lastName: 'Doe',
  displayName: 'Jane Doe',
  teamIds: [],
  friendIds: [],
  friendRequestIds: [],
  friendRequestSentIds: [],
  followingIds: [],
  userName: `user_${id}`,
  uploadedImages: [],
  fullName: 'Jane Doe',
  avatarUrl: '',
  ...overrides,
});

describe('TeamCard division label', () => {
  it('prefers divisionTypeName instead of rendering a division id', () => {
    const team = createTeam({
      division: 'event_123__division__c_skill_open',
      divisionTypeName: 'Open',
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText(/event_123__division__c_skill_open/i)).not.toBeInTheDocument();
  });

  it('uses expanded division name when available', () => {
    const team = createTeam({
      division: {
        id: 'event_456__division__f_skill_advanced',
        name: 'Womens Advanced',
      },
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText('Womens Advanced')).toBeInTheDocument();
  });

  it('does not fall back to an opaque division id', () => {
    const team = createTeam({
      division: 'division_5f2f1c9d',
      divisionTypeName: undefined,
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText('Division')).toBeInTheDocument();
    expect(screen.queryByText(/division_5f2f1c9d/i)).not.toBeInTheDocument();
  });

  it('ignores legacy skill/age metadata labels and falls back to clean type name', () => {
    const team = createTeam({
      division: {
        id: 'event_456__division__c_skill_open_age_u14',
        name: 'C - Skill: Open - Age: U14',
      },
      divisionTypeName: 'Open / U14',
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText('Open / U14')).toBeInTheDocument();
    expect(screen.queryByText(/skill:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/age:/i)).not.toBeInTheDocument();
  });

  it('falls back to inferred label from division object id when name is legacy metadata', () => {
    const team = createTeam({
      division: {
        id: 'event_456__division__c_skill_open_age_u14',
        name: 'C - Skill: Open - Age: U14',
      },
      divisionTypeName: undefined,
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText(/Open/i)).toBeInTheDocument();
    expect(screen.queryByText(/Skill/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Division')).not.toBeInTheDocument();
  });
});

describe('TeamCard members visibility', () => {
  it('excludes hidden members from the avatar list', () => {
    const visiblePlayer = createPlayer('player_visible', { fullName: 'Visible Player' });
    const hiddenPlayer = createPlayer('player_hidden', {
      fullName: 'Name Hidden',
      displayName: 'Name Hidden',
      userName: 'hidden',
      isIdentityHidden: true,
    });
    const team = createTeam({
      players: [visiblePlayer, hiddenPlayer],
      currentSize: 2,
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.getByText('Members:')).toBeInTheDocument();
    expect(screen.getByAltText('Visible Player')).toBeInTheDocument();
    expect(screen.queryByAltText('Name Hidden')).not.toBeInTheDocument();
  });

  it('hides the members section when all members are hidden', () => {
    const hiddenPlayer = createPlayer('player_hidden', {
      fullName: 'Name Hidden',
      displayName: 'Name Hidden',
      userName: 'hidden',
      isIdentityHidden: true,
    });
    const team = createTeam({
      players: [hiddenPlayer],
      currentSize: 1,
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.queryByText('Members:')).not.toBeInTheDocument();
  });

  it('hides the members section when there are no members', () => {
    const team = createTeam({
      players: [],
      currentSize: 0,
    });

    renderWithMantine(<TeamCard team={team} />);

    expect(screen.queryByText('Members:')).not.toBeInTheDocument();
  });
});
