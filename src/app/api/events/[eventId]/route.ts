import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  deleteMatchesByEvent,
  loadEventWithRelations,
  saveEventSchedule,
  saveMatches,
  syncEventDivisions,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';
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
  'fieldType',
  'doTeamsRef',
  'refereeIds',
  'allowPaymentPlans',
  'installmentCount',
  'installmentDueDates',
  'installmentAmounts',
  'allowTeamSplitDefault',
  'requiredTemplateIds',
]);

const updateSchema = z.object({
  event: z.record(z.string(), z.any()).optional(),
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
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
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
      divisionTypeId: normalizeDivisionKey(row.divisionTypeId) ?? inferred.divisionTypeId,
      divisionTypeName:
        typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length
          ? row.divisionTypeName.trim()
          : inferred.divisionTypeName,
      ratingType: inferred.ratingType,
      gender: inferred.gender,
      sportId: typeof row.sportId === 'string' ? row.sportId : sportId ?? null,
      ageCutoffDate: ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : null,
      ageCutoffLabel: ageEligibility.message ?? null,
      ageCutoffSource: ageEligibility.applies ? ageEligibility.cutoffRule.source : null,
      fieldIds: normalizeFieldIds(row.fieldIds),
    });
  }
  return details;
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
    return {
      id: row?.id ?? divisionId,
      key: row?.key ?? inferred.token,
      name: row?.name ?? inferred.defaultName,
      divisionTypeId: row?.divisionTypeId ?? inferred.divisionTypeId,
      divisionTypeName: row?.divisionTypeName ?? inferred.divisionTypeName,
      ratingType: row?.ratingType ?? inferred.ratingType,
      gender: row?.gender ?? inferred.gender,
      sportId: row?.sportId ?? null,
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
    };
  });
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
  return slots.flatMap((slot, index) => {
    const sourceId = typeof slot.$id === 'string' && slot.$id.length > 0
      ? slot.$id
      : typeof slot.id === 'string' && slot.id.length > 0
        ? slot.id
        : `${eventId}__slot_${index + 1}`;
    const baseSlotId = normalizeSlotBaseId(sourceId);
    const normalizedDays = normalizeSlotDays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    });
    if (!normalizedDays.length) {
      return [];
    }

    const startDate = parseDateInput(slot.startDate) ?? fallbackStartDate;
    const endDate = slot.endDate === null ? null : parseDateInput(slot.endDate);
    const startTimeMinutes = typeof slot.startTimeMinutes === 'number'
      ? slot.startTimeMinutes
      : Number.isFinite(Number(slot.startTimeMinutes))
        ? Number(slot.startTimeMinutes)
        : null;
    const endTimeMinutes = typeof slot.endTimeMinutes === 'number'
      ? slot.endTimeMinutes
      : Number.isFinite(Number(slot.endTimeMinutes))
        ? Number(slot.endTimeMinutes)
        : null;
    const repeating = typeof slot.repeating === 'boolean' ? slot.repeating : true;
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

    return normalizedDays.flatMap((day) =>
      expandedFieldIds.map((fieldId) => ({
        id: buildExpandedSlotId(
          sourceId,
          baseSlotId,
          day,
          fieldId,
          normalizedDays.length,
          expandedFieldIds.length,
        ),
        dayOfWeek: day,
        startTimeMinutes,
        endTimeMinutes,
        startDate,
        endDate: endDate ?? null,
        repeating,
        scheduledFieldId: fieldId,
        price,
        divisions,
        requiredTemplateIds,
      })),
    );
  });
};

const hasScheduleImpact = (existing: any, payload: Record<string, any>): boolean => {
  const scheduleFields = [
    'eventType',
    'start',
    'end',
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (event.state === 'TEMPLATE') {
    const session = await requireSession(_req);
    if (!session.isAdmin && session.userId !== event.hostId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const divisionKeys = normalizeDivisionKeys(event.divisions);
  const [divisionFieldIds, divisionDetails] = await Promise.all([
    getDivisionFieldMapForEvent(eventId, divisionKeys),
    getDivisionDetailsForEvent(eventId, divisionKeys, event.start),
  ]);
  return NextResponse.json(
    withLegacyEvent({ ...event, divisionFieldIds, divisionDetails }),
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
      if (!session.isAdmin && existing.hostId !== session.userId) {
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
      const incomingDivisionFieldMap = hasDivisionFieldMapInput
        ? coerceDivisionFieldMap(payload.divisionFieldIds)
        : {};
      const incomingDivisionDetails = hasDivisionDetailsInput
        ? normalizeDivisionDetailsInput(
          payload.divisionDetails,
          eventId,
          (payload.sportId ?? existing.sportId ?? null) as string | null,
          parseDateInput(payload.start) ?? existing.start,
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
      delete payload.teams;
      delete payload.fields;
      delete payload.matches;
      delete payload.timeSlots;
      delete payload.divisionFieldIds;
      delete payload.divisionDetails;
      delete payload.leagueConfig;

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

      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!EVENT_UPDATE_FIELDS.has(key)) continue;
        data[key] = value;
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
      const existingSlotIds = Array.isArray(existing.timeSlotIds)
        ? existing.timeSlotIds.map((value: unknown) => String(value))
        : [];
      const shouldSyncDivisions = hasDivisionFieldMapInput
        || hasDivisionDetailsInput
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

      const shouldSchedule = hasScheduleImpact(existing, data) || divisionFieldMapChanged || hasTimeSlotPayload;

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
            type: normalizeNullableString(field.type),
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

      if (shouldSyncDivisions) {
        await syncEventDivisions({
          eventId,
          divisionIds: nextDivisionKeys,
          fieldIds: nextFieldIds,
          sportId: (data.sportId ?? existing.sportId ?? null) as string | null,
          referenceDate: (data.start ?? existing.start ?? null) as Date | null,
          organizationId: (data.organizationId ?? existing.organizationId ?? null) as string | null,
          divisionFieldMap: nextDivisionFieldMap,
          divisionDetails: incomingDivisionDetails,
        }, tx as any);
      }

      const nextEventType = (data.eventType ?? existing.eventType ?? updatedEvent.eventType) as string | null;
      if (shouldSchedule && isSchedulableEventType(nextEventType)) {
        await acquireEventLock(tx, eventId);
        const loaded = await loadEventWithRelations(eventId, tx);
        if (isSchedulableEventType(loaded.eventType)) {
          const scheduled = scheduleEvent({ event: loaded }, context);
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
    const [divisionFieldIds, divisionDetails] = await Promise.all([
      getDivisionFieldMapForEvent(eventId, divisionKeys),
      getDivisionDetailsForEvent(eventId, divisionKeys, updated.start),
    ]);
    return NextResponse.json(
      withLegacyEvent({ ...updated, divisionFieldIds, divisionDetails }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
  if (!session.isAdmin && event.hostId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.events.delete({ where: { id: eventId } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
