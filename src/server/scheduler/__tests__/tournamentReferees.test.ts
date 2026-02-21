/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { finalizeMatch } from '@/server/scheduler/updateMatch';
import { Division, PlayingField, Team, Tournament, UserData } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (division: Division) =>
  new PlayingField({
    id: 'field_1',
    fieldNumber: 1,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  });

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      seed: i,
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

const buildTournament = (overrides: Partial<ConstructorParameters<typeof Tournament>[0]>) => {
  const division = overrides.divisions?.[0] ?? buildDivision();
  const field = Object.values(overrides.fields ?? {})[0] ?? buildField(division);
  const start = overrides.start ?? new Date(2026, 0, 3, 9, 0, 0);
  const end = overrides.end ?? new Date(2026, 0, 3, 23, 0, 0);

  return new Tournament({
    id: 'tournament_1',
    name: 'Test Tournament',
    start,
    end,
    maxParticipants: Object.keys(overrides.teams ?? {}).length || 4,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams: overrides.teams ?? buildTeams(4, division),
    divisions: overrides.divisions ?? [division],
    fields: overrides.fields ?? { [field.id]: field },
    referees: overrides.referees ?? [],
    doTeamsRef: overrides.doTeamsRef ?? true,
    doubleElimination: overrides.doubleElimination ?? false,
    winnerSetCount: overrides.winnerSetCount ?? 2,
    loserSetCount: overrides.loserSetCount ?? 1,
    usesSets: overrides.usesSets ?? true,
    setDurationMinutes: overrides.setDurationMinutes ?? 20,
    restTimeMinutes: overrides.restTimeMinutes ?? 0,
  });
};

describe('tournament scheduling (referees)', () => {
  it('assigns official referees for every scheduled match (even future matches with TBD teams)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const ref = new UserData({ id: 'ref_1', divisions: [], matches: [] });

    const tournament = buildTournament({
      id: 'tournament_official_refs',
      teams,
      divisions: [division],
      referees: [ref],
      doTeamsRef: false,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    const matches = [...scheduled.matches];

    // Sanity check: bracket should include future match with TBD team assignments.
    expect(matches.some((match) => !match.team1 || !match.team2)).toBe(true);

    for (const match of matches) {
      expect(match.referee?.id).toBe('ref_1');
    }
  });

  it('assigns team referees based on results for future matches (single elimination)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);

    const tournament = buildTournament({
      id: 'tournament_team_refs',
      teams,
      divisions: [division],
      referees: [],
      doTeamsRef: true,
      doubleElimination: false,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    const matches = Object.values(tournament.matches);

    const final = matches.find(
      (match) =>
        !match.losersBracket &&
        !match.winnerNextMatch &&
        Boolean(match.previousLeftMatch || match.previousRightMatch),
    );
    expect(final).toBeTruthy();

    const semis = matches.filter((match) => match.winnerNextMatch && match.winnerNextMatch === final);
    expect(semis).toHaveLength(2);

    // Team refs are only assigned when both teams are known.
    expect(final?.teamReferee ?? null).toBeNull();

    const semi = semis[0];
    expect(semi.team1).toBeTruthy();
    expect(semi.team2).toBeTruthy();
    expect(semi.teamReferee).toBeTruthy();
    expect(semi.teamReferee).not.toBe(semi.team1);
    expect(semi.teamReferee).not.toBe(semi.team2);

    // Complete the semi: team1 wins.
    semi.setResults = [1, 1];
    semi.team1Points = [21, 21];
    semi.team2Points = [10, 10];

    const winner = semi.team1 as Team;
    const loser = semi.team2 as Team;
    finalizeMatch(tournament, semi, context, new Date(semi.end));

    expect(final?.team1 === winner || final?.team2 === winner).toBe(true);
    expect(final?.teamReferee?.id).toBe(loser.id);
  });

  it('reschedules dependent matches when a match runs long (pushes following matches later)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);

    const tournament = buildTournament({
      id: 'tournament_reschedule_long',
      teams,
      divisions: [division],
      referees: [],
      doTeamsRef: true,
      doubleElimination: false,
      restTimeMinutes: 0,
    });

    scheduleEvent({ event: tournament }, context);
    const matches = Object.values(tournament.matches);

    const final = matches.find(
      (match) =>
        !match.losersBracket &&
        !match.winnerNextMatch &&
        Boolean(match.previousLeftMatch || match.previousRightMatch),
    );
    expect(final).toBeTruthy();

    const semis = matches.filter((match) => match.winnerNextMatch && match.winnerNextMatch === final);
    expect(semis).toHaveLength(2);

    const lastSemi = [...semis].sort((a, b) => b.end.getTime() - a.end.getTime())[0];
    const originalFinalStart = (final as any).start.getTime();

    // Extend the match end time by 30 minutes to simulate running long.
    lastSemi.end = new Date(lastSemi.end.getTime() + 30 * 60 * 1000);
    lastSemi.setResults = [1, 1];
    lastSemi.team1Points = [21, 21];
    lastSemi.team2Points = [10, 10];

    finalizeMatch(tournament, lastSemi, context, new Date(lastSemi.end));

    expect((final as any).start.getTime()).toBeGreaterThanOrEqual(lastSemi.end.getTime());
    expect((final as any).start.getTime()).toBeGreaterThan(originalFinalStart);
  });

  it('does not reschedule locked downstream matches when a prior match runs long', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);

    const tournament = buildTournament({
      id: 'tournament_reschedule_locked',
      teams,
      divisions: [division],
      referees: [],
      doTeamsRef: true,
      doubleElimination: false,
      restTimeMinutes: 0,
    });

    scheduleEvent({ event: tournament }, context);
    const matches = Object.values(tournament.matches);

    const final = matches.find(
      (match) =>
        !match.losersBracket &&
        !match.winnerNextMatch &&
        Boolean(match.previousLeftMatch || match.previousRightMatch),
    );
    expect(final).toBeTruthy();
    if (!final) return;

    final.locked = true;

    const semis = matches.filter((match) => match.winnerNextMatch && match.winnerNextMatch === final);
    expect(semis).toHaveLength(2);

    const lastSemi = [...semis].sort((a, b) => b.end.getTime() - a.end.getTime())[0];
    const originalFinalStart = final.start.getTime();

    lastSemi.end = new Date(lastSemi.end.getTime() + 30 * 60 * 1000);
    lastSemi.setResults = [1, 1];
    lastSemi.team1Points = [21, 21];
    lastSemi.team2Points = [10, 10];

    finalizeMatch(tournament, lastSemi, context, new Date(lastSemi.end));

    expect(final.start.getTime()).toBe(originalFinalStart);
  });
});
