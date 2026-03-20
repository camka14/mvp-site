import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { sanitizeOrganizationEventAssignments } from '@/lib/organizationEventAccess';
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
  BlockingEvent,
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
} from '@/server/scheduler/types';
import {
  canonicalizeTimeSlots,
  normalizeTimeSlotDays,
  normalizeTimeSlotFieldIds,
} from '@/server/timeSlotCanonical';

type PrismaLike = PrismaClient | Prisma.TransactionClient;
const UNKNOWN_PRISMA_ARGUMENT_PATTERN = /Unknown argument `([^`]+)`/i;
const warnedMissingEventArguments = new Set<string>();

const extractUnknownPrismaArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_PRISMA_ARGUMENT_PATTERN);
  return match?.[1] ?? null;
};

const upsertEventWithUnknownArgFallback = async (
  client: PrismaLike,
  id: string,
  eventData: Record<string, unknown>,
): Promise<void> => {
  const removedArguments = new Set<string>();

  while (true) {
    const createData: Record<string, unknown> = { ...eventData, createdAt: new Date() };
    const updateData: Record<string, unknown> = { ...eventData };
    for (const argumentName of removedArguments) {
      delete createData[argumentName];
      delete updateData[argumentName];
    }

    try {
      await client.events.upsert({
        where: { id },
        create: createData as any,
        update: updateData as any,
      });
      return;
    } catch (error) {
      const unknownArgument = extractUnknownPrismaArgument(error);
      const hasArgument = unknownArgument
        ? Object.prototype.hasOwnProperty.call(createData, unknownArgument)
          || Object.prototype.hasOwnProperty.call(updateData, unknownArgument)
        : false;
      if (!unknownArgument || !hasArgument || removedArguments.has(unknownArgument)) {
        throw error;
      }
      removedArguments.add(unknownArgument);
      if (!warnedMissingEventArguments.has(unknownArgument)) {
        warnedMissingEventArguments.add(unknownArgument);
        console.warn(
          `[events] Prisma client is missing Events.${unknownArgument}; retrying event upsert without it. Regenerate Prisma client to restore this field.`,
        );
      }
    }
  }
};

const ensureArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const ensureStringArray = (value: unknown): string[] => ensureArray(value as string[]);
const normalizeTeamIdList = (value: unknown): string[] => Array.from(
  new Set(
    ensureArray(value as Array<string | null | undefined>)
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  ),
);
const ensureNumberArray = (value: unknown): number[] =>
  ensureArray(value as Array<number | string>)
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
const isSchedulableEventType = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'LEAGUE' || normalized === 'TOURNAMENT';
};
const FIELD_CONFLICT_LOOKAHEAD_WEEKS = 52;
const FIELD_MATCH_BLOCK_PREFIX = '__field_match_block__';
const FIELD_EVENT_BLOCK_PREFIX = '__field_event_block__';
const coerceBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const resolveBillingOwnerHasStripeAccount = async (
  client: PrismaLike,
  params: {
    organizationId?: unknown;
    hostId?: unknown;
  },
): Promise<boolean> => {
  const organizationId = normalizeEntityId(params.organizationId);
  if (organizationId) {
    const organization = await client.organizations.findUnique({
      where: { id: organizationId },
      select: { hasStripeAccount: true },
    });
    return Boolean(organization?.hasStripeAccount);
  }

  const hostId = normalizeEntityId(params.hostId);
  if (!hostId) {
    return false;
  }
  const hostProfile = await client.userData.findUnique({
    where: { id: hostId },
    select: { hasStripeAccount: true },
  });
  return Boolean(hostProfile?.hasStripeAccount);
};

const DEFAULT_DIVISION_KEY = 'open';
const DEFAULT_DIVISION_KIND: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE';
const LEAGUE_SCORING_BOOLEAN_FIELDS: readonly string[] = [];
const LEAGUE_SCORING_NUMBER_FIELDS = [
  'pointsForWin',
  'pointsForDraw',
  'pointsForLoss',
  'pointsPerGoalScored',
  'pointsPerGoalConceded',
] as const;

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const normalizeDivisionKind = (value: unknown, fallback: 'LEAGUE' | 'PLAYOFF' = DEFAULT_DIVISION_KIND): 'LEAGUE' | 'PLAYOFF' => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PLAYOFF') {
    return 'PLAYOFF';
  }
  return 'LEAGUE';
};

const normalizeStandingsOverrides = (value: unknown): Record<string, number> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([teamId, points]) => {
      const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
      const normalizedPoints = typeof points === 'number' ? points : Number(points);
      if (!normalizedTeamId || !Number.isFinite(normalizedPoints)) {
        return null;
      }
      return [normalizedTeamId, normalizedPoints] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);
  if (!entries.length) {
    return null;
  }
  return Object.fromEntries(entries);
};

type PlayoffDivisionConfigPayload = {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
};

const PLAYOFF_CONFIG_KEYS: ReadonlyArray<keyof PlayoffDivisionConfigPayload> = [
  'doubleElimination',
  'winnerSetCount',
  'loserSetCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'prize',
  'fieldCount',
  'restTimeMinutes',
];

const normalizePlayoffDivisionConfig = (value: unknown): PlayoffDivisionConfigPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hasConfigValue = PLAYOFF_CONFIG_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined,
  );
  if (!hasConfigValue) {
    return null;
  }

  const normalizeNumber = (input: unknown, fallback: number, min: number = 0): number => {
    const parsed = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.trunc(parsed));
  };

  const normalizePoints = (input: unknown, expectedLength: number): number[] => {
    const values = Array.isArray(input)
      ? input
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.max(1, Math.trunc(entry)))
      : [];
    const next = values.slice(0, expectedLength);
    while (next.length < expectedLength) {
      next.push(21);
    }
    return next;
  };

  const winnerSetCount = normalizeNumber(row.winnerSetCount, 1, 1);
  const doubleElimination = Boolean(row.doubleElimination);
  const loserSetCount = normalizeNumber(row.loserSetCount, 1, 1);
  const normalizedLoserSetCount = doubleElimination ? loserSetCount : 1;

  return {
    doubleElimination,
    winnerSetCount,
    loserSetCount: normalizedLoserSetCount,
    winnerBracketPointsToVictory: normalizePoints(row.winnerBracketPointsToVictory, winnerSetCount),
    loserBracketPointsToVictory: normalizePoints(row.loserBracketPointsToVictory, normalizedLoserSetCount),
    prize: typeof row.prize === 'string' ? row.prize : '',
    fieldCount: normalizeNumber(row.fieldCount, 1, 1),
    restTimeMinutes: normalizeNumber(row.restTimeMinutes, 0, 0),
  };
};

const serializePlayoffDivisionConfig = (value: PlayoffDivisionConfigPayload): Record<string, unknown> => ({
  doubleElimination: value.doubleElimination,
  winnerSetCount: value.winnerSetCount,
  loserSetCount: value.loserSetCount,
  winnerBracketPointsToVictory: [...value.winnerBracketPointsToVictory],
  loserBracketPointsToVictory: [...value.loserBracketPointsToVictory],
  prize: value.prize,
  fieldCount: value.fieldCount,
  restTimeMinutes: value.restTimeMinutes,
});

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

const isMissingTimeSlotArrayColumnError = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'P2022') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('timeslots')
    && (
      normalized.includes('scheduledfieldids')
      || normalized.includes('daysofweek')
      || normalized.includes('(not available)')
    )
    && normalized.includes('does not exist');
};

const loadTimeSlotRows = async (client: PrismaLike, timeSlotIds: string[]): Promise<any[]> => {
  if (!timeSlotIds.length) {
    return [];
  }
  try {
    return await client.timeSlots.findMany({
      where: { id: { in: timeSlotIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        dayOfWeek: true,
        daysOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        startDate: true,
        repeating: true,
        endDate: true,
        scheduledFieldId: true,
        scheduledFieldIds: true,
        price: true,
        divisions: true,
        requiredTemplateIds: true,
      } as any,
    });
  } catch (error) {
    if (!isMissingTimeSlotArrayColumnError(error)) {
      throw error;
    }
    const legacyRows = await client.timeSlots.findMany({
      where: { id: { in: timeSlotIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        dayOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        startDate: true,
        repeating: true,
        endDate: true,
        scheduledFieldId: true,
        price: true,
      } as any,
    });
    return legacyRows.map((row: any) => ({
      ...row,
      daysOfWeek: row.dayOfWeek === null || row.dayOfWeek === undefined ? [] : [Number(row.dayOfWeek)],
      scheduledFieldIds: row.scheduledFieldId ? [String(row.scheduledFieldId)] : [],
      divisions: [],
      requiredTemplateIds: [],
    }));
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

const scopeDivisionIdentifierToEvent = (identifier: string, eventId: string): string => {
  if (identifier.startsWith('division_')) {
    return identifier;
  }
  const token = extractDivisionTokenFromId(identifier) ?? identifier;
  return buildDivisionId(eventId, token);
};

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
  return normalized.map((entry) => scopeDivisionIdentifierToEvent(entry, eventId));
};

const normalizePlacementDivisionIdentifierList = (
  value: unknown,
  eventId?: string,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const normalized = normalizeDivisionKey(entry);
    if (!normalized) {
      return '';
    }
    if (!eventId) {
      return normalized;
    }
    return scopeDivisionIdentifierToEvent(normalized, eventId);
  });
};

type DivisionDetailPayload = {
  id: string;
  key: string;
  name: string;
  kind: 'LEAGUE' | 'PLAYOFF';
  divisionTypeId: string;
  divisionTypeName: string;
  ratingType: DivisionRatingType;
  gender: DivisionGender;
  price?: number | null;
  maxParticipants?: number | null;
  playoffTeamCount?: number | null;
  playoffPlacementDivisionIds?: string[];
  standingsOverrides?: Record<string, number> | null;
  playoffConfig?: PlayoffDivisionConfigPayload | null;
  standingsConfirmedAt?: string | null;
  standingsConfirmedBy?: string | null;
  allowPaymentPlans?: boolean | null;
  installmentCount?: number | null;
  installmentDueDates?: string[];
  installmentAmounts?: number[];
  ageCutoffDate: string | null;
  ageCutoffLabel: string | null;
  ageCutoffSource: string | null;
  fieldIds: string[];
  teamIds?: string[];
};

const normalizeDivisionDetailsPayload = (
  value: unknown,
  eventId: string,
  sportId?: string | null,
  defaultKind: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE',
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
        ? scopeDivisionIdentifierToEvent(rawId, eventId)
        : buildDivisionId(eventId, key);
      const divisionTypeName = typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length
        ? row.divisionTypeName.trim()
        : inferred.divisionTypeName;
      const defaultName = buildDivisionName({
        gender,
        divisionTypeName,
      });
      const rawPrice = coerceNullableNumber(row.price);
      const rawMaxParticipants = coerceNullableNumber(row.maxParticipants);
      const rawPlayoffTeamCount = coerceNullableNumber(row.playoffTeamCount);
      const rawKind = normalizeDivisionKind(row.kind, defaultKind);
      const hasPlayoffPlacementDivisionIdsInput = Object.prototype.hasOwnProperty.call(row, 'playoffPlacementDivisionIds');
      const rawPlayoffPlacementDivisionIds = hasPlayoffPlacementDivisionIdsInput
        ? normalizePlacementDivisionIdentifierList(row.playoffPlacementDivisionIds, eventId)
        : undefined;
      const rawStandingsOverrides = normalizeStandingsOverrides(row.standingsOverrides);
      const rawPlayoffConfig = rawKind === 'PLAYOFF'
        ? (
            normalizePlayoffDivisionConfig(row.playoffConfig)
            ?? normalizePlayoffDivisionConfig(row)
          )
        : null;
      const rawStandingsConfirmedAt = normalizeIsoDateString(row.standingsConfirmedAt);
      const rawStandingsConfirmedBy = typeof row.standingsConfirmedBy === 'string'
        ? row.standingsConfirmedBy.trim() || null
        : null;
      const rawAllowPaymentPlans = coerceNullableBoolean(row.allowPaymentPlans);
      const rawInstallmentCount = coerceNullableNumber(row.installmentCount);
      const rawInstallmentDueDates = Array.isArray(row.installmentDueDates)
        ? row.installmentDueDates
          .map((value) => normalizeIsoDateString(value))
          .filter((value): value is string => Boolean(value))
        : undefined;
      const rawInstallmentAmounts = Array.isArray(row.installmentAmounts)
        ? row.installmentAmounts
          .map((value) => (typeof value === 'number' ? value : Number(value)))
          .filter((value) => Number.isFinite(value))
          .map((value) => Math.max(0, Math.round(value)))
        : undefined;
      const hasTeamIdsInput = Object.prototype.hasOwnProperty.call(row, 'teamIds');
      const rawTeamIds = hasTeamIdsInput ? normalizeTeamIdList(row.teamIds) : undefined;

      const detail: DivisionDetailPayload = {
        id,
        key,
        name: typeof row.name === 'string' && row.name.trim().length ? row.name.trim() : defaultName,
        kind: rawKind,
        divisionTypeId,
        divisionTypeName,
        ratingType,
        gender,
        price: rawPrice === undefined ? undefined : rawPrice === null ? null : Math.max(0, Math.round(rawPrice)),
        maxParticipants: rawMaxParticipants === undefined
          ? undefined
          : rawMaxParticipants === null
            ? null
            : Math.max(0, Math.trunc(rawMaxParticipants)),
        playoffTeamCount: rawPlayoffTeamCount === undefined
          ? undefined
          : rawPlayoffTeamCount === null
            ? null
            : Math.max(0, Math.trunc(rawPlayoffTeamCount)),
        ...(rawPlayoffPlacementDivisionIds !== undefined
          ? { playoffPlacementDivisionIds: rawPlayoffPlacementDivisionIds }
          : {}),
        standingsOverrides: rawStandingsOverrides,
        playoffConfig: rawPlayoffConfig,
        standingsConfirmedAt: rawStandingsConfirmedAt,
        standingsConfirmedBy: rawStandingsConfirmedBy,
        allowPaymentPlans: rawAllowPaymentPlans,
        installmentCount: rawInstallmentCount === undefined
          ? undefined
          : rawInstallmentCount === null
            ? null
            : Math.max(0, Math.trunc(rawInstallmentCount)),
        installmentDueDates: rawInstallmentDueDates,
        installmentAmounts: rawInstallmentAmounts,
        ageCutoffDate: normalizeIsoDateString(row.ageCutoffDate),
        ageCutoffLabel: typeof row.ageCutoffLabel === 'string' ? row.ageCutoffLabel : null,
        ageCutoffSource: typeof row.ageCutoffSource === 'string' ? row.ageCutoffSource : null,
        fieldIds: normalizeFieldIds(row.fieldIds),
        ...(rawKind === 'PLAYOFF'
          ? { teamIds: [] }
          : hasTeamIdsInput
            ? { teamIds: rawTeamIds }
            : {}),
      };
      return detail;
    })
    .filter((entry): entry is DivisionDetailPayload => entry !== null);

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


const coerceDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const coerceNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const coerceNullableBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

const normalizeLeagueScoringConfigPayload = (
  value: unknown,
): { id?: string; data: Record<string, number | boolean | null> } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const configuredId = [row.id, row.$id]
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .find((entry) => entry.length > 0);
  const data: Record<string, number | boolean | null> = {};

  for (const key of LEAGUE_SCORING_NUMBER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const normalized = coerceNullableNumber(row[key]);
    if (normalized !== undefined) {
      data[key] = normalized;
    }
  }

  for (const key of LEAGUE_SCORING_BOOLEAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const normalized = coerceNullableBoolean(row[key]);
    if (normalized !== undefined) {
      data[key] = normalized;
    }
  }

  return { id: configuredId, data };
};

const normalizeInstallmentAmountList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.round(entry)));
};

const normalizeInstallmentDateList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeIsoDateString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const resolveDivisionValue = <T>(
  incoming: T | undefined,
  existing: T | undefined,
  fallback: T | undefined,
): T | undefined => {
  if (incoming !== undefined) {
    return incoming;
  }
  if (existing !== undefined) {
    return existing;
  }
  return fallback;
};

const normalizeIsoDateString = (value: unknown): string | null => {
  const parsed = coerceDate(value);
  return parsed ? parsed.toISOString() : null;
};

const matchBufferMs = (event: Tournament | League): number => {
  const restMinutes = event.restTimeMinutes ?? 0;
  return Math.max(restMinutes, 0) * MINUTE_MS;
};

const buildDivisions = (
  divisionIds: string[],
  divisionRows: Array<{
    id: string;
    name?: string | null;
    key?: string | null;
    kind?: 'LEAGUE' | 'PLAYOFF' | null;
    fieldIds?: string[] | null;
    sportId?: string | null;
    price?: number | null;
    maxParticipants?: number | null;
    playoffTeamCount?: number | null;
    playoffPlacementDivisionIds?: string[] | null;
    standingsOverrides?: unknown;
    standingsConfirmedAt?: Date | null;
    standingsConfirmedBy?: string | null;
    teamIds?: string[] | null;
  }>,
  sportId?: string | null,
  options?: { allowFallback?: boolean; fallbackKind?: 'LEAGUE' | 'PLAYOFF' },
) => {
  const allowFallback = options?.allowFallback ?? true;
  const fallbackKind = options?.fallbackKind ?? 'LEAGUE';
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
    const kind = normalizeDivisionKind(matchedRow?.kind, 'LEAGUE');
    const standingsOverrides = kind === 'PLAYOFF'
      ? null
      : normalizeStandingsOverrides(matchedRow?.standingsOverrides) ?? null;
    const playoffConfig = kind === 'PLAYOFF'
      ? normalizePlayoffDivisionConfig(matchedRow?.standingsOverrides) ?? null
      : null;
    const divisionName = matchedRow?.name
      ?? inferred.defaultName
      ?? buildDivisionDisplayName(divisionId, sportId);
    const fieldIds = ensureStringArray(matchedRow?.fieldIds);
    const teamIds = normalizeTeamIdList(matchedRow?.teamIds);
    const division = new Division(
      divisionId,
      divisionName,
      fieldIds,
      matchedRow?.price ?? null,
      matchedRow?.maxParticipants ?? null,
      matchedRow?.playoffTeamCount ?? null,
      kind,
      normalizePlacementDivisionIdentifierList(matchedRow?.playoffPlacementDivisionIds),
      standingsOverrides,
      matchedRow?.standingsConfirmedAt ?? null,
      matchedRow?.standingsConfirmedBy ?? null,
      playoffConfig,
      teamIds,
    );
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

  if (!result.length && allowFallback) {
    const fallbackId = DEFAULT_DIVISION_KEY;
    const fallback = new Division(fallbackId, buildDivisionDisplayName(fallbackId, sportId), [], null, null, null, fallbackKind);
    result.push(fallback);
    addAliases([fallbackId], fallback, []);
  }

  return { divisions: result, map, fieldIdsByDivision };
};

const buildTeams = (
  rows: any[],
  divisionMap: Map<string, Division>,
  fallbackDivision: Division,
  divisionByTeamId: Map<string, Division> = new Map<string, Division>(),
) => {
  const teams: Record<string, Team> = {};
  for (const row of rows) {
    const mappedDivision = divisionByTeamId.get(row.id);
    const normalizedDivisionId = normalizeDivisionKey(row.division);
    const division = mappedDivision
      ?? (normalizedDivisionId && divisionMap.has(normalizedDivisionId)
      ? (divisionMap.get(normalizedDivisionId) as Division)
      : row.division && divisionMap.has(row.division)
      ? (divisionMap.get(row.division) as Division)
      : fallbackDivision);
    teams[row.id] = new Team({
      id: row.id,
      captainId: row.captainId ?? '',
      division,
      name: row.name ?? '',
      matches: [],
      playerIds: ensureArray(row.playerIds),
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
  return rows.map((row) => {
    const repeating = Boolean(row.repeating);
    const startDate = row.startDate instanceof Date ? row.startDate : new Date(row.startDate);
    const endDate = row.endDate ? new Date(row.endDate) : null;
    const startTimeMinutes = typeof row.startTimeMinutes === 'number'
      ? row.startTimeMinutes
      : (startDate.getHours() * 60 + startDate.getMinutes());
    const endTimeMinutes = typeof row.endTimeMinutes === 'number'
      ? row.endTimeMinutes
      : (endDate ? endDate.getHours() * 60 + endDate.getMinutes() : 0);
    const normalizedDays = normalizeTimeSlotDays({
      dayOfWeek: row.dayOfWeek,
      daysOfWeek: (row as any).daysOfWeek,
    });
    const normalizedFieldIds = normalizeTimeSlotFieldIds(row);
    const slotDivisionIds = normalizeDivisionKeys((row as any).divisions);
    const slotDivisions = slotDivisionIds.length
      ? slotDivisionIds.map((id) => divisionMap.get(id) ?? new Division(id, buildDivisionDisplayName(id)))
      : fallbackDivisions;
    const daysOfWeek = normalizedDays.length
      ? normalizedDays
      : [((startDate.getDay() + 6) % 7)];
    const dayOfWeek = daysOfWeek[0] ?? ((startDate.getDay() + 6) % 7);
    return new TimeSlot({
      id: row.id,
      dayOfWeek,
      daysOfWeek,
      startDate,
      endDate,
      repeating,
      startTimeMinutes,
      endTimeMinutes,
      price: row.price ?? null,
      field: normalizedFieldIds[0] ?? null,
      fieldIds: normalizedFieldIds,
      divisions: [...slotDivisions],
    });
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
    field.rentalSlots = slots.filter((slot) =>
      (Array.isArray(slot.fieldIds) && slot.fieldIds.length
        ? slot.fieldIds
        : slot.field
          ? [slot.field]
          : []
      ).includes(field.id),
    );
  }
};

const resolveFieldConflictWindowEnd = (params: {
  start: Date;
  end: Date;
  noFixedEndDateTime: boolean;
}): Date => {
  const baselineEndMs = Math.max(params.start.getTime(), params.end.getTime());
  if (!params.noFixedEndDateTime) {
    return new Date(baselineEndMs);
  }
  return new Date(baselineEndMs + FIELD_CONFLICT_LOOKAHEAD_WEEKS * 7 * 24 * 60 * MINUTE_MS);
};

const clearManagedFieldBlockingEvents = (fields: Record<string, PlayingField>): void => {
  for (const field of Object.values(fields)) {
    field.events = field.events.filter((event) => {
      const id = String(event.id ?? '');
      return !id.startsWith(FIELD_MATCH_BLOCK_PREFIX) && !id.startsWith(FIELD_EVENT_BLOCK_PREFIX);
    });
  }
};

const normalizeMondayIndex = (date: Date): number => (date.getDay() + 6) % 7;

const setMinutesOnDay = (day: Date, minutes: number): Date => {
  const next = new Date(day.getTime());
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

const rangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const normalizeBlockingSlotDays = (slot: any): number[] => normalizeTimeSlotDays({
  dayOfWeek: slot?.dayOfWeek,
  daysOfWeek: slot?.daysOfWeek,
});

const normalizeBlockingSlotFieldIds = (slot: any): string[] => normalizeTimeSlotFieldIds({
  scheduledFieldId: slot?.scheduledFieldId,
  scheduledFieldIds: slot?.scheduledFieldIds,
});

const appendBlockingEvent = (params: {
  field: PlayingField;
  id: string;
  start: Date;
  end: Date;
  parentId: string;
}): void => {
  if (params.end.getTime() <= params.start.getTime()) {
    return;
  }
  params.field.events.push(
    new BlockingEvent({
      id: params.id,
      start: params.start,
      end: params.end,
      participants: [],
      field: params.field,
      parentId: params.parentId,
    }),
  );
};

const appendBlockingEventsFromSlot = (params: {
  slot: any;
  field: PlayingField;
  fieldId: string;
  blockPrefix: string;
  parentId: string;
  windowStart: Date;
  windowEnd: Date;
  fallbackStart?: Date | null;
  fallbackEnd?: Date | null;
}): void => {
  const slotStart = toOptionalDate(params.slot?.startDate) ?? params.fallbackStart ?? null;
  if (!slotStart) {
    return;
  }
  const repeating = params.slot?.repeating !== false;
  const startMinutes = typeof params.slot?.startTimeMinutes === 'number'
    ? params.slot.startTimeMinutes
    : slotStart.getHours() * 60 + slotStart.getMinutes();
  const explicitEnd = toOptionalDate(params.slot?.endDate) ?? params.fallbackEnd ?? null;
  const endMinutes = typeof params.slot?.endTimeMinutes === 'number'
    ? params.slot.endTimeMinutes
    : explicitEnd
      ? explicitEnd.getHours() * 60 + explicitEnd.getMinutes()
      : null;

  if (!repeating) {
    const resolvedEnd = explicitEnd ?? (
      typeof endMinutes === 'number' && endMinutes > startMinutes
        ? new Date(slotStart.getTime() + (endMinutes - startMinutes) * MINUTE_MS)
        : null
    );
    if (!resolvedEnd || !rangesOverlap(slotStart, resolvedEnd, params.windowStart, params.windowEnd)) {
      return;
    }
    appendBlockingEvent({
      field: params.field,
      id: `${params.blockPrefix}${params.fieldId}__${Math.max(slotStart.getTime(), params.windowStart.getTime())}`,
      start: new Date(Math.max(slotStart.getTime(), params.windowStart.getTime())),
      end: new Date(Math.min(resolvedEnd.getTime(), params.windowEnd.getTime())),
      parentId: params.parentId,
    });
    return;
  }

  if (typeof endMinutes !== 'number' || endMinutes <= startMinutes) {
    return;
  }
  const days = normalizeBlockingSlotDays(params.slot);
  if (!days.length) {
    return;
  }
  const slotEndBoundary = explicitEnd ?? params.windowEnd;
  const effectiveStart = new Date(Math.max(slotStart.getTime(), params.windowStart.getTime()));
  const effectiveEnd = new Date(Math.min(slotEndBoundary.getTime(), params.windowEnd.getTime()));
  if (effectiveEnd.getTime() <= effectiveStart.getTime()) {
    return;
  }
  const cursor = new Date(effectiveStart.getTime());
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(effectiveEnd.getTime());
  lastDay.setHours(0, 0, 0, 0);
  const durationMs = Math.max(MINUTE_MS, (endMinutes - startMinutes) * MINUTE_MS);

  while (cursor.getTime() <= lastDay.getTime()) {
    if (days.includes(normalizeMondayIndex(cursor))) {
      const occurrenceStart = setMinutesOnDay(cursor, startMinutes);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
      if (rangesOverlap(occurrenceStart, occurrenceEnd, effectiveStart, effectiveEnd)) {
        appendBlockingEvent({
          field: params.field,
          id: `${params.blockPrefix}${params.fieldId}__${occurrenceStart.getTime()}`,
          start: occurrenceStart,
          end: occurrenceEnd,
          parentId: params.parentId,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
};

const attachFieldSchedulingConflicts = async (params: {
  client: PrismaLike;
  eventId: string;
  organizationId?: string | null;
  fields: Record<string, PlayingField>;
  windowStart: Date;
  windowEnd: Date;
}): Promise<void> => {
  const fieldIds = Object.keys(params.fields);
  if (!fieldIds.length) {
    return;
  }
  if (params.windowEnd.getTime() <= params.windowStart.getTime()) {
    return;
  }

  clearManagedFieldBlockingEvents(params.fields);

  const currentEventRow = await params.client.events.findUnique({
    where: { id: params.eventId },
    select: {
      organizationId: true,
      timeSlotIds: true,
    },
  });
  const scopedOrganizationId = normalizeEntityId(params.organizationId) ?? normalizeEntityId(currentEventRow?.organizationId);
  const currentEventSlotIds = new Set(ensureStringArray(currentEventRow?.timeSlotIds));

  const [externalMatchRowsRaw, externalEventRowsRaw, fieldRows] = await Promise.all([
    params.client.matches.findMany({
      where: {
        fieldId: { in: fieldIds },
        eventId: { not: params.eventId },
        start: { not: null, lt: params.windowEnd },
        end: { not: null, gt: params.windowStart },
      } as any,
      select: {
        id: true,
        eventId: true,
        fieldId: true,
        start: true,
        end: true,
      },
    }),
    params.client.events.findMany({
      where: {
        id: { not: params.eventId },
        fieldIds: { hasSome: fieldIds },
        NOT: { state: 'TEMPLATE' },
        start: { lt: params.windowEnd },
        end: { gt: params.windowStart },
        ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}),
      } as any,
      select: {
        id: true,
        eventType: true,
        parentEvent: true,
        start: true,
        end: true,
        fieldIds: true,
        timeSlotIds: true,
      },
    }),
    params.client.fields.findMany({
      where: {
        id: { in: fieldIds },
        ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}),
      },
      select: {
        id: true,
        rentalSlotIds: true,
      },
    }),
  ]);

  let externalMatchRows = externalMatchRowsRaw;
  if (scopedOrganizationId) {
    const matchEventIds = Array.from(
      new Set(
        externalMatchRows
          .map((row) => (typeof row.eventId === 'string' ? row.eventId : ''))
          .filter((eventId) => eventId.length > 0),
      ),
    );
    if (matchEventIds.length) {
      const allowedEventRows = await params.client.events.findMany({
        where: {
          id: { in: matchEventIds },
          organizationId: scopedOrganizationId,
          NOT: { state: 'TEMPLATE' },
        },
        select: { id: true },
      });
      const allowedEventIds = new Set(allowedEventRows.map((event) => event.id));
      externalMatchRows = externalMatchRows.filter((row) => (
        typeof row.eventId === 'string' && allowedEventIds.has(row.eventId)
      ));
    } else {
      externalMatchRows = [];
    }
  }

  for (const row of externalMatchRows) {
    const fieldId = typeof row.fieldId === 'string' ? row.fieldId : '';
    const field = fieldId ? params.fields[fieldId] : undefined;
    if (!field) {
      continue;
    }
    const start = toOptionalDate(row.start);
    const end = toOptionalDate(row.end);
    if (!start || !end || end.getTime() <= start.getTime()) {
      continue;
    }
    field.events.push(
      new BlockingEvent({
        id: `${FIELD_MATCH_BLOCK_PREFIX}${row.id}`,
        start,
        end,
        participants: [],
        field,
        parentId: row.eventId ?? '',
      })
    );
  }

  const externalEventRows = externalEventRowsRaw.filter((row) => {
    const eventType = typeof row.eventType === 'string' ? row.eventType.toUpperCase() : '';
    const parentEventId = normalizeEntityId(row.parentEvent);
    if (eventType === 'WEEKLY_EVENT' && parentEventId) {
      return false;
    }
    if (scopedOrganizationId) {
      const rowOrganizationId = normalizeEntityId((row as any).organizationId);
      if (rowOrganizationId && rowOrganizationId !== scopedOrganizationId) {
        return false;
      }
    }
    return true;
  });
  const externalEventSlotIds = Array.from(
    new Set(
      externalEventRows.flatMap((row) => ensureStringArray(row.timeSlotIds)),
    ),
  );
  const externalEventSlotRows = externalEventSlotIds.length > 0
    ? await params.client.timeSlots.findMany({
      where: {
        id: { in: externalEventSlotIds },
      },
    })
    : [];
  const externalEventSlotById = new Map(externalEventSlotRows.map((slot) => [slot.id, slot]));
  const eventBoundSlotIds = new Set(externalEventSlotIds);

  for (const row of externalEventRows) {
    const eventType = typeof row.eventType === 'string' ? row.eventType.toUpperCase() : '';
    const parentEventId = normalizeEntityId(row.parentEvent);
    if (eventType === 'WEEKLY_EVENT' && parentEventId) {
      continue;
    }
    const eventFieldIds = normalizeFieldIds(row.fieldIds);
    const relevantFieldIds = eventFieldIds.filter((fieldId) => Boolean(params.fields[fieldId]));
    if (!relevantFieldIds.length) {
      continue;
    }

    const start = toOptionalDate(row.start);
    const end = toOptionalDate(row.end);
    const isWeeklyParent = eventType === 'WEEKLY_EVENT' && !parentEventId;
    const slotBased = isSchedulableEventType(eventType) || isWeeklyParent;

    if (!slotBased) {
      if (!start || !end || end.getTime() <= start.getTime()) {
        continue;
      }
      for (const fieldId of relevantFieldIds) {
        const field = params.fields[fieldId];
        if (!field) {
          continue;
        }
        appendBlockingEvent({
          field,
          id: `${FIELD_EVENT_BLOCK_PREFIX}${row.id}__${fieldId}`,
          start,
          end,
          parentId: row.id,
        });
      }
      continue;
    }

    const timeSlots = ensureStringArray(row.timeSlotIds)
      .map((slotId) => externalEventSlotById.get(slotId))
      .filter((slot): slot is any => Boolean(slot));
    for (const slot of timeSlots) {
      const slotFieldIds = normalizeBlockingSlotFieldIds(slot).filter((fieldId) => Boolean(params.fields[fieldId]));
      for (const fieldId of slotFieldIds) {
        const field = params.fields[fieldId];
        if (!field) {
          continue;
        }
        appendBlockingEventsFromSlot({
          slot,
          field,
          fieldId,
          blockPrefix: `${FIELD_EVENT_BLOCK_PREFIX}${row.id}__${slot.id}__`,
          parentId: row.id,
          windowStart: params.windowStart,
          windowEnd: params.windowEnd,
          fallbackStart: start,
          fallbackEnd: end,
        });
      }
    }
  }

  const rentalSlotIds = Array.from(
    new Set(
      fieldRows.flatMap((row) => ensureStringArray(row.rentalSlotIds)),
    ),
  );
  const rentalSlotRows = rentalSlotIds.length > 0
    ? await params.client.timeSlots.findMany({
      where: {
        id: { in: rentalSlotIds },
      },
    })
    : [];
  const rentalSlotById = new Map(rentalSlotRows.map((slot) => [slot.id, slot]));
  for (const fieldRow of fieldRows) {
    const field = params.fields[fieldRow.id];
    if (!field) {
      continue;
    }
    const rentalIdsForField = ensureStringArray(fieldRow.rentalSlotIds);
    for (const slotId of rentalIdsForField) {
      if (currentEventSlotIds.has(slotId) || eventBoundSlotIds.has(slotId)) {
        continue;
      }
      const slot = rentalSlotById.get(slotId);
      if (!slot) {
        continue;
      }
      const slotFieldIds = normalizeBlockingSlotFieldIds(slot);
      if (slotFieldIds.length > 0 && !slotFieldIds.includes(fieldRow.id)) {
        continue;
      }
      appendBlockingEventsFromSlot({
        slot,
        field,
        fieldId: fieldRow.id,
        blockPrefix: `${FIELD_EVENT_BLOCK_PREFIX}rental__${slotId}__`,
        parentId: '',
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
      });
    }
  }
};

const toOptionalDate = (value: unknown): Date | null => {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    const start = toOptionalDate(row.start);
    const end = toOptionalDate(row.end);
    const match = new Match({
      id: row.id,
      matchId: row.matchId ?? null,
      locked: Boolean(row.locked),
      team1Seed: typeof row.team1Seed === 'number'
        ? row.team1Seed
        : null,
      team2Seed: typeof row.team2Seed === 'number'
        ? row.team2Seed
        : null,
      team1Points: ensureArray(row.team1Points),
      team2Points: ensureArray(row.team2Points),
      // Match currently expects Date in constructor, but unscheduled matches may be null.
      // Use a temporary fallback and overwrite below.
      start: start ?? new Date(0),
      end: end ?? new Date(0),
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
    if (!start) {
      (match as unknown as { start: Date | null }).start = null;
    }
    if (!end) {
      (match as unknown as { end: Date | null }).end = null;
    }
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

  const eventDivisionIds = ensureStringArray(event.divisions);
  const allDivisionRows = await client.divisions.findMany({
    where: { eventId: event.id },
  });
  const leagueDivisionRows = allDivisionRows.filter((row) => normalizeDivisionKind((row as any).kind, 'LEAGUE') !== 'PLAYOFF');
  const playoffDivisionRows = allDivisionRows.filter((row) => normalizeDivisionKind((row as any).kind, 'LEAGUE') === 'PLAYOFF');
  const leagueDivisionIds = eventDivisionIds.length
    ? eventDivisionIds
    : leagueDivisionRows.map((row) => row.id);
  const { divisions, map: leagueDivisionMap, fieldIdsByDivision } = buildDivisions(
    leagueDivisionIds,
    leagueDivisionRows,
    event.sportId ?? null,
  );
  const {
    divisions: playoffDivisions,
    map: playoffDivisionMap,
  } = buildDivisions(
    playoffDivisionRows.map((row) => row.id),
    playoffDivisionRows,
    event.sportId ?? null,
    { allowFallback: false, fallbackKind: 'PLAYOFF' },
  );
  const divisionMap = new Map<string, Division>();
  for (const [key, division] of leagueDivisionMap.entries()) {
    divisionMap.set(key, division);
  }
  for (const [key, division] of playoffDivisionMap.entries()) {
    divisionMap.set(key, division);
  }
  const allDivisions = [
    ...divisions,
    ...playoffDivisions,
  ];
  const fallbackDivision = divisions[0] ?? new Division(DEFAULT_DIVISION_KEY, buildDivisionDisplayName(DEFAULT_DIVISION_KEY, event.sportId ?? null));

  const fieldIds = ensureStringArray(event.fieldIds);
  const teamIds = ensureStringArray(event.teamIds);
  const teamIdsToLoad = Array.from(new Set(teamIds));
  const timeSlotIds = ensureStringArray(event.timeSlotIds);
  const refereeIds = ensureStringArray(event.refereeIds);

  const [fieldRows, teamRows, timeSlotRows, refereeRows, matchRows, leagueConfigRow] = await Promise.all([
    fieldIds.length ? client.fields.findMany({ where: { id: { in: fieldIds } } }) : Promise.resolve([]),
    teamIdsToLoad.length ? client.teams.findMany({ where: { id: { in: teamIdsToLoad } } }) : Promise.resolve([]),
    loadTimeSlotRows(client, timeSlotIds),
    refereeIds.length ? client.userData.findMany({ where: { id: { in: refereeIds } } }) : Promise.resolve([]),
    client.matches.findMany({ where: { eventId: event.id } }),
    event.leagueScoringConfigId ? client.leagueScoringConfigs.findUnique({ where: { id: event.leagueScoringConfigId } }) : Promise.resolve(null),
  ]);

  const fallbackFieldDivisionIds = leagueDivisionIds.length ? leagueDivisionIds : [DEFAULT_DIVISION_KEY];
  const fields = buildFields(fieldRows, divisionMap, fallbackFieldDivisionIds, fieldIdsByDivision);
  const teamRosterSet = new Set(teamIdsToLoad);
  const divisionByTeamId = new Map<string, Division>();
  if (!Boolean(event.singleDivision) && divisions.length > 0) {
    for (const division of divisions) {
      for (const divisionTeamId of division.teamIds) {
        if (!teamRosterSet.has(divisionTeamId)) {
          continue;
        }
        if (!divisionByTeamId.has(divisionTeamId)) {
          divisionByTeamId.set(divisionTeamId, division);
        }
      }
    }
  }
  const teams = buildTeams(teamRows, divisionMap, fallbackDivision, divisionByTeamId);
  const timeSlots = buildTimeSlots(timeSlotRows, divisionMap, divisions);
  const referees = buildReferees(refereeRows, allDivisions);
  attachTimeSlotsToFields(fields, timeSlots);
  const eventStart = event.start instanceof Date ? event.start : new Date(event.start);
  const eventEnd = event.end instanceof Date
    ? event.end
    : (event.end ? new Date(event.end) : eventStart);
  const normalizedParentEvent = normalizeEntityId((event as any).parentEvent);
  const isWeeklyChild = (
    String(event.eventType ?? '').toUpperCase() === 'WEEKLY_EVENT'
    && Boolean(normalizedParentEvent)
  );
  const noFixedEndDateTime = typeof (event as any).noFixedEndDateTime === 'boolean'
    ? (event as any).noFixedEndDateTime
    : event.end == null || eventStart.getTime() === eventEnd.getTime();
  if (!isWeeklyChild) {
    const conflictWindowEnd = resolveFieldConflictWindowEnd({
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime,
    });
    await attachFieldSchedulingConflicts({
      client,
      eventId: event.id,
      organizationId: event.organizationId ?? null,
      fields,
      windowStart: eventStart,
      windowEnd: conflictWindowEnd,
    });
  }

  const coordinates = Array.isArray(event.coordinates)
    ? event.coordinates.filter((value): value is number => typeof value === 'number')
    : null;
  const resolvedFieldCount = (() => {
    const resolvedFieldEntries = Object.keys(fields).length;
    if (resolvedFieldEntries > 0) {
      return resolvedFieldEntries;
    }
    const linkedFieldCount = ensureStringArray(event.fieldIds).length;
    return linkedFieldCount > 0 ? linkedFieldCount : null;
  })();

  const baseParams = {
    id: event.id,
    start: eventStart,
    end: eventEnd,
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
    teamRefsMaySwap:
      event.doTeamsRef === true && typeof (event as any).teamRefsMaySwap === 'boolean'
        ? Boolean((event as any).teamRefsMaySwap)
        : false,
    fieldCount: resolvedFieldCount,
    prize: event.prize ?? null,
    hostId: event.hostId ?? '',
    assistantHostIds: ensureStringArray((event as any).assistantHostIds),
    noFixedEndDateTime,
    imageId: event.imageId ?? '',
    loserBracketPointsToVictory: ensureNumberArray(event.loserBracketPointsToVictory),
    winnerBracketPointsToVictory: ensureNumberArray(event.winnerBracketPointsToVictory),
    restTimeMinutes: event.restTimeMinutes ?? 0,
    state: event.state ?? 'UNPUBLISHED',
    leagueScoringConfig: leagueConfigRow ?? null,
    registeredTeamIds: teamIds,
    teams,
    players: [],
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
    splitLeaguePlayoffDivisions: Boolean((event as any).splitLeaguePlayoffDivisions),
    playoffDivisions,
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

  const matches = buildMatches(matchRows, constructed, teams, fields, allDivisions, referees);
  constructed.matches = matches;
  (constructed as any).parentEvent = normalizedParentEvent;
  return constructed;
};

export const saveMatches = async (
  eventId: string,
  matches: Match[],
  client: PrismaLike = prisma,
) => {
  const now = new Date();
  for (const match of matches) {
    const isBracketMatch = Boolean(
      match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch,
    );
    const start = (match as unknown as { start: Date | null }).start ?? null;
    const end = (match as unknown as { end: Date | null }).end ?? null;
    const data = {
      id: match.id,
      matchId: match.matchId ?? 0,
      start,
      end,
      locked: Boolean(match.locked),
      team1Seed: isBracketMatch
        ? (typeof match.team1Seed === 'number' ? match.team1Seed : null)
        : null,
      team2Seed: isBracketMatch
        ? (typeof match.team2Seed === 'number' ? match.team2Seed : null)
        : null,
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

export const persistScheduledRosterTeams = async (
  params: {
    eventId: string;
    scheduled: League | Tournament;
  },
  client: PrismaLike = prisma,
): Promise<string[]> => {
  const rosterTeamIds = Object.keys(params.scheduled.teams ?? {});
  const now = new Date();

  const scheduledLeagueDivisionIds = (() => {
    const ids: string[] = [];
    for (const division of params.scheduled.divisions ?? []) {
      if (normalizeDivisionKind(division.kind, 'LEAGUE') === 'PLAYOFF') {
        continue;
      }
      const normalizedId = normalizeDivisionKey(division.id);
      if (!normalizedId) {
        continue;
      }
      if (!ids.includes(division.id)) {
        ids.push(division.id);
      }
    }
    return ids;
  })();
  const scheduledDivisionAliasToId = new Map<string, string>();
  for (const divisionId of scheduledLeagueDivisionIds) {
    const aliases = [
      normalizeDivisionKey(divisionId),
      normalizeDivisionKey(extractDivisionTokenFromId(divisionId)),
    ].filter((alias): alias is string => Boolean(alias));
    for (const alias of aliases) {
      if (!scheduledDivisionAliasToId.has(alias)) {
        scheduledDivisionAliasToId.set(alias, divisionId);
      }
    }
  }
  const fallbackDivisionId = scheduledLeagueDivisionIds[0] ?? DEFAULT_DIVISION_KEY;
  const resolveScheduledTeamDivisionId = (team: Team | undefined): string => {
    const explicitDivisionId = normalizeDivisionKey(team?.division?.id);
    if (explicitDivisionId) {
      const mappedFromId = scheduledDivisionAliasToId.get(explicitDivisionId);
      if (mappedFromId) {
        return mappedFromId;
      }
      const token = normalizeDivisionKey(extractDivisionTokenFromId(team?.division?.id));
      if (token) {
        const mappedFromToken = scheduledDivisionAliasToId.get(token);
        if (mappedFromToken) {
          return mappedFromToken;
        }
      }
    }
    return fallbackDivisionId;
  };

  await client.events.update({
    where: { id: params.eventId },
    data: {
      teamIds: rosterTeamIds,
      updatedAt: now,
    },
  });

  if (!rosterTeamIds.length) {
    return rosterTeamIds;
  }

  const event = await client.events.findUnique({
    where: { id: params.eventId },
    select: {
      teamSizeLimit: true,
      singleDivision: true,
    },
  });
  const eventTeamSizeLimit = typeof event?.teamSizeLimit === 'number' && Number.isFinite(event.teamSizeLimit)
    ? Math.max(0, Math.trunc(event.teamSizeLimit))
    : null;

  const existingTeams = await client.teams.findMany({
    where: { id: { in: rosterTeamIds } },
    select: {
      id: true,
      division: true,
    },
  });
  const existingTeamById = new Map(existingTeams.map((team) => [team.id, team]));

  for (const teamId of rosterTeamIds) {
    const scheduledTeam = params.scheduled.teams[teamId];
    if (!scheduledTeam) {
      continue;
    }
    const existingTeam = existingTeamById.get(teamId);
    const captainId = String(scheduledTeam.captainId ?? '');
    const playerIds = ensureStringArray(scheduledTeam.playerIds);
    const divisionId = resolveScheduledTeamDivisionId(scheduledTeam);
    const teamSize = eventTeamSizeLimit ?? playerIds.length;

    if (!existingTeam) {
      await client.teams.create({
        data: {
          id: teamId,
          createdAt: now,
          updatedAt: now,
          playerIds,
          division: divisionId,
          divisionTypeId: null,
          divisionTypeName: null,
          name: scheduledTeam.name ?? '',
          captainId,
          managerId: captainId || '',
          headCoachId: null,
          coachIds: [],
          parentTeamId: null,
          pending: [],
          teamSize,
          profileImageId: null,
          sport: null,
        },
      });
      continue;
    }

    const existingDivision = normalizeDivisionKey(existingTeam.division);
    const nextDivision = normalizeDivisionKey(divisionId);
    if (existingDivision !== nextDivision) {
      await client.teams.update({
        where: { id: teamId },
        data: {
          division: divisionId,
          updatedAt: now,
        },
      });
    }
  }

  const isLeagueSchedule = String(params.scheduled.eventType ?? '').toUpperCase() === 'LEAGUE';
  if (isLeagueSchedule && !Boolean(event?.singleDivision)) {
    const assignedTeamIdsByDivisionId = new Map<string, string[]>();
    for (const teamId of rosterTeamIds) {
      const scheduledTeam = params.scheduled.teams[teamId];
      const divisionId = resolveScheduledTeamDivisionId(scheduledTeam);
      const bucket = assignedTeamIdsByDivisionId.get(divisionId) ?? [];
      bucket.push(teamId);
      assignedTeamIdsByDivisionId.set(divisionId, bucket);
    }

    const divisionRows = await client.divisions.findMany({
      where: { eventId: params.eventId },
      select: {
        id: true,
        key: true,
        kind: true,
      },
    });

    for (const row of divisionRows) {
      if (normalizeDivisionKind(row.kind, 'LEAGUE') === 'PLAYOFF') {
        continue;
      }
      const aliases = [
        normalizeDivisionKey(row.id),
        normalizeDivisionKey(row.key),
        normalizeDivisionKey(extractDivisionTokenFromId(row.id)),
      ].filter((alias): alias is string => Boolean(alias));
      const mappedDivisionId = aliases
        .map((alias) => scheduledDivisionAliasToId.get(alias))
        .find((value): value is string => Boolean(value))
        ?? fallbackDivisionId;

      await client.divisions.update({
        where: { id: row.id },
        data: {
          teamIds: assignedTeamIdsByDivisionId.get(mappedDivisionId) ?? [],
          updatedAt: now,
        },
      });
    }
  }

  return rosterTeamIds;
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
  void teams;
  void client;
};

export const syncEventDivisions = async (
  params: {
    eventId: string;
    divisionIds: string[];
    fieldIds: string[];
    singleDivision?: boolean;
    sportId?: string | null;
    referenceDate?: Date | null;
    organizationId?: string | null;
    divisionFieldMap?: Record<string, string[]>;
    divisionDetails?: unknown[];
    playoffDivisionDetails?: unknown[];
    defaultPrice?: number | null;
    defaultMaxParticipants?: number | null;
    defaultPlayoffTeamCount?: number | null;
    defaultAllowPaymentPlans?: boolean | null;
    defaultInstallmentCount?: number | null;
    defaultInstallmentDueDates?: string[];
    defaultInstallmentAmounts?: number[];
  },
  client: PrismaLike = prisma,
) => {
  const normalizedDivisionIds = normalizeDivisionIdentifierList(params.divisionIds, params.eventId);
  const divisionIds = normalizedDivisionIds.length
    ? normalizedDivisionIds
    : [buildDivisionId(params.eventId, DEFAULT_DIVISION_KEY)];
  const divisionFieldMap = params.divisionFieldMap ?? {};
  const allowedFieldIds = new Set(params.fieldIds.map((fieldId) => String(fieldId)));

  const normalizedLeagueDetails = normalizeDivisionDetailsPayload(
    params.divisionDetails ?? [],
    params.eventId,
    params.sportId,
    'LEAGUE',
  );
  const normalizedPlayoffDetails = normalizeDivisionDetailsPayload(
    params.playoffDivisionDetails ?? [],
    params.eventId,
    params.sportId,
    'PLAYOFF',
  );
  const allNormalizedDetails = [
    ...normalizedLeagueDetails,
    ...normalizedPlayoffDetails,
  ];
  const detailLookup = new Map<string, DivisionDetailPayload>();
  for (const detail of allNormalizedDetails) {
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
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      allowPaymentPlans: true,
      installmentCount: true,
      installmentDueDates: true,
      installmentAmounts: true,
      divisionTypeId: true,
      divisionTypeName: true,
      ratingType: true,
      gender: true,
      ageCutoffDate: true,
      ageCutoffLabel: true,
      ageCutoffSource: true,
      fieldIds: true,
      kind: true,
      playoffPlacementDivisionIds: true,
      standingsOverrides: true,
      standingsConfirmedAt: true,
      standingsConfirmedBy: true,
      teamIds: true,
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

  const targetDivisionDescriptors = [
    ...divisionIds.map((rawDivisionId) => ({ rawDivisionId, kind: 'LEAGUE' as const })),
    ...normalizedPlayoffDetails.map((detail) => ({ rawDivisionId: detail.id, kind: 'PLAYOFF' as const })),
  ];
  const seenDivisionIds = new Set<string>();
  const finalEntries = targetDivisionDescriptors
    .filter(({ rawDivisionId }) => {
      const normalizedDivisionId = normalizeDivisionKey(rawDivisionId) ?? rawDivisionId;
      if (seenDivisionIds.has(normalizedDivisionId)) {
        return false;
      }
      seenDivisionIds.add(normalizedDivisionId);
      return true;
    })
    .map(({ rawDivisionId, kind: targetKind }) => {
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
    const kind = normalizeDivisionKind(detail?.kind ?? existing?.kind ?? targetKind, targetKind);

    const gender = detail?.gender ?? inferred.gender;
    const ratingType = detail?.ratingType ?? inferred.ratingType;
    const divisionTypeId = detail?.divisionTypeId ?? inferred.divisionTypeId;
    const key = detail?.key ?? buildDivisionToken({
      gender,
      ratingType,
      divisionTypeId,
    });
    const divisionTypeName = detail?.divisionTypeName ?? inferred.divisionTypeName;

    const mappedFieldIds = kind === 'PLAYOFF'
      ? []
      : (() => {
        const fieldMapAliases = Array.from(
          new Set(
            [
              normalizedDivisionId,
              persistedId,
              key,
              detail?.id,
              detail?.key,
              extractDivisionTokenFromId(normalizedDivisionId),
              extractDivisionTokenFromId(persistedId),
            ]
              .map((alias) => normalizeDivisionKey(alias))
              .filter((alias): alias is string => Boolean(alias)),
          ),
        );
        return Array.from(
          new Set([
            ...fieldMapAliases.flatMap((alias) => ensureStringArray(divisionFieldMap[alias])),
            ...ensureStringArray(detail?.fieldIds),
          ]),
        ).filter((fieldId) => !allowedFieldIds.size || allowedFieldIds.has(fieldId));
      })();
    const mappedTeamIds = kind === 'PLAYOFF' || params.singleDivision
      ? []
      : normalizeTeamIdList(
        resolveDivisionValue(
          detail?.teamIds,
          normalizeTeamIdList(existing?.teamIds),
          [],
        ) ?? [],
      );

    const ratings = kind === 'PLAYOFF'
      ? { minRating: null, maxRating: null }
      : divisionRatingWindow(key, params.sportId ?? null);
    const name = detail?.name
      ?? existing?.name
      ?? inferred.defaultName
      ?? buildDivisionDisplayName(key, params.sportId ?? null);
    const ageEligibility = kind === 'PLAYOFF'
      ? null
      : evaluateDivisionAgeEligibility({
          divisionTypeId,
          sportInput: params.sportId ?? null,
          referenceDate: params.referenceDate ?? null,
        });
    const ageCutoffDate = kind === 'PLAYOFF'
      ? null
      : (
        detail?.ageCutoffDate
          ?? normalizeIsoDateString(existing?.ageCutoffDate)
          ?? (ageEligibility?.applies ? ageEligibility.cutoffDate.toISOString() : null)
      );
    const ageCutoffLabel = kind === 'PLAYOFF'
      ? null
      : (
        detail?.ageCutoffLabel
          ?? existing?.ageCutoffLabel
          ?? ageEligibility?.message
          ?? null
      );
    const ageCutoffSource = kind === 'PLAYOFF'
      ? null
      : (
        detail?.ageCutoffSource
          ?? existing?.ageCutoffSource
          ?? (ageEligibility?.applies ? ageEligibility.cutoffRule.source : null)
      );
    const price = kind === 'PLAYOFF'
      ? null
      : resolveDivisionValue(
        detail?.price,
        existing?.price,
        params.defaultPrice ?? undefined,
      ) ?? null;
    const maxParticipants = resolveDivisionValue(
      detail?.maxParticipants,
      existing?.maxParticipants,
      params.defaultMaxParticipants ?? undefined,
    ) ?? null;
    const playoffTeamCount = kind === 'PLAYOFF'
      ? null
      : resolveDivisionValue(
        detail?.playoffTeamCount,
        existing?.playoffTeamCount,
        params.defaultPlayoffTeamCount ?? undefined,
      ) ?? null;
    const allowPaymentPlans = kind === 'PLAYOFF'
      ? false
      : resolveDivisionValue(
        detail?.allowPaymentPlans,
        existing?.allowPaymentPlans ?? undefined,
        params.defaultAllowPaymentPlans ?? undefined,
      ) ?? null;
    const playoffPlacementDivisionIds = kind === 'PLAYOFF'
      ? []
      : resolveDivisionValue(
          detail?.playoffPlacementDivisionIds,
          normalizePlacementDivisionIdentifierList(existing?.playoffPlacementDivisionIds),
          [],
        ) ?? [];
    const playoffConfig = kind === 'PLAYOFF'
      ? resolveDivisionValue(
          detail?.playoffConfig,
          normalizePlayoffDivisionConfig(existing?.standingsOverrides),
          normalizePlayoffDivisionConfig(detail),
        ) ?? null
      : null;
    const standingsOverrides = kind === 'PLAYOFF'
      ? (playoffConfig ? serializePlayoffDivisionConfig(playoffConfig) : null)
      : resolveDivisionValue(
          detail?.standingsOverrides,
          normalizeStandingsOverrides(existing?.standingsOverrides),
          null,
        ) ?? null;
    const standingsConfirmedAt = kind === 'PLAYOFF'
      ? null
      : (
        resolveDivisionValue(
          detail?.standingsConfirmedAt,
          normalizeIsoDateString(existing?.standingsConfirmedAt),
          null,
        ) ?? null
      );
    const standingsConfirmedBy = kind === 'PLAYOFF'
      ? null
      : (
        resolveDivisionValue(
          detail?.standingsConfirmedBy,
          existing?.standingsConfirmedBy ?? null,
          null,
        ) ?? null
      );

    const fallbackInstallmentAmounts = normalizeInstallmentAmountList(params.defaultInstallmentAmounts ?? []);
    const fallbackInstallmentDueDates = normalizeInstallmentDateList(params.defaultInstallmentDueDates ?? []);
    const installmentAmounts = allowPaymentPlans
      ? resolveDivisionValue(
        detail?.installmentAmounts,
        Array.isArray(existing?.installmentAmounts)
          ? normalizeInstallmentAmountList(existing.installmentAmounts)
          : undefined,
        fallbackInstallmentAmounts,
      ) ?? []
      : [];
    const installmentDueDates = allowPaymentPlans
      ? resolveDivisionValue(
        detail?.installmentDueDates,
        Array.isArray(existing?.installmentDueDates)
          ? normalizeInstallmentDateList(existing.installmentDueDates)
          : undefined,
        fallbackInstallmentDueDates,
      ) ?? []
      : [];
    const resolvedInstallmentCount = allowPaymentPlans
      ? resolveDivisionValue(
        detail?.installmentCount,
        existing?.installmentCount ?? undefined,
        params.defaultInstallmentCount ?? undefined,
      )
      : null;
    const installmentCount = allowPaymentPlans
      ? (typeof resolvedInstallmentCount === 'number' && Number.isFinite(resolvedInstallmentCount)
        ? Math.max(0, Math.trunc(resolvedInstallmentCount))
        : installmentAmounts.length)
      : null;

    return {
      id: persistedId,
      key,
      name,
      kind,
      divisionTypeId,
      divisionTypeName,
      ratingType,
      gender,
      ageCutoffDate,
      ageCutoffLabel,
      ageCutoffSource,
      price,
      maxParticipants,
      playoffTeamCount,
      playoffPlacementDivisionIds,
      standingsOverrides,
      standingsConfirmedAt,
      standingsConfirmedBy,
      allowPaymentPlans,
      installmentCount,
      installmentDueDates,
      installmentAmounts,
      minRating: ratings.minRating,
      maxRating: ratings.maxRating,
      fieldIds: mappedFieldIds,
      teamIds: mappedTeamIds,
    };
  });

  if (!params.singleDivision) {
    const teamDivisionMap = new Map<string, string>();
    for (const entry of finalEntries) {
      if (entry.kind === 'PLAYOFF') {
        continue;
      }
      for (const teamId of entry.teamIds ?? []) {
        const existingDivisionId = teamDivisionMap.get(teamId);
        if (existingDivisionId && existingDivisionId !== entry.id) {
          throw new Error(`Team ${teamId} is assigned to more than one division.`);
        }
        teamDivisionMap.set(teamId, entry.id);
      }
    }
  }

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
        kind: entry.kind,
        eventId: params.eventId,
        organizationId: params.organizationId ?? null,
        sportId: params.sportId ?? null,
        price: entry.price,
        maxParticipants: entry.maxParticipants,
        playoffTeamCount: entry.playoffTeamCount,
        playoffPlacementDivisionIds: entry.playoffPlacementDivisionIds,
        standingsOverrides: entry.standingsOverrides,
        standingsConfirmedAt: entry.standingsConfirmedAt ? new Date(entry.standingsConfirmedAt) : null,
        standingsConfirmedBy: entry.standingsConfirmedBy,
        allowPaymentPlans: entry.allowPaymentPlans,
        installmentCount: entry.installmentCount,
        installmentDueDates: entry.installmentDueDates
          .map((value) => new Date(value))
          .filter((value) => !Number.isNaN(value.getTime())),
        installmentAmounts: entry.installmentAmounts,
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
        teamIds: params.singleDivision ? [] : (entry.teamIds ?? []),
        createdAt: now,
        updatedAt: now,
      } as any,
      update: {
        key: entry.key,
        name: entry.name,
        kind: entry.kind,
        eventId: params.eventId,
        organizationId: params.organizationId ?? null,
        sportId: params.sportId ?? null,
        price: entry.price,
        maxParticipants: entry.maxParticipants,
        playoffTeamCount: entry.playoffTeamCount,
        playoffPlacementDivisionIds: entry.playoffPlacementDivisionIds,
        standingsOverrides: entry.standingsOverrides,
        standingsConfirmedAt: entry.standingsConfirmedAt ? new Date(entry.standingsConfirmedAt) : null,
        standingsConfirmedBy: entry.standingsConfirmedBy,
        allowPaymentPlans: entry.allowPaymentPlans,
        installmentCount: entry.installmentCount,
        installmentDueDates: entry.installmentDueDates
          .map((value) => new Date(value))
          .filter((value) => !Number.isNaN(value.getTime())),
        installmentAmounts: entry.installmentAmounts,
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
        teamIds: params.singleDivision ? [] : (entry.teamIds ?? []),
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
    select: {
      fieldIds: true,
      timeSlotIds: true,
      eventType: true,
      leagueScoringConfigId: true,
      hostId: true,
      organizationId: true,
      parentEvent: true,
    },
  });
  const resolvedOrganizationId = normalizeEntityId(payload.organizationId) ?? normalizeEntityId(existingEvent?.organizationId);
  const resolvedHostId = normalizeEntityId(payload.hostId) ?? normalizeEntityId(existingEvent?.hostId);
  const organizationAccess = resolvedOrganizationId
    ? await client.organizations.findUnique({
      where: { id: resolvedOrganizationId },
      select: {
        ownerId: true,
        hostIds: true,
        refIds: true,
      },
    })
    : null;
  const organizationStaffMembers = resolvedOrganizationId && client.staffMembers?.findMany
    ? await client.staffMembers.findMany({
      where: { organizationId: resolvedOrganizationId },
      select: {
        organizationId: true,
        userId: true,
        types: true,
      },
    })
    : [];
  const organizationStaffInvites = resolvedOrganizationId && client.invites?.findMany
    ? await client.invites.findMany({
      where: { organizationId: resolvedOrganizationId, type: 'STAFF' },
      select: {
        organizationId: true,
        userId: true,
        type: true,
        status: true,
      },
    })
    : [];
  const organizationAssignments = resolvedOrganizationId
    ? sanitizeOrganizationEventAssignments(
      {
        hostId: payload.hostId ?? resolvedHostId ?? null,
        assistantHostIds: ensureStringArray(payload.assistantHostIds),
        refereeIds: ensureStringArray(payload.refereeIds),
      },
      organizationAccess ? { ...organizationAccess, staffMembers: organizationStaffMembers, staffInvites: organizationStaffInvites } : null,
    )
    : null;
  const normalizedHostId = organizationAssignments?.hostId ?? resolvedHostId ?? '';
  const normalizedAssistantHostIds = organizationAssignments
    ? organizationAssignments.assistantHostIds
    : ensureStringArray(payload.assistantHostIds);
  const normalizedRefereeIds = organizationAssignments
    ? organizationAssignments.refereeIds
    : ensureStringArray(payload.refereeIds);
  const billingOwnerHasStripeAccount = await resolveBillingOwnerHasStripeAccount(client, {
    organizationId: resolvedOrganizationId,
    hostId: normalizedHostId,
  });
  const existingFieldIds = normalizeFieldIds(existingEvent?.fieldIds ?? []);
  const existingTimeSlotIds = normalizeFieldIds(existingEvent?.timeSlotIds ?? []);
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const timeSlots = Array.isArray(payload.timeSlots) ? payload.timeSlots : [];
  const normalizeDivisionBilling = (detail: DivisionDetailPayload): DivisionDetailPayload => {
    if (billingOwnerHasStripeAccount) {
      return detail;
    }
    return {
      ...detail,
      price: detail.kind === 'PLAYOFF' ? null : 0,
      allowPaymentPlans: false,
      installmentCount: 0,
      installmentDueDates: [],
      installmentAmounts: [],
    };
  };
  const normalizedDivisionDetails = normalizeDivisionDetailsPayload(payload.divisionDetails, id, payload.sportId, 'LEAGUE')
    .map(normalizeDivisionBilling);
  const normalizedPlayoffDivisionDetails = normalizeDivisionDetailsPayload(payload.playoffDivisionDetails, id, payload.sportId, 'PLAYOFF')
    .map(normalizeDivisionBilling);
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
  const start = coerceDate(payload.start) ?? new Date();
  const canonicalTimeSlots = canonicalizeTimeSlots({
    eventId: id,
    slots: timeSlots,
    fallbackStartDate: start,
    fallbackDivisionKeys: normalizedEventDivisionIds,
    enforceAllDivisions: singleDivisionEnabled,
    normalizeDivisions: (value) => normalizeDivisionIdentifierList(value, id),
  });

  const slotFieldIds = normalizeFieldIds(
    canonicalTimeSlots.flatMap((slot) => slot.scheduledFieldIds),
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
  const derivedTimeSlotIds = canonicalTimeSlots.map((slot) => slot.id).filter(Boolean);
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

  const payloadEventType = typeof payload.eventType === 'string'
    ? payload.eventType.toUpperCase()
    : null;
  const existingEventType = typeof existingEvent?.eventType === 'string'
    ? existingEvent.eventType.toUpperCase()
    : null;
  const nextEventType = payloadEventType ?? existingEventType;
  const normalizedParentEvent = normalizeEntityId(payload.parentEvent)
    ?? normalizeEntityId((existingEvent as any)?.parentEvent);
  const isWeeklyParent = nextEventType === 'WEEKLY_EVENT' && !normalizedParentEvent;
  const supportsNoFixedEndDateTime = isSchedulableEventType(nextEventType) || isWeeklyParent;
  const payloadIncludesEnd = Object.prototype.hasOwnProperty.call(payload, 'end');
  const payloadIncludesNoFixedEndDateTime = Object.prototype.hasOwnProperty.call(payload, 'noFixedEndDateTime');
  const parsedPayloadEnd = payloadIncludesEnd ? coerceDate(payload.end) : null;
  const parsedExistingEnd = coerceDate(existingEvent?.end);
  const candidateEnd = payloadIncludesEnd
    ? parsedPayloadEnd
    : parsedExistingEnd;
  const splitLeaguePlayoffDivisions = payloadEventType === 'LEAGUE'
    ? coerceBoolean(payload.splitLeaguePlayoffDivisions, false)
    : false;
  const fallbackNoFixedEndDateTime = supportsNoFixedEndDateTime
    ? (
      !payloadIncludesNoFixedEndDateTime && typeof (existingEvent as any)?.noFixedEndDateTime === 'boolean'
        ? Boolean((existingEvent as any).noFixedEndDateTime)
        : candidateEnd === null
    )
    : false;
  const noFixedEndDateTime = supportsNoFixedEndDateTime
    ? coerceBoolean(payload.noFixedEndDateTime, fallbackNoFixedEndDateTime)
    : false;
  const normalizedEnd = noFixedEndDateTime ? null : candidateEnd;

  if (!noFixedEndDateTime && (!normalizedEnd || normalizedEnd.getTime() <= start.getTime())) {
    throw new Error('End date/time must be after start date/time when "No fixed end date/time" is disabled.');
  }

  const normalizedLeagueScoringConfig = normalizeLeagueScoringConfigPayload(payload.leagueScoringConfig);
  const payloadLeagueScoringConfigId = typeof payload.leagueScoringConfigId === 'string' && payload.leagueScoringConfigId.trim().length > 0
    ? payload.leagueScoringConfigId.trim()
    : null;
  const existingLeagueScoringConfigId = typeof existingEvent?.leagueScoringConfigId === 'string'
    && existingEvent.leagueScoringConfigId.trim().length > 0
    ? existingEvent.leagueScoringConfigId.trim()
    : null;
  let resolvedLeagueScoringConfigId = payloadLeagueScoringConfigId ?? existingLeagueScoringConfigId ?? null;
  if (nextEventType === 'LEAGUE') {
    const leagueScoringConfigId = normalizedLeagueScoringConfig?.id
      ?? payloadLeagueScoringConfigId
      ?? existingLeagueScoringConfigId
      ?? crypto.randomUUID();
    const leagueScoringData = normalizedLeagueScoringConfig?.data ?? {};
    const now = new Date();
    await client.leagueScoringConfigs.upsert({
      where: { id: leagueScoringConfigId },
      create: {
        id: leagueScoringConfigId,
        ...leagueScoringData,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        ...leagueScoringData,
        updatedAt: now,
      },
    });
    resolvedLeagueScoringConfigId = leagueScoringConfigId;
  }

  const normalizedEventPrice = (() => {
    if (!billingOwnerHasStripeAccount) {
      return 0;
    }
    const parsed = coerceNullableNumber(payload.price);
    if (typeof parsed === 'number') {
      return Math.max(0, Math.round(parsed));
    }
    return 0;
  })();
  const normalizedEventAllowPaymentPlans = billingOwnerHasStripeAccount
    ? (payload.allowPaymentPlans ?? null)
    : false;
  const normalizedEventInstallmentCount = billingOwnerHasStripeAccount
    ? (payload.installmentCount ?? null)
    : 0;
  const normalizedEventInstallmentDueDates = billingOwnerHasStripeAccount
    ? (ensureArray(payload.installmentDueDates).map((value) => coerceDate(value)).filter(Boolean) as Date[])
    : [];
  const normalizedEventInstallmentAmounts = billingOwnerHasStripeAccount
    ? ensureNumberArray(payload.installmentAmounts)
    : [];
  const normalizedDoTeamsRef = coerceNullableBoolean(payload.doTeamsRef);
  const normalizedTeamRefsMaySwap = normalizedDoTeamsRef === true
    ? coerceBoolean(payload.teamRefsMaySwap, false)
    : false;

  const eventData = {
    id,
    name: payload.name ?? 'Untitled Event',
    start,
    end: normalizedEnd,
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
    hostId: normalizedHostId,
    assistantHostIds: normalizedAssistantHostIds,
    noFixedEndDateTime,
    price: normalizedEventPrice,
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
    // Deprecated input: derive field count from linked fields instead of trusting payload.fieldCount.
    fieldCount: fieldIds.length > 0 ? fieldIds.length : null,
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
    leagueScoringConfigId: resolvedLeagueScoringConfigId,
    organizationId: payload.organizationId ?? null,
    parentEvent: normalizedParentEvent,
    autoCancellation: payload.autoCancellation ?? null,
    eventType: payload.eventType ?? null,
    doTeamsRef: normalizedDoTeamsRef ?? null,
    teamRefsMaySwap: normalizedTeamRefsMaySwap,
    refereeIds: normalizedRefereeIds,
    allowPaymentPlans: normalizedEventAllowPaymentPlans,
    installmentCount: normalizedEventInstallmentCount,
    installmentDueDates: normalizedEventInstallmentDueDates,
    installmentAmounts: normalizedEventInstallmentAmounts,
    allowTeamSplitDefault: payload.allowTeamSplitDefault ?? null,
    splitLeaguePlayoffDivisions,
    requiredTemplateIds: ensureStringArray(payload.requiredTemplateIds),
    updatedAt: new Date(),
  };

  const defaultDivisionPrice = (() => {
    if (!billingOwnerHasStripeAccount) {
      return 0;
    }
    return normalizedEventPrice;
  })();
  const defaultDivisionMaxParticipants = (() => {
    const parsed = coerceNullableNumber(payload.maxParticipants);
    if (typeof parsed === 'number') {
      return Math.max(0, Math.trunc(parsed));
    }
    return parsed ?? null;
  })();
  const defaultDivisionPlayoffTeamCount = (() => {
    const parsed = coerceNullableNumber(payload.playoffTeamCount);
    if (typeof parsed === 'number') {
      return Math.max(0, Math.trunc(parsed));
    }
    return parsed ?? null;
  })();
  const defaultDivisionAllowPaymentPlans = (() => {
    if (!billingOwnerHasStripeAccount) {
      return false;
    }
    const parsed = coerceNullableBoolean(payload.allowPaymentPlans);
    if (typeof parsed === 'boolean') {
      return parsed;
    }
    return parsed ?? null;
  })();
  const defaultDivisionInstallmentCount = (() => {
    if (!billingOwnerHasStripeAccount) {
      return 0;
    }
    const parsed = coerceNullableNumber(payload.installmentCount);
    if (typeof parsed === 'number') {
      return Math.max(0, Math.trunc(parsed));
    }
    return parsed ?? null;
  })();
  const defaultDivisionInstallmentDueDates = billingOwnerHasStripeAccount
    ? normalizeInstallmentDateList(payload.installmentDueDates)
    : [];
  const defaultDivisionInstallmentAmounts = billingOwnerHasStripeAccount
    ? normalizeInstallmentAmountList(payload.installmentAmounts)
    : [];

  await upsertEventWithUnknownArgFallback(client, id, eventData as Record<string, unknown>);

  await syncEventDivisions({
    eventId: id,
    divisionIds: normalizedEventDivisionIds,
    fieldIds,
    singleDivision: singleDivisionEnabled,
    sportId: payload.sportId ?? null,
    referenceDate: start,
    organizationId: payload.organizationId ?? null,
    divisionFieldMap,
    divisionDetails: normalizedDivisionDetails,
    playoffDivisionDetails: normalizedPlayoffDivisionDetails,
    defaultPrice: defaultDivisionPrice,
    defaultMaxParticipants: defaultDivisionMaxParticipants,
    defaultPlayoffTeamCount: defaultDivisionPlayoffTeamCount,
    defaultAllowPaymentPlans: defaultDivisionAllowPaymentPlans,
    defaultInstallmentCount: defaultDivisionInstallmentCount,
    defaultInstallmentDueDates: defaultDivisionInstallmentDueDates,
    defaultInstallmentAmounts: defaultDivisionInstallmentAmounts,
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
    const hasRentalSlotIdsInput = Array.isArray(field.rentalSlotIds);
    const normalizedRentalSlotIds = hasRentalSlotIdsInput
      ? ensureArray(field.rentalSlotIds).map((value) => String(value)).filter(Boolean)
      : null;
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
        rentalSlotIds: normalizedRentalSlotIds ?? [],
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
        ...(normalizedRentalSlotIds !== null ? { rentalSlotIds: normalizedRentalSlotIds } : {}),
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
    await client.teams.upsert({
      where: { id: teamId },
      create: {
        id: teamId,
        playerIds: ensureArray(team.playerIds),
        division: normalizedTeamDivision,
        divisionTypeId: normalizedTeamDivisionTypeId,
        divisionTypeName: normalizedTeamDivisionTypeName,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        managerId: team.managerId ?? team.captainId ?? '',
        headCoachId: team.headCoachId ?? null,
        coachIds: ensureArray((team as any).assistantCoachIds ?? team.coachIds),
        parentTeamId: team.parentTeamId ?? null,
        pending: ensureArray(team.pending),
        teamSize: team.teamSize ?? 0,
        profileImageId: team.profileImageId ?? null,
        sport: team.sport ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        playerIds: ensureArray(team.playerIds),
        division: normalizedTeamDivision,
        divisionTypeId: normalizedTeamDivisionTypeId,
        divisionTypeName: normalizedTeamDivisionTypeName,
        name: team.name ?? null,
        captainId: team.captainId ?? '',
        managerId: team.managerId ?? team.captainId ?? '',
        headCoachId: team.headCoachId ?? null,
        coachIds: ensureArray((team as any).assistantCoachIds ?? team.coachIds),
        parentTeamId: team.parentTeamId ?? null,
        pending: ensureArray(team.pending),
        teamSize: team.teamSize ?? 0,
        profileImageId: team.profileImageId ?? null,
        sport: team.sport ?? null,
        updatedAt: new Date(),
      },
    });
  }

  for (const slot of canonicalTimeSlots) {
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
        dayOfWeek: slot.dayOfWeek ?? null,
        daysOfWeek: slot.daysOfWeek,
        startTimeMinutes: slot.startTimeMinutes ?? null,
        endTimeMinutes: slot.endTimeMinutes ?? null,
        startDate,
        repeating: Boolean(slot.repeating),
        endDate,
        scheduledFieldId: slot.scheduledFieldId ?? null,
        scheduledFieldIds: slot.scheduledFieldIds,
        price: slot.price ?? null,
        createdAt: now,
        updatedAt: now,
      } as any,
      update: {
        dayOfWeek: slot.dayOfWeek ?? null,
        daysOfWeek: slot.daysOfWeek,
        startTimeMinutes: slot.startTimeMinutes ?? null,
        endTimeMinutes: slot.endTimeMinutes ?? null,
        startDate,
        repeating: Boolean(slot.repeating),
        endDate,
        scheduledFieldId: slot.scheduledFieldId ?? null,
        scheduledFieldIds: slot.scheduledFieldIds,
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

