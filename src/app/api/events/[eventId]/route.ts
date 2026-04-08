import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { buildRefundCreateParamsForPaymentIntent } from '@/lib/stripeConnectAccounts';
import { sanitizeOrganizationEventAssignments } from '@/lib/organizationEventAccess';
import {
  deleteMatchesByEvent,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  syncEventDivisions,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';
import { canManageEvent } from '@/server/accessControl';
import {
  buildEventDivisionId,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
} from '@/lib/divisionTypes';
import { canonicalizeTimeSlots, normalizeTimeSlotFieldIds } from '@/server/timeSlotCanonical';
import {
  buildEventOfficialPositionsFromTemplates,
  deriveEventOfficialsFromLegacyOfficialIds,
  normalizeEventOfficials,
  normalizeEventOfficialPositions,
  normalizeOfficialSchedulingMode,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';

export const dynamic = 'force-dynamic';
const UNKNOWN_PRISMA_ARGUMENT_PATTERN = /Unknown argument `([^`]+)`/i;
const warnedMissingEventArguments = new Set<string>();
const RESTRICTED_EVENT_STATES = new Set(['TEMPLATE', 'UNPUBLISHED', 'PRIVATE', 'DRAFT']);

const EVENT_UPDATE_FIELDS = new Set([
  'name',
  'start',
  'end',
  'description',
  'divisions',
  'winnerSetCount',
  'loserSetCount',
  'doubleElimination',
  'location',
  'address',
  'rating',
  'teamSizeLimit',
  'maxParticipants',
  'minAge',
  'maxAge',
  'hostId',
  'assistantHostIds',
  'noFixedEndDateTime',
  'price',
  'singleDivision',
  'registrationByDivisionType',
  'waitListIds',
  'freeAgentIds',
  'cancellationRefundHours',
  'teamSignup',
  'prize',
  'registrationCutoffHours',
  'seedColor',
  'imageId',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'coordinates',
  'gamesPerOpponent',
  'includePlayoffs',
  'playoffTeamCount',
  'usesSets',
  'matchDurationMinutes',
  'setDurationMinutes',
  'setsPerMatch',
  'restTimeMinutes',
  'state',
  'pointsToVictory',
  'sportId',
  'timeSlotIds',
  'fieldIds',
  'teamIds',
  'userIds',
  'leagueScoringConfigId',
  'organizationId',
  'parentEvent',
  'autoCancellation',
  'eventType',
  'officialSchedulingMode',
  'doTeamsOfficiate',
  'teamOfficialsMaySwap',
  'officialIds',
  'officialPositions',
  'allowPaymentPlans',
  'installmentCount',
  'installmentDueDates',
  'installmentAmounts',
  'allowTeamSplitDefault',
  'splitLeaguePlayoffDivisions',
  'requiredTemplateIds',
]);

const LEAGUE_SCORING_BOOLEAN_FIELDS: readonly string[] = [];

const LEAGUE_SCORING_NUMBER_FIELDS = [
  'pointsForWin',
  'pointsForDraw',
  'pointsForLoss',
  'pointsPerGoalScored',
  'pointsPerGoalConceded',
] as const;

const EVENT_PATCH_ALLOWED_FIELDS = new Set<string>([
  ...EVENT_UPDATE_FIELDS,
  'fields',
  'timeSlots',
  'divisionFieldIds',
  'divisionDetails',
  'playoffDivisionDetails',
  'leagueScoringConfig',
  'eventOfficials',
  'fieldCount',
  'status',
  'leagueConfig',
  'refType',
]);
const EVENT_PATCH_HARD_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);
const EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS = new Set<string>([
  'organizationId',
  'parentEvent',
]);

const extractUnknownPrismaArgument = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(UNKNOWN_PRISMA_ARGUMENT_PATTERN);
  return match?.[1] ?? null;
};

const updateEventWithUnknownArgFallback = async (
  tx: any,
  eventId: string,
  updateData: Record<string, unknown>,
): Promise<{ event: any; removedArguments: Set<string> }> => {
  const removedArguments = new Set<string>();

  while (true) {
    const payload: Record<string, unknown> = { ...updateData };
    for (const argumentName of removedArguments) {
      delete payload[argumentName];
    }

    try {
      const event = await tx.events.update({
        where: { id: eventId },
        data: payload,
      });
      return { event, removedArguments };
    } catch (error) {
      const unknownArgument = extractUnknownPrismaArgument(error);
      const hasArgument = unknownArgument
        ? Object.prototype.hasOwnProperty.call(payload, unknownArgument)
        : false;
      if (!unknownArgument || !hasArgument || removedArguments.has(unknownArgument)) {
        throw error;
      }
      removedArguments.add(unknownArgument);
      if (!warnedMissingEventArguments.has(unknownArgument)) {
        warnedMissingEventArguments.add(unknownArgument);
        console.warn(
          `[events] Prisma client is missing Events.${unknownArgument}; retrying without it. Regenerate Prisma client to restore this field.`,
        );
      }
    }
  }
};

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray(legacy.waitListIds)) {
    (legacy as any).waitListIds = [];
  }
  if (!Array.isArray(legacy.freeAgentIds)) {
    (legacy as any).freeAgentIds = [];
  }
  if (!Array.isArray(legacy.officialIds)) {
    (legacy as any).officialIds = [];
  }
  if (!Array.isArray((legacy as any).officialPositions)) {
    (legacy as any).officialPositions = [];
  }
  if (!Array.isArray((legacy as any).eventOfficials)) {
    (legacy as any).eventOfficials = [];
  }
  if (typeof (legacy as any).officialSchedulingMode !== 'string') {
    (legacy as any).officialSchedulingMode = 'SCHEDULE';
  }
  if (!Array.isArray((legacy as any).assistantHostIds)) {
    (legacy as any).assistantHostIds = [];
  }
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
  }
  if (typeof (legacy as any).noFixedEndDateTime !== 'boolean') {
    const start = parseDateInput((legacy as any).start);
    const end = parseDateInput((legacy as any).end);
    (legacy as any).noFixedEndDateTime = Boolean(
      start
      && (!end || start.getTime() === end.getTime()),
    );
  }
  if ((legacy as any).doTeamsOfficiate !== true) {
    (legacy as any).teamOfficialsMaySwap = false;
  } else if (typeof (legacy as any).teamOfficialsMaySwap !== 'boolean') {
    (legacy as any).teamOfficialsMaySwap = false;
  }
  return legacy;
};

const buildEventOfficialResponse = async (event: any) => {
  const [eventOfficialRows, sportRow] = await Promise.all([
    typeof (prisma as any).eventOfficials?.findMany === 'function'
      ? (prisma as any).eventOfficials.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    event.sportId && typeof (prisma as any).sports?.findUnique === 'function'
      ? (prisma as any).sports.findUnique({
          where: { id: event.sportId },
          select: { officialPositionTemplates: true } as any,
        })
      : Promise.resolve(null),
  ]);
  const templatePositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
  );
  const officialPositions = (() => {
    const explicit = normalizeEventOfficialPositions((event as any).officialPositions, event.id);
    if (explicit.length) {
      return explicit;
    }
    return templatePositions;
  })();
  const eventOfficials = eventOfficialRows.length
    ? (eventOfficialRows as any[])
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          positionIds: normalizeFieldIds(row.positionIds).filter((positionId: string) => (
            officialPositions.some((position) => position.id === positionId)
          )),
          fieldIds: normalizeFieldIds(row.fieldIds).filter((fieldId: string) => (
            normalizeFieldIds(event.fieldIds).includes(fieldId)
          )),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.positionIds.length > 0)
    : deriveEventOfficialsFromLegacyOfficialIds({
        eventId: event.id,
        officialIds: Array.isArray(event.officialIds) ? event.officialIds : [],
        positionIds: officialPositions.map((position) => position.id),
      });
  return {
    officialSchedulingMode: normalizeOfficialSchedulingMode((event as any).officialSchedulingMode),
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official: { userId: string }) => official.userId),
  };
};

const isSchedulableEventType = (value: unknown): boolean => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'LEAGUE' || normalized === 'TOURNAMENT';
};

const buildContext = (): SchedulerContext => {
  const debug = process.env.SCHEDULER_DEBUG === 'true';
  return {
    log: (message) => {
      if (debug) console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  };
};

const ORDER_SENSITIVE_ARRAYS = new Set([
  'pointsToVictory',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
]);

const normalizeStringArray = (value: unknown, key?: string): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const mapped = value.map((item) => String(item)).filter(Boolean);
  if (key && ORDER_SENSITIVE_ARRAYS.has(key)) {
    return mapped;
  }
  return mapped.sort();
};

const arraysEqual = (left: string[] | null, right: string[] | null): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const DEFAULT_DIVISION_KEY = 'open';

const normalizeDivisionKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeDivisionKind = (value: unknown, fallback: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE'): 'LEAGUE' | 'PLAYOFF' => {
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
  const rows = Object.entries(value as Record<string, unknown>)
    .map(([teamId, points]) => {
      const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
      const normalizedPoints = typeof points === 'number' ? points : Number(points);
      if (!normalizedTeamId || !Number.isFinite(normalizedPoints)) {
        return null;
      }
      return [normalizedTeamId, normalizedPoints] as const;
    })
    .filter((row): row is readonly [string, number] => row !== null);
  if (!rows.length) {
    return null;
  }
  return Object.fromEntries(rows);
};

type PlayoffDivisionConfig = {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
};

const PLAYOFF_CONFIG_KEYS: ReadonlyArray<keyof PlayoffDivisionConfig> = [
  'doubleElimination',
  'winnerSetCount',
  'loserSetCount',
  'winnerBracketPointsToVictory',
  'loserBracketPointsToVictory',
  'prize',
  'fieldCount',
  'restTimeMinutes',
];

const normalizePlayoffDivisionConfig = (value: unknown): PlayoffDivisionConfig | null => {
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

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const keys = value
    .map((entry) => normalizeDivisionKey(entry))
    .filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(keys));
};

const normalizeDivisionIds = (value: unknown, eventId: string): string[] => {
  const keys = normalizeDivisionKeys(value);
  return keys.map((entry) => (
    entry.includes('__division__') || entry.startsWith('division_')
      ? entry
      : buildEventDivisionId(eventId, entry)
  ));
};

const normalizePlacementDivisionIds = (value: unknown, eventId: string): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const normalized = normalizeDivisionKey(entry);
    if (!normalized) {
      return '';
    }
    return normalized.includes('__division__') || normalized.startsWith('division_')
      ? normalized
      : buildEventDivisionId(eventId, normalized);
  });
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry)).filter(Boolean)));
};

const normalizeTeamIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeFieldNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value;
};

const normalizeOptionalBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
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
  return null;
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
    .map((entry) => parseDateInput(entry))
    .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
    .map((entry) => entry.toISOString());
};

const normalizeInputNullableNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeInputOptionalBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed = normalizeOptionalBoolean(value);
  return parsed;
};

const normalizeLeagueScoringConfigUpdate = (
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
    const rawValue = row[key];
    const normalized = normalizeNullableNumber(rawValue);
    if (normalized !== null || rawValue === null || rawValue === '') {
      data[key] = normalized;
    }
  }

  for (const key of LEAGUE_SCORING_BOOLEAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const rawValue = row[key];
    const normalized = normalizeOptionalBoolean(rawValue);
    if (normalized !== null || rawValue === null) {
      data[key] = normalized;
    }
  }

  return { id: configuredId, data };
};

const coerceDivisionFieldMap = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [rawKey, rawFieldIds] of Object.entries(value as Record<string, unknown>)) {
    const key = normalizeDivisionKey(rawKey);
    if (!key) continue;
    result[key] = normalizeFieldIds(rawFieldIds);
  }
  return result;
};

const normalizeDivisionDetailsInput = (
  value: unknown,
  eventId: string,
  sportId?: string | null,
  eventStart?: Date | null,
  defaultKind: 'LEAGUE' | 'PLAYOFF' = 'LEAGUE',
): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const details: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const rawIdentifier = normalizeDivisionKey(row.id)
      ?? normalizeDivisionKey(row.key)
      ?? normalizeDivisionKey(row.name)
      ?? 'c_skill_open';
    const inferred = inferDivisionDetails({
      identifier: rawIdentifier,
      sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
      fallbackName: typeof row.name === 'string' ? row.name : undefined,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId: inferred.divisionTypeId,
      sportInput: typeof row.sportId === 'string' ? row.sportId : sportId ?? undefined,
      referenceDate: eventStart ?? null,
    });
    const parsedPrice = normalizeInputNullableNumber(row.price);
    const parsedMaxParticipants = normalizeInputNullableNumber(row.maxParticipants);
    const parsedPlayoffTeamCount = normalizeInputNullableNumber(row.playoffTeamCount);
    const parsedKind = normalizeDivisionKind(row.kind, defaultKind);
    const hasPlacementDivisionIdsInput = Object.prototype.hasOwnProperty.call(row, 'playoffPlacementDivisionIds');
    const parsedPlacementDivisionIds = hasPlacementDivisionIdsInput
      ? normalizePlacementDivisionIds(row.playoffPlacementDivisionIds, eventId)
      : undefined;
    const parsedStandingsOverrides = normalizeStandingsOverrides(row.standingsOverrides);
    const parsedStandingsConfirmedAt = (() => {
      const parsed = parseDateInput(row.standingsConfirmedAt);
      return parsed ? parsed.toISOString() : null;
    })();
    const parsedStandingsConfirmedBy = typeof row.standingsConfirmedBy === 'string'
      ? row.standingsConfirmedBy.trim() || null
      : null;
    const parsedPlayoffConfig = parsedKind === 'PLAYOFF'
      ? (
          normalizePlayoffDivisionConfig(row.playoffConfig)
          ?? normalizePlayoffDivisionConfig(row)
        )
      : null;
    const parsedAllowPaymentPlans = normalizeInputOptionalBoolean(row.allowPaymentPlans);
    const parsedInstallmentCount = normalizeInputNullableNumber(row.installmentCount);
    const parsedInstallmentDueDates = Object.prototype.hasOwnProperty.call(row, 'installmentDueDates')
      ? normalizeInstallmentDateList(row.installmentDueDates)
      : undefined;
    const parsedInstallmentAmounts = Object.prototype.hasOwnProperty.call(row, 'installmentAmounts')
      ? normalizeInstallmentAmountList(row.installmentAmounts)
      : undefined;
    const hasTeamIdsInput = Object.prototype.hasOwnProperty.call(row, 'teamIds');
    const id = normalizeDivisionKey(row.id)
      ?? buildEventDivisionId(eventId, inferred.token);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    details.push({
      id,
      key: normalizeDivisionKey(row.key) ?? inferred.token,
      name: typeof row.name === 'string' && row.name.trim().length
        ? row.name.trim()
        : inferred.defaultName,
      kind: parsedKind,
      divisionTypeId: normalizeDivisionKey(row.divisionTypeId) ?? inferred.divisionTypeId,
      divisionTypeName:
        typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length
          ? row.divisionTypeName.trim()
          : inferred.divisionTypeName,
      ratingType: inferred.ratingType,
      gender: inferred.gender,
      sportId: typeof row.sportId === 'string' ? row.sportId : sportId ?? null,
      price: typeof parsedPrice === 'number'
        ? Math.max(0, Math.round(parsedPrice))
        : parsedPrice,
      maxParticipants: typeof parsedMaxParticipants === 'number'
        ? Math.max(0, Math.trunc(parsedMaxParticipants))
        : parsedMaxParticipants,
      playoffTeamCount: typeof parsedPlayoffTeamCount === 'number'
        ? Math.max(0, Math.trunc(parsedPlayoffTeamCount))
        : parsedPlayoffTeamCount,
      ...(parsedKind === 'PLAYOFF'
        ? { playoffPlacementDivisionIds: [] }
        : parsedPlacementDivisionIds !== undefined
          ? { playoffPlacementDivisionIds: parsedPlacementDivisionIds }
          : {}),
      standingsOverrides: parsedKind === 'PLAYOFF' ? null : parsedStandingsOverrides,
      standingsConfirmedAt: parsedKind === 'PLAYOFF' ? null : parsedStandingsConfirmedAt,
      standingsConfirmedBy: parsedKind === 'PLAYOFF' ? null : parsedStandingsConfirmedBy,
      playoffConfig: parsedKind === 'PLAYOFF' ? parsedPlayoffConfig : null,
      allowPaymentPlans: parsedAllowPaymentPlans,
      installmentCount: (() => {
        if (typeof parsedInstallmentCount === 'number') {
          return Math.max(0, Math.trunc(parsedInstallmentCount));
        }
        return parsedInstallmentCount;
      })(),
      installmentDueDates: parsedInstallmentDueDates,
      installmentAmounts: parsedInstallmentAmounts,
      ageCutoffDate: ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null,
      ageCutoffLabel: ageEligibility.message ?? null,
      ageCutoffSource: ageEligibility.applies ? ageEligibility.cutoffRule.source : null,
      fieldIds: normalizeFieldIds(row.fieldIds),
      ...(parsedKind === 'PLAYOFF'
        ? { teamIds: [] }
        : hasTeamIdsInput
          ? { teamIds: normalizeTeamIds(row.teamIds) }
          : {}),
    });
  }
  return details;
};

const validateUniqueDivisionTeamAssignments = (
  divisionDetails: Array<Record<string, unknown>>,
  singleDivision: boolean,
) => {
  if (singleDivision) {
    return;
  }
  const assignmentMap = new Map<string, string>();
  for (const detail of divisionDetails) {
    const kind = normalizeDivisionKind(detail.kind, 'LEAGUE');
    if (kind === 'PLAYOFF') {
      continue;
    }
    const divisionId = normalizeDivisionKey(detail.id)
      ?? normalizeDivisionKey(detail.key)
      ?? '';
    if (!divisionId) {
      continue;
    }
    const teamIds = normalizeTeamIds(detail.teamIds);
    for (const teamId of teamIds) {
      const assignedDivisionId = assignmentMap.get(teamId);
      if (assignedDivisionId && assignedDivisionId !== divisionId) {
        throw new Response(
          `Team ${teamId} is assigned to multiple divisions. Each team can only belong to one division.`,
          { status: 400 },
        );
      }
      assignmentMap.set(teamId, divisionId);
    }
  }
};

const buildDivisionFieldMap = (
  divisionKeys: string[],
  fieldIds: string[],
  ...maps: Array<Record<string, string[]>>
): Record<string, string[]> => {
  const normalizedDivisionKeys = divisionKeys.length ? divisionKeys : [DEFAULT_DIVISION_KEY];
  const allowedFieldIds = new Set(fieldIds);
  const merged = new Map<string, Set<string>>();
  const aliasToCanonical = new Map<string, string>();

  for (const divisionKey of normalizedDivisionKeys) {
    merged.set(divisionKey, new Set<string>());
    const aliases = new Set<string>([
      divisionKey,
      extractDivisionTokenFromId(divisionKey) ?? '',
    ]);
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeDivisionKey(alias);
      if (!normalizedAlias) return;
      aliasToCanonical.set(normalizedAlias, divisionKey);
    });
  }

  for (const map of maps) {
    for (const [key, ids] of Object.entries(map)) {
      const aliases = new Set<string>([
        key,
        extractDivisionTokenFromId(key) ?? '',
      ]);
      aliases.forEach((alias) => {
        const normalizedAlias = normalizeDivisionKey(alias);
        if (!normalizedAlias) return;
        const canonicalKey = aliasToCanonical.get(normalizedAlias) ?? normalizedAlias;
        const bucket = merged.get(canonicalKey) ?? new Set<string>();
        for (const id of ids) {
          if (!allowedFieldIds.size || allowedFieldIds.has(id)) {
            bucket.add(id);
          }
        }
        merged.set(canonicalKey, bucket);
      });
    }
  }

  const result: Record<string, string[]> = {};
  for (const divisionKey of normalizedDivisionKeys) {
    const ids = Array.from(merged.get(divisionKey) ?? []);
    result[divisionKey] = ids.length ? ids : [];
  }

  return result;
};

const mapDivisionRowsToFieldMap = (
  rows: Array<{ id: string; key: string | null; fieldIds: string[] | null }>,
  divisionKeys: string[],
): Record<string, string[]> => {
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  const result: Record<string, string[]> = {};
  for (const divisionKey of divisionKeys) {
    const row = rowsById.get(divisionKey)
      ?? rowsByKey.get(divisionKey)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionKey) ?? '');
    result[divisionKey] = normalizeFieldIds(row?.fieldIds ?? []);
  }
  return result;
};

const divisionFieldMapsEqual = (
  left: Record<string, string[]>,
  right: Record<string, string[]>,
): boolean => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  for (const key of keys) {
    const leftValues = normalizeFieldIds(left[key]).sort();
    const rightValues = normalizeFieldIds(right[key]).sort();
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    for (let index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) {
        return false;
      }
    }
  }
  return true;
};

const getDivisionFieldMapForEvent = async (
  eventId: string,
  divisionKeys: string[],
): Promise<Record<string, string[]>> => {
  if (!divisionKeys.length) {
    return {};
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      fieldIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return mapDivisionRowsToFieldMap(rows, normalizedKeys);
};

const getDivisionDetailsForEvent = async (
  eventId: string,
  divisionKeys: string[],
  eventStart?: Date | null,
  eventDefaults?: {
    price?: number | null;
    maxParticipants?: number | null;
    playoffTeamCount?: number | null;
    allowPaymentPlans?: boolean | null;
    installmentCount?: number | null;
    installmentDueDates?: unknown;
    installmentAmounts?: unknown;
  },
): Promise<Array<Record<string, unknown>>> => {
  if (!divisionKeys.length) {
    return [];
  }
  const normalizedKeys = normalizeDivisionKeys(divisionKeys);
  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId,
      OR: [
        { id: { in: normalizedKeys } },
        { key: { in: normalizedKeys } },
      ],
    },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      playoffPlacementDivisionIds: true,
      standingsOverrides: true,
      standingsConfirmedAt: true,
      standingsConfirmedBy: true,
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
      teamIds: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const rowsById = new Map<string, (typeof rows)[number]>();
  const rowsByKey = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const rowId = normalizeDivisionKey(row.id);
    if (rowId) {
      rowsById.set(rowId, row);
      const token = extractDivisionTokenFromId(rowId);
      if (token) {
        rowsByKey.set(token, row);
      }
    }
    const rowKey = normalizeDivisionKey(row.key);
    if (rowKey) {
      rowsByKey.set(rowKey, row);
    }
  });

  return normalizedKeys.map((divisionId) => {
    const row = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? null;
    const inferred = inferDivisionDetails({
      identifier: row?.key ?? row?.id ?? divisionId,
      sportInput: row?.sportId ?? undefined,
      fallbackName: row?.name ?? undefined,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId: inferred.divisionTypeId,
      sportInput: row?.sportId ?? undefined,
      referenceDate: eventStart ?? null,
    });
    const ageCutoffDate = (() => {
      if (row?.ageCutoffDate instanceof Date && !Number.isNaN(row.ageCutoffDate.getTime())) {
        return row.ageCutoffDate.toISOString();
      }
      return ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null;
    })();
    const kind = normalizeDivisionKind((row as any)?.kind, 'LEAGUE');
    const standingsConfirmedAt = (() => {
      const parsed = parseDateInput((row as any)?.standingsConfirmedAt);
      return parsed ? parsed.toISOString() : null;
    })();
    const standingsConfirmedBy = typeof (row as any)?.standingsConfirmedBy === 'string'
      ? (row as any).standingsConfirmedBy.trim() || null
      : null;
    const standingsOverrides = normalizeStandingsOverrides((row as any)?.standingsOverrides);
    const playoffConfig = kind === 'PLAYOFF'
      ? (
          normalizePlayoffDivisionConfig((row as any)?.standingsOverrides)
          ?? normalizePlayoffDivisionConfig(row)
        )
      : null;
    return {
      id: row?.id ?? divisionId,
      key: row?.key ?? inferred.token,
      name: row?.name ?? inferred.defaultName,
      kind,
      divisionTypeId: row?.divisionTypeId ?? inferred.divisionTypeId,
      divisionTypeName: row?.divisionTypeName ?? inferred.divisionTypeName,
      ratingType: row?.ratingType ?? inferred.ratingType,
      gender: row?.gender ?? inferred.gender,
      sportId: row?.sportId ?? null,
      price: typeof row?.price === 'number'
        ? row.price
        : (typeof eventDefaults?.price === 'number' ? eventDefaults.price : null),
      maxParticipants: typeof row?.maxParticipants === 'number'
        ? row.maxParticipants
        : (typeof eventDefaults?.maxParticipants === 'number' ? eventDefaults.maxParticipants : null),
      playoffTeamCount: typeof row?.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : (typeof eventDefaults?.playoffTeamCount === 'number' ? eventDefaults.playoffTeamCount : null),
      playoffPlacementDivisionIds: kind === 'PLAYOFF' ? [] : normalizePlacementDivisionIds((row as any)?.playoffPlacementDivisionIds, eventId),
      standingsOverrides: kind === 'PLAYOFF' ? null : standingsOverrides,
      standingsConfirmedAt: kind === 'PLAYOFF' ? null : standingsConfirmedAt,
      standingsConfirmedBy: kind === 'PLAYOFF' ? null : standingsConfirmedBy,
      playoffConfig: kind === 'PLAYOFF' ? playoffConfig : null,
      allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
        ? row.allowPaymentPlans
        : (typeof eventDefaults?.allowPaymentPlans === 'boolean' ? eventDefaults.allowPaymentPlans : null),
      installmentCount: typeof row?.installmentCount === 'number'
        ? row.installmentCount
        : (typeof eventDefaults?.installmentCount === 'number' ? eventDefaults.installmentCount : null),
      installmentDueDates: Array.isArray(row?.installmentDueDates)
        ? row.installmentDueDates
          .map((entry) => parseDateInput(entry))
          .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
          .map((entry) => entry.toISOString())
        : normalizeInstallmentDateList(eventDefaults?.installmentDueDates),
      installmentAmounts: Array.isArray(row?.installmentAmounts)
        ? normalizeInstallmentAmountList(row.installmentAmounts)
        : normalizeInstallmentAmountList(eventDefaults?.installmentAmounts),
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
      teamIds: kind === 'PLAYOFF' ? [] : normalizeTeamIds((row as any)?.teamIds),
    };
  });
};

const getDivisionKeysForEventKind = async (
  eventId: string,
  kind: 'LEAGUE' | 'PLAYOFF',
): Promise<string[]> => {
  const rows = await prisma.divisions.findMany({
    where: {
      eventId,
      kind,
    },
    select: {
      id: true,
    },
  });
  return rows
    .map((row) => normalizeDivisionKey(row.id))
    .filter((value): value is string => Boolean(value));
};

const isMissingTimeSlotDivisionsColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('timeslots')
    && normalized.includes('divisions')
    && normalized.includes('does not exist');
};

const persistTimeSlotDivisions = async (
  client: any,
  slotId: string,
  divisions: string[],
  updatedAt: Date,
): Promise<void> => {
  if (typeof client?.$executeRaw !== 'function') {
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

const hasScheduleImpact = (existing: any, payload: Record<string, any>): boolean => {
  const scheduleFields = [
    'eventType',
    'start',
    'end',
    'noFixedEndDateTime',
    'divisions',
    'fieldIds',
    'timeSlotIds',
    'gamesPerOpponent',
    'includePlayoffs',
    'playoffTeamCount',
    'usesSets',
    'matchDurationMinutes',
    'setDurationMinutes',
    'setsPerMatch',
    'restTimeMinutes',
    'pointsToVictory',
    'winnerSetCount',
    'loserSetCount',
    'doubleElimination',
    'winnerBracketPointsToVictory',
    'loserBracketPointsToVictory',
    'teamIds',
    'userIds',
    'maxParticipants',
    'teamSizeLimit',
    'singleDivision',
  ];

  return scheduleFields.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      return false;
    }

    const nextValue = payload[key];
    const prevValue = (existing as Record<string, any>)[key];

    if (key === 'start' || key === 'end') {
      const nextTime = nextValue instanceof Date ? nextValue.getTime() : parseDateInput(nextValue)?.getTime();
      const prevTime = prevValue instanceof Date ? prevValue.getTime() : parseDateInput(prevValue)?.getTime();
      return nextTime !== prevTime;
    }

    if (Array.isArray(nextValue) || Array.isArray(prevValue)) {
      return !arraysEqual(normalizeStringArray(nextValue, key), normalizeStringArray(prevValue, key));
    }

    if (key === 'eventType') {
      const nextType = typeof nextValue === 'string' ? nextValue.toUpperCase() : nextValue;
      const prevType = typeof prevValue === 'string' ? prevValue.toUpperCase() : prevValue;
      return nextType !== prevType;
    }

    return nextValue !== prevValue;
  });
};

const isDivisionAssignmentValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('assigned to more than one division')
    || normalized.includes('assigned to multiple divisions');
};

const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeEntityIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeEntityId(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

const isPlaceholderTeamName = (value: unknown): boolean => (
  typeof value === 'string' && value.trim().toLowerCase().startsWith('place holder')
);

const normalizeStripeSecretKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'undefined' || normalizedLower === 'null') {
    return null;
  }
  return normalized;
};

const removeEntityIdFromList = (values: unknown, targetId: string): string[] => {
  const normalizedTargetId = normalizeEntityId(targetId);
  if (!normalizedTargetId) {
    return normalizeEntityIdList(values);
  }
  return normalizeEntityIdList(values).filter((value) => value !== normalizedTargetId);
};

const isAlreadyRefundedStripeError = (error: unknown): boolean => {
  const normalizedCode = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  if (normalizedCode === 'charge_already_refunded') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('already refunded');
};

const isCancellablePaymentIntentStatus = (status: unknown): boolean => {
  if (typeof status !== 'string') {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === 'requires_payment_method'
    || normalized === 'requires_confirmation'
    || normalized === 'requires_action'
    || normalized === 'requires_capture'
    || normalized === 'processing';
};

const collectEventBillIds = async (
  eventId: string,
  client: any = prisma,
): Promise<string[]> => {
  const rootRows = await client.bills.findMany({
    where: { eventId },
    select: { id: true },
  });
  const collected = new Set<string>(normalizeEntityIdList(rootRows.map((row: { id: string }) => row.id)));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const childRows = await client.bills.findMany({
      where: { parentBillId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    childRows.forEach((row: { id: string }) => {
      const normalizedId = normalizeEntityId(row.id);
      if (!normalizedId || collected.has(normalizedId)) {
        return;
      }
      collected.add(normalizedId);
      nextFrontier.push(normalizedId);
    });
    frontier = nextFrontier;
  }

  return Array.from(collected);
};

const settleEventBillingBeforeDelete = async (params: {
  eventId: string;
  billIds: string[];
  client?: any;
}): Promise<{ refundedPaymentIntentIds: string[]; cancelledPaymentIntentIds: string[] }> => {
  if (!params.billIds.length) {
    return {
      refundedPaymentIntentIds: [],
      cancelledPaymentIntentIds: [],
    };
  }

  const client = params.client ?? prisma;
  const paymentRows = await client.billPayments.findMany({
    where: {
      billId: { in: params.billIds },
      paymentIntentId: { not: null },
    },
    select: {
      id: true,
      paymentIntentId: true,
      status: true,
    },
  });

  const byIntentId = new Map<string, { hasPaid: boolean; hasPending: boolean }>();
  paymentRows.forEach((row: { paymentIntentId: string | null; status: string | null }) => {
    const intentId = normalizeEntityId(row.paymentIntentId);
    if (!intentId) {
      return;
    }
    const existing = byIntentId.get(intentId) ?? { hasPaid: false, hasPending: false };
    const normalizedStatus = typeof row.status === 'string' ? row.status.toUpperCase() : '';
    if (normalizedStatus === 'PAID') {
      existing.hasPaid = true;
    } else if (normalizedStatus === '' || normalizedStatus === 'PENDING') {
      existing.hasPending = true;
    }
    byIntentId.set(intentId, existing);
  });

  const paidIntentIds = Array.from(byIntentId.entries())
    .filter(([, state]) => state.hasPaid)
    .map(([intentId]) => intentId);
  const stripeSecretKey = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  if (paidIntentIds.length > 0 && !stripe) {
    throw new Error('Cannot refund paid bills because Stripe is not configured.');
  }

  const refundedPaymentIntentIds: string[] = [];
  const cancelledPaymentIntentIds: string[] = [];

  for (const [intentId, state] of byIntentId.entries()) {
    if (state.hasPaid) {
      try {
        await stripe!.refunds.create(await buildRefundCreateParamsForPaymentIntent({
          stripe: stripe!,
          paymentIntentId: intentId,
          reason: 'requested_by_customer',
          metadata: {
            event_id: params.eventId,
            source: 'event_delete',
          },
        }));
        refundedPaymentIntentIds.push(intentId);
      } catch (error) {
        if (isAlreadyRefundedStripeError(error)) {
          refundedPaymentIntentIds.push(intentId);
          continue;
        }
        throw error;
      }
      continue;
    }

    if (!state.hasPending || !stripe) {
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (!isCancellablePaymentIntentStatus(intent.status)) {
        continue;
      }
      await stripe.paymentIntents.cancel(intentId);
      cancelledPaymentIntentIds.push(intentId);
    } catch (error) {
      console.warn(`Failed to cancel pending PaymentIntent ${intentId} before event delete.`, error);
    }
  }

  return {
    refundedPaymentIntentIds,
    cancelledPaymentIntentIds,
  };
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (RESTRICTED_EVENT_STATES.has(String(event.state ?? '').toUpperCase())) {
    const session = await requireSession(_req);
    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const divisionKeys = normalizeDivisionKeys(event.divisions);
  const playoffDivisionKeys = await getDivisionKeysForEventKind(eventId, 'PLAYOFF');
  const [divisionFieldIds, divisionDetails, playoffDivisionDetails, staffInvites] = await Promise.all([
    getDivisionFieldMapForEvent(eventId, divisionKeys),
    getDivisionDetailsForEvent(eventId, divisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentAmounts: event.installmentAmounts,
    }),
    getDivisionDetailsForEvent(eventId, playoffDivisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentAmounts: event.installmentAmounts,
    }),
    prisma.invites.findMany({
      where: { eventId, type: 'STAFF' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const officialResponse = await buildEventOfficialResponse(event);
  return NextResponse.json(
    withLegacyEvent({
      ...event,
      ...officialResponse,
      divisionFieldIds,
      divisionDetails,
      playoffDivisionDetails,
      staffInvites: staffInvites.map((invite) => withLegacyFields(invite)),
    }),
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'event',
    allowedTopLevelKeys: ['reschedule'],
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }
  const rescheduleValue = parsed.topLevel.reschedule;
  if (rescheduleValue !== undefined && typeof rescheduleValue !== 'boolean') {
    return NextResponse.json({ error: 'Invalid input: "reschedule" must be a boolean.' }, { status: 400 });
  }
  const rescheduleRequested = rescheduleValue === true;

  const { eventId } = await params;

  try {
    const context = buildContext();
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.events.findUnique({ where: { id: eventId } });
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, existing, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const rawPayload = parsed.payload as Record<string, any>;
      const hardImmutableKeys = findPresentKeys(rawPayload, EVENT_PATCH_HARD_IMMUTABLE_FIELDS);
      if (hardImmutableKeys.length) {
        throw NextResponse.json(
          { error: 'Immutable event fields cannot be updated.', fields: hardImmutableKeys },
          { status: 403 },
        );
      }
      const adminOverridableKeys = findPresentKeys(rawPayload, EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS);
      if (adminOverridableKeys.length && !session.isAdmin) {
        throw NextResponse.json(
          { error: 'Immutable event fields cannot be updated.', fields: adminOverridableKeys },
          { status: 403 },
        );
      }
      const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;
      const unknownPayloadKeys = findUnknownKeys(payload, [
        ...EVENT_PATCH_ALLOWED_FIELDS,
        ...EVENT_PATCH_ADMIN_OVERRIDABLE_FIELDS,
      ]);
      if (unknownPayloadKeys.length) {
        throw NextResponse.json(
          { error: 'Unknown event patch fields.', unknownKeys: unknownPayloadKeys },
          { status: 400 },
        );
      }

      // Never allow callers to override the URL id or server-managed timestamps.
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;

      const incomingTimeSlots = Array.isArray(payload.timeSlots)
        ? payload.timeSlots.filter((slot): slot is Record<string, any> => Boolean(slot) && typeof slot === 'object')
        : null;
      const incomingFields = Array.isArray(payload.fields)
        ? payload.fields.filter((field): field is Record<string, any> => Boolean(field) && typeof field === 'object')
        : [];
      const hasDivisionFieldMapInput = Object.prototype.hasOwnProperty.call(payload, 'divisionFieldIds');
      const hasDivisionDetailsInput = Object.prototype.hasOwnProperty.call(payload, 'divisionDetails');
      const hasPlayoffDivisionDetailsInput = Object.prototype.hasOwnProperty.call(payload, 'playoffDivisionDetails');
      const incomingDivisionFieldMap = hasDivisionFieldMapInput
        ? coerceDivisionFieldMap(payload.divisionFieldIds)
        : {};
      const incomingDivisionDetails = hasDivisionDetailsInput
        ? normalizeDivisionDetailsInput(
          payload.divisionDetails,
          eventId,
          (payload.sportId ?? existing.sportId ?? null) as string | null,
          parseDateInput(payload.start) ?? existing.start,
          'LEAGUE',
        )
        : [];
      const incomingPlayoffDivisionDetails = hasPlayoffDivisionDetailsInput
        ? normalizeDivisionDetailsInput(
            payload.playoffDivisionDetails,
            eventId,
            (payload.sportId ?? existing.sportId ?? null) as string | null,
            parseDateInput(payload.start) ?? existing.start,
            'PLAYOFF',
          )
        : [];
      if (Object.prototype.hasOwnProperty.call(payload, 'divisions')) {
        const normalized = hasDivisionDetailsInput
          ? normalizeDivisionIds(payload.divisions, eventId)
          : normalizeDivisionKeys(payload.divisions);
        payload.divisions = normalized.length
          ? normalized
          : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
      } else if (incomingDivisionDetails.length) {
        payload.divisions = incomingDivisionDetails
          .map((detail) => normalizeDivisionKey(detail.id))
          .filter((id): id is string => Boolean(id));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'fieldIds')) {
        payload.fieldIds = normalizeFieldIds(payload.fieldIds);
      }

      // Drop relationship objects that Prisma doesn't accept on `events.update`.
      delete payload.players;
      delete payload.officials;
      delete payload.assistantHosts;
      delete payload.teams;
      delete payload.fields;
      delete payload.matches;
      delete payload.timeSlots;
      delete payload.divisionFieldIds;
      delete payload.divisionDetails;
      delete payload.playoffDivisionDetails;
      delete payload.leagueConfig;
      const incomingLeagueScoringConfig = payload.leagueScoringConfig;
      delete payload.leagueScoringConfig;

      if (payload.installmentDueDates) {
        payload.installmentDueDates = Array.isArray(payload.installmentDueDates)
          ? payload.installmentDueDates.map((value: unknown) => parseDateInput(value)).filter(Boolean)
          : payload.installmentDueDates;
      }

      if (payload.start) {
        const parsedStart = parseDateInput(payload.start);
        if (parsedStart) payload.start = parsedStart;
      }

      if (payload.end) {
        const parsedEnd = parseDateInput(payload.end);
        if (parsedEnd) payload.end = parsedEnd;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'noFixedEndDateTime')) {
        const normalizedNoFixedEndDateTime = normalizeOptionalBoolean(payload.noFixedEndDateTime);
        if (normalizedNoFixedEndDateTime !== null) {
          payload.noFixedEndDateTime = normalizedNoFixedEndDateTime;
        } else {
          delete payload.noFixedEndDateTime;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'teamOfficialsMaySwap')) {
        const normalizedTeamOfficialsMaySwap = normalizeOptionalBoolean(payload.teamOfficialsMaySwap);
        if (normalizedTeamOfficialsMaySwap !== null) {
          payload.teamOfficialsMaySwap = normalizedTeamOfficialsMaySwap;
        } else {
          delete payload.teamOfficialsMaySwap;
        }
      }

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!EVENT_UPDATE_FIELDS.has(key)) continue;
        data[key] = value;
      }

      const targetEventTypeRaw = (data.eventType ?? existing.eventType ?? null) as string | null;
      const targetEventType = typeof targetEventTypeRaw === 'string'
        ? targetEventTypeRaw.toUpperCase()
        : targetEventTypeRaw;
      if (targetEventType !== 'LEAGUE') {
        data.splitLeaguePlayoffDivisions = false;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'splitLeaguePlayoffDivisions')) {
        data.splitLeaguePlayoffDivisions = Boolean(payload.splitLeaguePlayoffDivisions);
      } else if (!Object.prototype.hasOwnProperty.call(data, 'splitLeaguePlayoffDivisions')) {
        data.splitLeaguePlayoffDivisions = Boolean(existing.splitLeaguePlayoffDivisions);
      }
      if (data.doTeamsOfficiate !== true) {
        data.teamOfficialsMaySwap = false;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'teamOfficialsMaySwap')) {
        data.teamOfficialsMaySwap = Boolean(payload.teamOfficialsMaySwap);
      } else if (!Object.prototype.hasOwnProperty.call(data, 'teamOfficialsMaySwap')) {
        data.teamOfficialsMaySwap = Boolean((existing as any).teamOfficialsMaySwap);
      }
      const nextOrganizationId = normalizeEntityId(data.organizationId ?? existing.organizationId ?? null);
      if (nextOrganizationId) {
        const [organizationAccess, staffMembers, staffInvites] = await Promise.all([
          tx.organizations.findUnique({
            where: { id: nextOrganizationId },
            select: {
              ownerId: true,
              hostIds: true,
              officialIds: true,
            },
          }),
          tx.staffMembers?.findMany
            ? tx.staffMembers.findMany({
              where: { organizationId: nextOrganizationId },
              select: {
                organizationId: true,
                userId: true,
                types: true,
              },
            })
            : Promise.resolve([]),
          tx.invites?.findMany
            ? tx.invites.findMany({
              where: { organizationId: nextOrganizationId, type: 'STAFF' },
              select: {
                organizationId: true,
                userId: true,
                type: true,
                status: true,
              },
            })
            : Promise.resolve([]),
        ]);
        if (!organizationAccess) {
          throw new Response('Organization not found', { status: 400 });
        }
        const sanitizedAssignments = sanitizeOrganizationEventAssignments(
          {
            hostId: data.hostId ?? existing.hostId,
            assistantHostIds: (
              Object.prototype.hasOwnProperty.call(data, 'assistantHostIds')
                ? data.assistantHostIds
                : existing.assistantHostIds
            ) as string[] | null | undefined,
            officialIds: (
              Object.prototype.hasOwnProperty.call(data, 'officialIds')
                ? data.officialIds
                : existing.officialIds
            ) as string[] | null | undefined,
          },
          { ...organizationAccess, staffMembers, staffInvites },
        );
        data.hostId = sanitizedAssignments.hostId ?? normalizeEntityId(existing.hostId) ?? '';
        data.assistantHostIds = sanitizedAssignments.assistantHostIds;
        data.officialIds = sanitizedAssignments.officialIds;
      }
      if (targetEventType === 'LEAGUE') {
        const normalizedLeagueConfig = normalizeLeagueScoringConfigUpdate(incomingLeagueScoringConfig);
        const payloadLeagueConfigId = typeof payload.leagueScoringConfigId === 'string'
          && payload.leagueScoringConfigId.trim().length > 0
          ? payload.leagueScoringConfigId.trim()
          : null;
        const existingLeagueConfigId = typeof existing.leagueScoringConfigId === 'string'
          && existing.leagueScoringConfigId.trim().length > 0
          ? existing.leagueScoringConfigId.trim()
          : null;
        const leagueScoringConfigId = normalizedLeagueConfig?.id
          ?? payloadLeagueConfigId
          ?? existingLeagueConfigId
          ?? crypto.randomUUID();
        const leagueScoringData = normalizedLeagueConfig?.data ?? {};
        const now = new Date();
        await tx.leagueScoringConfigs.upsert({
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
        data.leagueScoringConfigId = leagueScoringConfigId;
      }

      const existingDivisionKeys = normalizeDivisionKeys(existing.divisions);
      const existingFieldIds = normalizeFieldIds(existing.fieldIds);
      const payloadFieldIds = incomingFields
        .map((field) => {
          if (typeof field.$id === 'string' && field.$id.length > 0) {
            return field.$id;
          }
          if (typeof field.id === 'string' && field.id.length > 0) {
            return field.id;
          }
          return null;
        })
        .filter((id): id is string => Boolean(id));
      const hasTimeSlotPayload = incomingTimeSlots !== null;
      const slotDerivedFieldIds = hasTimeSlotPayload
        ? normalizeFieldIds(
          incomingTimeSlots.flatMap((slot) => normalizeTimeSlotFieldIds(slot)),
        )
        : [];
      const nextFieldIds = (() => {
        if (slotDerivedFieldIds.length) {
          return slotDerivedFieldIds;
        }
        if (Array.isArray(data.fieldIds)) {
          return normalizeFieldIds(data.fieldIds);
        }
        if (payloadFieldIds.length) {
          return normalizeFieldIds(payloadFieldIds);
        }
        return existingFieldIds;
      })();
      if (
        hasTimeSlotPayload
        || Object.prototype.hasOwnProperty.call(payload, 'fieldIds')
        || incomingFields.length > 0
      ) {
        data.fieldIds = nextFieldIds;
      }
      const nextSportId = normalizeEntityId(data.sportId ?? existing.sportId ?? null);
      const [existingEventOfficialRows, sportRow] = await Promise.all([
        typeof (tx as any).eventOfficials?.findMany === 'function'
          ? (tx as any).eventOfficials.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } })
          : Promise.resolve([]),
        nextSportId && typeof (tx as any).sports?.findUnique === 'function'
          ? (tx as any).sports.findUnique({
              where: { id: nextSportId },
              select: { officialPositionTemplates: true } as any,
            })
          : Promise.resolve(null),
      ]);
      const templateOfficialPositions = buildEventOfficialPositionsFromTemplates(
        eventId,
        normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
      );
      const hasOfficialPositionsInput = Object.prototype.hasOwnProperty.call(payload, 'officialPositions');
      let nextOfficialPositions = hasOfficialPositionsInput
        ? normalizeEventOfficialPositions(payload.officialPositions, eventId)
        : normalizeEventOfficialPositions((existing as any).officialPositions, eventId);
      if (!nextOfficialPositions.length) {
        nextOfficialPositions = templateOfficialPositions;
      }
      const nextCompatibilityOfficialIds = Object.prototype.hasOwnProperty.call(data, 'officialIds')
        ? normalizeEntityIdList(data.officialIds)
        : normalizeEntityIdList(existing.officialIds);
      if (!nextOfficialPositions.length && nextCompatibilityOfficialIds.length) {
        nextOfficialPositions = buildEventOfficialPositionsFromTemplates(eventId, [{ name: 'Official', count: 1 }]);
      }
      data.officialPositions = nextOfficialPositions;
      data.officialSchedulingMode = normalizeOfficialSchedulingMode(
        data.officialSchedulingMode ?? (existing as any).officialSchedulingMode,
      );
      const validPositionIdSet = new Set(nextOfficialPositions.map((position) => position.id));
      const validFieldIdSet = new Set(nextFieldIds);
      const sanitizedExistingEventOfficials = (existingEventOfficialRows as any[])
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          positionIds: normalizeEntityIdList(row.positionIds).filter((positionId: string) => validPositionIdSet.has(positionId)),
          fieldIds: normalizeEntityIdList(row.fieldIds).filter((fieldId: string) => validFieldIdSet.has(fieldId)),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.positionIds.length > 0);
      const hasEventOfficialsInput = Object.prototype.hasOwnProperty.call(payload, 'eventOfficials');
      const nextEventOfficials = hasEventOfficialsInput
        ? normalizeEventOfficials(payload.eventOfficials, {
            eventId,
            positionIds: nextOfficialPositions.map((position) => position.id),
            fieldIds: nextFieldIds,
          })
        : sanitizedExistingEventOfficials.length
          ? sanitizedExistingEventOfficials
          : deriveEventOfficialsFromLegacyOfficialIds({
              eventId,
              officialIds: nextCompatibilityOfficialIds,
              positionIds: nextOfficialPositions.map((position) => position.id),
            });
      data.officialIds = nextEventOfficials.map((official) => official.userId);
      const nextDivisionKeys = (() => {
        if (Array.isArray(data.divisions)) {
          const normalized = hasDivisionDetailsInput
            ? normalizeDivisionIds(data.divisions, eventId)
            : normalizeDivisionKeys(data.divisions);
          return normalized.length
            ? normalized
            : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
        }
        return existingDivisionKeys.length
          ? existingDivisionKeys
          : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY];
      })();
      const nextSingleDivision = typeof data.singleDivision === 'boolean'
        ? data.singleDivision
        : Boolean(existing.singleDivision);
      if (incomingDivisionDetails.length > 0) {
        validateUniqueDivisionTeamAssignments(incomingDivisionDetails, nextSingleDivision);
      }
      const nextEventTypeRaw = (data.eventType ?? existing.eventType ?? null) as string | null;
      const nextEventType = typeof nextEventTypeRaw === 'string'
        ? nextEventTypeRaw.toUpperCase()
        : nextEventTypeRaw;
      const nextStart = (data.start ?? existing.start ?? null) as Date | null;
      const nextEnd = (data.end ?? existing.end ?? null) as Date | null;
      const nextNoFixedEndDateTime = typeof data.noFixedEndDateTime === 'boolean'
        ? data.noFixedEndDateTime
        : typeof (existing as any).noFixedEndDateTime === 'boolean'
          ? Boolean((existing as any).noFixedEndDateTime)
          : false;
      if (isSchedulableEventType(nextEventType) && !nextNoFixedEndDateTime) {
        if (!(nextStart instanceof Date) || !(nextEnd instanceof Date)) {
          throw new Response('Start and end date/time are required when no fixed end date/time is disabled.', { status: 400 });
        }
        if (nextEnd.getTime() <= nextStart.getTime()) {
          throw new Response('End date/time must be after start date/time when no fixed end date/time is disabled.', { status: 400 });
        }
      }
      const existingSlotIds = Array.isArray(existing.timeSlotIds)
        ? existing.timeSlotIds.map((value: unknown) => String(value))
        : [];
      const shouldSyncDivisions = hasDivisionFieldMapInput
        || hasDivisionDetailsInput
        || hasPlayoffDivisionDetailsInput
        || incomingFields.length > 0
        || hasTimeSlotPayload
        || Object.prototype.hasOwnProperty.call(payload, 'divisions')
        || Object.prototype.hasOwnProperty.call(payload, 'fieldIds')
        || Object.prototype.hasOwnProperty.call(payload, 'sportId')
        || Object.prototype.hasOwnProperty.call(payload, 'organizationId');

      let currentDivisionFieldMap: Record<string, string[]> = {};
      let nextDivisionFieldMap: Record<string, string[]> = {};
      let divisionFieldMapChanged = false;
      if (shouldSyncDivisions && nextDivisionKeys.length) {
        const persistedDivisionRows = await tx.divisions.findMany({
          where: {
            eventId,
            OR: [
              { id: { in: nextDivisionKeys } },
              { key: { in: nextDivisionKeys } },
            ],
          },
          select: {
            id: true,
            key: true,
            fieldIds: true,
          },
        });
        currentDivisionFieldMap = mapDivisionRowsToFieldMap(persistedDivisionRows, nextDivisionKeys);
        nextDivisionFieldMap = buildDivisionFieldMap(
          nextDivisionKeys,
          nextFieldIds,
          currentDivisionFieldMap,
          incomingDivisionFieldMap,
        );
        divisionFieldMapChanged = !divisionFieldMapsEqual(currentDivisionFieldMap, nextDivisionFieldMap);
      }

      let canonicalTimeSlots: ReturnType<typeof canonicalizeTimeSlots> | null = null;
      if (incomingTimeSlots !== null) {
        canonicalTimeSlots = canonicalizeTimeSlots({
          eventId,
          slots: incomingTimeSlots,
          fallbackStartDate: existing.start,
          fallbackDivisionKeys: nextDivisionKeys,
          enforceAllDivisions: nextSingleDivision,
          normalizeDivisions: (value) => (
            hasDivisionDetailsInput
              ? normalizeDivisionIds(value, eventId)
              : normalizeDivisionKeys(value)
          ),
        });
        data.timeSlotIds = Array.from(new Set(canonicalTimeSlots.map((slot) => slot.id)));
      }

      // Keep plain PATCH saves metadata-only; clients must explicitly opt-in to a rebuild.
      const scheduleChanged = hasScheduleImpact(existing, data) || divisionFieldMapChanged || hasTimeSlotPayload;
      const shouldSchedule = rescheduleRequested && scheduleChanged;

      if (canonicalTimeSlots !== null) {
        const nextSlotIds = Array.from(new Set(canonicalTimeSlots.map((slot) => slot.id)));
        const nextSlotIdSet = new Set(nextSlotIds);
        const staleSlotIds = existingSlotIds.filter((slotId) => !nextSlotIdSet.has(slotId));

        for (const slot of canonicalTimeSlots) {
          const now = new Date();
          const upsertData = {
            dayOfWeek: slot.dayOfWeek,
            daysOfWeek: slot.daysOfWeek,
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: slot.startDate,
            endDate: slot.endDate,
            repeating: slot.repeating,
            scheduledFieldId: slot.scheduledFieldId,
            scheduledFieldIds: slot.scheduledFieldIds,
            price: slot.price,
            requiredTemplateIds: slot.requiredTemplateIds,
            hostRequiredTemplateIds: slot.hostRequiredTemplateIds,
            updatedAt: now,
          };

          await tx.timeSlots.upsert({
            where: { id: slot.id },
            create: {
              id: slot.id,
              ...upsertData,
              createdAt: now,
            } as any,
            update: upsertData as any,
          });
          await persistTimeSlotDivisions(tx, slot.id, slot.divisions, now);
        }

        if (staleSlotIds.length) {
          await tx.timeSlots.deleteMany({
            where: { id: { in: staleSlotIds } },
          });
        }
      } else if (nextSingleDivision && nextDivisionKeys.length && existingSlotIds.length) {
        const now = new Date();
        for (const slotId of existingSlotIds) {
          await persistTimeSlotDivisions(tx, slotId, nextDivisionKeys, now);
        }
      }

      const nextFieldIdSet = new Set(nextFieldIds);
      const incomingFieldsById = new Map<string, Record<string, any>>();
      for (const field of incomingFields) {
        const fieldId = typeof field.$id === 'string' && field.$id.length > 0
          ? field.$id
          : typeof field.id === 'string' && field.id.length > 0
            ? field.id
            : null;
        if (!fieldId) continue;
        incomingFieldsById.set(fieldId, field);
      }
      const existingFieldOwnershipById = new Map<string, { organizationId: string | null; createdBy: string | null }>();
      const incomingFieldIds = Array.from(incomingFieldsById.keys());
      if (incomingFieldIds.length && typeof (tx as any).fields?.findMany === 'function') {
        const existingIncomingFields = await (tx as any).fields.findMany({
          where: { id: { in: incomingFieldIds } },
          select: { id: true, organizationId: true, createdBy: true },
        });
        for (const row of existingIncomingFields as Array<{ id: string; organizationId?: string | null; createdBy?: string | null }>) {
          existingFieldOwnershipById.set(
            row.id,
            {
              organizationId: normalizeNullableString(row.organizationId) ?? null,
              createdBy: normalizeNullableString(row.createdBy) ?? null,
            },
          );
        }
      }

      const resolvedNextOrganizationId = (data.organizationId ?? existing.organizationId ?? null) as string | null;
      const shouldPersistLocalFields = incomingFieldsById.size > 0;
      if (shouldPersistLocalFields && typeof (tx as any).fields?.upsert === 'function') {
        for (const [index, fieldId] of nextFieldIds.entries()) {
          const field = incomingFieldsById.get(fieldId);
          if (!field) continue;
          const now = new Date();
          const existingFieldOwnership = existingFieldOwnershipById.get(fieldId);
          const incomingFieldOrganizationId = normalizeNullableString(field.organizationId);
          const persistedFieldOrganizationId = existingFieldOwnership?.organizationId ?? null;
          const persistedFieldCreatedBy = existingFieldOwnership?.createdBy ?? null;
          const createFieldOrganizationId = incomingFieldOrganizationId ?? resolvedNextOrganizationId;
          if (
            Boolean(existingFieldOwnership)
            && incomingFieldOrganizationId !== null
            && persistedFieldOrganizationId !== incomingFieldOrganizationId
          ) {
            console.warn(
              `[events] Ignoring attempted field ownership change during PATCH for field ${fieldId}: ` +
                `${persistedFieldOrganizationId ?? 'null'} -> ${incomingFieldOrganizationId}`,
            );
          }
          const updateFieldOwnershipUpdate = existingFieldOwnership
            ? {
                organizationId: persistedFieldOrganizationId ?? null,
                createdBy: persistedFieldCreatedBy ?? null,
              }
            : {};
          const fieldData = {
            fieldNumber: normalizeFieldNumber(field.fieldNumber, index + 1),
            lat: normalizeNullableNumber(field.lat),
            long: normalizeNullableNumber(field.long),
            heading: normalizeNullableNumber(field.heading),
            inUse: typeof field.inUse === 'boolean' ? field.inUse : null,
            name: normalizeNullableString(field.name),
            rentalSlotIds: normalizeFieldIds(field.rentalSlotIds),
            location: normalizeNullableString(field.location),
            updatedAt: now,
          };

          await (tx as any).fields.upsert({
            where: { id: fieldId },
            create: {
              id: fieldId,
              ...fieldData,
              organizationId: createFieldOrganizationId ?? null,
              createdBy: persistedFieldCreatedBy ?? session.userId,
              createdAt: now,
            },
            update: {
              ...fieldData,
              ...updateFieldOwnershipUpdate,
            },
          });
        }
      }

      const removedFieldIds = existingFieldIds.filter((fieldId) => !nextFieldIdSet.has(fieldId));
      if (removedFieldIds.length) {
        if (typeof (tx as any).matches?.deleteMany === 'function') {
          await (tx as any).matches.deleteMany({
            where: {
              eventId,
              fieldId: { in: removedFieldIds },
            },
          });
        }
        if (typeof (tx as any).fields?.deleteMany === 'function') {
          await (tx as any).fields.deleteMany({
            where: {
              id: { in: removedFieldIds },
              organizationId: null,
            },
          });
        }
      }

      const { event: updatedEvent, removedArguments } = await updateEventWithUnknownArgFallback(
        tx,
        eventId,
        {
          ...data,
          updatedAt: new Date(),
        },
      );
      const shouldFallbackAddressWrite = removedArguments.has('address')
        && Object.prototype.hasOwnProperty.call(data, 'address');
      const fallbackAddressValue = shouldFallbackAddressWrite
        ? (data.address == null ? null : String(data.address))
        : null;
      if (shouldFallbackAddressWrite) {
        if (typeof (tx as any).$executeRaw === 'function') {
          await (tx as any).$executeRaw`
            UPDATE "Events"
            SET "address" = ${fallbackAddressValue}, "updatedAt" = ${new Date()}
            WHERE "id" = ${eventId}
          `;
        } else {
          console.warn(
            '[events] Unable to persist fallback address because transaction client has no $executeRaw.',
          );
        }
      }
      if (
        typeof (tx as any).eventOfficials?.deleteMany === 'function'
        && (
          hasEventOfficialsInput
          || hasOfficialPositionsInput
          || Object.prototype.hasOwnProperty.call(payload, 'sportId')
          || existingEventOfficialRows.length === 0
        )
      ) {
        await (tx as any).eventOfficials.deleteMany({ where: { eventId } });
        for (const official of nextEventOfficials) {
          await (tx as any).eventOfficials.create({
            data: {
              id: official.id,
              eventId,
              userId: official.userId,
              positionIds: official.positionIds,
              fieldIds: official.fieldIds,
              isActive: official.isActive,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }

      const defaultDivisionPrice = (() => {
        const parsed = normalizeNullableNumber(data.price ?? existing.price);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.round(parsed));
        }
        return parsed;
      })();
      const defaultDivisionMaxParticipants = (() => {
        const parsed = normalizeNullableNumber(data.maxParticipants ?? existing.maxParticipants);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionPlayoffTeamCount = (() => {
        const parsed = normalizeNullableNumber(data.playoffTeamCount ?? existing.playoffTeamCount);
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionAllowPaymentPlans = normalizeOptionalBoolean(
        Object.prototype.hasOwnProperty.call(data, 'allowPaymentPlans')
          ? data.allowPaymentPlans
          : existing.allowPaymentPlans,
      );
      const defaultDivisionInstallmentCount = (() => {
        const parsed = normalizeNullableNumber(
          Object.prototype.hasOwnProperty.call(data, 'installmentCount')
            ? data.installmentCount
            : existing.installmentCount,
        );
        if (typeof parsed === 'number') {
          return Math.max(0, Math.trunc(parsed));
        }
        return parsed;
      })();
      const defaultDivisionInstallmentDueDates = normalizeInstallmentDateList(
        Object.prototype.hasOwnProperty.call(data, 'installmentDueDates')
          ? data.installmentDueDates
          : existing.installmentDueDates,
      );
      const defaultDivisionInstallmentAmounts = normalizeInstallmentAmountList(
        Object.prototype.hasOwnProperty.call(data, 'installmentAmounts')
          ? data.installmentAmounts
          : existing.installmentAmounts,
      );

      if (shouldSyncDivisions) {
        await syncEventDivisions({
          eventId,
          divisionIds: nextDivisionKeys,
          fieldIds: nextFieldIds,
          singleDivision: nextSingleDivision,
          sportId: (data.sportId ?? existing.sportId ?? null) as string | null,
          referenceDate: (data.start ?? existing.start ?? null) as Date | null,
          organizationId: (data.organizationId ?? existing.organizationId ?? null) as string | null,
          divisionFieldMap: nextDivisionFieldMap,
          divisionDetails: incomingDivisionDetails,
          playoffDivisionDetails: incomingPlayoffDivisionDetails,
          defaultPrice: defaultDivisionPrice,
          defaultMaxParticipants: defaultDivisionMaxParticipants,
          defaultPlayoffTeamCount: defaultDivisionPlayoffTeamCount,
          defaultAllowPaymentPlans: defaultDivisionAllowPaymentPlans,
          defaultInstallmentCount: defaultDivisionInstallmentCount,
          defaultInstallmentDueDates: defaultDivisionInstallmentDueDates,
          defaultInstallmentAmounts: defaultDivisionInstallmentAmounts,
        }, tx as any);
      }

      const nextEventTypeForSchedule = (data.eventType ?? existing.eventType ?? updatedEvent.eventType) as string | null;
      if (shouldSchedule && isSchedulableEventType(nextEventTypeForSchedule)) {
        await acquireEventLock(tx, eventId);
        const loaded = await loadEventWithRelations(eventId, tx);
        if (isSchedulableEventType(loaded.eventType)) {
          const scheduled = scheduleEvent({ event: loaded }, context);
          await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
          await deleteMatchesByEvent(eventId, tx);
          await saveMatches(eventId, scheduled.matches, tx);
          await saveEventSchedule(scheduled.event, tx);
        }
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to update event');
      }
      if (shouldFallbackAddressWrite) {
        (fresh as Record<string, unknown>).address = fallbackAddressValue;
      }
      return fresh;
    });
    const divisionKeys = normalizeDivisionKeys(updated.divisions);
    const playoffDivisionKeys = await getDivisionKeysForEventKind(eventId, 'PLAYOFF');
    const [divisionFieldIds, divisionDetails, playoffDivisionDetails] = await Promise.all([
      getDivisionFieldMapForEvent(eventId, divisionKeys),
      getDivisionDetailsForEvent(eventId, divisionKeys, updated.start, {
        price: updated.price,
        maxParticipants: updated.maxParticipants,
        playoffTeamCount: updated.playoffTeamCount,
        allowPaymentPlans: updated.allowPaymentPlans,
        installmentCount: updated.installmentCount,
        installmentDueDates: updated.installmentDueDates,
        installmentAmounts: updated.installmentAmounts,
      }),
      getDivisionDetailsForEvent(eventId, playoffDivisionKeys, updated.start, {
        price: updated.price,
        maxParticipants: updated.maxParticipants,
        playoffTeamCount: updated.playoffTeamCount,
        allowPaymentPlans: updated.allowPaymentPlans,
        installmentCount: updated.installmentCount,
        installmentDueDates: updated.installmentDueDates,
        installmentAmounts: updated.installmentAmounts,
      }),
    ]);
    const officialResponse = await buildEventOfficialResponse(updated);
    return NextResponse.json(
      withLegacyEvent({
        ...updated,
        ...officialResponse,
        divisionFieldIds,
        divisionDetails,
        playoffDivisionDetails,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isDivisionAssignmentValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid division team assignments';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Update event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const { eventId } = await params;
  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      fieldIds: true,
      timeSlotIds: true,
      teamIds: true,
      state: true,
      leagueScoringConfigId: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const billIds = await collectEventBillIds(eventId);
  try {
    await settleEventBillingBeforeDelete({ eventId, billIds });
  } catch (error) {
    console.error('Failed to settle billing before deleting event.', error);
    const message = error instanceof Error
      ? error.message
      : 'Failed to settle billing before deleting event';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const eventFieldIds = normalizeEntityIdList(event.fieldIds);
  const eventTimeSlotIds = normalizeEntityIdList(event.timeSlotIds);
  const eventTeamIds = normalizeEntityIdList(event.teamIds);
  const eventState = typeof event.state === 'string' ? event.state.toUpperCase() : '';
  const leagueScoringConfigId = normalizeEntityId(event.leagueScoringConfigId);

  await prisma.$transaction(async (tx) => {
    if (eventState === 'TEMPLATE') {
      const [eventsUsingTemplate, timeSlotsUsingTemplate] = await Promise.all([
        tx.events.findMany({
          where: {
            id: { not: eventId },
            requiredTemplateIds: { has: eventId },
          },
          select: {
            id: true,
            requiredTemplateIds: true,
          },
        }),
        tx.timeSlots.findMany({
          where: {
            OR: [
              { requiredTemplateIds: { has: eventId } },
              { hostRequiredTemplateIds: { has: eventId } },
            ],
          },
          select: {
            id: true,
            requiredTemplateIds: true,
            hostRequiredTemplateIds: true,
          },
        }),
      ]);

      for (const linkedEvent of eventsUsingTemplate) {
        await tx.events.update({
          where: { id: linkedEvent.id },
          data: {
            requiredTemplateIds: removeEntityIdFromList(linkedEvent.requiredTemplateIds, eventId),
            updatedAt: new Date(),
          },
        });
      }

      for (const linkedSlot of timeSlotsUsingTemplate) {
        await tx.timeSlots.update({
          where: { id: linkedSlot.id },
          data: {
            requiredTemplateIds: removeEntityIdFromList(linkedSlot.requiredTemplateIds, eventId),
            hostRequiredTemplateIds: removeEntityIdFromList(linkedSlot.hostRequiredTemplateIds, eventId),
            updatedAt: new Date(),
          },
        });
      }
    }

    const registrations = await tx.eventRegistrations.findMany({
      where: { eventId },
      select: {
        registrantId: true,
        registrantType: true,
      },
    });
    const registrationTeamIds = registrations
      .filter((row: { registrantType: string }) => row.registrantType === 'TEAM')
      .map((row: { registrantId: string }) => row.registrantId);
    const seedTeamIds = Array.from(new Set([...eventTeamIds, ...normalizeEntityIdList(registrationTeamIds)]));

    const linkedTeams = seedTeamIds.length > 0
      ? await tx.teams.findMany({
          where: {
            OR: [
              { id: { in: seedTeamIds } },
              { parentTeamId: { in: seedTeamIds } },
            ],
          },
          select: {
            id: true,
            parentTeamId: true,
            captainId: true,
            name: true,
          },
        })
      : [];
    const candidateTeamIds = Array.from(
      new Set([...seedTeamIds, ...linkedTeams.map((row: { id: string }) => row.id)]),
    );

    const referencedTeamIds = new Set<string>();
    if (candidateTeamIds.length > 0) {
      const registrationsUsingTeams = await tx.eventRegistrations.findMany({
        where: {
          eventId: { not: eventId },
          registrantType: 'TEAM',
          registrantId: { in: candidateTeamIds },
        },
        select: { registrantId: true },
      });
      normalizeEntityIdList(registrationsUsingTeams.map((row: { registrantId: string }) => row.registrantId))
        .forEach((id) => referencedTeamIds.add(id));

      const eventsUsingTeams = await tx.events.findMany({
        where: {
          id: { not: eventId },
          OR: candidateTeamIds.map((teamId) => ({ teamIds: { has: teamId } })),
        },
        select: { teamIds: true },
      });
      eventsUsingTeams.forEach((row: { teamIds: string[] }) => {
        normalizeEntityIdList(row.teamIds).forEach((teamId) => {
          if (candidateTeamIds.includes(teamId)) {
            referencedTeamIds.add(teamId);
          }
        });
      });
    }
    const forcedTeamIdsToDelete = new Set(
      linkedTeams
        .filter((team: { parentTeamId: string | null; captainId: string; name: string | null }) => (
          normalizeEntityId(team.parentTeamId) !== null
          || normalizeEntityId(team.captainId) === null
          || isPlaceholderTeamName(team.name)
        ))
        .map((team: { id: string }) => team.id),
    );

    const teamIdsToDelete = candidateTeamIds.filter(
      (teamId) => forcedTeamIdsToDelete.has(teamId) || !referencedTeamIds.has(teamId),
    );

    const localFieldIds = eventFieldIds.length > 0
      ? (await tx.fields.findMany({
          where: {
            id: { in: eventFieldIds },
            organizationId: null,
          },
          select: { id: true },
        })).map((row: { id: string }) => row.id)
      : [];

    await tx.matches.deleteMany({ where: { eventId } });
    await tx.divisions.deleteMany({ where: { eventId } });
    await tx.eventRegistrations.deleteMany({ where: { eventId } });
    await tx.refundRequests.deleteMany({ where: { eventId } });
    await tx.signedDocuments.deleteMany({ where: { eventId } });
    await tx.invites.deleteMany({ where: { eventId } });
    await tx.paymentIntents.deleteMany({ where: { eventId } });
    await tx.templateDocuments.deleteMany({ where: { templateId: eventId } });

    if (billIds.length > 0) {
      await tx.billPayments.deleteMany({
        where: {
          billId: { in: billIds },
        },
      });
      await tx.bills.deleteMany({
        where: {
          id: { in: billIds },
        },
      });
    }

    if (eventTimeSlotIds.length > 0) {
      await tx.timeSlots.deleteMany({
        where: {
          id: { in: eventTimeSlotIds },
        },
      });
    }

    if (localFieldIds.length > 0) {
      await tx.fields.deleteMany({
        where: {
          id: { in: localFieldIds },
          organizationId: null,
        },
      });
    }

    if (teamIdsToDelete.length > 0) {
      await tx.teams.deleteMany({
        where: {
          id: { in: teamIdsToDelete },
        },
      });
    }

    await tx.events.delete({ where: { id: eventId } });

    if (leagueScoringConfigId) {
      const remainingEventsUsingConfig = await tx.events.count({
        where: { leagueScoringConfigId },
      });
      if (remainingEventsUsingConfig === 0) {
        await tx.leagueScoringConfigs.deleteMany({
          where: { id: leagueScoringConfigId },
        });
      }
    }
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
