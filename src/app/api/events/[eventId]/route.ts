import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
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

export const dynamic = 'force-dynamic';

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
  'fieldCount',
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
  'registrationIds',
  'leagueScoringConfigId',
  'organizationId',
  'autoCancellation',
  'eventType',
  'doTeamsRef',
  'teamRefsMaySwap',
  'refereeIds',
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

const updateSchema = z.object({
  event: z.record(z.string(), z.any()).optional(),
  reschedule: z.boolean().optional(),
}).passthrough();

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray(legacy.waitListIds)) {
    (legacy as any).waitListIds = [];
  }
  if (!Array.isArray(legacy.freeAgentIds)) {
    (legacy as any).freeAgentIds = [];
  }
  if (!Array.isArray(legacy.refereeIds)) {
    (legacy as any).refereeIds = [];
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
      && end
      && start.getTime() === end.getTime(),
    );
  }
  if ((legacy as any).doTeamsRef !== true) {
    (legacy as any).teamRefsMaySwap = false;
  } else if (typeof (legacy as any).teamRefsMaySwap !== 'boolean') {
    (legacy as any).teamRefsMaySwap = false;
  }
  return legacy;
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

const normalizeSlotDays = (input: { dayOfWeek?: unknown; daysOfWeek?: unknown }): number[] => {
  const source = Array.isArray(input.daysOfWeek) && input.daysOfWeek.length
    ? input.daysOfWeek
    : input.dayOfWeek !== undefined
      ? [input.dayOfWeek]
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

const ensureUniqueExpandedSlotIds = <T extends { id: string }>(slots: T[]): T[] => {
  const seen = new Map<string, number>();
  return slots.map((slot) => {
    const count = seen.get(slot.id) ?? 0;
    seen.set(slot.id, count + 1);
    if (count === 0) {
      return slot;
    }
    return {
      ...slot,
      id: `${slot.id}__dup${count}`,
    };
  });
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

type ExpandedTimeSlotInput = {
  id: string;
  dayOfWeek: number;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  scheduledFieldId: string | null;
  price: number | null;
  divisions: string[];
  requiredTemplateIds: string[];
};

const expandTimeSlotsForUpdate = (
  eventId: string,
  slots: Array<Record<string, any>>,
  fallbackStartDate: Date,
  fallbackDivisionKeys: string[],
  enforceAllDivisions: boolean,
  useDivisionIds: boolean,
): ExpandedTimeSlotInput[] => {
  return ensureUniqueExpandedSlotIds(slots.flatMap((slot, index) => {
    const sourceId = typeof slot.$id === 'string' && slot.$id.length > 0
      ? slot.$id
      : typeof slot.id === 'string' && slot.id.length > 0
        ? slot.id
        : `${eventId}__slot_${index + 1}`;
    const baseSlotId = normalizeSlotBaseId(sourceId);
    const repeating = typeof slot.repeating === 'boolean' ? slot.repeating : true;
    const startDate = parseDateInput(slot.startDate) ?? fallbackStartDate;
    const parsedEndDate = slot.endDate === null ? null : parseDateInput(slot.endDate);
    const normalizedDays = normalizeSlotDays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    });
    const startTimeMinutesInput = typeof slot.startTimeMinutes === 'number'
      ? slot.startTimeMinutes
      : Number.isFinite(Number(slot.startTimeMinutes))
        ? Number(slot.startTimeMinutes)
        : null;
    const endTimeMinutesInput = typeof slot.endTimeMinutes === 'number'
      ? slot.endTimeMinutes
      : Number.isFinite(Number(slot.endTimeMinutes))
        ? Number(slot.endTimeMinutes)
        : null;
    const derivedStartTimeMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const derivedEndTimeMinutes = parsedEndDate
      ? parsedEndDate.getHours() * 60 + parsedEndDate.getMinutes()
      : null;
    const startTimeMinutes = startTimeMinutesInput ?? (repeating ? null : derivedStartTimeMinutes);
    const endTimeMinutes = endTimeMinutesInput ?? (repeating ? null : derivedEndTimeMinutes);
    const normalizedFieldIds = normalizeSlotFieldIds(slot);
    const expandedFieldIds: Array<string | null> = normalizedFieldIds.length ? normalizedFieldIds : [null];
    const price = typeof slot.price === 'number'
      ? slot.price
      : Number.isFinite(Number(slot.price))
        ? Number(slot.price)
        : null;
    const requiredTemplateIds = Array.isArray(slot.requiredTemplateIds)
      ? Array.from(
        new Set(
          slot.requiredTemplateIds
            .map((entry: unknown) => String(entry))
            .filter((entry: string) => entry.length > 0),
        ),
      )
      : [];
    const normalizedSlotDivisions = useDivisionIds
      ? normalizeDivisionIds(slot.divisions, eventId)
      : normalizeDivisionKeys(slot.divisions);
    const divisions = enforceAllDivisions
      ? fallbackDivisionKeys
      : normalizedSlotDivisions.length
      ? normalizedSlotDivisions
      : fallbackDivisionKeys;

    if (!repeating) {
      const explicitEndDate = parsedEndDate ?? (() => {
        if (typeof startTimeMinutes === 'number' && typeof endTimeMinutes === 'number') {
          const baseDay = new Date(startDate);
          baseDay.setHours(0, 0, 0, 0);
          const candidate = new Date(baseDay.getTime() + endTimeMinutes * 60 * 1000);
          if (candidate.getTime() <= startDate.getTime()) {
            candidate.setDate(candidate.getDate() + 1);
          }
          return candidate;
        }
        return null;
      })();
      if (!explicitEndDate || explicitEndDate.getTime() <= startDate.getTime()) {
        return [];
      }
      const defaultDay = ((startDate.getDay() + 6) % 7);
      const slotDay = normalizedDays[0] ?? defaultDay;
      return expandedFieldIds.map((fieldId): ExpandedTimeSlotInput => ({
        id: buildExpandedSlotId(
          sourceId,
          baseSlotId,
          slotDay,
          fieldId,
          1,
          expandedFieldIds.length,
        ),
        dayOfWeek: slotDay,
        startTimeMinutes,
        endTimeMinutes,
        startDate,
        endDate: explicitEndDate,
        repeating: false,
        scheduledFieldId: fieldId,
        price,
        divisions,
        requiredTemplateIds,
      }));
    }

    const days = normalizedDays.length ? normalizedDays : [((startDate.getDay() + 6) % 7)];

    return days.flatMap((day) =>
      expandedFieldIds.map((fieldId): ExpandedTimeSlotInput => ({
        id: buildExpandedSlotId(
          sourceId,
          baseSlotId,
          day,
          fieldId,
          days.length,
          expandedFieldIds.length,
        ),
        dayOfWeek: day,
        startTimeMinutes,
        endTimeMinutes,
        startDate,
        endDate: parsedEndDate ?? null,
        repeating: true,
        scheduledFieldId: fieldId,
        price,
        divisions,
        requiredTemplateIds,
      })),
    );
  }));
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
    'fieldCount',
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (event.state === 'TEMPLATE') {
    const session = await requireSession(_req);
    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const divisionKeys = normalizeDivisionKeys(event.divisions);
  const playoffDivisionKeys = await getDivisionKeysForEventKind(eventId, 'PLAYOFF');
  const [divisionFieldIds, divisionDetails, playoffDivisionDetails] = await Promise.all([
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
  ]);
  return NextResponse.json(
    withLegacyEvent({ ...event, divisionFieldIds, divisionDetails, playoffDivisionDetails }),
    { status: 200 },
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

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

      const rawPayload = (parsed.data.event ?? parsed.data ?? {}) as Record<string, any>;
      const payload = stripLegacyFieldsDeep(rawPayload) as Record<string, any>;

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
      const incomingFieldDivisionMap = {};

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
      delete payload.referees;
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
      if (Object.prototype.hasOwnProperty.call(payload, 'teamRefsMaySwap')) {
        const normalizedTeamRefsMaySwap = normalizeOptionalBoolean(payload.teamRefsMaySwap);
        if (normalizedTeamRefsMaySwap !== null) {
          payload.teamRefsMaySwap = normalizedTeamRefsMaySwap;
        } else {
          delete payload.teamRefsMaySwap;
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
      if (data.doTeamsRef !== true) {
        data.teamRefsMaySwap = false;
      } else if (Object.prototype.hasOwnProperty.call(payload, 'teamRefsMaySwap')) {
        data.teamRefsMaySwap = Boolean(payload.teamRefsMaySwap);
      } else if (!Object.prototype.hasOwnProperty.call(data, 'teamRefsMaySwap')) {
        data.teamRefsMaySwap = Boolean((existing as any).teamRefsMaySwap);
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
          incomingTimeSlots.flatMap((slot) => normalizeSlotFieldIds(slot)),
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
          : Boolean(
            nextStart instanceof Date
            && nextEnd instanceof Date
            && nextStart.getTime() === nextEnd.getTime(),
          );
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
          incomingFieldDivisionMap,
          incomingDivisionFieldMap,
        );
        divisionFieldMapChanged = !divisionFieldMapsEqual(currentDivisionFieldMap, nextDivisionFieldMap);
      }

      let expandedTimeSlots: ExpandedTimeSlotInput[] | null = null;
      if (incomingTimeSlots !== null) {
        expandedTimeSlots = expandTimeSlotsForUpdate(
          eventId,
          incomingTimeSlots,
          existing.start,
          nextDivisionKeys,
          nextSingleDivision,
          hasDivisionDetailsInput,
        );
        data.timeSlotIds = Array.from(new Set(expandedTimeSlots.map((slot) => slot.id)));
      }

      // Keep plain PATCH saves metadata-only; clients must explicitly opt-in to a rebuild.
      const scheduleChanged = hasScheduleImpact(existing, data) || divisionFieldMapChanged || hasTimeSlotPayload;
      const shouldSchedule = parsed.data.reschedule === true && scheduleChanged;

      if (expandedTimeSlots !== null) {
        const nextSlotIds = Array.from(new Set(expandedTimeSlots.map((slot) => slot.id)));
        const nextSlotIdSet = new Set(nextSlotIds);
        const staleSlotIds = existingSlotIds.filter((slotId) => !nextSlotIdSet.has(slotId));

        for (const slot of expandedTimeSlots) {
          const now = new Date();
          const upsertData = {
            dayOfWeek: slot.dayOfWeek,
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: slot.startDate,
            endDate: slot.endDate,
            repeating: slot.repeating,
            scheduledFieldId: slot.scheduledFieldId,
            price: slot.price,
            requiredTemplateIds: slot.requiredTemplateIds,
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

      const nextOrganizationId = (data.organizationId ?? existing.organizationId ?? null) as string | null;
      const shouldPersistLocalFields = incomingFieldsById.size > 0 && !nextOrganizationId;
      if (shouldPersistLocalFields && typeof (tx as any).fields?.upsert === 'function') {
        for (const [index, fieldId] of nextFieldIds.entries()) {
          const field = incomingFieldsById.get(fieldId);
          if (!field) continue;
          const now = new Date();
          const fieldDivisions = hasDivisionDetailsInput
            ? normalizeDivisionIds(field.divisions, eventId)
            : normalizeDivisionKeys(field.divisions);
          const divisions = fieldDivisions.length
            ? fieldDivisions
            : (
              nextDivisionKeys.length
                ? nextDivisionKeys
                : [hasDivisionDetailsInput ? buildEventDivisionId(eventId, DEFAULT_DIVISION_KEY) : DEFAULT_DIVISION_KEY]
            );
          const fieldData = {
            fieldNumber: normalizeFieldNumber(field.fieldNumber, index + 1),
            divisions,
            lat: normalizeNullableNumber(field.lat),
            long: normalizeNullableNumber(field.long),
            heading: normalizeNullableNumber(field.heading),
            inUse: typeof field.inUse === 'boolean' ? field.inUse : null,
            name: normalizeNullableString(field.name),
            rentalSlotIds: normalizeFieldIds(field.rentalSlotIds),
            location: normalizeNullableString(field.location),
            organizationId: null,
            updatedAt: now,
          };

          await (tx as any).fields.upsert({
            where: { id: fieldId },
            create: {
              id: fieldId,
              ...fieldData,
              createdAt: now,
            },
            update: fieldData,
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

      const updatedEvent = await tx.events.update({
        where: { id: eventId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

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
    return NextResponse.json(
      withLegacyEvent({ ...updated, divisionFieldIds, divisionDetails, playoffDivisionDetails }),
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
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canManageEvent(session, event))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.events.delete({ where: { id: eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
