import { buildPublicBracketWidgetView } from '@/server/publicWidgetBracket';

type TestMatch = {
  id: string;
  matchId: number;
  losersBracket: boolean;
  division: string;
  previousLeftId: null;
  previousRightId: null;
  winnerNextMatchId: null;
  loserNextMatchId: null;
  previousLeftMatch: TestMatch | null;
  previousRightMatch: TestMatch | null;
  winnerNextMatch: TestMatch | null;
  loserNextMatch: TestMatch | null;
  start: Date;
  field: { id: string; name: string };
  team1: null;
  team2: null;
  team1Points: number[];
  team2Points: number[];
};

const createMatch = (
  id: string,
  matchId: number,
  division: string,
): TestMatch => ({
  id,
  matchId,
  losersBracket: false,
  division,
  previousLeftId: null,
  previousRightId: null,
  winnerNextMatchId: null,
  loserNextMatchId: null,
  previousLeftMatch: null,
  previousRightMatch: null,
  winnerNextMatch: null,
  loserNextMatch: null,
  start: new Date('2026-08-02T17:00:00.000Z'),
  field: { id: 'main', name: 'Main' },
  team1: null,
  team2: null,
  team1Points: [],
  team2Points: [],
});

describe('buildPublicBracketWidgetView', () => {
  it('renders the full winners bracket from relation-only links and skips losers for single elimination', () => {
    const division = 'division_open';
    const match91 = createMatch('match_91', 91, division);
    const match95 = createMatch('match_95', 95, division);
    const match97 = createMatch('match_97', 97, division);
    const match99 = createMatch('match_99', 99, division);
    const match101 = createMatch('match_101', 101, division);
    const match103 = createMatch('match_103', 103, division);
    const match105 = createMatch('match_105', 105, division);
    const match107 = createMatch('match_107', 107, division);

    match91.winnerNextMatch = match95;

    match95.previousLeftMatch = match91;
    match95.winnerNextMatch = match103;

    match97.winnerNextMatch = match103;

    match99.winnerNextMatch = match105;

    match101.winnerNextMatch = match105;

    match103.previousLeftMatch = match95;
    match103.previousRightMatch = match97;
    match103.winnerNextMatch = match107;

    match105.previousLeftMatch = match99;
    match105.previousRightMatch = match101;
    match105.winnerNextMatch = match107;

    match107.previousLeftMatch = match103;
    match107.previousRightMatch = match105;

    const view = buildPublicBracketWidgetView({
      matches: {
        [match91.id]: match91,
        [match95.id]: match95,
        [match97.id]: match97,
        [match99.id]: match99,
        [match101.id]: match101,
        [match103.id]: match103,
        [match105.id]: match105,
        [match107.id]: match107,
      },
    } as any, division);

    expect(view).not.toBeNull();
    expect(view?.selectedDivisionId).toBe(division);
    expect(view?.winnersLane?.matchIds).toHaveLength(8);
    expect(view?.winnersLane?.matchIds).toEqual(expect.arrayContaining([
      'match_91',
      'match_95',
      'match_97',
      'match_99',
      'match_101',
      'match_103',
      'match_105',
      'match_107',
    ]));
    expect(view?.winnersLane?.connections.length).toBeGreaterThan(0);
    expect(view?.winnersLane?.cardsById.match_107).toEqual(expect.objectContaining({
      team1Name: 'Winner of match #103',
      team2Name: 'Winner of match #105',
    }));
    expect(view?.losersLane).toBeNull();
    expect(view?.hasLosersBracket).toBe(false);
  });
});
