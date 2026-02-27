import { Division, League, Match, PlayingField, Team, TimeSlot, Tournament, UserData } from './types';

const serializeDivision = (division: Division) => ({
  id: division.id,
  name: division.name,
  kind: division.kind,
  teamIds: [...(division.teamIds ?? [])],
  playoffTeamCount: division.playoffTeamCount,
  playoffPlacementDivisionIds: [...(division.playoffPlacementDivisionIds ?? [])],
  standingsOverrides: division.standingsOverrides ? { ...division.standingsOverrides } : null,
  standingsConfirmedAt: division.standingsConfirmedAt ? division.standingsConfirmedAt.toISOString() : null,
  standingsConfirmedBy: division.standingsConfirmedBy ?? null,
  playoffConfig: division.playoffConfig
    ? {
        ...division.playoffConfig,
        winnerBracketPointsToVictory: [...(division.playoffConfig.winnerBracketPointsToVictory ?? [])],
        loserBracketPointsToVictory: [...(division.playoffConfig.loserBracketPointsToVictory ?? [])],
      }
    : null,
});

const serializeTeam = (team: Team) => ({
  id: team.id,
  captainId: team.captainId,
  division: team.division?.id ?? team.division,
  name: team.name,
  playerIds: team.playerIds ?? [],
});

const serializeField = (field: PlayingField) => ({
  id: field.id,
  fieldNumber: field.fieldNumber,
  organizationId: field.organizationId ?? null,
  divisions: field.divisions.map((division) => division.id),
  name: field.name,
});

const serializeTimeSlot = (slot: TimeSlot) => {
  const normalizedDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : [slot.dayOfWeek];
  const normalizedFieldIds = Array.isArray(slot.fieldIds) && slot.fieldIds.length
    ? slot.fieldIds
    : slot.field
      ? [slot.field]
      : [];
  return {
    id: slot.id,
    dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek,
    daysOfWeek: normalizedDays,
    startDate: slot.startDate?.toISOString(),
    endDate: slot.endDate ? slot.endDate.toISOString() : null,
    repeating: slot.repeating,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    price: slot.price ?? null,
    scheduledFieldId: normalizedFieldIds[0] ?? null,
    scheduledFieldIds: normalizedFieldIds,
    divisions: slot.divisions.map((division) => division.id),
  };
};

const serializeUser = (user: UserData) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  userName: user.userName,
});

const serializeMatch = (match: Match) => ({
  id: match.id,
  matchId: match.matchId ?? null,
  eventId: match.eventId,
  start: match.start ? match.start.toISOString() : null,
  end: match.end ? match.end.toISOString() : null,
  locked: Boolean(match.locked),
  division: match.division?.id ?? null,
  fieldId: match.field?.id ?? null,
  team1Id: match.team1?.id ?? null,
  team2Id: match.team2?.id ?? null,
  team1Seed: match.team1Seed ?? null,
  team2Seed: match.team2Seed ?? null,
  refereeId: match.referee?.id ?? null,
  teamRefereeId: match.teamReferee?.id ?? null,
  teamRefereeSeed: null,
  team1Points: match.team1Points ?? [],
  team2Points: match.team2Points ?? [],
  setResults: match.setResults ?? [],
  losersBracket: match.losersBracket ?? false,
  winnerNextMatchId: match.winnerNextMatch?.id ?? null,
  loserNextMatchId: match.loserNextMatch?.id ?? null,
  previousLeftId: match.previousLeftMatch?.id ?? null,
  previousRightId: match.previousRightMatch?.id ?? null,
  side: match.side ?? null,
  refereeCheckedIn: match.refereeCheckedIn ?? false,
  team1: match.team1 ? serializeTeam(match.team1) : null,
  team2: match.team2 ? serializeTeam(match.team2) : null,
  teamReferee: match.teamReferee ? serializeTeam(match.teamReferee) : null,
  referee: match.referee ? serializeUser(match.referee) : null,
  field: match.field ? serializeField(match.field) : null,
});

const serializeEventBase = (event: Tournament | League) => ({
  id: event.id,
  name: event.name,
  description: event.description,
  start: event.start.toISOString(),
  end: event.end.toISOString(),
  location: event.location,
  coordinates: event.coordinates ?? null,
  price: event.price ?? null,
  minAge: null,
  maxAge: null,
  rating: event.rating ?? null,
  imageId: event.imageId,
  hostId: event.hostId,
  assistantHostIds: event.assistantHostIds ?? [],
  noFixedEndDateTime: event.noFixedEndDateTime ?? true,
  state: event.state,
  maxParticipants: event.maxParticipants,
  teamSizeLimit: event.teamSizeLimit ?? null,
  restTimeMinutes: event.restTimeMinutes ?? 0,
  teamSignup: event.teamSignup,
  singleDivision: event.singleDivision,
  waitListIds: event.waitListIds ?? [],
  freeAgentIds: event.freeAgentIds ?? [],
  teamIds: Array.isArray(event.registeredTeamIds) && event.registeredTeamIds.length
    ? [...event.registeredTeamIds]
    : Object.keys(event.teams),
  userIds: event.players.map((player) => player.id),
  fieldIds: Object.keys(event.fields),
  timeSlotIds: event.timeSlots.map((slot) => slot.id),
  refereeIds: event.referees.map((ref) => ref.id),
  cancellationRefundHours: event.cancellationRefundHours ?? null,
  registrationCutoffHours: event.registrationCutoffHours ?? null,
  seedColor: event.seedColor ?? null,
  eventType: event.eventType,
  sportId: event.sportId ?? null,
  leagueScoringConfigId: (event.leagueScoringConfig as any)?.id ?? null,
  organizationId: event.organizationId ?? null,
  requiredTemplateIds: event.requiredTemplateIds ?? [],
  allowPaymentPlans: event.allowPaymentPlans ?? false,
  installmentCount: event.installmentCount ?? 0,
  installmentDueDates: event.installmentDueDates.map((date) => date.toISOString()),
  installmentAmounts: event.installmentAmounts ?? [],
  allowTeamSplitDefault: event.allowTeamSplitDefault ?? false,
  splitLeaguePlayoffDivisions: event.splitLeaguePlayoffDivisions ?? false,
  divisions: event.divisions.map((division) => division.id),
  divisionDetails: event.divisions.map(serializeDivision),
  playoffDivisionDetails: event instanceof League
    ? event.playoffDivisions.map(serializeDivision)
    : [],
  fields: Object.values(event.fields).map(serializeField),
  teams: Object.values(event.teams).map(serializeTeam),
  timeSlots: event.timeSlots.map(serializeTimeSlot),
  referees: event.referees.map(serializeUser),
});

const serializeTournamentExtras = (event: Tournament) => ({
  doubleElimination: event.doubleElimination ?? false,
  winnerSetCount: event.winnerSetCount ?? null,
  loserSetCount: event.loserSetCount ?? null,
  winnerBracketPointsToVictory: event.winnerBracketPointsToVictory ?? [],
  loserBracketPointsToVictory: event.loserBracketPointsToVictory ?? [],
  prize: event.prize ?? null,
  fieldCount: event.fieldCount ?? null,
  matches: Object.values(event.matches).map(serializeMatch),
  usesSets: event.usesSets ?? false,
  matchDurationMinutes: event.matchDurationMinutes ?? null,
  setDurationMinutes: event.setDurationMinutes ?? null,
  setsPerMatch: event.setsPerMatch ?? null,
  doTeamsRef: event.doTeamsRef ?? true,
  teamRefsMaySwap: event.doTeamsRef ? event.teamRefsMaySwap ?? false : false,
});

const serializeLeagueExtras = (event: League) => ({
  gamesPerOpponent: event.gamesPerOpponent ?? 1,
  includePlayoffs: event.includePlayoffs ?? false,
  playoffTeamCount: event.playoffTeamCount ?? 0,
  pointsToVictory: event.pointsToVictory ?? [],
});

export const serializeEvent = (event: Tournament | League) => {
  const base = serializeEventBase(event);
  const tournamentExtras = serializeTournamentExtras(event);
  const leagueExtras = event instanceof League ? serializeLeagueExtras(event) : {};
  return { ...base, ...tournamentExtras, ...leagueExtras };
};

export const serializeMatches = (matches: Match[]) => matches.map(serializeMatch);

const serializeTeamLegacy = (team: Team) => ({
  $id: team.id,
  id: team.id,
  captainId: team.captainId,
  division: team.division?.id ?? team.division,
  name: team.name,
  playerIds: team.playerIds ?? [],
});

const serializeFieldLegacy = (field: PlayingField) => ({
  $id: field.id,
  id: field.id,
  fieldNumber: field.fieldNumber,
  organizationId: field.organizationId ?? null,
  divisions: field.divisions.map((division) => division.id),
  name: field.name,
});

const serializeTimeSlotLegacy = (slot: TimeSlot) => {
  const normalizedDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : [slot.dayOfWeek];
  const normalizedFieldIds = Array.isArray(slot.fieldIds) && slot.fieldIds.length
    ? slot.fieldIds
    : slot.field
      ? [slot.field]
      : [];
  return {
    $id: slot.id,
    id: slot.id,
    dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek,
    daysOfWeek: normalizedDays,
    startDate: slot.startDate?.toISOString(),
    endDate: slot.endDate ? slot.endDate.toISOString() : null,
    repeating: slot.repeating,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    price: slot.price ?? null,
    scheduledFieldId: normalizedFieldIds[0] ?? null,
    scheduledFieldIds: normalizedFieldIds,
    divisions: slot.divisions.map((division) => division.id),
  };
};

const serializeUserLegacy = (user: UserData) => ({
  $id: user.id,
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  userName: user.userName,
});

const serializeMatchLegacy = (match: Match) => ({
  $id: match.id,
  id: match.id,
  matchId: match.matchId ?? null,
  eventId: match.eventId,
  start: match.start ? match.start.toISOString() : null,
  end: match.end ? match.end.toISOString() : null,
  locked: Boolean(match.locked),
  division: match.division?.id ?? null,
  fieldId: match.field?.id ?? null,
  team1Id: match.team1?.id ?? null,
  team2Id: match.team2?.id ?? null,
  team1Seed: match.team1Seed ?? null,
  team2Seed: match.team2Seed ?? null,
  refereeId: match.referee?.id ?? null,
  teamRefereeId: match.teamReferee?.id ?? null,
  teamRefereeSeed: null,
  team1Points: match.team1Points ?? [],
  team2Points: match.team2Points ?? [],
  setResults: match.setResults ?? [],
  losersBracket: match.losersBracket ?? false,
  winnerNextMatchId: match.winnerNextMatch?.id ?? null,
  loserNextMatchId: match.loserNextMatch?.id ?? null,
  previousLeftId: match.previousLeftMatch?.id ?? null,
  previousRightId: match.previousRightMatch?.id ?? null,
  side: match.side ?? null,
  refereeCheckedIn: match.refereeCheckedIn ?? false,
  refCheckedIn: match.refereeCheckedIn ?? false,
  team1: match.team1 ? serializeTeamLegacy(match.team1) : null,
  team2: match.team2 ? serializeTeamLegacy(match.team2) : null,
  teamReferee: match.teamReferee ? serializeTeamLegacy(match.teamReferee) : null,
  referee: match.referee ? serializeUserLegacy(match.referee) : null,
  field: match.field ? serializeFieldLegacy(match.field) : null,
});

export const serializeEventLegacy = (event: Tournament | League) => {
  const base = serializeEvent(event);
  return {
    ...base,
    $id: base.id,
    id: base.id,
    divisions: event.divisions.map((division) => division.id),
    divisionDetails: event.divisions.map((division) => ({
      $id: division.id,
      id: division.id,
      name: division.name,
      kind: division.kind,
      teamIds: [...(division.teamIds ?? [])],
      playoffTeamCount: division.playoffTeamCount,
      playoffPlacementDivisionIds: [...(division.playoffPlacementDivisionIds ?? [])],
      standingsOverrides: division.standingsOverrides ? { ...division.standingsOverrides } : null,
      standingsConfirmedAt: division.standingsConfirmedAt ? division.standingsConfirmedAt.toISOString() : null,
      standingsConfirmedBy: division.standingsConfirmedBy ?? null,
      playoffConfig: division.playoffConfig
        ? {
            ...division.playoffConfig,
            winnerBracketPointsToVictory: [...(division.playoffConfig.winnerBracketPointsToVictory ?? [])],
            loserBracketPointsToVictory: [...(division.playoffConfig.loserBracketPointsToVictory ?? [])],
          }
        : null,
    })),
    playoffDivisionDetails: event instanceof League
      ? event.playoffDivisions.map((division) => ({
          $id: division.id,
          id: division.id,
          name: division.name,
          kind: division.kind,
          teamIds: [...(division.teamIds ?? [])],
          playoffTeamCount: division.playoffTeamCount,
          playoffPlacementDivisionIds: [...(division.playoffPlacementDivisionIds ?? [])],
          standingsOverrides: division.standingsOverrides ? { ...division.standingsOverrides } : null,
          standingsConfirmedAt: division.standingsConfirmedAt ? division.standingsConfirmedAt.toISOString() : null,
          standingsConfirmedBy: division.standingsConfirmedBy ?? null,
          playoffConfig: division.playoffConfig
            ? {
                ...division.playoffConfig,
                winnerBracketPointsToVictory: [...(division.playoffConfig.winnerBracketPointsToVictory ?? [])],
                loserBracketPointsToVictory: [...(division.playoffConfig.loserBracketPointsToVictory ?? [])],
              }
            : null,
        }))
      : [],
    fields: Object.values(event.fields).map(serializeFieldLegacy),
    teams: Object.values(event.teams).map(serializeTeamLegacy),
    timeSlots: event.timeSlots.map(serializeTimeSlotLegacy),
    referees: event.referees.map(serializeUserLegacy),
    matches: Object.values(event.matches).map(serializeMatchLegacy),
  };
};

export const serializeMatchesLegacy = (matches: Match[]) => matches.map(serializeMatchLegacy);
