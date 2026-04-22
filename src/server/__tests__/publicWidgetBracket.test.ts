import { buildPublicBracketWidgetView } from '@/server/publicWidgetBracket';

type TestMatch = {
  id: string;
  matchId: number;
  losersBracket: boolean;
  division: string;
  team1Seed?: number | null;
  team2Seed?: number | null;
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
  team1Seed: null,
  team2Seed: null,
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

  it('uses direct league placement labels for empty first-round slots when playoffs are not split', () => {
    const division = {
      id: 'division_open',
      name: 'Open',
      playoffTeamCount: 4,
      playoffPlacementDivisionIds: [],
    };
    const semifinalA = createMatch('match_1', 1, division.id);
    const semifinalB = createMatch('match_2', 2, division.id);
    const finalMatch = createMatch('match_3', 3, division.id);

    semifinalA.team1Seed = 1;
    semifinalA.team2Seed = 4;
    semifinalA.winnerNextMatch = finalMatch;

    semifinalB.team1Seed = 2;
    semifinalB.team2Seed = 3;
    semifinalB.winnerNextMatch = finalMatch;

    finalMatch.previousLeftMatch = semifinalA;
    finalMatch.previousRightMatch = semifinalB;

    const view = buildPublicBracketWidgetView({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 4,
      divisions: [division],
      playoffDivisions: [],
      matches: {
        [semifinalA.id]: semifinalA,
        [semifinalB.id]: semifinalB,
        [finalMatch.id]: finalMatch,
      },
    } as any, division.id);

    expect(view).not.toBeNull();
    expect(view?.winnersLane?.cardsById.match_1).toEqual(expect.objectContaining({
      team1Name: '1st place (Open)',
      team2Name: '4th place (Open)',
    }));
    expect(view?.winnersLane?.cardsById.match_2).toEqual(expect.objectContaining({
      team1Name: '2nd place (Open)',
      team2Name: '3rd place (Open)',
    }));
  });

  it('ignores stale unmatched relation objects when resolving bye-slot placement labels', () => {
    const division = {
      id: 'division_open',
      name: 'Open',
      playoffTeamCount: 9,
      playoffPlacementDivisionIds: [],
    };
    const playIn = createMatch('match_91', 91, division.id);
    const byeCarry = createMatch('match_95', 95, division.id);
    const otherSide = createMatch('match_97', 97, division.id);
    const finalMatch = createMatch('match_103', 103, division.id);

    playIn.team1Seed = 8;
    playIn.team2Seed = 9;
    playIn.winnerNextMatch = byeCarry;

    byeCarry.team2Seed = '1' as unknown as number;
    byeCarry.previousLeftMatch = playIn;
    byeCarry.previousRightMatch = { id: 'stale_missing_match' } as any;
    byeCarry.winnerNextMatch = finalMatch;

    otherSide.team1Seed = 4;
    otherSide.team2Seed = 5;
    otherSide.winnerNextMatch = finalMatch;

    finalMatch.previousLeftMatch = byeCarry;
    finalMatch.previousRightMatch = otherSide;

    const view = buildPublicBracketWidgetView({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 9,
      divisions: [division],
      playoffDivisions: [],
      matches: {
        [playIn.id]: playIn,
        [byeCarry.id]: byeCarry,
        [otherSide.id]: otherSide,
        [finalMatch.id]: finalMatch,
      },
    } as any, division.id);

    expect(view).not.toBeNull();
    expect(view?.winnersLane?.cardsById.match_95).toEqual(expect.objectContaining({
      team1Name: 'Winner of match #91',
      team2Name: '1st place (Open)',
    }));
  });

  it('renders both carried bye seeds for a 10-team non-split league bracket', () => {
    const division = {
      id: 'division_open',
      name: 'Open',
      playoffTeamCount: 10,
      playoffPlacementDivisionIds: [],
    };
    const playInOne = createMatch('match_91', 91, division.id);
    const playInTwo = createMatch('match_93', 93, division.id);
    const carryOne = createMatch('match_95', 95, division.id);
    const quarterOne = createMatch('match_97', 97, division.id);
    const carryTwo = createMatch('match_99', 99, division.id);
    const quarterTwo = createMatch('match_101', 101, division.id);
    const semifinalOne = createMatch('match_103', 103, division.id);
    const semifinalTwo = createMatch('match_105', 105, division.id);
    const finalMatch = createMatch('match_107', 107, division.id);

    playInOne.team1Seed = 8;
    playInOne.team2Seed = 9;
    playInOne.winnerNextMatch = carryOne;

    playInTwo.team1Seed = 7;
    playInTwo.team2Seed = 10;
    playInTwo.winnerNextMatch = carryTwo;

    carryOne.team2Seed = 1;
    carryOne.previousLeftMatch = playInOne;
    carryOne.winnerNextMatch = semifinalOne;

    quarterOne.team1Seed = 4;
    quarterOne.team2Seed = 5;
    quarterOne.winnerNextMatch = semifinalOne;

    carryTwo.team2Seed = 2;
    carryTwo.previousLeftMatch = playInTwo;
    carryTwo.winnerNextMatch = semifinalTwo;

    quarterTwo.team1Seed = 3;
    quarterTwo.team2Seed = 6;
    quarterTwo.winnerNextMatch = semifinalTwo;

    semifinalOne.previousLeftMatch = carryOne;
    semifinalOne.previousRightMatch = quarterOne;
    semifinalOne.winnerNextMatch = finalMatch;

    semifinalTwo.previousLeftMatch = carryTwo;
    semifinalTwo.previousRightMatch = quarterTwo;
    semifinalTwo.winnerNextMatch = finalMatch;

    finalMatch.previousLeftMatch = semifinalOne;
    finalMatch.previousRightMatch = semifinalTwo;

    const view = buildPublicBracketWidgetView({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 10,
      divisions: [division],
      playoffDivisions: [],
      matches: {
        [playInOne.id]: playInOne,
        [playInTwo.id]: playInTwo,
        [carryOne.id]: carryOne,
        [quarterOne.id]: quarterOne,
        [carryTwo.id]: carryTwo,
        [quarterTwo.id]: quarterTwo,
        [semifinalOne.id]: semifinalOne,
        [semifinalTwo.id]: semifinalTwo,
        [finalMatch.id]: finalMatch,
      },
    } as any, division.id);

    expect(view).not.toBeNull();
    expect(view?.winnersLane?.cardsById.match_95).toEqual(expect.objectContaining({
      team1Name: 'Winner of match #91',
      team2Name: '1st place (Open)',
    }));
    expect(view?.winnersLane?.cardsById.match_99).toEqual(expect.objectContaining({
      team1Name: 'Winner of match #93',
      team2Name: '2nd place (Open)',
    }));
  });

  it('renders carried bye labels for a non-split league even when the saved seed is on the dependency side', () => {
    const open = {
      id: 'division_open',
      name: 'CoEd Open • 18+',
      playoffTeamCount: 10,
      playoffPlacementDivisionIds: [],
    };
    const premier = {
      id: 'division_premier',
      name: 'CoEd Premier • 18+',
      playoffTeamCount: 10,
      playoffPlacementDivisionIds: [],
    };
    const playInOne = createMatch('match_91', 91, open.id);
    const carryOne = createMatch('match_95', 95, open.id);
    const quarterOne = createMatch('match_97', 97, open.id);
    const semifinalOne = createMatch('match_103', 103, open.id);
    const semifinalTwo = createMatch('match_105', 105, open.id);

    playInOne.team1Seed = 8;
    playInOne.team2Seed = 9;
    playInOne.winnerNextMatch = carryOne;

    carryOne.team1Seed = 1;
    (carryOne as any).previousLeftId = playInOne.id;
    carryOne.previousLeftMatch = playInOne;
    carryOne.winnerNextMatch = semifinalOne;

    quarterOne.team1Seed = 4;
    quarterOne.team2Seed = 5;
    quarterOne.winnerNextMatch = semifinalOne;

    semifinalOne.previousLeftMatch = carryOne;
    semifinalOne.previousRightMatch = quarterOne;
    (semifinalOne as any).previousLeftId = carryOne.id;
    (semifinalOne as any).previousRightId = quarterOne.id;

    semifinalTwo.team1Seed = 3;
    semifinalTwo.team2Seed = 6;

    const view = buildPublicBracketWidgetView({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: 10,
      divisions: [open, premier],
      playoffDivisions: [],
      matches: {
        [playInOne.id]: playInOne,
        [carryOne.id]: carryOne,
        [quarterOne.id]: quarterOne,
        [semifinalOne.id]: semifinalOne,
        [semifinalTwo.id]: semifinalTwo,
      },
    } as any, open.id);

    expect(view).not.toBeNull();
    expect(view?.winnersLane?.cardsById.match_95).toEqual(expect.objectContaining({
      team1Name: 'Winner of match #91',
      team2Name: '1st place (CoEd Open • 18+)',
    }));
  });
});
