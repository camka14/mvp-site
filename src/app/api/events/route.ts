import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { canManageEvent, hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { isSessionTokenCurrent } from '@/server/authSessions';
import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';
import { withDerivedEventParticipantIds } from '@/server/events/eventRegistrations';
import { getEventOfficialIdsByEventIds } from '@/server/officials/eventOfficials';
import {
  deleteMatchesByEvent,
  isEventFieldConflictError,
  isLeaguePlayoffTeamCountValidationError,
  isRentalBookingReservationError,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  upsertEventFromPayload,
} from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';
import {
  cleanDivisionDisplayName,
  deriveDivisionTypeDisplayName,
  evaluateDivisionAgeEligibility,
  extractDivisionTokenFromId,
  inferDivisionDetails,
  normalizeDivisionGender,
  normalizeDivisionRatingType,
} from '@/lib/divisionTypes';
import { notifySocialAudienceOfEventCreation } from '@/server/eventCreationNotifications';
import { assertEventContentAllowed, EventContentFilterError } from '@/server/contentFilter';
import {
  buildEventOfficialPositionsFromTemplates,
  normalizeEventOfficialPositions,
  normalizeOfficialSchedulingMode,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';
import { buildEmailVerificationRequiredResponse, isUserEmailVerified } from '@/server/emailVerificationGate';
import { sendAdminEventCreatedNotification } from '@/server/adminNotifications';
import { getEventTagsForEventIds } from '@/server/eventTags';
import { refreshBroadcastPresentationForEvent } from '@/server/broadcast/presentation';
import {
  normalizeManualPaymentInstructions,
  normalizeManualPaymentLinks,
  normalizeRegistrationPaymentMode,
} from '@/lib/manualRegistrationPayments';

export const dynamic = 'force-dynamic';

const CREATE_EVENT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

const createSchema = z.object({
  id: z.string().min(1),
  event: z.record(z.string(), z.unknown()),
  newFields: z.array(z.record(z.string(), z.unknown())).optional(),
  timeSlots: z.array(z.record(z.string(), z.unknown())).optional(),
  leagueScoringConfig: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

const EVENT_CREATE_FORBIDDEN_EVENT_KEYS = new Set<string>([
  'fields',
  'timeSlots',
  'teams',
  'matches',
  'players',
  'officials',
  'assistantHosts',
  'organization',
  'sport',
  'leagueConfig',
  'leagueScoringConfig',
  'staffInvites',
]);

const EVENT_CREATE_ID_LIST_FIELDS = [
  'assistantHostIds',
  'fieldIds',
  'teamIds',
  'userIds',
  'timeSlotIds',
  'requiredTemplateIds',
] as const;

const isStringIdArray = (value: unknown): boolean => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
);

const coerceArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return undefined;
};

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

const normalizeDivisionSortOrder = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const compareDivisionRowsByStoredOrder = <T extends {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
}>(left: T, right: T): number => {
  const leftOrder = normalizeDivisionSortOrder(left.sortOrder);
  const rightOrder = normalizeDivisionSortOrder(right.sortOrder);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  const nameCompare = String(left.name ?? '').localeCompare(String(right.name ?? ''));
  return nameCompare || String(left.id ?? '').localeCompare(String(right.id ?? ''));
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

const fallbackAttendeeCount = (event: { teamSignup?: boolean | null; userIds?: unknown }): number => {
  if (event.teamSignup) {
    return 0;
  }
  return (coerceArray(event.userIds) ?? []).length;
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

const normalizeInstallmentRelativeDayList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
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
      sourceDivisionId: true,
      key: true,
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
  const map: Record<string, string[]> = {};
  for (const key of normalizedKeys) {
    const row = rowsById.get(key)
      ?? rowsByKey.get(key)
      ?? rowsByKey.get(extractDivisionTokenFromId(key) ?? '');
    map[key] = normalizeFieldIds(row?.fieldIds ?? []);
  }
  return map;
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
    installmentDueRelativeDays?: unknown;
    installmentAmounts?: unknown;
  },
): Promise<Array<Record<string, unknown>>> => {
  void eventDefaults;
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
      sourceDivisionId: true,
      key: true,
      name: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      playoffTeamCount: true,
      allowPaymentPlans: true,
      installmentCount: true,
      installmentDueDates: true,
      installmentDueRelativeDays: true,
      installmentAmounts: true,
      divisionTypeId: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
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

  const details = normalizedKeys.map((divisionId) => {
    const row = rowsById.get(divisionId)
      ?? rowsByKey.get(divisionId)
      ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
      ?? null;
    const inferred = inferDivisionDetails({
      identifier: row?.key ?? row?.id ?? divisionId,
      sportInput: row?.sportId ?? undefined,
      fallbackName: row?.name ?? undefined,
    });
    const divisionTypeId = row?.divisionTypeId ?? inferred.divisionTypeId;
    const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
    const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
    const divisionTypeName = deriveDivisionTypeDisplayName({
      sportInput: row?.sportId ?? undefined,
      gender,
      ratingType,
      divisionTypeId,
    });
    const ageEligibility = evaluateDivisionAgeEligibility({
      divisionTypeId,
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
      sourceDivisionId: row?.sourceDivisionId ?? null,
      key: row?.key ?? inferred.token,
      name: cleanDivisionDisplayName(row?.name, inferred.defaultName),
      divisionTypeId,
      skillDivisionTypeId: row?.skillDivisionTypeId ?? null,
      ageDivisionTypeId: row?.ageDivisionTypeId ?? null,
      divisionTypeName,
      ratingType,
      gender,
      sportId: row?.sportId ?? null,
      price: typeof row?.price === 'number'
        ? row.price
        : null,
      maxParticipants: typeof row?.maxParticipants === 'number'
        ? row.maxParticipants
        : null,
      playoffTeamCount: typeof row?.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : null,
      allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
        ? row.allowPaymentPlans
        : null,
      installmentCount: typeof row?.installmentCount === 'number'
        ? row.installmentCount
        : null,
      installmentDueDates: Array.isArray(row?.installmentDueDates)
        ? row.installmentDueDates
            .map((entry) => parseDateInput(entry))
            .filter((entry): entry is Date => entry instanceof Date && !Number.isNaN(entry.getTime()))
            .map((entry) => entry.toISOString())
        : [],
      installmentDueRelativeDays: Array.isArray((row as any)?.installmentDueRelativeDays)
        ? normalizeInstallmentRelativeDayList((row as any).installmentDueRelativeDays)
        : [],
      installmentAmounts: Array.isArray(row?.installmentAmounts)
        ? normalizeInstallmentAmountList(row.installmentAmounts)
        : [],
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
      teamIds: normalizeTeamIds((row as any)?.teamIds),
    };
  });

  return details;
};

const getDivisionDetailsForEvents = async (
  events: Array<{ id: string; sportId?: string | null }>,
): Promise<Map<string, Array<Record<string, unknown>>>> => {
  const eventIds = events.map((event) => event.id).filter(Boolean);

  const detailsByEventId = new Map<string, Array<Record<string, unknown>>>();
  if (!eventIds.length) {
    return detailsByEventId;
  }

  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId: { in: eventIds },
      OR: [
        { kind: 'LEAGUE' },
        { kind: null },
      ],
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
    select: {
      eventId: true,
      id: true,
      sourceDivisionId: true,
      key: true,
      name: true,
      sortOrder: true,
      sportId: true,
      price: true,
      maxParticipants: true,
      divisionTypeId: true,
      skillDivisionTypeId: true,
      ageDivisionTypeId: true,
      ratingType: true,
      gender: true,
    },
  });
  const rows = Array.isArray(rawRows) ? rawRows : [];

  const rowsByEventId = new Map<string, Array<(typeof rows)[number]>>();
  rows.forEach((row) => {
    if (!row.eventId) {
      return;
    }
    const existing = rowsByEventId.get(row.eventId) ?? [];
    existing.push(row);
    rowsByEventId.set(row.eventId, existing);
  });

  events.forEach((event) => {
    const eventRows = [...(rowsByEventId.get(event.id) ?? [])].sort(compareDivisionRowsByStoredOrder);
    const details = eventRows.map((row) => {
      const inferred = inferDivisionDetails({
        identifier: row.key ?? row.id,
        sportInput: row.sportId ?? event.sportId ?? undefined,
        fallbackName: row.name ?? undefined,
      });
      const divisionTypeId = row.divisionTypeId ?? inferred.divisionTypeId;
      const ratingType = normalizeDivisionRatingType(row.ratingType) ?? inferred.ratingType;
      const gender = normalizeDivisionGender(row.gender) ?? inferred.gender;
      const divisionTypeName = deriveDivisionTypeDisplayName({
        sportInput: row.sportId ?? event.sportId ?? undefined,
        gender,
        ratingType,
        divisionTypeId,
      });

      return {
        id: row.id,
        sourceDivisionId: row.sourceDivisionId ?? null,
        key: row.key ?? inferred.token,
        name: cleanDivisionDisplayName(row.name, inferred.defaultName),
        divisionTypeId,
        skillDivisionTypeId: row.skillDivisionTypeId ?? null,
        ageDivisionTypeId: row.ageDivisionTypeId ?? null,
        divisionTypeName,
        ratingType,
        gender,
        sportId: row.sportId ?? event.sportId ?? null,
        price: typeof row.price === 'number' ? row.price : null,
        maxParticipants: typeof row.maxParticipants === 'number' ? row.maxParticipants : null,
      };
    });

    detailsByEventId.set(event.id, details);
  });

  return detailsByEventId;
};

const withLegacyEvent = (row: any) => {
  const legacy = withLegacyFields(row);
  if (!Array.isArray((legacy as any).divisions)) {
    (legacy as any).divisions = Array.isArray((legacy as any).divisionDetails)
      ? (legacy as any).divisionDetails
          .map((detail: any) => (typeof detail?.id === 'string' ? detail.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : [];
  }
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
  if ((legacy as any).officialSchedulingMode === 'TEAM_STAFFING') {
    (legacy as any).doTeamsOfficiate = true;
  }
  if (!Array.isArray((legacy as any).assistantHostIds)) {
    (legacy as any).assistantHostIds = [];
  }
  if (!Array.isArray(legacy.requiredTemplateIds)) {
    (legacy as any).requiredTemplateIds = [];
  }
  (legacy as any).registrationPaymentMode = normalizeRegistrationPaymentMode((legacy as any).registrationPaymentMode);
  (legacy as any).manualPaymentLinks = normalizeManualPaymentLinks((legacy as any).manualPaymentLinks);
  (legacy as any).manualPaymentInstructions = normalizeManualPaymentInstructions(
    (legacy as any).manualPaymentInstructions,
  );
  if (typeof (legacy as any).noFixedEndDateTime !== 'boolean') {
    (legacy as any).noFixedEndDateTime = false;
  }
  if ((legacy as any).doTeamsOfficiate !== true) {
    (legacy as any).teamOfficialsMaySwap = false;
  } else if (typeof (legacy as any).teamOfficialsMaySwap !== 'boolean') {
    (legacy as any).teamOfficialsMaySwap = false;
  }
  const legacyTeamCheckInMode = typeof (legacy as any).teamCheckInMode === 'string'
    ? (legacy as any).teamCheckInMode.trim().toUpperCase()
    : 'OFF';
  (legacy as any).teamCheckInMode =
    (legacy as any).teamSignup === true && ['OFF', 'EVENT', 'MATCH'].includes(legacyTeamCheckInMode)
      ? legacyTeamCheckInMode
      : 'OFF';
  const legacyOpenMinutes = Number((legacy as any).teamCheckInOpenMinutesBefore);
  (legacy as any).teamCheckInOpenMinutesBefore = Number.isFinite(legacyOpenMinutes)
    ? Math.max(0, Math.trunc(legacyOpenMinutes))
    : 60;
  (legacy as any).allowMatchRosterEdits =
    (legacy as any).teamSignup === true && typeof (legacy as any).allowMatchRosterEdits === 'boolean'
      ? Boolean((legacy as any).allowMatchRosterEdits)
      : false;
  (legacy as any).allowTemporaryMatchPlayers =
    (legacy as any).allowMatchRosterEdits === true && typeof (legacy as any).allowTemporaryMatchPlayers === 'boolean'
      ? Boolean((legacy as any).allowTemporaryMatchPlayers)
      : false;
  return legacy;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => (
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  )
);

const loadEventOrganizationsById = async (
  events: Array<{ organizationId?: string | null }>,
): Promise<Map<string, Record<string, unknown>>> => {
  const organizationIds = uniqueStrings(events.map((event) => event.organizationId));
  if (!organizationIds.length) {
    return new Map();
  }

  const organizations = await prisma.organizations.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      logoId: true,
    },
  });
  return new Map(organizations.map((organization) => [organization.id, organization]));
};

const buildEventResponsePayload = async (event: any) => {
  const [eventOfficialRows, sportRow] = await Promise.all([
    typeof (prisma as any).eventOfficials?.findMany === 'function'
      ? (prisma as any).eventOfficials.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    event.sportId
      ? prisma.sports.findUnique({
          where: { id: event.sportId },
          select: { officialPositionTemplates: true } as any,
        })
      : Promise.resolve(null),
  ]);
  const sportPositions = buildEventOfficialPositionsFromTemplates(
    event.id,
    normalizeSportOfficialPositionTemplates((sportRow as any)?.officialPositionTemplates),
  );
  let officialPositions = (() => {
    const explicit = normalizeEventOfficialPositions((event as any).officialPositions, event.id);
    if (explicit.length) {
      return explicit;
    }
    return sportPositions;
  })();
  if (!officialPositions.length && eventOfficialRows.length) {
    officialPositions = buildEventOfficialPositionsFromTemplates(event.id, [{ name: 'Official', count: 1 }]);
  }
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
    : [];
  const legacyDivisionKeys = normalizeDivisionKeys(event.divisions);
  const divisionKeys = legacyDivisionKeys.length
    ? legacyDivisionKeys
    : (await prisma.divisions.findMany({
        where: {
          eventId: event.id,
          OR: [
            { kind: 'LEAGUE' },
            { kind: null },
          ],
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
          { name: 'asc' },
          { id: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      }))
        .sort(compareDivisionRowsByStoredOrder)
        .map((row) => row.id);
  const [divisionFieldIds, divisionDetails, tagsByEventId] = await Promise.all([
    getDivisionFieldMapForEvent(event.id, divisionKeys),
    getDivisionDetailsForEvent(event.id, divisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentDueRelativeDays: (event as any).installmentDueRelativeDays,
      installmentAmounts: event.installmentAmounts,
    }),
    getEventTagsForEventIds([event.id]),
  ]);

  return withLegacyEvent({
    ...event,
    officialSchedulingMode: normalizeOfficialSchedulingMode((event as any).officialSchedulingMode),
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official: { userId: string }) => official.userId),
    divisionFieldIds,
    divisionDetails,
    tags: tagsByEventId.get(event.id) ?? [],
  });
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

const isFixedEndValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('No fixed end date/time')
    || message.includes('No fixed end datetime scheduling')
    || message.includes('End date/time must be after start date/time');
};

const isDivisionAssignmentValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('assigned to more than one division')
    || normalized.includes('assigned to multiple divisions')
    || normalized.includes('do not match the composite division type');
};

const isOrganizationFieldRequirementError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Select or create at least one field for this event');
};

const isTryoutValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Tryout events')
    || message.includes('club and team features')
    || message.includes('club division');
};

const resolveSessionContext = async (
  req: NextRequest,
): Promise<{ userId: string; isAdmin: boolean } | null> => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }
  const session = verifySessionToken(token);
  if (!session) {
    return null;
  }
  const userId = typeof session.userId === 'string' ? session.userId.trim() : '';
  if (!userId) {
    return null;
  }
  const authUser = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { disabledAt: true, sessionVersion: true },
  });
  if (!authUser || authUser.disabledAt || !isSessionTokenCurrent(session, authUser.sessionVersion)) {
    return null;
  }
  return {
    userId,
    isAdmin: Boolean(session.isAdmin),
  };
};

const loadHiddenEventIdsForSessionUser = async (
  sessionUserId: string | null,
  isAdmin: boolean,
): Promise<string[]> => {
  if (!sessionUserId || isAdmin) {
    return [];
  }

  const user = await prisma.userData.findUnique({
    where: { id: sessionUserId },
    select: { hiddenEventIds: true },
  });

  return Array.from(
    new Set(
      (user?.hiddenEventIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
};

const HIDDEN_EVENT_STATES = ['UNPUBLISHED', 'PRIVATE'] as const;

const isHiddenEventStateFilter = (
  value: string | undefined,
): value is (typeof HIDDEN_EVENT_STATES)[number] => (
  value === 'UNPUBLISHED' || value === 'PRIVATE'
);

const buildDefaultEventVisibilityClause = (
  sessionUserId: string | null,
  isAdmin: boolean,
  includeManagedOrganizationDrafts: boolean = false,
) => {
  const visibilityOr: any[] = [
    { state: 'PUBLISHED' },
    { state: null },
  ];

  if (isAdmin || includeManagedOrganizationDrafts) {
    visibilityOr.push({ state: { in: [...HIDDEN_EVENT_STATES] } });
  } else if (sessionUserId) {
    visibilityOr.push({
      state: { in: [...HIDDEN_EVENT_STATES] },
      OR: [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ],
    });
  }

  return {
    AND: [
      { NOT: { state: 'TEMPLATE' } },
      { OR: visibilityOr },
    ],
  };
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const organizationId = params.get('organizationId') || undefined;
  let hostId = params.get('hostId') || undefined;
  const sportId = params.get('sportId') || undefined;
  const eventType = params.get('eventType') || undefined;
  const state = params.get('state') || undefined;
  const limit = Number(params.get('limit') || '100');
  const offset = Number(params.get('offset') || '0');
  const normalizedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), 1), 500)
    : 100;
  const normalizedOffset = Number.isFinite(offset)
    ? Math.max(Math.trunc(offset), 0)
    : 0;
  let templateSession: Awaited<ReturnType<typeof requireSession>> | null = null;

  const normalizedStateRaw = typeof state === 'string' ? state.toUpperCase() : undefined;
  const normalizedState = normalizedStateRaw === 'DRAFT' ? 'UNPUBLISHED' : normalizedStateRaw;
  const sessionContext = await resolveSessionContext(req);
  const sessionUserId = sessionContext?.userId ?? null;
  const isAdminSession = sessionContext?.isAdmin === true;
  const hiddenEventIds = await loadHiddenEventIdsForSessionUser(sessionUserId, isAdminSession);
  if (normalizedState === 'TEMPLATE') {
    templateSession = await requireSession(req);
    if (!templateSession.isAdmin) {
      if (organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: organizationId },
          select: { id: true, ownerId: true },
        });
        if (!(await hasOrgPermission(templateSession, organization, ORG_PERMISSIONS.TEMPLATES_MANAGE))) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        // Organization template visibility is org-scoped, not host-scoped.
        hostId = undefined;
      } else {
        // Personal templates are private to the signed-in host.
        if (hostId && hostId !== templateSession.userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        hostId = templateSession.userId;
      }
    }
  }

  const ids = idsParam
    ? idsParam.split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;
  const includeManagedOrganizationDrafts = (() => {
    if (normalizedState || !organizationId || !sessionContext) {
      return Promise.resolve(false);
    }
    return prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    }).then((organization) => hasOrgPermission(sessionContext, organization, ORG_PERMISSIONS.EVENTS_MANAGE));
  })();
  const canViewOrganizationDrafts = await includeManagedOrganizationDrafts;

  const where: any = { archivedAt: null };
  // Event templates are not real events and should not appear in normal lists.
  if (!normalizedState) {
    const visibilityClause = buildDefaultEventVisibilityClause(
      sessionUserId,
      isAdminSession,
      canViewOrganizationDrafts,
    );
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...visibilityClause.AND];
  }
  if (ids?.length) where.id = { in: ids };
  if (organizationId) where.organizationId = organizationId;
  if (!organizationId && normalizedState === 'TEMPLATE' && templateSession && !templateSession.isAdmin) {
    where.organizationId = null;
  }
  if (hostId) where.hostId = hostId;
  if (sportId) where.sportId = sportId;
  if (eventType) where.eventType = eventType;
  if (state) where.state = normalizedState ?? state;
  if (hiddenEventIds.length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { id: { notIn: hiddenEventIds } }];
  }
  if (isHiddenEventStateFilter(normalizedState) && !isAdminSession) {
    if (canViewOrganizationDrafts) {
      // Organization managers can view hidden events within the scoped organization.
    } else if (sessionUserId) {
      where.OR = [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ];
    } else {
      where.id = { in: [] };
    }
  }

  const fetchedEvents = await prisma.events.findMany({
    where,
    skip: normalizedOffset,
    take: normalizedLimit + 1,
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
  });
  const events = fetchedEvents.slice(0, normalizedLimit);

  const eventsWithAttendees = await withEventAttendeeCounts(events).catch((error) => {
    console.error('Failed to enrich attendee counts for events list', error);
    return events.map((event) => ({
      ...event,
      attendees: fallbackAttendeeCount(event),
    }));
  });

  const divisionDetailsByEventId = await getDivisionDetailsForEvents(
    eventsWithAttendees.map((event) => ({
      id: event.id,
      sportId: event.sportId,
    })),
  ).catch((error) => {
    console.error('Failed to enrich division details for events list', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });

  const eventsWithParticipantIds = await withDerivedEventParticipantIds(eventsWithAttendees).catch((error) => {
    console.error('Failed to enrich participant ids for events list', error);
    return eventsWithAttendees.map((event) => ({
      ...event,
      teamIds: [],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
    }));
  });
  const officialIdsByEventId = await getEventOfficialIdsByEventIds(
    eventsWithParticipantIds.map((event) => event.id),
  ).catch((error) => {
    console.error('Failed to enrich official ids for events list', error);
    return new Map<string, string[]>();
  });
  const tagsByEventId = await getEventTagsForEventIds(
    eventsWithParticipantIds.map((event) => event.id),
  ).catch((error) => {
    console.error('Failed to enrich tags for events list', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });
  const organizationsById = await loadEventOrganizationsById(eventsWithParticipantIds).catch((error) => {
    console.error('Failed to enrich event organizations for events list', error);
    return new Map<string, Record<string, unknown>>();
  });

  const normalized = eventsWithParticipantIds.map((row) => {
    const divisionDetails = divisionDetailsByEventId.get(row.id) ?? [];
    const organizationId = typeof row.organizationId === 'string' ? row.organizationId : '';
    return withLegacyEvent({
      ...row,
      organization: organizationId ? organizationsById.get(organizationId) ?? null : null,
      officialIds: officialIdsByEventId.get(row.id) ?? [],
      divisions: divisionDetails.map((division) => division.id).filter((id): id is string => typeof id === 'string'),
      divisionDetails,
      tags: tagsByEventId.get(row.id) ?? [],
    });
  });

  return NextResponse.json({
    events: normalized,
    pagination: {
      limit: normalizedLimit,
      offset: normalizedOffset,
      nextOffset: normalizedOffset + events.length,
      hasMore: fetchedEvents.length > normalizedLimit,
    },
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!await isUserEmailVerified(session.userId)) {
    return buildEmailVerificationRequiredResponse('create_event');
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const eventId = parsed.data.id.trim();
  const commandEvent = parsed.data.event as Record<string, unknown>;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });
  }
  if (typeof commandEvent.id === 'string' && commandEvent.id.trim().length > 0 && commandEvent.id.trim() !== eventId) {
    return NextResponse.json({ error: 'Event id mismatch between top-level id and event.id.' }, { status: 400 });
  }
  if (typeof (commandEvent as any).$id === 'string' && String((commandEvent as any).$id).trim().length > 0) {
    return NextResponse.json({ error: 'Legacy event.$id is not allowed in create payload.' }, { status: 400 });
  }

  const forbiddenEventKeys = Object.keys(commandEvent)
    .filter((key) => EVENT_CREATE_FORBIDDEN_EVENT_KEYS.has(key));
  if (forbiddenEventKeys.length) {
    return NextResponse.json(
      {
        error: 'Hydrated relationship objects are not allowed in event create payload.',
        fields: forbiddenEventKeys,
      },
      { status: 400 },
    );
  }

  const invalidIdListField = EVENT_CREATE_ID_LIST_FIELDS.find((fieldName) => (
    Object.prototype.hasOwnProperty.call(commandEvent, fieldName)
    && !isStringIdArray(commandEvent[fieldName])
  ));
  if (invalidIdListField) {
    return NextResponse.json(
      { error: `event.${invalidIdListField} must be an array of ids.` },
      { status: 400 },
    );
  }

  if (parsed.data.newFields?.some((row) => typeof row.id !== 'string' || row.id.trim().length === 0)) {
    return NextResponse.json({ error: 'Each new field must include a non-empty id.' }, { status: 400 });
  }
  if (parsed.data.timeSlots?.some((row) => typeof row.id !== 'string' || row.id.trim().length === 0)) {
    return NextResponse.json({ error: 'Each timeslot must include a non-empty id.' }, { status: 400 });
  }

  const existingEvent = await prisma.events.findUnique({
    where: { id: eventId },
  });
  if (existingEvent) {
    const canAccessExisting = await canManageEvent(session, existingEvent);
    if (!canAccessExisting) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await buildEventResponsePayload(existingEvent);
    return NextResponse.json(
      {
        event: payload,
        alreadyCreated: true,
        code: 'EVENT_ALREADY_CREATED',
        message: 'Event already exists for this id; returning existing event.',
      },
      { status: 200 },
    );
  }

  const organizationId = typeof commandEvent.organizationId === 'string'
    ? commandEvent.organizationId.trim()
    : '';
  if (organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true, enabledFeatures: true },
    });
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }
    if (!await hasOrgPermission(session, organization, ORG_PERMISSIONS.EVENTS_MANAGE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const eventType = typeof commandEvent.eventType === 'string' ? commandEvent.eventType.toUpperCase() : 'EVENT';
    const requiredFeature = eventType === 'TRYOUT' ? 'CLUB_TEAMS' : 'EVENT_MANAGEMENT';
    if (!organization.enabledFeatures.includes(requiredFeature)) {
      return NextResponse.json({
        error: eventType === 'TRYOUT'
          ? 'Enable club and team features before creating tryout events.'
          : 'Enable event management tools before creating events.',
      }, { status: 400 });
    }
  }

  const requestedHostId = typeof commandEvent.hostId === 'string' && commandEvent.hostId.trim().length > 0
    ? commandEvent.hostId.trim()
    : session.userId;
  const authoritativeHostId = session.isAdmin ? requestedHostId : session.userId;
  const eventPayload: Record<string, unknown> = {
    ...commandEvent,
    id: eventId,
    hostId: authoritativeHostId,
  };
  if (Array.isArray(parsed.data.newFields) && parsed.data.newFields.length > 0) {
    eventPayload.fields = parsed.data.newFields;
  }
  if (Array.isArray(parsed.data.timeSlots) && parsed.data.timeSlots.length > 0) {
    eventPayload.timeSlots = parsed.data.timeSlots;
  }
  if (Object.prototype.hasOwnProperty.call(parsed.data, 'leagueScoringConfig')) {
    eventPayload.leagueScoringConfig = parsed.data.leagueScoringConfig;
  }

  try {
    assertEventContentAllowed({
      name: eventPayload.name,
      description: eventPayload.description,
    });
  } catch (error) {
    if (error instanceof EventContentFilterError) {
      return NextResponse.json(
        {
          error: error.message,
          matches: error.matches,
        },
        { status: 400 },
      );
    }
    throw error;
  }

  try {
    const context = buildContext();
    const created = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      await upsertEventFromPayload(eventPayload, tx);

      const loaded = await loadEventWithRelations(eventId, tx);
      let didRebuildSchedule = false;
      if (isSchedulableEventType(loaded.eventType)) {
        const scheduled = scheduleEvent({ event: loaded }, context);
        await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
        await deleteMatchesByEvent(eventId, tx);
        await saveMatches(eventId, scheduled.matches, tx);
        await saveEventSchedule(scheduled.event, tx);
        didRebuildSchedule = true;
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to create event');
      }
      return { event: fresh, didRebuildSchedule };
    }, CREATE_EVENT_TRANSACTION_OPTIONS);

    const { event, didRebuildSchedule } = created;
    if (didRebuildSchedule) {
      await refreshBroadcastPresentationForEvent({
        eventId,
        reason: 'SCHEDULE_CHANGE',
      }).catch((error) => {
        console.error('[broadcast-overlay] Presentation refresh failed after event creation schedule', {
          eventId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }

    const payload = await buildEventResponsePayload(event);
    const notificationBaseUrl = getRequestOrigin(req);
    void notifySocialAudienceOfEventCreation({
      eventId: event.id,
      hostId: event.hostId,
      eventName: event.name,
      eventStart: event.start,
      location: event.location,
      baseUrl: notificationBaseUrl,
    }).catch((notificationError) => {
      console.error('Post-create social notification failed', notificationError);
    });
    await sendAdminEventCreatedNotification({
      event,
      baseUrl: notificationBaseUrl,
    }).catch((notificationError) => {
      console.warn('Failed to send admin event creation notification', {
        eventId: event.id,
        error: notificationError,
      });
    });
    return NextResponse.json(
      { event: payload },
      { status: 201 },
    );
  } catch (error) {
    if (isEventFieldConflictError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          conflicts: error.conflicts.map((conflict) => ({
            fieldId: conflict.fieldId,
            parentId: conflict.parentId,
            start: conflict.start.toISOString(),
            end: conflict.end.toISOString(),
          })),
        },
        { status: 409 },
      );
    }
    if (isRentalBookingReservationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isFixedEndValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid schedule window';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isDivisionAssignmentValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid division team assignments';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isOrganizationFieldRequirementError(error)) {
      const message = error instanceof Error ? error.message : 'Organization field is required';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isTryoutValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid tryout event';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isLeaguePlayoffTeamCountValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid playoff team count';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof EventContentFilterError) {
      return NextResponse.json(
        {
          error: error.message,
          matches: error.matches,
        },
        { status: 400 },
      );
    }
    console.error('Create event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
