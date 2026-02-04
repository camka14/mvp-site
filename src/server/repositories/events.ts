import { PrismaClient } from '../../generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
  sideFrom,
  MINUTE_MS,
  TIMES,
} from '@/server/scheduler/types';

type PrismaLike = PrismaClient | Parameters<PrismaClient['$transaction']>[0];

const ensureArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const coerceDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const matchBufferMs = (event: Tournament | League): number => {
  const restMinutes = event.restTimeMinutes || 0;
  if (restMinutes > 0) return restMinutes * MINUTE_MS;
  const multiplier = event.usesSets ? (event.setsPerMatch || 1) : 1;
  return TIMES.REST * Math.max(multiplier, 1);
};

const buildDivisions = (divisionIds: string[], divisionRows: { id: string; name?: string | null }[]) => {
  const map = new Map<string, Division>();
  for (const row of divisionRows) {
    map.set(row.id, new Division(row.id, row.name ?? row.id));
  }
  const result: Division[] = [];
  for (const id of divisionIds) {
    if (map.has(id)) {
      result.push(map.get(id) as Division);
    } else {
      result.push(new Division(id, id));
    }
  }
  if (!result.length) {
    result.push(new Division('OPEN', 'OPEN'));
  }
  return { divisions: result, map };
};

const buildTeams = (rows: any[], divisionMap: Map<string, Division>, fallbackDivision: Division) => {
  const teams: Record<string, Team> = {};
  for (const row of rows) {
    const division = row.division && divisionMap.has(row.division)
      ? (divisionMap.get(row.division) as Division)
      : fallbackDivision;
    teams[row.id] = new Team({
      id: row.id,
      seed: row.seed ?? 0,
      captainId: row.captainId ?? '',
      division,
      name: row.name ?? '',
      matches: [],
      playerIds: ensureArray(row.playerIds),
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
    });
  }
  return teams;
};

const buildFields = (rows: any[], divisionMap: Map<string, Division>) => {
  const fields: Record<string, PlayingField> = {};
  for (const row of rows) {
    const divisions = ensureArray(row.divisions).map((id: string) =>
      divisionMap.get(id) ?? new Division(id, id),
    );
    fields[row.id] = new PlayingField({
      id: row.id,
      fieldNumber: row.fieldNumber ?? 0,
      organizationId: row.organizationId ?? null,
      divisions,
      matches: [],
      events: [],
      rentalSlots: [],
      name: row.name ?? '',
    });
  }
  return fields;
};

const buildTimeSlots = (rows: any[]) => {
  return rows.map((row) => new TimeSlot({
    id: row.id,
    dayOfWeek: row.dayOfWeek ?? 0,
    startDate: row.startDate instanceof Date ? row.startDate : new Date(row.startDate),
    endDate: row.endDate ? new Date(row.endDate) : null,
    repeating: Boolean(row.repeating),
    startTimeMinutes: row.startTimeMinutes ?? 0,
    endTimeMinutes: row.endTimeMinutes ?? 0,
    price: row.price ?? null,
    field: row.scheduledFieldId ?? null,
  }));
};

const buildReferees = (rows: any[], divisions: Division[]) => {
  return rows.map((row) => new UserData({
    id: row.id,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    userName: row.userName ?? '',
    hasStripeAccount: Boolean(row.hasStripeAccount),
    teamIds: ensureArray(row.teamIds),
    matches: [],
    divisions: divisions.length ? [...divisions] : [],
  }));
};

const attachTimeSlotsToFields = (fields: Record<string, PlayingField>, slots: TimeSlot[]) => {
  for (const field of Object.values(fields)) {
    field.rentalSlots = slots.filter((slot) => slot.field === field.id);
  }
};

const buildMatches = (
  rows: any[],
  event: Tournament | League,
  teams: Record<string, Team>,
  fields: Record<string, PlayingField>,
  divisions: Division[],
  referees: UserData[],
) => {
  const divisionLookup = new Map(divisions.map((division) => [division.id, division]));
  const refereeLookup = new Map(referees.map((ref) => [ref.id, ref]));
  const matches: Record<string, Match> = {};
  for (const row of rows) {
    const division = row.division && divisionLookup.has(row.division)
      ? (divisionLookup.get(row.division) as Division)
      : divisions[0];
    const match = new Match({
      id: row.id,
      matchId: row.matchId ?? null,
      team1Points: ensureArray(row.team1Points),
      team2Points: ensureArray(row.team2Points),
      start: row.start instanceof Date ? row.start : new Date(row.start),
      end: row.end instanceof Date ? row.end : new Date(row.end),
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      losersBracket: Boolean(row.losersBracket),
      division,
      field: row.fieldId ? fields[row.fieldId] ?? null : null,
      setResults: ensureArray(row.setResults),
      bufferMs: matchBufferMs(event),
      side: sideFrom(row.side),
      refereeCheckedIn: row.refereeCheckedIn ?? row.refCheckedIn ?? false,
      teamReferee: row.teamRefereeId ? teams[row.teamRefereeId] ?? null : null,
      referee: row.refereeId ? refereeLookup.get(row.refereeId) ?? null : null,
      team1: row.team1Id ? teams[row.team1Id] ?? null : null,
      team2: row.team2Id ? teams[row.team2Id] ?? null : null,
      eventId: row.eventId,
    });
    matches[row.id] = match;
  }
  // Wire pointers
  for (const row of rows) {
    const match = matches[row.id];
    if (!match) continue;
    match.previousLeftMatch = row.previousLeftId ? matches[row.previousLeftId] ?? null : null;
    match.previousRightMatch = row.previousRightId ? matches[row.previousRightId] ?? null : null;
    match.winnerNextMatch = row.winnerNextMatchId ? matches[row.winnerNextMatchId] ?? null : null;
    match.loserNextMatch = row.loserNextMatchId ? matches[row.loserNextMatchId] ?? null : null;
  }
  // Attach to teams/fields/referees
  for (const match of Object.values(matches)) {
    if (match.field) {
      match.field.matches.push(match);
    }
    for (const participant of match.getParticipants()) {
      const matchesAttr = (participant as any).matches as Match[] | undefined;
      if (!matchesAttr) continue;
      if (!matchesAttr.includes(match)) matchesAttr.push(match);
    }
  }
  return matches;
};

export const loadEventWithRelations = async (eventId: string, client: PrismaLike = prisma): Promise<League | Tournament> => {
  const event = await client.events.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new Error('Event not found');
  }

  const divisionIds = ensureArray(event.divisions);
  const divisionRows = divisionIds.length
    ? await client.divisions.findMany({ where: { id: { in: divisionIds } } })
    : [];
  const { divisions, map: divisionMap } = buildDivisions(divisionIds, divisionRows);
  const fallbackDivision = divisions[0];

  const fieldIds = ensureArray(event.fieldIds);
  const teamIds = ensureArray(event.teamIds);
  const timeSlotIds = ensureArray(event.timeSlotIds);
  const refereeIds = ensureArray(event.refereeIds);

  const [fieldRows, teamRows, timeSlotRows, refereeRows, matchRows, leagueConfigRow] = await Promise.all([
    fieldIds.length ? client.fields.findMany({ where: { id: { in: fieldIds } } }) : Promise.resolve([]),
    teamIds.length ? client.volleyBallTeams.findMany({ where: { id: { in: teamIds } } }) : Promise.resolve([]),
    timeSlotIds.length ? client.timeSlots.findMany({ where: { id: { in: timeSlotIds } } }) : Promise.resolve([]),
    refereeIds.length ? client.userData.findMany({ where: { id: { in: refereeIds } } }) : Promise.resolve([]),
    client.matches.findMany({ where: { eventId: event.id } }),
    event.leagueScoringConfigId ? client.leagueScoringConfigs.findUnique({ where: { id: event.leagueScoringConfigId } }) : Promise.resolve(null),
  ]);

  const fields = buildFields(fieldRows, divisionMap);
  const teams = buildTeams(teamRows, divisionMap, fallbackDivision);
  const timeSlots = buildTimeSlots(timeSlotRows);
  const referees = buildReferees(refereeRows, divisions);
  attachTimeSlotsToFields(fields, timeSlots);

  const baseParams = {
    id: event.id,
    start: event.start instanceof Date ? event.start : new Date(event.start),
    end: event.end instanceof Date ? event.end : new Date(event.end),
    createdAt: event.createdAt ?? null,
    updatedAt: event.updatedAt ?? null,
    name: event.name,
    description: event.description ?? '',
    waitListIds: ensureArray(event.waitListIds),
    freeAgentIds: ensureArray(event.freeAgentIds),
    maxParticipants: event.maxParticipants ?? 0,
    teamSignup: Boolean(event.teamSignup),
    fieldType: event.fieldType ?? '',
    coordinates: Array.isArray(event.coordinates) ? event.coordinates : event.coordinates ?? null,
    organizationId: event.organizationId ?? null,
    requiredTemplateIds: ensureArray(event.requiredTemplateIds),
    location: event.location ?? '',
    price: event.price ?? null,
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    installmentCount: event.installmentCount ?? 0,
    installmentDueDates: ensureArray(event.installmentDueDates).map((value) => coerceDate(value)).filter(Boolean) as Date[],
    installmentAmounts: ensureArray(event.installmentAmounts),
    allowTeamSplitDefault: Boolean(event.allowTeamSplitDefault),
    sportId: event.sportId ?? '',
    teamSizeLimit: event.teamSizeLimit ?? null,
    singleDivision: Boolean(event.singleDivision),
    seedColor: event.seedColor ?? null,
    cancellationRefundHours: event.cancellationRefundHours ?? null,
    registrationCutoffHours: event.registrationCutoffHours ?? null,
    rating: event.rating ?? null,
    minAge: event.minAge ?? null,
    maxAge: event.maxAge ?? null,
    doTeamsRef: typeof event.doTeamsRef === 'boolean' ? event.doTeamsRef : true,
    fieldCount: event.fieldCount ?? null,
    prize: event.prize ?? null,
    hostId: event.hostId ?? '',
    imageId: event.imageId ?? '',
    loserBracketPointsToVictory: ensureArray(event.loserBracketPointsToVictory),
    winnerBracketPointsToVictory: ensureArray(event.winnerBracketPointsToVictory),
    restTimeMinutes: event.restTimeMinutes ?? 0,
    state: event.state ?? 'UNPUBLISHED',
    leagueScoringConfig: leagueConfigRow ?? null,
    teams,
    players: [],
    registrationIds: ensureArray(event.registrationIds),
    divisions,
    referees,
    eventType: event.eventType ?? 'EVENT',
    fields,
    doubleElimination: Boolean(event.doubleElimination),
    matches: {},
    winnerSetCount: event.winnerSetCount ?? null,
    loserSetCount: event.loserSetCount ?? null,
    matchDurationMinutes: event.matchDurationMinutes ?? 0,
    usesSets: Boolean(event.usesSets),
    setDurationMinutes: event.setDurationMinutes ?? 0,
    timeSlots,
  };

  const constructed = event.eventType === 'LEAGUE'
    ? new League({
        ...baseParams,
        gamesPerOpponent: event.gamesPerOpponent ?? 1,
        includePlayoffs: Boolean(event.includePlayoffs),
        playoffTeamCount: event.playoffTeamCount ?? 0,
        setsPerMatch: event.setsPerMatch ?? 0,
        pointsToVictory: ensureArray(event.pointsToVictory),
      })
    : new Tournament(baseParams);

  const matches = buildMatches(matchRows, constructed, teams, fields, divisions, referees);
  constructed.matches = matches;
  return constructed;
};

export const saveMatches = async (
  eventId: string,
  matches: Match[],
  client: PrismaLike = prisma,
) => {
  const now = new Date();
  for (const match of matches) {
    const data = {
      id: match.id,
      matchId: match.matchId ?? null,
      start: match.start,
      end: match.end,
      division: match.division?.id ?? null,
      team1Points: match.team1Points ?? [],
      team2Points: match.team2Points ?? [],
      setResults: match.setResults ?? [],
      side: match.side ?? null,
      losersBracket: Boolean(match.losersBracket),
      winnerNextMatchId: match.winnerNextMatch?.id ?? null,
      loserNextMatchId: match.loserNextMatch?.id ?? null,
      previousLeftId: match.previousLeftMatch?.id ?? null,
      previousRightId: match.previousRightMatch?.id ?? null,
      refereeCheckedIn: match.refereeCheckedIn ?? false,
      refereeId: match.referee?.id ?? null,
      teamRefereeId: match.teamReferee?.id ?? null,
      team1Id: match.team1?.id ?? null,
      team2Id: match.team2?.id ?? null,
      eventId,
      fieldId: match.field?.id ?? null,
      updatedAt: now,
    };
    const { id, ...updateData } = data;
    await client.matches.upsert({
      where: { id },
      create: { ...data, createdAt: now },
      update: updateData,
    });
  }
};

export const deleteMatchesByEvent = async (
  eventId: string,
  client: PrismaLike = prisma,
) => {
  await client.matches.deleteMany({ where: { eventId } });
};

export const saveEventSchedule = async (event: League | Tournament, client: PrismaLike = prisma) => {
  await client.events.update({
    where: { id: event.id },
    data: {
      end: event.end,
      updatedAt: new Date(),
    },
  });
};

export const saveTeamRecords = async (teams: Team[], client: PrismaLike = prisma) => {
  for (const team of teams) {
    await client.volleyBallTeams.update({
      where: { id: team.id },
      data: {
        wins: team.wins,
        losses: team.losses,
        updatedAt: new Date(),
      },
    });
  }
};

export const upsertEventFromPayload = async (payload: any, client: PrismaLike = prisma): Promise<string> => {
  const id = payload?.$id || payload?.id;
  if (!id) {
    throw new Error('Event payload missing id');
  }
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const timeSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : [];

  const fieldIds = Array.isArray(payload.fieldIds) && payload.fieldIds.length
    ? payload.fieldIds
    : fields.map((field: any) => field.$id || field.id).filter(Boolean);
  const teamIds = Array.isArray(payload.teamIds) && payload.teamIds.length
    ? payload.teamIds
    : teams.map((team: any) => team.$id || team.id).filter(Boolean);
  const timeSlotIds = Array.isArray(payload.timeSlotIds) && payload.timeSlotIds.length
    ? payload.timeSlotIds
    : timeSlots.map((slot: any) => slot.$id || slot.id).filter(Boolean);

  const start = coerceDate(payload.start) ?? new Date();
  const end = coerceDate(payload.end) ?? start;

  const eventData = {
    id,
    name: payload.name ?? 'Untitled Event',
    start,
    end,
    description: payload.description ?? null,
    divisions: ensureArray(payload.divisions),
    winnerSetCount: payload.winnerSetCount ?? null,
    loserSetCount: payload.loserSetCount ?? null,
    doubleElimination: payload.doubleElimination ?? false,
    location: payload.location ?? '',
    rating: payload.rating ?? null,
    teamSizeLimit: payload.teamSizeLimit ?? 0,
    maxParticipants: payload.maxParticipants ?? null,
    minAge: payload.minAge ?? null,
    maxAge: payload.maxAge ?? null,
    hostId: payload.hostId ?? '',
    price: payload.price ?? 0,
    singleDivision: payload.singleDivision ?? false,
    waitListIds: ensureArray(payload.waitListIds),
    freeAgentIds: ensureArray(payload.freeAgentIds),
    cancellationRefundHours: payload.cancellationRefundHours ?? null,
    teamSignup: payload.teamSignup ?? true,
    prize: payload.prize ?? null,
    registrationCutoffHours: payload.registrationCutoffHours ?? null,
    seedColor: payload.seedColor ?? null,
    imageId: payload.imageId ?? '',
    fieldCount: payload.fieldCount ?? null,
    winnerBracketPointsToVictory: ensureArray(payload.winnerBracketPointsToVictory),
    loserBracketPointsToVictory: ensureArray(payload.loserBracketPointsToVictory),
    coordinates: payload.coordinates ?? null,
    gamesPerOpponent: payload.gamesPerOpponent ?? null,
    includePlayoffs: payload.includePlayoffs ?? false,
    playoffTeamCount: payload.playoffTeamCount ?? null,
    usesSets: payload.usesSets ?? false,
    matchDurationMinutes: payload.matchDurationMinutes ?? null,
    setDurationMinutes: payload.setDurationMinutes ?? null,
    setsPerMatch: payload.setsPerMatch ?? null,
    restTimeMinutes: payload.restTimeMinutes ?? null,
    state: payload.state ?? null,
    pointsToVictory: ensureArray(payload.pointsToVictory),
    sportId: payload.sportId ?? null,
    timeSlotIds,
    fieldIds,
    teamIds,
    userIds: ensureArray(payload.userIds),
    registrationIds: ensureArray(payload.registrationIds),
    leagueScoringConfigId: payload.leagueScoringConfigId ?? null,
    organizationId: payload.organizationId ?? null,
    autoCancellation: payload.autoCancellation ?? null,
    eventType: payload.eventType ?? null,
    fieldType: payload.fieldType ?? null,
    doTeamsRef: payload.doTeamsRef ?? null,
    refereeIds: ensureArray(payload.refereeIds),
    allowPaymentPlans: payload.allowPaymentPlans ?? null,
    installmentCount: payload.installmentCount ?? null,
    installmentDueDates: ensureArray(payload.installmentDueDates).map((value) => coerceDate(value)).filter(Boolean) as Date[],
    installmentAmounts: ensureArray(payload.installmentAmounts),
    allowTeamSplitDefault: payload.allowTeamSplitDefault ?? null,
    requiredTemplateIds: ensureArray(payload.requiredTemplateIds),
    updatedAt: new Date(),
  };

  await client.events.upsert({
    where: { id },
    create: { ...eventData, createdAt: new Date() },
    update: eventData,
  });

  for (const field of fields) {
    const fieldId = field.$id || field.id;
    if (!fieldId) continue;
    await client.fields.upsert({
      where: { id: fieldId },
      create: {
        id: fieldId,
        fieldNumber: field.fieldNumber ?? 0,
        divisions: ensureArray(field.divisions),
        lat: field.lat ?? null,
        long: field.long ?? null,
        heading: field.heading ?? null,
        inUse: field.inUse ?? null,
        name: field.name ?? null,
        type: field.type ?? null,
        rentalSlotIds: ensureArray(field.rentalSlotIds),
        location: field.location ?? null,
        organizationId: field.organizationId ?? payload.organizationId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        fieldNumber: field.fieldNumber ?? 0,
        divisions: ensureArray(field.divisions),
        lat: field.lat ?? null,
        long: field.long ?? null,
        heading: field.heading ?? null,
        inUse: field.inUse ?? null,
        name: field.name ?? null,
        type: field.type ?? null,
        rentalSlotIds: ensureArray(field.rentalSlotIds),
        location: field.location ?? null,
        organizationId: field.organizationId ?? payload.organizationId ?? null,
        updatedAt: new Date(),
      },
    });
  }

  for (const team of teams) {
    const teamId = team.$id || team.id;
    if (!teamId) continue;
    await client.volleyBallTeams.upsert({
      where: { id: teamId },
      create: {
        id: teamId,
        seed: team.seed ?? 0,
        playerIds: ensureArray(team.playerIds),
        division: typeof team.division === 'string' ? team.division : team.division?.id ?? null,
        wins: team.wins ?? 0,
        losses: team.losses ?? 0,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        pending: ensureArray(team.pending),
        teamSize: team.teamSize ?? 0,
        profileImageId: team.profileImageId ?? null,
        sport: team.sport ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        seed: team.seed ?? 0,
        playerIds: ensureArray(team.playerIds),
        division: typeof team.division === 'string' ? team.division : team.division?.id ?? null,
        wins: team.wins ?? 0,
        losses: team.losses ?? 0,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        pending: ensureArray(team.pending),
        teamSize: team.teamSize ?? 0,
        profileImageId: team.profileImageId ?? null,
        sport: team.sport ?? null,
        updatedAt: new Date(),
      },
    });
  }

  for (const slot of timeSlots) {
    const slotId = slot.$id || slot.id;
    if (!slotId) continue;
    const startDate = coerceDate(slot.startDate) ?? new Date();
    const endDate = slot.endDate ? coerceDate(slot.endDate) : null;
    await client.timeSlots.upsert({
      where: { id: slotId },
      create: {
        id: slotId,
        dayOfWeek: slot.dayOfWeek ?? 0,
        startTimeMinutes: slot.startTimeMinutes ?? null,
        endTimeMinutes: slot.endTimeMinutes ?? null,
        startDate,
        repeating: Boolean(slot.repeating),
        endDate,
        scheduledFieldId: slot.scheduledFieldId ?? null,
        price: slot.price ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        dayOfWeek: slot.dayOfWeek ?? 0,
        startTimeMinutes: slot.startTimeMinutes ?? null,
        endTimeMinutes: slot.endTimeMinutes ?? null,
        startDate,
        repeating: Boolean(slot.repeating),
        endDate,
        scheduledFieldId: slot.scheduledFieldId ?? null,
        price: slot.price ?? null,
        updatedAt: new Date(),
      },
    });
  }

  return id;
};
