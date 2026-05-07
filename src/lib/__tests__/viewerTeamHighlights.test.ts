import type { Division, Match, Team, UserData } from '@/types';

import {
  collectViewerDivisionHighlightKeys,
  collectViewerTeamIds,
  isViewerDivisionHighlighted,
  matchHasViewerPlayingTeam,
} from '../viewerTeamHighlights';

const buildUser = (overrides: Partial<UserData> = {}): UserData => ({
  $id: 'user_parent',
  firstName: 'Parent',
  lastName: 'User',
  teamIds: [],
  friendIds: [],
  friendRequestIds: [],
  friendRequestSentIds: [],
  followingIds: [],
  blockedUserIds: [],
  hiddenEventIds: [],
  userName: 'parent',
  uploadedImages: [],
  fullName: 'Parent User',
  avatarUrl: '',
  ...overrides,
});

const buildTeam = (overrides: Partial<Team> = {}): Team => ({
  $id: 'team_1',
  name: 'Team One',
  division: 'division_a',
  sport: 'Volleyball',
  playerIds: [],
  captainId: 'captain_1',
  pending: [],
  teamSize: 6,
  currentSize: 0,
  isFull: false,
  avatarUrl: '',
  ...overrides,
});

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  team1Points: [],
  team2Points: [],
  setResults: [],
  ...overrides,
});

describe('viewer team highlights', () => {
  it('collects team IDs from the signed-in user profile and child rosters', () => {
    const currentUser = buildUser({ teamIds: ['team_parent'] });
    const childTeam = buildTeam({
      $id: 'team_child',
      playerIds: ['child_1'],
    });

    const viewerTeamIds = collectViewerTeamIds({
      currentUser,
      childUserIds: ['child_1'],
      teams: [childTeam],
    });

    expect(Array.from(viewerTeamIds).sort()).toEqual(['team_child', 'team_parent']);
  });

  it('highlights direct team divisions, pool divisions, and mapped playoff divisions', () => {
    const currentUser = buildUser({ teamIds: ['team_parent'] });
    const childTeam = buildTeam({
      $id: 'team_child',
      division: { id: 'pool_b', name: 'Pool B' } as Division,
      playerIds: ['child_1'],
    });
    const parentPool = {
      id: 'pool_a',
      name: 'Pool A',
      teamIds: ['team_parent'],
      playoffPlacementDivisionIds: ['gold_bracket'],
    };

    const highlightedKeys = collectViewerDivisionHighlightKeys({
      currentUser,
      childUserIds: ['child_1'],
      teams: [childTeam],
      divisions: [parentPool],
      matches: [
        buildMatch({
          division: 'silver_bracket',
          team1Id: 'team_child',
        }),
      ],
    });

    expect(isViewerDivisionHighlighted(highlightedKeys, 'pool_a')).toBe(true);
    expect(isViewerDivisionHighlighted(highlightedKeys, 'pool_b')).toBe(true);
    expect(isViewerDivisionHighlighted(highlightedKeys, 'gold_bracket')).toBe(true);
    expect(isViewerDivisionHighlighted(highlightedKeys, 'silver_bracket')).toBe(true);
    expect(isViewerDivisionHighlighted(highlightedKeys, 'bronze_bracket')).toBe(false);
  });

  it('detects viewer match involvement by fallback team ID', () => {
    expect(
      matchHasViewerPlayingTeam(
        buildMatch({ team2Id: 'team_parent' }),
        new Set(['team_parent']),
        new Set(['user_parent']),
      ),
    ).toBe(true);
  });
});
