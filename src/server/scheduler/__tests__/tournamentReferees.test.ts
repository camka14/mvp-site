/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import {
  finalizeMatch,
  finalizeMatchWithoutRescheduling,
  finalizeMatchWithTeamOfficialCapacityFallback,
} from '@/server/scheduler/updateMatch';
import { Division, PlayingField, Team, TimeSlot, Tournament, UserData } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (division: Division) =>
  new PlayingField({
    id: 'field_1',
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  });

const buildNamedField = (id: string, name: string, division: Division) =>
  new PlayingField({
    id,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name,
  });

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
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
    timeSlots: overrides.timeSlots ?? [],
    officials: overrides.officials ?? [],
    doTeamsOfficiate: overrides.doTeamsOfficiate ?? true,
    doubleElimination: overrides.doubleElimination ?? false,
    winnerSetCount: overrides.winnerSetCount ?? 2,
    loserSetCount: overrides.loserSetCount ?? 1,
    usesSets: overrides.usesSets ?? true,
    setDurationMinutes: overrides.setDurationMinutes ?? 20,
    restTimeMinutes: overrides.restTimeMinutes ?? 0,
  });
};

describe('tournament scheduling (officials)', () => {
  it('assigns official officials for every scheduled match (even future matches with TBD teams)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const official = new UserData({ id: 'official_1', divisions: [], matches: [] });

    const tournament = buildTournament({
      id: 'tournament_official_refs',
      teams,
      divisions: [division],
      officials: [official],
      doTeamsOfficiate: false,
    });

    const scheduled = scheduleEvent({ event: tournament }, context);
    const matches = [...scheduled.matches];

    // Sanity check: bracket should include future match with TBD team assignments.
    expect(matches.some((match) => !match.team1 || !match.team2)).toBe(true);

    for (const match of matches) {
      expect(match.official?.id).toBe('official_1');
    }
  });

  it('assigns team officials based on results for future matches (single elimination)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);

    const tournament = buildTournament({
      id: 'tournament_team_refs',
      teams,
      divisions: [division],
      officials: [],
      doTeamsOfficiate: true,
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

    // Team officials are only assigned when both teams are known.
    expect(final?.teamOfficial ?? null).toBeNull();

    const semi = semis[0];
    expect(semi.team1).toBeTruthy();
    expect(semi.team2).toBeTruthy();
    expect(semi.teamOfficial).toBeTruthy();
    expect(semi.teamOfficial).not.toBe(semi.team1);
    expect(semi.teamOfficial).not.toBe(semi.team2);

    // Complete the semi: team1 wins.
    semi.setResults = [1, 1];
    semi.team1Points = [21, 21];
    semi.team2Points = [10, 10];

    const winner = semi.team1 as Team;
    const loser = semi.team2 as Team;
    finalizeMatch(tournament, semi, context, new Date(semi.end));

    expect(final?.team1 === winner || final?.team2 === winner).toBe(true);
    expect(final?.teamOfficial?.id).toBe(loser.id);
  });

  it('advances a confirmed result without rebuilding the existing bracket schedule', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const tournament = buildTournament({
      id: 'tournament_preserve_existing_schedule',
      teams,
      divisions: [division],
      officials: [],
      doTeamsOfficiate: true,
      doubleElimination: false,
    });

    scheduleEvent({ event: tournament }, context);
    const matches = Object.values(tournament.matches);
    const final = matches.find(
      (match) =>
        !match.losersBracket &&
        !match.winnerNextMatch &&
        Boolean(match.previousLeftMatch || match.previousRightMatch),
    );
    const semi = matches.find((match) => match.winnerNextMatch === final);
    expect(final).toBeTruthy();
    expect(semi?.team1).toBeTruthy();
    expect(semi?.team2).toBeTruthy();
    if (!final || !semi) return;

    const finalStart = final.start.getTime();
    const winner = semi.team1 as Team;
    semi.setResults = [1, 1];
    semi.team1Points = [21, 21];
    semi.team2Points = [12, 8];

    finalizeMatchWithoutRescheduling(tournament, semi, new Date(semi.end));

    expect(final.team1 === winner || final.team2 === winner).toBe(true);
    expect(final.start.getTime()).toBe(finalStart);
    expect(semi.status).toBe('COMPLETE');
  });

  it('preserves a confirmed result when auto-rescheduling has no eligible field', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const timeSlot = new TimeSlot({
      id: 'slot_field_mapping_fallback',
      dayOfWeek: 5,
      startDate: new Date(2026, 0, 3),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 23 * 60,
      divisions: [division],
    });
    const tournament = buildTournament({
      id: 'tournament_field_mapping_fallback',
      teams,
      divisions: [division],
      timeSlots: [timeSlot],
      officials: [],
      doTeamsOfficiate: false,
      doubleElimination: false,
    });

    scheduleEvent({ event: tournament }, context);
    const matches = Object.values(tournament.matches);
    const final = matches.find(
      (match) => !match.winnerNextMatch && match.previousLeftMatch && match.previousRightMatch,
    );
    const semi = matches.find((match) => match.winnerNextMatch === final);
    expect(final).toBeTruthy();
    expect(semi?.team1).toBeTruthy();
    expect(semi?.team2).toBeTruthy();
    if (!final || !semi?.team1 || !semi.team2) return;

    const finalStart = final.start.getTime();
    const winner = semi.team1;
    semi.setResults = [1, 1];
    semi.team1Points = [21, 21];
    semi.team2Points = [12, 8];

    const incompatibleDivision = new Division('OTHER', 'Other');
    timeSlot.divisions = [incompatibleDivision];
    const fallbackContext = { log: jest.fn(), error: jest.fn() };

    expect(() => finalizeMatchWithTeamOfficialCapacityFallback(
      tournament,
      semi,
      fallbackContext,
      new Date(semi.end),
    )).not.toThrow();

    expect(semi.status).toBe('COMPLETE');
    expect(semi.winnerEventTeamId).toBe(winner.id);
    expect(final.team1 === winner || final.team2 === winner).toBe(true);
    expect(final.start.getTime()).toBe(finalStart);
    expect(fallbackContext.error).toHaveBeenCalledWith(expect.stringContaining('preserving the existing schedule'));
  });

  it('keeps bracket participant slots intact when a feeder is finalized again', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const tournament = buildTournament({
      id: 'tournament_idempotent_advancement',
      teams,
      divisions: [division],
      officials: [],
      doTeamsOfficiate: false,
      doubleElimination: false,
    });

    scheduleEvent({ event: tournament }, context);
    const final = Object.values(tournament.matches).find(
      (match) => !match.winnerNextMatch && match.previousLeftMatch && match.previousRightMatch,
    );
    expect(final).toBeTruthy();
    if (!final?.previousLeftMatch || !final.previousRightMatch) return;

    const leftSemi = final.previousLeftMatch;
    const rightSemi = final.previousRightMatch;
    const initialLeftWinner = leftSemi.team1 as Team;
    const rightWinner = rightSemi.team1 as Team;

    leftSemi.setResults = [1, 1];
    leftSemi.team1Points = [21, 21];
    leftSemi.team2Points = [10, 10];
    finalizeMatchWithoutRescheduling(tournament, leftSemi, new Date(leftSemi.end));

    rightSemi.setResults = [1, 1];
    rightSemi.team1Points = [21, 21];
    rightSemi.team2Points = [10, 10];
    finalizeMatchWithoutRescheduling(tournament, rightSemi, new Date(rightSemi.end));

    expect(final.team1).toBe(initialLeftWinner);
    expect(final.team2).toBe(rightWinner);

    // Retrying the same confirmation is an idempotent no-op.
    finalizeMatchWithoutRescheduling(tournament, leftSemi, new Date(leftSemi.end));
    expect(final.team1).toBe(initialLeftWinner);
    expect(final.team2).toBe(rightWinner);
  });

  it('stagger first-round matches when teams officiate and only one team official is available', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);
    const fields = {
      field_1: buildNamedField('field_1', 'Court A', division),
      field_2: buildNamedField('field_2', 'Court B', division),
    };

    const tournament = buildTournament({
      id: 'tournament_team_ref_capacity',
      teams,
      divisions: [division],
      fields,
      officials: [],
      doTeamsOfficiate: true,
      doubleElimination: false,
    });

    scheduleEvent({ event: tournament }, context);
    const firstRoundMatches = Object.values(tournament.matches)
      .filter((match) => match.winnerNextMatch && match.team1 && match.team2)
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    expect(firstRoundMatches).toHaveLength(2);
    expect(firstRoundMatches.every((match) => Boolean(match.teamOfficial))).toBe(true);
    expect(firstRoundMatches[0].end.getTime()).toBeLessThanOrEqual(firstRoundMatches[1].start.getTime());
  });

  it('reschedules dependent matches when a match runs long (pushes following matches later)', () => {
    const division = buildDivision();
    const teams = buildTeams(4, division);

    const tournament = buildTournament({
      id: 'tournament_reschedule_long',
      teams,
      divisions: [division],
      officials: [],
      doTeamsOfficiate: true,
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
      officials: [],
      doTeamsOfficiate: true,
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

