import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import type { Match, TournamentBracket } from '@/types';

import TournamentBracketView from '../TournamentBracketView';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

jest.mock('../MatchCard', () => ({
  __esModule: true,
  default: ({
    match,
    team1Placeholder,
    team2Placeholder,
  }: {
    match: Match;
    team1Placeholder?: string;
    team2Placeholder?: string;
  }) => (
    <div>
      <span>{`match-${match.$id}`}</span>
      {team1Placeholder ? <span>{team1Placeholder}</span> : null}
      {team2Placeholder ? <span>{team2Placeholder}</span> : null}
    </div>
  ),
}));

jest.mock('../ScoreUpdateModal', () => ({
  __esModule: true,
  default: () => null,
}));

const buildMatch = (id: string, overrides: Partial<Match> = {}): Match => ({
  $id: id,
  matchId: Number(id.replace(/\D/g, '')) || 1,
  start: '2026-03-01T00:00:00.000Z',
  end: '2026-03-01T01:00:00.000Z',
  team1Points: [],
  team2Points: [],
  setResults: [],
  losersBracket: false,
  ...overrides,
});

const buildBracketWithLosers = (): TournamentBracket => {
  const winners1 = buildMatch('w1', { winnerNextMatchId: 'w2' });
  const winners2 = buildMatch('w2', { previousLeftId: 'w1' });
  const losers1 = buildMatch('l1', { losersBracket: true, winnerNextMatchId: 'l2' });
  const losers2 = buildMatch('l2', { losersBracket: true, previousLeftId: 'l1' });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [winners1.$id]: winners1,
      [winners2.$id]: winners2,
      [losers1.$id]: losers1,
      [losers2.$id]: losers2,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildWinnersOnlyBracket = (): TournamentBracket => {
  const winners3 = buildMatch('w3', { winnerNextMatchId: 'w4' });
  const winners4 = buildMatch('w4', { previousLeftId: 'w3' });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [winners3.$id]: winners3,
      [winners4.$id]: winners4,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildSplitLeaguePlayoffBracket = (): TournamentBracket => {
  const semifinalA = buildMatch('m1', {
    matchId: 1,
    team1Seed: 1,
    team2Seed: 2,
    division: { id: 'playoff_top', name: 'Playoff Top' } as Match['division'],
    winnerNextMatchId: 'm3',
  });
  const semifinalB = buildMatch('m2', {
    matchId: 2,
    team1Seed: 1,
    team2Seed: 2,
    division: { id: 'playoff_bottom', name: 'Playoff Bottom' } as Match['division'],
    winnerNextMatchId: 'm3',
  });
  const finalMatch = buildMatch('m3', {
    matchId: 3,
    division: { id: 'playoff_final', name: 'Finals' } as Match['division'],
    previousLeftId: 'm1',
    previousRightId: 'm2',
  });

  return {
    tournament: {
      includePlayoffs: true,
      playoffTeamCount: 2,
      divisions: ['league_a', 'league_b'],
      divisionDetails: [
        {
          id: 'league_a',
          name: 'League A',
          playoffTeamCount: 2,
          playoffPlacementDivisionIds: ['playoff_top', 'playoff_bottom'],
        },
        {
          id: 'league_b',
          name: 'League B',
          playoffTeamCount: 2,
          playoffPlacementDivisionIds: ['playoff_top', 'playoff_bottom'],
        },
      ],
      playoffDivisionDetails: [
        { id: 'playoff_top', name: 'Playoff Top' },
        { id: 'playoff_bottom', name: 'Playoff Bottom' },
      ],
    } as TournamentBracket['tournament'],
    matches: {
      [semifinalA.$id]: semifinalA,
      [semifinalB.$id]: semifinalB,
      [finalMatch.$id]: finalMatch,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

function BracketDivisionSwitchHarness() {
  const [winnersOnly, setWinnersOnly] = useState(false);
  const bracket = winnersOnly ? buildWinnersOnlyBracket() : buildBracketWithLosers();

  return (
    <>
      <button type="button" onClick={() => setWinnersOnly(true)}>
        Switch division
      </button>
      <TournamentBracketView bracket={bracket} />
    </>
  );
}

const getMatchNodeTop = (matchId: string): string => {
  const label = screen.getByText(`match-${matchId}`);
  const wrapper = label.closest('div.absolute');
  if (!wrapper) {
    throw new Error(`Expected absolute wrapper for match-${matchId}`);
  }
  return (wrapper as HTMLDivElement).style.top;
};

describe('TournamentBracketView', () => {
  it('falls back to winners when switching to a division without loser matches', async () => {
    renderWithMantine(<BracketDivisionSwitchHarness />);

    expect(screen.getByText('match-w1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Losers Bracket'));
    await waitFor(() => {
      expect(screen.getByText('match-l1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch division' }));

    await waitFor(() => {
      expect(screen.getByText('match-w3')).toBeInTheDocument();
    });

    expect(screen.queryByText('match-l1')).not.toBeInTheDocument();
    expect(screen.queryByText('Losers Bracket')).not.toBeInTheDocument();
  });

  it('uses split-league playoff mappings for empty first-round placeholders', () => {
    renderWithMantine(<TournamentBracketView bracket={buildSplitLeaguePlayoffBracket()} />);

    expect(screen.getByText('1st place (League A)')).toBeInTheDocument();
    expect(screen.getByText('1st place (League B)')).toBeInTheDocument();
    expect(screen.getByText('2nd place (League A)')).toBeInTheDocument();
    expect(screen.getByText('2nd place (League B)')).toBeInTheDocument();
  });

  it('uses explicit previous IDs for edit-layout child offsets when relation objects are stale', () => {
    const leftChild = buildMatch('c1', { winnerNextMatchId: 'p1' });
    const staleRightRelation = buildMatch('c2', { winnerNextMatchId: 'p1' });
    const parent = buildMatch('p1', {
      previousLeftId: 'c1',
      previousRightId: null,
      previousLeftMatch: leftChild,
      previousRightMatch: staleRightRelation,
    });

    const bracket: TournamentBracket = {
      tournament: { doubleElimination: false } as TournamentBracket['tournament'],
      matches: {
        [leftChild.$id]: leftChild,
        [staleRightRelation.$id]: staleRightRelation,
        [parent.$id]: parent,
      },
      teams: [],
      isHost: false,
      canManage: false,
    };

    renderWithMantine(
      <TournamentBracketView
        bracket={bracket}
        canEditMatches
        onMatchClick={() => undefined}
      />,
    );

    expect(getMatchNodeTop('p1')).toBe(getMatchNodeTop('c1'));
  });
});
