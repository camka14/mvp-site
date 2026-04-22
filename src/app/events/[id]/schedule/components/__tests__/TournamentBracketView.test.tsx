import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import type { Match, TournamentBracket } from '@/types';
import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { rescheduleEventMatchesPreservingLocks } from '@/server/scheduler/reschedulePreservingLocks';
import {
  Division as SchedulerDivision,
  League as SchedulerLeague,
  PlayingField as SchedulerPlayingField,
  Team as SchedulerTeam,
  TimeSlot as SchedulerTimeSlot,
} from '@/server/scheduler/types';
import { serializeEventLegacy, serializeMatchesLegacy } from '@/server/scheduler/serialize';
import { normalizeApiEvent, normalizeApiMatch } from '@/lib/apiMappers';

import TournamentBracketView from '../TournamentBracketView';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

jest.mock('../MatchCard', () => ({
  __esModule: true,
  default: ({
    match,
    highlightCurrentUser,
    team1Placeholder,
    team2Placeholder,
  }: {
    match: Match;
    highlightCurrentUser?: boolean;
    team1Placeholder?: string;
    team2Placeholder?: string;
  }) => (
    <div>
      <span>{`match-${match.$id}`}</span>
      <span>{highlightCurrentUser ? `highlight-${match.$id}` : `normal-${match.$id}`}</span>
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

const buildLosersRootTraversalBracket = (): TournamentBracket => {
  const root = buildMatch('r', {
    matchId: 900,
    previousLeftId: 'wA',
    previousRightId: 'wB',
  });
  const wA = buildMatch('wA', {
    matchId: 800,
    winnerNextMatchId: 'r',
    previousLeftId: 'wA1',
    previousRightId: 'lA',
  });
  const wB = buildMatch('wB', {
    matchId: 790,
    winnerNextMatchId: 'r',
    previousLeftId: 'wB1',
    previousRightId: 'wB2',
  });
  const wA1 = buildMatch('wA1', {
    matchId: 780,
    winnerNextMatchId: 'wA',
    previousLeftId: 'wA1Deep',
  });
  const lA = buildMatch('lA', {
    matchId: 770,
    losersBracket: true,
    winnerNextMatchId: 'wA',
    previousLeftId: 'lA1',
    previousRightId: 'wMix',
  });
  const lA1 = buildMatch('lA1', {
    matchId: 760,
    losersBracket: true,
    winnerNextMatchId: 'lA',
  });
  const wMix = buildMatch('wMix', {
    matchId: 750,
    winnerNextMatchId: 'lA',
    previousLeftId: 'wMixDeep',
  });
  const wB1 = buildMatch('wB1', {
    matchId: 740,
    winnerNextMatchId: 'wB',
    previousLeftId: 'lB',
  });
  const wB2 = buildMatch('wB2', {
    matchId: 730,
    winnerNextMatchId: 'wB',
  });
  const lB = buildMatch('lB', {
    matchId: 720,
    losersBracket: true,
    winnerNextMatchId: 'wB1',
  });
  const wA1Deep = buildMatch('wA1Deep', {
    matchId: 710,
    winnerNextMatchId: 'wA1',
  });
  const wMixDeep = buildMatch('wMixDeep', {
    matchId: 700,
    winnerNextMatchId: 'wMix',
  });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [root.$id]: root,
      [wA.$id]: wA,
      [wB.$id]: wB,
      [wA1.$id]: wA1,
      [lA.$id]: lA,
      [lA1.$id]: lA1,
      [wMix.$id]: wMix,
      [wB1.$id]: wB1,
      [wB2.$id]: wB2,
      [lB.$id]: lB,
      [wA1Deep.$id]: wA1Deep,
      [wMixDeep.$id]: wMixDeep,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildLosersBracketWithMissingPreviousIds = (): TournamentBracket => {
  const root = buildMatch('root', {
    matchId: 1000,
    previousLeftId: 'wTop',
    previousRightId: 'lTop',
  });
  const wTop = buildMatch('wTop', {
    matchId: 990,
    winnerNextMatchId: 'root',
  });
  const lTop = buildMatch('lTop', {
    matchId: 980,
    losersBracket: true,
    winnerNextMatchId: 'root',
    previousLeftId: null,
    previousLeftMatch: { $id: 'wCross' } as Match['previousLeftMatch'],
    previousRightId: 'lChain',
  });
  const wCross = buildMatch('wCross', {
    matchId: 970,
    loserNextMatchId: 'lTop',
    previousLeftId: 'wCrossLeaf',
  });
  const lChain = buildMatch('lChain', {
    matchId: 960,
    losersBracket: true,
    winnerNextMatchId: 'lTop',
  });
  const wCrossLeaf = buildMatch('wCrossLeaf', {
    matchId: 950,
    winnerNextMatchId: 'wCross',
  });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [root.$id]: root,
      [wTop.$id]: wTop,
      [lTop.$id]: lTop,
      [wCross.$id]: wCross,
      [lChain.$id]: lChain,
      [wCrossLeaf.$id]: wCrossLeaf,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildLosersBracketWithInvalidWbChildLink = (): TournamentBracket => {
  const root = buildMatch('root2', {
    matchId: 1100,
    previousLeftId: 'wTop2',
    previousRightId: 'lTop2',
  });
  const wTop = buildMatch('wTop2', {
    matchId: 1090,
    winnerNextMatchId: 'root2',
  });
  const lTop = buildMatch('lTop2', {
    matchId: 1080,
    losersBracket: true,
    winnerNextMatchId: 'root2',
    previousLeftId: 'wValid',
    previousRightId: 'wInvalid',
  });
  const wValid = buildMatch('wValid', {
    matchId: 1070,
    loserNextMatchId: 'lTop2',
  });
  const wInvalid = buildMatch('wInvalid', {
    matchId: 1060,
    winnerNextMatchId: 'lTop2',
    loserNextMatchId: 'some_other_drop',
  });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [root.$id]: root,
      [wTop.$id]: wTop,
      [lTop.$id]: lTop,
      [wValid.$id]: wValid,
      [wInvalid.$id]: wInvalid,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildLosersBracketWithWbWinnerFallbackLink = (): TournamentBracket => {
  const root = buildMatch('lbRoot3', {
    matchId: 1200,
    losersBracket: true,
    previousLeftId: 'wbChild3',
  });
  const wbChild = buildMatch('wbChild3', {
    matchId: 1190,
    losersBracket: false,
    winnerNextMatchId: 'lbRoot3',
    loserNextMatchId: null,
  });

  return {
    tournament: { doubleElimination: true } as TournamentBracket['tournament'],
    matches: {
      [root.$id]: root,
      [wbChild.$id]: wbChild,
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

const buildUnifiedLeaguePlayoffBracket = (): TournamentBracket => {
  const semifinalA = buildMatch('u1', {
    matchId: 1,
    team1Seed: 1,
    team2Seed: 4,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    winnerNextMatchId: 'u3',
  });
  const semifinalB = buildMatch('u2', {
    matchId: 2,
    team1Seed: 2,
    team2Seed: 3,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    winnerNextMatchId: 'u3',
  });
  const finalMatch = buildMatch('u3', {
    matchId: 3,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    previousLeftId: 'u1',
    previousRightId: 'u2',
  });

  return {
    tournament: {
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 4,
      divisions: ['league_open'],
      divisionDetails: [
        {
          id: 'league_open',
          name: 'Open',
          playoffTeamCount: 4,
          playoffPlacementDivisionIds: [],
        },
      ],
      playoffDivisionDetails: [],
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

const buildUnifiedLeaguePlayoffBracketWithStaleByeRelation = (): TournamentBracket => {
  const playInMatch = buildMatch('b1', {
    matchId: 91,
    team1Seed: 8,
    team2Seed: 9,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    winnerNextMatchId: 'b2',
  });
  const byeCarryMatch = buildMatch('b2', {
    matchId: 95,
    team2Seed: '1' as unknown as number,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    previousLeftId: 'b1',
    previousRightId: undefined,
    previousRightMatch: { $id: 'stale_seed_source' } as Match['previousRightMatch'],
    winnerNextMatchId: 'b4',
  });
  const quarterfinal = buildMatch('b3', {
    matchId: 97,
    team1Seed: 4,
    team2Seed: 5,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    winnerNextMatchId: 'b4',
  });
  const finalMatch = buildMatch('b4', {
    matchId: 103,
    division: { id: 'league_open', name: 'Open' } as Match['division'],
    previousLeftId: 'b2',
    previousRightId: 'b3',
  });

  return {
    tournament: {
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 9,
      divisions: ['league_open'],
      divisionDetails: [
        {
          id: 'league_open',
          name: 'Open',
          playoffTeamCount: 9,
          playoffPlacementDivisionIds: [],
        },
      ],
      playoffDivisionDetails: [],
    } as TournamentBracket['tournament'],
    matches: {
      [playInMatch.$id]: playInMatch,
      [byeCarryMatch.$id]: byeCarryMatch,
      [quarterfinal.$id]: quarterfinal,
      [finalMatch.$id]: finalMatch,
    },
    teams: [],
    isHost: false,
    canManage: false,
  };
};

const buildScheduledLeagueBracket = (playoffTeamCount: number): TournamentBracket => {
  const context = {
    log: () => {},
    error: () => {},
  };
  const division = new SchedulerDivision('league_open', 'CoEd Open 18+');
  const field = new SchedulerPlayingField({
    id: 'field_main',
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Main',
  });
  const teams: Record<string, SchedulerTeam> = {};
  for (let index = 1; index <= playoffTeamCount; index += 1) {
    const id = `team_${index}`;
    teams[id] = new SchedulerTeam({
      id,
      captainId: `captain_${index}`,
      division,
      name: `Team ${index}`,
      matches: [],
      playerIds: [],
    });
  }

  const scheduled = scheduleEvent({
    event: new SchedulerLeague({
      id: 'league_nine_team_component_test',
      name: 'Nine Team League',
      start: new Date('2026-07-01T08:00:00.000Z'),
      end: new Date('2026-08-31T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: playoffTeamCount,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams,
      divisions: [division],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      officials: [],
      fields: {
        [field.id]: field,
      },
      timeSlots: [
        new SchedulerTimeSlot({
          id: 'slot_component_real_bracket',
          dayOfWeek: 0,
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 22 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    }),
  }, context);

  const serializedEvent = serializeEventLegacy(scheduled.event);
  const serializedMatches = serializeMatchesLegacy(scheduled.matches);
  const tournament = normalizeApiEvent({
    ...serializedEvent,
    matches: serializedMatches,
  } as TournamentBracket['tournament']);
  if (!tournament) {
    throw new Error('Expected serialized event');
  }

  return {
    tournament,
    matches: Object.fromEntries(
      serializedMatches.map((match) => {
        const normalizedMatch = normalizeApiMatch(match as Match);
        return [normalizedMatch.$id, normalizedMatch];
      }),
    ),
    teams: Array.isArray(tournament.teams) ? tournament.teams : [],
    isHost: false,
    canManage: false,
  };
};

const buildScheduledNineTeamLeagueBracket = (): TournamentBracket => buildScheduledLeagueBracket(9);

const buildScheduledTenTeamLeagueBracket = (): TournamentBracket => buildScheduledLeagueBracket(10);

const buildRescheduledNineTeamLeagueBracket = (): TournamentBracket => {
  const context = {
    log: () => {},
    error: () => {},
  };
  const division = new SchedulerDivision('league_open', 'CoEd Open 18+');
  const field = new SchedulerPlayingField({
    id: 'field_main_reschedule',
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Main',
  });
  const teams: Record<string, SchedulerTeam> = {};
  for (let index = 1; index <= 9; index += 1) {
    const id = `team_reschedule_${index}`;
    teams[id] = new SchedulerTeam({
      id,
      captainId: `captain_reschedule_${index}`,
      division,
      name: `Team ${index}`,
      matches: [],
      playerIds: [],
    });
  }

  const initial = scheduleEvent({
    event: new SchedulerLeague({
      id: 'league_nine_team_reschedule_test',
      name: 'Nine Team League Rescheduled',
      start: new Date('2026-07-01T08:00:00.000Z'),
      end: new Date('2026-08-31T22:00:00.000Z'),
      noFixedEndDateTime: false,
      maxParticipants: 9,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams,
      divisions: [division],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      officials: [],
      fields: {
        [field.id]: field,
      },
      timeSlots: [
        new SchedulerTimeSlot({
          id: 'slot_component_rescheduled_bracket',
          dayOfWeek: 0,
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 22 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 9,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    }),
  }, context);

  const rescheduled = rescheduleEventMatchesPreservingLocks(initial.event);
  const serializedEvent = serializeEventLegacy(rescheduled.event);
  const serializedMatches = serializeMatchesLegacy(rescheduled.matches);
  const tournament = normalizeApiEvent({
    ...serializedEvent,
    matches: serializedMatches,
  } as TournamentBracket['tournament']);
  if (!tournament) {
    throw new Error('Expected serialized event');
  }

  return {
    tournament,
    matches: Object.fromEntries(
      serializedMatches.map((match) => {
        const normalizedMatch = normalizeApiMatch(match as Match);
        return [normalizedMatch.$id, normalizedMatch];
      }),
    ),
    teams: Array.isArray(tournament.teams) ? tournament.teams : [],
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

  it('uses direct league placements for empty first-round placeholders when playoffs are not split', () => {
    renderWithMantine(<TournamentBracketView bracket={buildUnifiedLeaguePlayoffBracket()} />);

    expect(screen.getByText('1st place (Open)')).toBeInTheDocument();
    expect(screen.getByText('4th place (Open)')).toBeInTheDocument();
    expect(screen.getByText('2nd place (Open)')).toBeInTheDocument();
    expect(screen.getByText('3rd place (Open)')).toBeInTheDocument();
  });

  it('keeps bye-seed placeholders when the open slot only has a stale relation object', () => {
    renderWithMantine(<TournamentBracketView bracket={buildUnifiedLeaguePlayoffBracketWithStaleByeRelation()} />);

    expect(screen.getByText('1st place (Open)')).toBeInTheDocument();
    expect(screen.getByText('8th place (Open)')).toBeInTheDocument();
    expect(screen.getByText('9th place (Open)')).toBeInTheDocument();
  });

  it('renders carried bye placeholders on the actual 10-team bracket nodes', () => {
    const bracket = buildScheduledTenTeamLeagueBracket();
    const carriedSeedMatches = Object.values(bracket.matches).filter((match) => {
      const previousCount = Number(Boolean(match.previousLeftId)) + Number(Boolean(match.previousRightId));
      const directSeedCount = Number(match.team1Seed !== null && match.team1Seed !== undefined)
        + Number(match.team2Seed !== null && match.team2Seed !== undefined);
      return previousCount === 1 && directSeedCount === 1;
    });

    expect(carriedSeedMatches).toHaveLength(2);

    renderWithMantine(<TournamentBracketView bracket={bracket} />);

    const carriedCardText = carriedSeedMatches.map((match) => (
      screen.getByText(`match-${match.$id}`).parentElement?.textContent ?? ''
    ));

    expect(carriedCardText).toEqual(expect.arrayContaining([
      expect.stringContaining('1st place (CoEd Open 18+)'),
      expect.stringContaining('2nd place (CoEd Open 18+)'),
    ]));
  });

  it('keeps bye placeholders after rescheduling an existing 9-team bracket', () => {
    const bracket = buildRescheduledNineTeamLeagueBracket();
    const seed1Match = Object.values(bracket.matches).find((match) => (
      (match.team1Seed === 1 || match.team2Seed === 1)
      && (Boolean(match.previousLeftId || match.previousLeftMatch) || Boolean(match.previousRightId || match.previousRightMatch))
    ));

    expect(seed1Match).toBeTruthy();

    renderWithMantine(<TournamentBracketView bracket={bracket} />);

    const seed1Card = screen.getByText(`match-${seed1Match!.$id}`).parentElement;
    expect(seed1Card).toHaveTextContent('1st place (CoEd Open 18+)');
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

  it('ignores stale right relation objects when previousRightId is undefined', () => {
    const leftChild = buildMatch('c3', { winnerNextMatchId: 'p2' });
    const staleRightRelation = buildMatch('c4', { winnerNextMatchId: 'p2' });
    const parent = buildMatch('p2', {
      previousLeftId: 'c3',
      previousRightId: undefined,
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

    expect(getMatchNodeTop('p2')).toBe(getMatchNodeTop('c3'));
  });

  it('highlights matches involving the current user, including official assignments', () => {
    const userId = 'user_1';
    const playerMatch = buildMatch('m1', {
      winnerNextMatchId: 'm3',
      team1: {
        $id: 'team_player',
        playerIds: [userId],
      } as Match['team1'],
    });
    const officialMatch = buildMatch('m2', {
      winnerNextMatchId: 'm3',
      officialId: userId,
    });
    const teamOfficialMatch = buildMatch('m3', {
      previousLeftId: 'm1',
      previousRightId: 'm2',
      winnerNextMatchId: 'm4',
      teamOfficial: {
        $id: 'team_ref',
        playerIds: [userId],
      } as Match['teamOfficial'],
    });
    const otherMatch = buildMatch('m4', {
      previousLeftId: 'm3',
      team1: {
        $id: 'team_other',
        playerIds: ['someone_else'],
      } as Match['team1'],
      officialId: 'official_other',
    });
    const assignedOfficialSlotMatch = buildMatch('m5', {
      previousLeftId: 'm4',
      officialIds: [
        {
          positionId: 'position-r1',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId,
          eventOfficialId: 'event-official-1',
        },
      ],
    });

    const bracket: TournamentBracket = {
      tournament: { doubleElimination: false } as TournamentBracket['tournament'],
      matches: {
        [playerMatch.$id]: playerMatch,
        [officialMatch.$id]: officialMatch,
        [teamOfficialMatch.$id]: teamOfficialMatch,
        [otherMatch.$id]: otherMatch,
        [assignedOfficialSlotMatch.$id]: assignedOfficialSlotMatch,
      },
      teams: [],
      isHost: false,
      canManage: false,
    };

    renderWithMantine(
      <TournamentBracketView
        bracket={bracket}
        currentUser={{ $id: userId, teamIds: [] } as any}
      />,
    );

    expect(screen.getByText('highlight-m1')).toBeInTheDocument();
    expect(screen.getByText('highlight-m2')).toBeInTheDocument();
    expect(screen.getByText('highlight-m3')).toBeInTheDocument();
    expect(screen.getByText('normal-m4')).toBeInTheDocument();
    expect(screen.getByText('highlight-m5')).toBeInTheDocument();
  });

  it('renders disconnected matches in a collapsible unplaced dock', () => {
    const treeLeft = buildMatch('t1', {
      matchId: 101,
      winnerNextMatchId: 't3',
    });
    const treeRight = buildMatch('t2', {
      matchId: 102,
      winnerNextMatchId: 't3',
    });
    const treeRoot = buildMatch('t3', {
      matchId: 303,
      previousLeftId: 't1',
      previousRightId: 't2',
    });

    const disconnectedLeaf = buildMatch('u1', {
      matchId: 11,
      winnerNextMatchId: 'u2',
    });
    const disconnectedRoot = buildMatch('u2', {
      matchId: 12,
      previousLeftId: 'u1',
    });

    const bracket: TournamentBracket = {
      tournament: { doubleElimination: false } as TournamentBracket['tournament'],
      matches: {
        [treeLeft.$id]: treeLeft,
        [treeRight.$id]: treeRight,
        [treeRoot.$id]: treeRoot,
        [disconnectedLeaf.$id]: disconnectedLeaf,
        [disconnectedRoot.$id]: disconnectedRoot,
      },
      teams: [],
      isHost: false,
      canManage: false,
    };

    renderWithMantine(<TournamentBracketView bracket={bracket} />);

    expect(screen.getByText('Unplaced Matches (2)')).toBeInTheDocument();
    expect(screen.getByText('match-u1').closest('div.absolute')).toBeNull();
    expect(screen.getByText('match-t1').closest('div.absolute')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Collapse unplaced matches'));
    expect(screen.queryByText('Unplaced Matches (2)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand unplaced matches'));
    expect(screen.getByText('Unplaced Matches (2)')).toBeInTheDocument();
  });

  it('builds losers view from tournament root and only gates traversal by child bracket type', async () => {
    renderWithMantine(<TournamentBracketView bracket={buildLosersRootTraversalBracket()} />);

    fireEvent.click(screen.getByText('Losers Bracket'));
    await waitFor(() => {
    expect(screen.getByText('match-r')).toBeInTheDocument();
    });

    expect(screen.getByText('match-wA').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wB').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wA1').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-lA').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-lA1').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wMix').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wB1').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wB2').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-lB').closest('div.absolute')).not.toBeNull();

    // Descendants of non-traversed WB branches should remain unplaced.
    expect(screen.getByText('match-wA1Deep').closest('div.absolute')).toBeNull();
    expect(screen.getByText('match-wMixDeep').closest('div.absolute')).toBeNull();
    expect(screen.getByText('Unplaced Matches (2)')).toBeInTheDocument();
  });

  it('places WB children of traversed LB matches when previous IDs are missing but next links exist', async () => {
    renderWithMantine(<TournamentBracketView bracket={buildLosersBracketWithMissingPreviousIds()} />);

    fireEvent.click(screen.getByText('Losers Bracket'));
    await waitFor(() => {
      expect(screen.getByText('match-root')).toBeInTheDocument();
    });

    expect(screen.getByText('match-lTop').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-lChain').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wCross').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wCrossLeaf').closest('div.absolute')).toBeNull();
  });

  it('for LB parents, only renders WB children whose loserNext points to that parent', async () => {
    renderWithMantine(<TournamentBracketView bracket={buildLosersBracketWithInvalidWbChildLink()} />);

    fireEvent.click(screen.getByText('Losers Bracket'));
    await waitFor(() => {
      expect(screen.getByText('match-root2')).toBeInTheDocument();
    });

    expect(screen.getByText('match-lTop2').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wValid').closest('div.absolute')).not.toBeNull();
    expect(screen.getByText('match-wInvalid').closest('div.absolute')).toBeNull();
  });

  it('draws a connector for WB children in losers view when loserNext is missing but winnerNext targets parent', async () => {
    renderWithMantine(<TournamentBracketView bracket={buildLosersBracketWithWbWinnerFallbackLink()} />);

    fireEvent.click(screen.getByText('Losers Bracket'));
    await waitFor(() => {
      expect(screen.getByText('match-lbRoot3')).toBeInTheDocument();
    });

    const connectorPaths = document.querySelectorAll('svg path[marker-end=\"url(#schedule-arrowhead-losers)\"]');
    expect(connectorPaths.length).toBeGreaterThan(0);
  });
});

