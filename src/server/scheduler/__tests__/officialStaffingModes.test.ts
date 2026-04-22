/** @jest-environment node */

import { OfficialStaffingPlanner } from '@/server/scheduler/officialStaffing';
import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, Match, PlayingField, Team, Tournament, UserData } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (id: string, labelNumber: number, division: Division) => new PlayingField({
  id,
  divisions: [division],
  matches: [],
  events: [],
  rentalSlots: [],
  name: `Court ${labelNumber}`,
});

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${i}`,
      division,
      name: `Team ${i}`,
      matches: [],
    });
  }
  return teams;
};

const buildTournament = (mode: 'STAFFING' | 'SCHEDULE' | 'OFF') => {
  const division = buildDivision();
  const fields = {
    field_1: buildField('field_1', 1, division),
    field_2: buildField('field_2', 2, division),
  };
  const official = new UserData({
    id: 'official_1',
    divisions: [division],
    matches: [],
  });

  return new Tournament({
    id: `tournament_${mode.toLowerCase()}`,
    name: `Tournament ${mode}`,
    start: new Date(2026, 0, 3, 9, 0, 0),
    end: new Date(2026, 0, 3, 13, 0, 0),
    maxParticipants: 4,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams: buildTeams(4, division),
    divisions: [division],
    fields,
    officials: [official],
    doTeamsOfficiate: false,
    doubleElimination: false,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    officialSchedulingMode: mode,
    officialPositions: [
      { id: 'referee', name: 'Referee', count: 1, order: 0 },
    ],
    eventOfficials: [
      {
        id: 'event_official_1',
        userId: official.id,
        positionIds: ['referee'],
        fieldIds: [],
        isActive: true,
      },
    ],
  });
};

const buildPlannerMatch = (
  id: string,
  division: Division,
  field: PlayingField,
  team1: Team,
  team2: Team,
  startHour: number,
) => new Match({
  id,
  start: new Date(2026, 0, 3, startHour, 0, 0),
  end: new Date(2026, 0, 3, startHour + 1, 0, 0),
  division,
  field,
  bufferMs: 0,
  eventId: 'planner_event',
  team1,
  team2,
});

const overlappingAssignments = (scheduled: ReturnType<typeof scheduleEvent>['event']) => {
  const matches = Object.values(scheduled.matches).sort((left, right) => left.start.getTime() - right.start.getTime());
  const conflicts: Array<[string, string]> = [];
  for (let index = 0; index < matches.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < matches.length; compareIndex += 1) {
      const left = matches[index];
      const right = matches[compareIndex];
      if (left.end.getTime() <= right.start.getTime() || right.end.getTime() <= left.start.getTime()) {
        continue;
      }
      const leftUsers = new Set(left.officialAssignments.map((assignment) => assignment.userId));
      const rightUsers = new Set(right.officialAssignments.map((assignment) => assignment.userId));
      for (const userId of leftUsers) {
        if (rightUsers.has(userId)) {
          conflicts.push([left.id, right.id]);
        }
      }
    }
  }
  return conflicts;
};

describe('official staffing modes', () => {
  it('STAFFING staggers matches to maintain full official coverage', () => {
    const tournament = buildTournament('STAFFING');

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const matches = Object.values(scheduled.matches);

    expect(matches).toHaveLength(3);
    expect(matches.every((match) => Array.isArray(match.officialAssignments))).toBe(true);
    expect(matches.every((match) => match.officialAssignments.length === 1)).toBe(true);
    expect(overlappingAssignments(scheduled)).toHaveLength(0);

    const firstRoundMatches = matches.filter((match) => match.winnerNextMatch);
    expect(firstRoundMatches).toHaveLength(2);
    const distinctStartTimes = new Set(firstRoundMatches.map((match) => match.start.getTime()));
    expect(distinctStartTimes.size).toBe(2);
  });

  it('SCHEDULE preserves match timing and leaves unstaffed matches empty when needed', () => {
    const tournament = buildTournament('SCHEDULE');

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const matches = Object.values(scheduled.matches);
    const firstRoundMatches = matches.filter((match) => match.winnerNextMatch);

    expect(firstRoundMatches).toHaveLength(2);
    const distinctStartTimes = new Set(firstRoundMatches.map((match) => match.start.getTime()));
    expect(distinctStartTimes.size).toBe(1);
    expect(matches.some((match) => match.officialAssignments.length === 0)).toBe(true);
    expect(overlappingAssignments(scheduled)).toHaveLength(0);
  });

  it('OFF assigns overlapping officials and marks conflicts', () => {
    const tournament = buildTournament('OFF');

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const matches = Object.values(scheduled.matches);
    const firstRoundMatches = matches.filter((match) => match.winnerNextMatch);

    expect(firstRoundMatches).toHaveLength(2);
    const distinctStartTimes = new Set(firstRoundMatches.map((match) => match.start.getTime()));
    expect(distinctStartTimes.size).toBe(1);
    expect(matches.every((match) => match.officialAssignments.length === 1)).toBe(true);
    expect(overlappingAssignments(scheduled).length).toBeGreaterThan(0);
    expect(matches.some((match) => match.officialAssignments.some((assignment) => assignment.hasConflict))).toBe(true);
  });

  it('balances exact position assignments across sequential matches', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(4, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_fairness',
      name: 'Planner Fairness',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const firstMatch = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);
    const secondMatch = buildPlannerMatch('match_2', division, field, teams[2], teams[3], 10);

    planner.assignMatches([firstMatch, secondMatch]);

    expect(firstMatch.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_1' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_2' }),
    ]);
    expect(secondMatch.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_2' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_1' }),
    ]);
  });

  it('SCHEDULE keeps assignable single-position officials when another slot has no candidates', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(2, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_single_position_candidates',
      name: 'Planner Single Position Candidates',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    planner.assignMatch(match);

    expect(match.officialAssignments).toHaveLength(1);
    expect(match.officialAssignments[0]).toEqual(expect.objectContaining({ positionId: 'r1' }));
    expect(['official_1', 'official_2']).toContain(match.officialAssignments[0].userId);
  });

  it('assigns officials from position-specific pools per slot', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(2, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_position_pools',
      name: 'Planner Position Pools',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    planner.assignMatch(match);

    expect(match.officialAssignments).toHaveLength(2);
    expect(match.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_1' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_2' }),
    ]);
  });

  it('OFF still avoids assigning the same user twice in one match', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(2, division));
    const official = new UserData({ id: 'official_1', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_off_unique_user',
      name: 'Planner OFF Uniqueness',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'OFF',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    planner.assignMatch(match);

    expect(match.officialAssignments).toHaveLength(1);
    expect(match.officialAssignments[0]).toEqual(expect.objectContaining({ userId: 'official_1' }));
    expect(new Set(match.officialAssignments.map((assignment) => assignment.userId)).size).toBe(1);
  });
});
