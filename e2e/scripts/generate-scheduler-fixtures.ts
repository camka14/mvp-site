import fs from 'node:fs';
import path from 'node:path';
import { scheduleEvent } from '../../src/server/scheduler/scheduleEvent';
import { serializeMatchesLegacy } from '../../src/server/scheduler/serialize';
import { canonicalizeMatches } from '../utils/scheduler';
import { Division, League, PlayingField, Team, TimeSlot, Tournament } from '../../src/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildTeams = (division: Division, count: number): Record<string, Team> => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      seed: i,
      captainId: `captain_${i}`,
      division,
      name: `Team ${i}`,
      playerIds: [],
      wins: 0,
      losses: 0,
    });
  }
  return teams;
};

const buildField = (division: Division): Record<string, PlayingField> => ({
  field_1: new PlayingField({
    id: 'field_1',
    fieldNumber: 1,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  }),
});

const buildFullDaySlot = (start: Date): TimeSlot => {
  return new TimeSlot({
    id: 'slot_full_day',
    dayOfWeek: start.getDay(),
    startDate: start,
    endDate: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
    repeating: true,
    startTimeMinutes: 0,
    endTimeMinutes: 24 * 60,
  });
};

const buildTournament = (id: string, teamCount: number, doubleElimination: boolean): Tournament => {
  const division = new Division('OPEN', 'Open');
  const start = new Date('2026-03-01T10:00:00Z');
  const end = new Date('2026-03-10T10:00:00Z');
  const teams = buildTeams(division, teamCount);
  const fields = buildField(division);
  const timeSlots = [buildFullDaySlot(start)];

  return new Tournament({
    id,
    name: id,
    start,
    end,
    maxParticipants: teamCount,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teamSizeLimit: 6,
    divisions: [division],
    teams,
    fields,
    timeSlots,
    doubleElimination,
    winnerSetCount: 2,
    loserSetCount: 1,
    usesSets: true,
    setDurationMinutes: 20,
    setsPerMatch: 2,
    winnerBracketPointsToVictory: [21],
    loserBracketPointsToVictory: [15],
    fieldCount: 1,
    price: 0,
    location: 'Test City',
    coordinates: [-122.4194, 37.7749],
    imageId: 'image_1',
    hostId: 'user_host',
    singleDivision: true,
    waitListIds: [],
    freeAgentIds: [],
    registrationIds: [],
    referees: [],
    players: [],
    requiredTemplateIds: [],
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    state: 'PUBLISHED',
  });
};

const buildLeague = (id: string, withSlots: boolean, startEqualsEnd: boolean): League => {
  const division = new Division('OPEN', 'Open');
  const start = new Date('2026-04-01T10:00:00Z');
  const end = startEqualsEnd ? new Date(start) : new Date('2026-04-10T10:00:00Z');
  const teams = buildTeams(division, 4);
  const fields = buildField(division);
  const timeSlots = withSlots ? [buildFullDaySlot(start)] : [];

  return new League({
    id,
    name: id,
    start,
    end,
    maxParticipants: 4,
    teamSignup: true,
    eventType: 'LEAGUE',
    teamSizeLimit: 6,
    divisions: [division],
    teams,
    fields,
    timeSlots,
    gamesPerOpponent: 1,
    includePlayoffs: false,
    playoffTeamCount: 0,
    usesSets: false,
    matchDurationMinutes: 60,
    price: 0,
    location: 'Test City',
    coordinates: [-122.4194, 37.7749],
    imageId: 'image_1',
    hostId: 'user_host',
    singleDivision: true,
    waitListIds: [],
    freeAgentIds: [],
    registrationIds: [],
    referees: [],
    players: [],
    requiredTemplateIds: [],
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentDueDates: [],
    installmentAmounts: [],
    allowTeamSplitDefault: false,
    state: 'PUBLISHED',
  });
};

const writeFixture = (name: string, data: unknown) => {
  const dir = path.resolve(__dirname, '..', 'fixtures', 'scheduler');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
};

const run = () => {
  const tourney8 = buildTournament('event_tournament_8', 8, false);
  const tourney6 = buildTournament('event_tournament_6', 6, false);
  const tourneyDE = buildTournament('event_tournament_de', 8, true);

  const leagueNoSlots = buildLeague('event_league_no_slots', false, false);
  const leagueSameDay = buildLeague('event_league_same_day', true, true);

  const tourney8Result = scheduleEvent({ event: tourney8 }, context);
  const tourney6Result = scheduleEvent({ event: tourney6 }, context);
  const tourneyDEResult = scheduleEvent({ event: tourneyDE }, context);
  const leagueSameDayResult = scheduleEvent({ event: leagueSameDay }, context);

  writeFixture('tournament-8', canonicalizeMatches(serializeMatchesLegacy(tourney8Result.matches)));
  writeFixture('tournament-6', canonicalizeMatches(serializeMatchesLegacy(tourney6Result.matches)));
  writeFixture('tournament-double-elim', canonicalizeMatches(serializeMatchesLegacy(tourneyDEResult.matches)));
  writeFixture('league-same-day', {
    eventId: leagueSameDay.id,
    eventEnd: leagueSameDayResult.event.end.toISOString(),
  });

  writeFixture('league-no-slots', {
    eventId: leagueNoSlots.id,
    error:
      'Unable to schedule league because no recurring time slots are configured. Add weekly field availability to continue.',
  });
};

run();
