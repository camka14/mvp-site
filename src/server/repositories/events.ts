import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildDivisionName,
  buildDivisionToken,
  buildEventDivisionId,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
  type DivisionGender,
  type DivisionRatingType,
} from '@/lib/divisionTypes';
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

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const ensureArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const ensureStringArray = (value: unknown): string[] => ensureArray(value as string[]);
const ensureNumberArray = (value: unknown): number[] =>
  ensureArray(value as Array<number | string>)
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
const DEFAULT_DIVISION_KEY = 'open';

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const isMissingTimeSlotDivisionsColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('timeslots')
    && normalized.includes('divisions')
    && normalized.includes('does not exist');
};

const persistTimeSlotDivisions = async (
  client: PrismaLike,
  slotId: string,
  divisions: string[],
  updatedAt: Date,
): Promise<void> => {
  if (typeof (client as any).$executeRaw !== 'function') {
    return;
  }
  try {
    await client.$executeRaw`
      UPDATE "TimeSlots"
      SET "divisions" = ${divisions}::TEXT[],
          "updatedAt" = ${updatedAt}
      WHERE "id" = ${slotId}
    `;
  } catch (error) {
    if (isMissingTimeSlotDivisionsColumnError(error)) {
      return;
    }
    throw error;
  }
};

const defaultDivisionKeysForSport = (sportId: unknown): string[] => {
  const normalizedSport = typeof sportId === 'string' ? sportId.toLowerCase() : '';
  if (normalizedSport.includes('soccer')) {
    return ['beginner', 'advanced'];
  }
  return ['beginner', 'intermediate', 'advanced'];
};

const buildDivisionDisplayName = (key: string, sportId?: string | null): string => {
  if (!key.length) return 'Open';
  const inferred = inferDivisionDetails({ identifier: key, sportInput: sportId ?? undefined });
  if (inferred.defaultName && inferred.defaultName.trim().length > 0) {
    return inferred.defaultName;
  }
  return key
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
};

const buildDivisionId = (eventId: string, key: string): string => buildEventDivisionId(eventId, key);

const normalizeDivisionIdentifierList = (
  value: unknown,
  eventId?: string,
): string[] => {
  const normalized = normalizeDivisionKeys(value);
  if (!normalized.length) {
    return [];
  }
  if (!eventId) {
    return normalized;
  }
  return normalized.map((entry) => (
    entry.includes('__division__') || entry.startsWith('division_')
      ? entry
      : buildDivisionId(eventId, entry)
  ));
};

type DivisionDetailPayload = {
  id: string;
  key: string;
  name: string;
  divisionTypeId: string;
  divisionTypeName: string;
  ratingType: DivisionRatingType;
  gender: DivisionGender;
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
  fieldIds: string[];
};

const normalizeDivisionDetailsPayload = (
  value: unknown,
  eventId: string,
  sportId?: string | null,
): DivisionDetailPayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const details = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const rawId = normalizeDivisionKey(row.id) ?? normalizeDivisionKey(row.$id);
      const rawKey = normalizeDivisionKey(row.key) ?? (rawId ? extractDivisionTokenFromId(rawId) : null);
      const inferred = inferDivisionDetails({
        identifier: rawKey ?? rawId ?? 'c_skill_open',
        sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
        fallbackName: typeof row.name === 'string' ? row.name : undefined,
      });

      const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
      const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
      const divisionTypeId = normalizeDivisionKey(row.divisionTypeId) ?? inferred.divisionTypeId;
      const key = normalizeDivisionKey(row.key)
        ?? buildDivisionToken({
          gender,
          ratingType,
          divisionTypeId,
        });
      const id = rawId
        && (rawId.includes('__division__') || rawId.startsWith('division_'))
        ? rawId
        : buildDivisionId(eventId, key);
      const divisionTypeName = typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length
        ? row.divisionTypeName.trim()
        : inferred.divisionTypeName;
      const defaultName = buildDivisionName({
        gender,
        divisionTypeName,
      });

      return {
        id,
        key,
        name: typeof row.name === 'string' && row.name.trim().length ? row.name.trim() : defaultName,
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        ageCutoffDate: normalizeIsoDateString(row.ageCutoffDate),
        ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : null,
        ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : null,
        fieldIds: normalizeFieldIds(row.fieldIds),
      } satisfies DivisionDetailPayload;
    })
    .filter((entry): entry is DivisionDetailPayload => Boolean(entry));

  const seen = new Set<string>();
  const unique: DivisionDetailPayload[] = [];
  for (const detail of details) {
    if (seen.has(detail.id)) {
      continue;
    }
    seen.add(detail.id);
    unique.push(detail);
  }
  return unique;
};

type DivisionRatingWindow = {
  minRating: number | null;
  maxRating: number | null;
};

const divisionRatingWindow = (key: string, sportId?: string | null): DivisionRatingWindow => {
  const normalizedSport = typeof sportId === 'string' ? sportId.toLowerCase() : '';
  // Some sports don't have standardized public ratings, so keep labels only.
  if (normalizedSport.includes('soccer')) {
    return { minRating: null, maxRating: null };
  }
  const inferred = inferDivisionDetails({
    identifier: key,
    sportInput: sportId ?? undefined,
  });
  const divisionTypeId = inferred.divisionTypeId;
  if (divisionTypeId === 'beginner') return { minRating: 1.0, maxRating: 2.5 };
  if (divisionTypeId === 'intermediate') return { minRating: 2.5, maxRating: 3.5 };
  if (divisionTypeId === 'advanced') return { minRating: 3.5, maxRating: 4.5 };
  if (divisionTypeId === 'expert') return { minRating: 4.5, maxRating: null };
  return { minRating: null, maxRating: null };
};

const coerceDivisionFieldMap = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const map: Record<string, string[]> = {};
  for (const [rawKey, rawFieldIds] of Object.entries(value as Record<string, unknown>)) {
    const key = normalizeDivisionKey(rawKey);
    if (!key) continue;
    const fieldIds = Array.from(new Set(ensureStringArray(rawFieldIds).map((id) => String(id)).filter(Boolean)));
    map[key] = fieldIds;
  }
  return map;
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry)).filter(Boolean)));
};

const normalizeSlotFieldIds = (slot: Record<string, unknown>): string[] => {
  const fromList = normalizeFieldIds(slot.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  if (typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0) {
    return [slot.scheduledFieldId];
  }
  return [];
};

const buildDivisionFieldMap = (
  divisionKeys: string[],
  fieldIds: string[],
  _fields: any[],
  incomingMap: Record<string, string[]>,
): Record<string, string[]> => {
  const map: Record<string, Set<string>> = {};
  for (const key of divisionKeys) {
    const aliases = new Set<string>([
      key,
      extractDivisionTokenFromId(key) ?? '',
    ]);
    const normalizedKey = normalizeDivisionKey(key);
    if (normalizedKey) {
      aliases.add(normalizedKey);
    }
    const merged = new Set<string>();
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeDivisionKey(alias);
      if (!normalizedAlias) return;
      ensureStringArray(incomingMap[normalizedAlias]).forEach((fieldId) => merged.add(String(fieldId)));
    });
    map[key] = merged;
  }

  // Field/division ownership now lives on time slots, not fields.
  // Keep division->field mappings only when explicitly provided by legacy clients.

  const allowed = new Set(fieldIds);
  const result: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(map)) {
    result[key] = Array.from(ids).filter((id) => allowed.has(id));
  }
  return result;
};

const buildLegacyFieldDivisionMap = (divisionFieldMap: Record<string, string[]>): Record<string, string[]> => {
  const map = new Map<string, Set<string>>();
  for (const [divisionKey, fieldIds] of Object.entries(divisionFieldMap)) {
    for (const fieldId of fieldIds) {
      const existing = map.get(fieldId) ?? new Set<string>();
      existing.add(divisionKey);
      map.set(fieldId, existing);
    }
  }
  const result: Record<string, string[]> = {};
  for (const [fieldId, divisionKeys] of map.entries()) {
    result[fieldId] = Array.from(divisionKeys);
  }
  return result;
};

const normalizeDayValues = (slot: { dayOfWeek?: unknown; daysOfWeek?: unknown }): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : slot.dayOfWeek !== undefined
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

const normalizeSlotBaseId = (value: string): string => {
  return value
    .replace(/__d[0-6]__f.+$/, '')
    .replace(/__f.+$/, '')
    .replace(/__d[0-6](?:_\d+)?$/, '');
};

const buildExpandedSlotId = (
  sourceId: string,
  baseSlotId: string,
  day: number,
  fieldId: string | null,
  dayCount: number,
  fieldCount: number,
): string => {
  if (dayCount === 1 && fieldCount === 1) {
    return sourceId;
  }
  if (dayCount > 1 && fieldCount === 1) {
    return `${baseSlotId}__d${day}`;
  }
  if (dayCount === 1 && fieldCount > 1) {
    return `${baseSlotId}__f${fieldId}`;
  }
  return `${baseSlotId}__d${day}__f${fieldId}`;
};

const coerceDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const normalizeIsoDateString = (value: unknown): string | null => {
  const parsed = coerceDate(value);
  return parsed ? parsed.toISOString() : null;
};

const matchBufferMs = (event: Tournament | League): number => {
  const restMinutes = event.restTimeMinutes || 0;
  if (restMinutes > 0) return restMinutes * MINUTE_MS;
  const multiplier = event.usesSets ? (event.setsPerMatch || 1) : 1;
  return TIMES.REST * Math.max(multiplier, 1);
};

const buildDivisions = (
  divisionIds: string[],
  divisionRows: Array<{
    id: string;
    name?: string | null;
    key?: string | null;
    fieldIds?: string[] | null;
    sportId?: string | null;
  }>,
  sportId?: string | null,
) => {
  const map = new Map<string, Division>();
  const fieldIdsByDivision = new Map<string, string[]>();
  const rowsById = new Map<string, (typeof divisionRows)[number]>();
  const rowsByKey = new Map<string, (typeof divisionRows)[number]>();

  for (const row of divisionRows) {
    const normalizedId = normalizeDivisionKey(row.id) ?? row.id;
    const normalizedKey = normalizeDivisionKey(row.key);
    rowsById.set(normalizedId, row);
    if (normalizedKey) {
      rowsByKey.set(normalizedKey, row);
    }
    const tokenFromId = extractDivisionTokenFromId(row.id);
    if (tokenFromId) {
      rowsByKey.set(tokenFromId, row);
    }
  }

  const addAliases = (aliases: Array<string | null | undefined>, division: Division, fieldIds: string[]) => {
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeDivisionKey(alias);
      if (!normalizedAlias) return;
      map.set(normalizedAlias, division);
      fieldIdsByDivision.set(normalizedAlias, fieldIds);
    });
  };

  const result: Division[] = [];
  for (const rawDivisionId of divisionIds) {
    const divisionId = normalizeDivisionKey(rawDivisionId) ?? rawDivisionId;
    const matchedRow = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '');
    const inferred = inferDivisionDetails({
      identifier: matchedRow?.key ?? matchedRow?.id ?? divisionId,
      sportInput: matchedRow?.sportId ?? sportId ?? undefined,
      fallbackName: matchedRow?.name ?? undefined,
    });
    const divisionName = matchedRow?.name
      ?? inferred.defaultName
      ?? buildDivisionDisplayName(divisionId, sportId);
    const fieldIds = ensureStringArray(matchedRow?.fieldIds);
    const division = new Division(divisionId, divisionName, fieldIds);
    result.push(division);

    addAliases(
      [
        divisionId,
        matchedRow?.id,
        matchedRow?.key,
        extractDivisionTokenFromId(divisionId),
        extractDivisionTokenFromId(matchedRow?.id),
      ],
      division,
      fieldIds,
    );
  }

  if (!result.length) {
    const fallbackId = DEFAULT_DIVISION_KEY;
    const fallback = new Division(fallbackId, buildDivisionDisplayName(fallbackId, sportId));
    result.push(fallback);
    addAliases([fallbackId], fallback, []);
  }

  return { divisions: result, map, fieldIdsByDivision };
};

const buildTeams = (rows: any[], divisionMap: Map<string, Division>, fallbackDivision: Division) => {
  const teams: Record<string, Team> = {};
  for (const row of rows) {
    const normalizedDivisionId = normalizeDivisionKey(row.division);
    const division = normalizedDivisionId && divisionMap.has(normalizedDivisionId)
      ? (divisionMap.get(normalizedDivisionId) as Division)
      : row.division && divisionMap.has(row.division)
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

const buildFields = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivisionIds: string[],
  divisionFieldIds: Map<string, string[]>,
) => {
  const fields: Record<string, PlayingField> = {};
  for (const row of rows) {
    const explicitDivisionIds = Array.from(divisionFieldIds.entries())
      .filter(([, fieldIds]) => fieldIds.includes(row.id))
      .map(([divisionId]) => divisionId);
    const divisionIds = explicitDivisionIds.length
      ? explicitDivisionIds
      : ensureStringArray(row.divisions).length
        ? ensureStringArray(row.divisions)
        : fallbackDivisionIds;
    const divisions = divisionIds.map((id) =>
      divisionMap.get(id) ?? new Division(id, buildDivisionDisplayName(id)),
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

const buildTimeSlots = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivisions: Division[],
) => {
  return rows.flatMap((row) => {
    const normalizedDays = normalizeDayValues({
      dayOfWeek: row.dayOfWeek,
      daysOfWeek: (row as any).daysOfWeek,
    });
    const slotDivisionIds = normalizeDivisionKeys((row as any).divisions);
    const slotDivisions = slotDivisionIds.length
      ? slotDivisionIds.map((id) => divisionMap.get(id) ?? new Division(id, buildDivisionDisplayName(id)))
      : fallbackDivisions;
    const days = normalizedDays.length ? normalizedDays : [0];
    return days.map((day, index) => new TimeSlot({
      id: days.length === 1 ? row.id : `${row.id}__d${day}_${index}`,
      dayOfWeek: day,
      startDate: row.startDate instanceof Date ? row.startDate : new Date(row.startDate),
      endDate: row.endDate ? new Date(row.endDate) : null,
      repeating: Boolean(row.repeating),
      startTimeMinutes: row.startTimeMinutes ?? 0,
      endTimeMinutes: row.endTimeMinutes ?? 0,
      price: row.price ?? null,
      field: row.scheduledFieldId ?? null,
      divisions: [...slotDivisions],
    }));
  });
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
    const normalizedDivisionId = normalizeDivisionKey(row.division);
    const division = normalizedDivisionId && divisionLookup.has(normalizedDivisionId)
      ? (divisionLookup.get(normalizedDivisionId) as Division)
      : row.division && divisionLookup.has(row.division)
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

  const divisionIds = ensureStringArray(event.divisions);
  const divisionRows = divisionIds.length
    ? await client.divisions.findMany({
      where: {
        OR: [
          { key: { in: divisionIds }, eventId: event.id },
          { id: { in: divisionIds } },
        ],
      },
    })
    : [];
  const { divisions, map: divisionMap, fieldIdsByDivision } = buildDivisions(
    divisionIds,
    divisionRows,
    event.sportId ?? null,
  );
  const fallbackDivision = divisions[0];

  const fieldIds = ensureStringArray(event.fieldIds);
  const teamIds = ensureStringArray(event.teamIds);
  const timeSlotIds = ensureStringArray(event.timeSlotIds);
  const refereeIds = ensureStringArray(event.refereeIds);

  const [fieldRows, teamRows, timeSlotRows, refereeRows, matchRows, leagueConfigRow] = await Promise.all([
    fieldIds.length ? client.fields.findMany({ where: { id: { in: fieldIds } } }) : Promise.resolve([]),
    teamIds.length ? client.volleyBallTeams.findMany({ where: { id: { in: teamIds } } }) : Promise.resolve([]),
    timeSlotIds.length ? client.timeSlots.findMany({ where: { id: { in: timeSlotIds } } }) : Promise.resolve([]),
    refereeIds.length ? client.userData.findMany({ where: { id: { in: refereeIds } } }) : Promise.resolve([]),
    client.matches.findMany({ where: { eventId: event.id } }),
    event.leagueScoringConfigId ? client.leagueScoringConfigs.findUnique({ where: { id: event.leagueScoringConfigId } }) : Promise.resolve(null),
  ]);

  const fallbackFieldDivisionIds = divisionIds.length ? divisionIds : [DEFAULT_DIVISION_KEY];
  const fields = buildFields(fieldRows, divisionMap, fallbackFieldDivisionIds, fieldIdsByDivision);
  const teams = buildTeams(teamRows, divisionMap, fallbackDivision);
  const timeSlots = buildTimeSlots(timeSlotRows, divisionMap, divisions);
  const referees = buildReferees(refereeRows, divisions);
  attachTimeSlotsToFields(fields, timeSlots);

  const coordinates = Array.isArray(event.coordinates)
    ? event.coordinates.filter((value): value is number => typeof value === 'number')
    : null;

  const baseParams = {
    id: event.id,
    start: event.start instanceof Date ? event.start : new Date(event.start),
    end: event.end instanceof Date ? event.end : new Date(event.end),
    createdAt: event.createdAt ?? null,
    updatedAt: event.updatedAt ?? null,
    name: event.name,
    description: event.description ?? '',
    waitListIds: ensureStringArray(event.waitListIds),
    freeAgentIds: ensureStringArray(event.freeAgentIds),
    maxParticipants: event.maxParticipants ?? 0,
    teamSignup: Boolean(event.teamSignup),
    coordinates,
    organizationId: event.organizationId ?? null,
    requiredTemplateIds: ensureStringArray(event.requiredTemplateIds),
    location: event.location ?? '',
    price: event.price ?? null,
    allowPaymentPlans: Boolean(event.allowPaymentPlans),
    installmentCount: event.installmentCount ?? 0,
    installmentDueDates: ensureArray(event.installmentDueDates).map((value) => coerceDate(value)).filter(Boolean) as Date[],
    installmentAmounts: ensureNumberArray(event.installmentAmounts),
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
    loserBracketPointsToVictory: ensureNumberArray(event.loserBracketPointsToVictory),
    winnerBracketPointsToVictory: ensureNumberArray(event.winnerBracketPointsToVictory),
    restTimeMinutes: event.restTimeMinutes ?? 0,
    state: event.state ?? 'UNPUBLISHED',
    leagueScoringConfig: leagueConfigRow ?? null,
    teams,
    players: [],
    registrationIds: ensureStringArray(event.registrationIds),
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
        pointsToVictory: ensureNumberArray(event.pointsToVictory),
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
      matchId: match.matchId ?? 0,
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

export const syncEventDivisions = async (
  params: {
    eventId: string;
    divisionIds: string[];
    fieldIds: string[];
    sportId?: string | null;
    referenceDate?: Date | null;
    organizationId?: string | null;
    divisionFieldMap?: Record<string, string[]>;
    divisionDetails?: unknown[];
  },
  client: PrismaLike = prisma,
) => {
  const normalizedDivisionIds = normalizeDivisionIdentifierList(params.divisionIds, params.eventId);
  const divisionIds = normalizedDivisionIds.length
    ? normalizedDivisionIds
    : [buildDivisionId(params.eventId, DEFAULT_DIVISION_KEY)];
  const divisionFieldMap = params.divisionFieldMap ?? {};
  const allowedFieldIds = new Set(params.fieldIds.map((fieldId) => String(fieldId)));

  const normalizedDetails = normalizeDivisionDetailsPayload(
    params.divisionDetails ?? [],
    params.eventId,
    params.sportId,
  );
  const detailLookup = new Map<string, DivisionDetailPayload>();
  for (const detail of normalizedDetails) {
    const aliases = new Set<string>([
      detail.id,
      detail.key,
      extractDivisionTokenFromId(detail.id) ?? '',
    ]);
    aliases.forEach((alias) => {
      const normalized = normalizeDivisionKey(alias);
      if (!normalized) return;
      detailLookup.set(normalized, detail);
    });
  }

  const existingRows = await client.divisions.findMany({
    where: {
      eventId: params.eventId,
    },
    select: {
      id: true,
      key: true,
      name: true,
      sportId: true,
      divisionTypeId: true,
      divisionTypeName: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
      fieldIds: true,
    },
  });

  const existingById = new Map<string, (typeof existingRows)[number]>();
  const existingByKey = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    const normalizedId = normalizeDivisionKey(row.id);
    if (normalizedId) {
      existingById.set(normalizedId, row);
      const token = extractDivisionTokenFromId(normalizedId);
      if (token) {
        existingByKey.set(token, row);
      }
    }
    const normalizedKey = normalizeDivisionKey(row.key);
    if (normalizedKey) {
      existingByKey.set(normalizedKey, row);
    }
  }

  const finalEntries = divisionIds.map((rawDivisionId) => {
    const normalizedDivisionId = normalizeDivisionKey(rawDivisionId) ?? rawDivisionId;
    const detail = detailLookup.get(normalizedDivisionId)
      ?? detailLookup.get(extractDivisionTokenFromId(normalizedDivisionId) ?? '')
      ?? null;
    const existing = existingById.get(normalizedDivisionId)
      ?? existingByKey.get(normalizedDivisionId)
      ?? existingByKey.get(extractDivisionTokenFromId(normalizedDivisionId) ?? '')
      ?? null;

    const fallbackIdentifier = detail?.key
      ?? existing?.key
      ?? extractDivisionTokenFromId(normalizedDivisionId)
      ?? normalizedDivisionId;
    const inferred = inferDivisionDetails({
      identifier: fallbackIdentifier,
      sportInput: params.sportId ?? existing?.sportId ?? undefined,
      fallbackName: detail?.name ?? existing?.name ?? undefined,
    });

    const persistedId = (() => {
      if (
        normalizedDivisionId.includes('__division__')
        || normalizedDivisionId.startsWith('division_')
      ) {
        return normalizedDivisionId;
      }
      if (existing?.id) {
        const existingId = normalizeDivisionKey(existing.id);
        if (existingId) {
          return existingId;
        }
      }
      if (detail?.id) {
        return detail.id;
      }
      return buildDivisionId(params.eventId, inferred.token);
    })();

    const gender = detail?.gender ?? inferred.gender;
    const ratingType = detail?.ratingType ?? inferred.ratingType;
    const divisionTypeId = detail?.divisionTypeId ?? inferred.divisionTypeId;
    const key = detail?.key ?? buildDivisionToken({
      gender,
      ratingType,
      divisionTypeId,
    });
    const divisionTypeName = detail?.divisionTypeName ?? inferred.divisionTypeName;

    const mappedFieldIds = Array.from(
      new Set([
        ...ensureStringArray(divisionFieldMap[normalizedDivisionId]),
        ...ensureStringArray(divisionFieldMap[persistedId]),
        ...ensureStringArray(divisionFieldMap[key]),
        ...ensureStringArray(detail?.fieldIds),
      ]),
    ).filter((fieldId) => !allowedFieldIds.size || allowedFieldIds.has(fieldId));

    const ratings = divisionRatingWindow(key, params.sportId ?? null);
    const name = detail?.name
      ?? existing?.name
      ?? inferred.defaultName
      ?? buildDivisionDisplayName(key, params.sportId ?? null);
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId,
      sportInput: params.sportId ?? null,
      referenceDate: params.referenceDate ?? null,
    });
    const ageCutoffDate = detail?.ageCutoffDate
      ?? normalizeIsoDateString(existing?.ageCutoffDate)
      ?? (ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null);
    const ageCutoffLabel = detail?.ageCutoffLabel
      ?? existing?.ageCutoffLabel
      ?? ageEligibility.message
      ?? null;
    const ageCutoffSource = detail?.ageCutoffSource
      ?? existing?.ageCutoffSource
      ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null);

    return {
      id: persistedId,
      key,
      name,
      divisionTypeId,
      divisionTypeName,
      ratingType,
      gender,
      ageCutoffDate,
      ageCutoffLabel,
      ageCutoffSource,
      minRating: ratings.minRating,
      maxRating: ratings.maxRating,
      fieldIds: mappedFieldIds,
    };
  });

  const finalIdSet = new Set(
    finalEntries.map((entry) => normalizeDivisionKey(entry.id) ?? entry.id),
  );
  const staleDivisionIds = existingRows
    .filter((row) => {
      const normalizedId = normalizeDivisionKey(row.id) ?? row.id;
      return !finalIdSet.has(normalizedId);
    })
    .map((row) => row.id);

  if (staleDivisionIds.length) {
    await client.divisions.deleteMany({
      where: { id: { in: staleDivisionIds } },
    });
  }

  const now = new Date();
  for (const entry of finalEntries) {
    await client.divisions.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        key: entry.key,
        name: entry.name,
        eventId: params.eventId,
        organizationId: params.organizationId ?? null,
        sportId: params.sportId ?? null,
        divisionTypeId: entry.divisionTypeId,
        divisionTypeName: entry.divisionTypeName,
        ratingType: entry.ratingType,
        gender: entry.gender,
        ageCutoffDate: entry.ageCutoffDate ? new Date(entry.ageCutoffDate) : null,
        ageCutoffLabel: entry.ageCutoffLabel,
        ageCutoffSource: entry.ageCutoffSource,
        minRating: entry.minRating,
        maxRating: entry.maxRating,
        fieldIds: entry.fieldIds,
        createdAt: now,
        updatedAt: now,
      } as any,
      update: {
        key: entry.key,
        name: entry.name,
        eventId: params.eventId,
        organizationId: params.organizationId ?? null,
        sportId: params.sportId ?? null,
        divisionTypeId: entry.divisionTypeId,
        divisionTypeName: entry.divisionTypeName,
        ratingType: entry.ratingType,
        gender: entry.gender,
        ageCutoffDate: entry.ageCutoffDate ? new Date(entry.ageCutoffDate) : null,
        ageCutoffLabel: entry.ageCutoffLabel,
        ageCutoffSource: entry.ageCutoffSource,
        minRating: entry.minRating,
        maxRating: entry.maxRating,
        fieldIds: entry.fieldIds,
        updatedAt: now,
      } as any,
    });
  }
};

export const upsertEventFromPayload = async (payload: any, client: PrismaLike = prisma): Promise<string> => {
  const id = payload?.$id || payload?.id;
  if (!id) {
    throw new Error('Event payload missing id');
  }
  const existingEvent = await client.events.findUnique({
    where: { id },
    select: { fieldIds: true, timeSlotIds: true },
  });
  const existingFieldIds = normalizeFieldIds(existingEvent?.fieldIds ?? []);
  const existingTimeSlotIds = normalizeFieldIds(existingEvent?.timeSlotIds ?? []);
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const timeSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : [];
  const normalizedDivisionDetails = normalizeDivisionDetailsPayload(payload.divisionDetails, id, payload.sportId);
  const payloadDivisionIds = normalizeDivisionIdentifierList(payload.divisions, id);
  const divisionIdsFromDetails = normalizedDivisionDetails.map((detail) => detail.id);
  const fallbackDivisionIds = defaultDivisionKeysForSport(payload.sportId)
    .map((divisionKey) => buildDivisionId(id, divisionKey));
  const normalizedEventDivisionIds = payloadDivisionIds.length
    ? payloadDivisionIds
    : divisionIdsFromDetails.length
      ? divisionIdsFromDetails
      : fallbackDivisionIds;
  const singleDivisionEnabled = Boolean(payload.singleDivision);

  const expandedTimeSlots = timeSlots.flatMap((slot: any, index: number) => {
    const sourceSlotId = slot.$id || slot.id || `${id}__slot_${index + 1}`;
    const baseSlotId = normalizeSlotBaseId(sourceSlotId);
    const normalizedDays = normalizeDayValues({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    });
    const normalizedFieldIds = normalizeSlotFieldIds(slot);
    const expandedFieldIds: Array<string | null> = normalizedFieldIds.length ? normalizedFieldIds : [null];
    const normalizedSlotDivisions = normalizeDivisionIdentifierList(slot.divisions, id);
    const slotDivisions = singleDivisionEnabled
      ? normalizedEventDivisionIds
      : normalizedSlotDivisions.length
      ? normalizedSlotDivisions
      : normalizedEventDivisionIds;
    if (!normalizedDays.length) {
      return [{
        ...slot,
        id: buildExpandedSlotId(sourceSlotId, baseSlotId, 0, expandedFieldIds[0], 1, expandedFieldIds.length),
        dayOfWeek: null,
        scheduledFieldId: expandedFieldIds[0],
        divisions: slotDivisions,
      }];
    }
    return normalizedDays.flatMap((day) =>
      expandedFieldIds.map((fieldId) => ({
        ...slot,
        id: buildExpandedSlotId(
          sourceSlotId,
          baseSlotId,
          day,
          fieldId,
          normalizedDays.length,
          expandedFieldIds.length,
        ),
        dayOfWeek: day,
        scheduledFieldId: fieldId,
        divisions: slotDivisions,
      })),
    );
  });

  const slotFieldIds = normalizeFieldIds(
    expandedTimeSlots
      .map((slot: any) => slot.scheduledFieldId)
      .filter(Boolean),
  );
  const fieldIds = slotFieldIds.length
    ? slotFieldIds
    : Array.isArray(payload.fieldIds) && payload.fieldIds.length
      ? normalizeFieldIds(payload.fieldIds)
      : fields.map((field: any) => field.$id || field.id).filter(Boolean);
  const allowedFieldIdSet = new Set(fieldIds);
  const fieldsToPersist = allowedFieldIdSet.size
    ? fields.filter((field: any) => {
      const fieldId = field?.$id || field?.id;
      return typeof fieldId === 'string' && allowedFieldIdSet.has(fieldId);
    })
    : fields;
  const teamIds = Array.isArray(payload.teamIds) && payload.teamIds.length
    ? payload.teamIds
    : teams.map((team: any) => team.$id || team.id).filter(Boolean);
  const derivedTimeSlotIds = expandedTimeSlots.map((slot: any) => slot.id).filter(Boolean);
  const timeSlotIds = derivedTimeSlotIds.length
    ? derivedTimeSlotIds
    : Array.isArray(payload.timeSlotIds) && payload.timeSlotIds.length
      ? payload.timeSlotIds
      : [];
  const incomingDivisionFieldMap = coerceDivisionFieldMap(payload.divisionFieldIds);
  const divisionFieldMap = buildDivisionFieldMap(
    normalizedEventDivisionIds,
    fieldIds,
    fields,
    incomingDivisionFieldMap,
  );
  const legacyFieldDivisionMap = buildLegacyFieldDivisionMap(divisionFieldMap);

  const start = coerceDate(payload.start) ?? new Date();
  const end = coerceDate(payload.end) ?? start;

  const eventData = {
    id,
    name: payload.name ?? 'Untitled Event',
    start,
    end,
    description: payload.description ?? null,
    divisions: normalizedEventDivisionIds,
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
    registrationByDivisionType: payload.registrationByDivisionType ?? false,
    waitListIds: ensureStringArray(payload.waitListIds),
    freeAgentIds: ensureStringArray(payload.freeAgentIds),
    cancellationRefundHours: payload.cancellationRefundHours ?? null,
    teamSignup: payload.teamSignup ?? true,
    prize: payload.prize ?? null,
    registrationCutoffHours: payload.registrationCutoffHours ?? null,
    seedColor: payload.seedColor ?? null,
    imageId: payload.imageId ?? '',
    fieldCount: payload.fieldCount ?? null,
    winnerBracketPointsToVictory: ensureNumberArray(payload.winnerBracketPointsToVictory),
    loserBracketPointsToVictory: ensureNumberArray(payload.loserBracketPointsToVictory),
    coordinates: Array.isArray(payload.coordinates)
      ? payload.coordinates.filter((value: unknown): value is number => typeof value === 'number')
      : null,
    gamesPerOpponent: payload.gamesPerOpponent ?? null,
    includePlayoffs: payload.includePlayoffs ?? false,
    playoffTeamCount: payload.playoffTeamCount ?? null,
    usesSets: payload.usesSets ?? false,
    matchDurationMinutes: payload.matchDurationMinutes ?? null,
    setDurationMinutes: payload.setDurationMinutes ?? null,
    setsPerMatch: payload.setsPerMatch ?? null,
    restTimeMinutes: payload.restTimeMinutes ?? null,
    state: payload.state ?? null,
    pointsToVictory: ensureNumberArray(payload.pointsToVictory),
    sportId: payload.sportId ?? null,
    timeSlotIds,
    fieldIds,
    teamIds,
    userIds: ensureStringArray(payload.userIds),
    registrationIds: ensureStringArray(payload.registrationIds),
    leagueScoringConfigId: payload.leagueScoringConfigId ?? null,
    organizationId: payload.organizationId ?? null,
    autoCancellation: payload.autoCancellation ?? null,
    eventType: payload.eventType ?? null,
    doTeamsRef: payload.doTeamsRef ?? null,
    refereeIds: ensureStringArray(payload.refereeIds),
    allowPaymentPlans: payload.allowPaymentPlans ?? null,
    installmentCount: payload.installmentCount ?? null,
    installmentDueDates: ensureArray(payload.installmentDueDates).map((value) => coerceDate(value)).filter(Boolean) as Date[],
    installmentAmounts: ensureNumberArray(payload.installmentAmounts),
    allowTeamSplitDefault: payload.allowTeamSplitDefault ?? null,
    requiredTemplateIds: ensureStringArray(payload.requiredTemplateIds),
    updatedAt: new Date(),
  };

  await client.events.upsert({
    where: { id },
    create: { ...eventData, createdAt: new Date() },
    update: eventData,
  });

  await syncEventDivisions({
    eventId: id,
    divisionIds: normalizedEventDivisionIds,
    fieldIds,
    sportId: payload.sportId ?? null,
    referenceDate: start,
    organizationId: payload.organizationId ?? null,
    divisionFieldMap,
    divisionDetails: normalizedDivisionDetails,
  }, client);

  const removedFieldIds = existingFieldIds.filter((fieldId) => !allowedFieldIdSet.has(fieldId));
  if (removedFieldIds.length) {
    await client.matches.deleteMany({
      where: {
        eventId: id,
        fieldId: { in: removedFieldIds },
      },
    });
    await client.fields.deleteMany({
      where: {
        id: { in: removedFieldIds },
        organizationId: null,
      },
    });
  }

  for (const field of fieldsToPersist) {
    const fieldId = field.$id || field.id;
    if (!fieldId) continue;
    // Backward-compatible mirror so legacy clients can still inspect field division tags.
    let fieldDivisions = legacyFieldDivisionMap[fieldId] ?? [];
    if (!fieldDivisions.length) {
      fieldDivisions = ensureStringArray(field.divisions);
    }
    if (!fieldDivisions.length && normalizedEventDivisionIds.length) {
      fieldDivisions = [...normalizedEventDivisionIds];
    }
    if (!fieldDivisions.length) {
      const existing = await client.fields.findUnique({ where: { id: fieldId }, select: { divisions: true } });
      if (existing?.divisions?.length) {
        fieldDivisions = existing.divisions;
      }
    }
    if (!fieldDivisions.length) {
      fieldDivisions = [DEFAULT_DIVISION_KEY];
    }
    await client.fields.upsert({
      where: { id: fieldId },
      create: {
        id: fieldId,
        fieldNumber: field.fieldNumber ?? 0,
        divisions: fieldDivisions,
        lat: field.lat ?? null,
        long: field.long ?? null,
        heading: field.heading ?? null,
        inUse: field.inUse ?? null,
        name: field.name ?? null,
        rentalSlotIds: ensureArray(field.rentalSlotIds),
        location: field.location ?? null,
        organizationId: field.organizationId ?? payload.organizationId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        fieldNumber: field.fieldNumber ?? 0,
        divisions: fieldDivisions,
        lat: field.lat ?? null,
        long: field.long ?? null,
        heading: field.heading ?? null,
        inUse: field.inUse ?? null,
        name: field.name ?? null,
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
    const normalizedTeamDivision = normalizeDivisionKey(
      typeof team.division === 'string' ? team.division : team.division?.id,
    ) ?? normalizedEventDivisionIds[0] ?? DEFAULT_DIVISION_KEY;
    const inferredTeamDivision = inferDivisionDetails({
      identifier: normalizedTeamDivision,
      sportInput: payload.sportId ?? undefined,
    });
    const normalizedTeamDivisionTypeId = normalizeDivisionKey(team.divisionTypeId)
      ?? inferredTeamDivision.divisionTypeId;
    const normalizedTeamDivisionTypeName =
      (typeof team.divisionTypeName === 'string' && team.divisionTypeName.trim().length
        ? team.divisionTypeName.trim()
        : inferredTeamDivision.divisionTypeName);
    await client.volleyBallTeams.upsert({
      where: { id: teamId },
      create: {
        id: teamId,
        seed: team.seed ?? 0,
        playerIds: ensureArray(team.playerIds),
        division: normalizedTeamDivision,
        divisionTypeId: normalizedTeamDivisionTypeId,
        divisionTypeName: normalizedTeamDivisionTypeName,
        wins: team.wins ?? 0,
        losses: team.losses ?? 0,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        managerId: team.managerId ?? team.captainId ?? '',
        coachIds: ensureArray(team.coachIds),
        parentTeamId: team.parentTeamId ?? null,
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
        division: normalizedTeamDivision,
        divisionTypeId: normalizedTeamDivisionTypeId,
        divisionTypeName: normalizedTeamDivisionTypeName,
        wins: team.wins ?? 0,
        losses: team.losses ?? 0,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        managerId: team.managerId ?? team.captainId ?? '',
        coachIds: ensureArray(team.coachIds),
        parentTeamId: team.parentTeamId ?? null,
        pending: ensureArray(team.pending),
        teamSize: team.teamSize ?? 0,
        profileImageId: team.profileImageId ?? null,
        sport: team.sport ?? null,
        updatedAt: new Date(),
      },
    });
  }

  for (const slot of expandedTimeSlots) {
    const slotId = slot.id;
    if (!slotId) continue;
    const startDate = coerceDate(slot.startDate) ?? new Date();
    const endDate = slot.endDate ? coerceDate(slot.endDate) : null;
    const slotDivisionKeys = normalizeDivisionIdentifierList(slot.divisions, id);
    const slotDivisions = singleDivisionEnabled
      ? normalizedEventDivisionIds
      : slotDivisionKeys.length
      ? slotDivisionKeys
      : normalizedEventDivisionIds;
    const now = new Date();
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
        createdAt: now,
        updatedAt: now,
      } as any,
      update: {
        dayOfWeek: slot.dayOfWeek ?? 0,
        startTimeMinutes: slot.startTimeMinutes ?? null,
        endTimeMinutes: slot.endTimeMinutes ?? null,
        startDate,
        repeating: Boolean(slot.repeating),
        endDate,
        scheduledFieldId: slot.scheduledFieldId ?? null,
        price: slot.price ?? null,
        updatedAt: now,
      } as any,
    });
    await persistTimeSlotDivisions(client, slotId, slotDivisions, now);
  }

  const nextTimeSlotIdSet = new Set(timeSlotIds);
  const staleTimeSlotIds = existingTimeSlotIds.filter((slotId) => !nextTimeSlotIdSet.has(slotId));
  if (staleTimeSlotIds.length) {
    await client.timeSlots.deleteMany({
      where: { id: { in: staleTimeSlotIds } },
    });
  }

  return id;
};
