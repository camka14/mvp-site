import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import { requireSession } from '@/lib/permissions';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import { withEventAttendeeCounts } from '@/app/api/events/participantCounts';
import {
  deleteMatchesByEvent,
  isEventFieldConflictError,
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
import { evaluateDivisionAgeEligibility, extractDivisionTokenFromId, inferDivisionDetails } from '@/lib/divisionTypes';
import { notifySocialAudienceOfEventCreation } from '@/server/eventCreationNotifications';
import {
  buildEventOfficialPositionsFromTemplates,
  deriveEventOfficialsFromLegacyOfficialIds,
  normalizeEventOfficialPositions,
  normalizeOfficialSchedulingMode,
  normalizeSportOfficialPositionTemplates,
} from '@/server/officials/config';

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
  'officialIds',
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

const fallbackAttendeeCount = (event: { teamSignup?: boolean | null; teamIds?: unknown; userIds?: unknown }): number => {
  if (event.teamSignup) {
    return normalizeTeamIds(event.teamIds).length;
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
      price: typeof row?.price === 'number'
        ? row.price
        : (typeof eventDefaults?.price === 'number' ? eventDefaults.price : null),
      maxParticipants: typeof row?.maxParticipants === 'number'
        ? row.maxParticipants
        : (typeof eventDefaults?.maxParticipants === 'number' ? eventDefaults.maxParticipants : null),
      playoffTeamCount: typeof row?.playoffTeamCount === 'number'
        ? row.playoffTeamCount
        : (typeof eventDefaults?.playoffTeamCount === 'number' ? eventDefaults.playoffTeamCount : null),
      allowPaymentPlans: typeof row?.allowPaymentPlans === 'boolean'
        ? row.allowPaymentPlans
        : normalizeOptionalBoolean(eventDefaults?.allowPaymentPlans),
      installmentCount: typeof row?.installmentCount === 'number'
        ? row.installmentCount
        : (
          typeof eventDefaults?.installmentCount === 'number'
            ? Math.max(0, Math.trunc(eventDefaults.installmentCount))
            : null
        ),
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
      teamIds: normalizeTeamIds((row as any)?.teamIds),
    };
  });

  return details;
};

const getDivisionDetailsForEvents = async (
  events: Array<{ id: string; divisions: unknown; sportId?: string | null }>,
): Promise<Map<string, Array<Record<string, unknown>>>> => {
  const normalizedDivisionsByEventId = new Map<string, string[]>();
  const eventIds = events
    .map((event) => {
      const normalizedDivisions = normalizeDivisionKeys(event.divisions);
      normalizedDivisionsByEventId.set(event.id, normalizedDivisions);
      return normalizedDivisions.length > 0 ? event.id : null;
    })
    .filter((eventId): eventId is string => Boolean(eventId));

  const detailsByEventId = new Map<string, Array<Record<string, unknown>>>();
  if (!eventIds.length) {
    return detailsByEventId;
  }

  const rawRows = await prisma.divisions.findMany({
    where: {
      eventId: { in: eventIds },
    },
    select: {
      eventId: true,
      id: true,
      key: true,
      name: true,
      sportId: true,
      maxParticipants: true,
      divisionTypeId: true,
      divisionTypeName: true,
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
    const normalizedDivisions = normalizedDivisionsByEventId.get(event.id) ?? [];
    if (!normalizedDivisions.length) {
      detailsByEventId.set(event.id, []);
      return;
    }

    const eventRows = rowsByEventId.get(event.id) ?? [];
    const rowsById = new Map<string, (typeof eventRows)[number]>();
    const rowsByKey = new Map<string, (typeof eventRows)[number]>();
    eventRows.forEach((row) => {
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

    const details = normalizedDivisions.map((divisionId) => {
      const row = rowsById.get(divisionId)
        ?? rowsByKey.get(divisionId)
        ?? rowsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
        ?? null;
      const inferred = inferDivisionDetails({
        identifier: row?.key ?? row?.id ?? divisionId,
        sportInput: row?.sportId ?? event.sportId ?? undefined,
        fallbackName: row?.name ?? undefined,
      });

      return {
        id: row?.id ?? divisionId,
        key: row?.key ?? inferred.token,
        name: row?.name ?? inferred.defaultName,
        divisionTypeId: row?.divisionTypeId ?? inferred.divisionTypeId,
        divisionTypeName: row?.divisionTypeName ?? inferred.divisionTypeName,
        ratingType: row?.ratingType ?? inferred.ratingType,
        gender: row?.gender ?? inferred.gender,
        sportId: row?.sportId ?? event.sportId ?? null,
        maxParticipants: typeof row?.maxParticipants === 'number' ? row.maxParticipants : null,
      };
    });

    detailsByEventId.set(event.id, details);
  });

  return detailsByEventId;
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
    const start = legacy.start ? new Date(legacy.start) : null;
    const end = legacy.end ? new Date(legacy.end) : null;
    (legacy as any).noFixedEndDateTime = Boolean(
      start
      && !Number.isNaN(start.getTime())
      && (
        !end
        || (
          !Number.isNaN(end.getTime())
          && start.getTime() === end.getTime()
        )
      ),
    );
  }
  if ((legacy as any).doTeamsOfficiate !== true) {
    (legacy as any).teamOfficialsMaySwap = false;
  } else if (typeof (legacy as any).teamOfficialsMaySwap !== 'boolean') {
    (legacy as any).teamOfficialsMaySwap = false;
  }
  return legacy;
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
  const officialPositions = (() => {
    const explicit = normalizeEventOfficialPositions((event as any).officialPositions, event.id);
    if (explicit.length) {
      return explicit;
    }
    return sportPositions;
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
  const divisionKeys = normalizeDivisionKeys(event.divisions);
  const [divisionFieldIds, divisionDetails] = await Promise.all([
    getDivisionFieldMapForEvent(event.id, divisionKeys),
    getDivisionDetailsForEvent(event.id, divisionKeys, event.start, {
      price: event.price,
      maxParticipants: event.maxParticipants,
      playoffTeamCount: event.playoffTeamCount,
      allowPaymentPlans: event.allowPaymentPlans,
      installmentCount: event.installmentCount,
      installmentDueDates: event.installmentDueDates,
      installmentAmounts: event.installmentAmounts,
    }),
  ]);

  return withLegacyEvent({
    ...event,
    officialSchedulingMode: normalizeOfficialSchedulingMode((event as any).officialSchedulingMode),
    officialPositions,
    eventOfficials,
    officialIds: eventOfficials.map((official: { userId: string }) => official.userId),
    divisionFieldIds,
    divisionDetails,
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
    || message.includes('End date/time must be after start date/time');
};

const isDivisionAssignmentValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('assigned to more than one division')
    || normalized.includes('assigned to multiple divisions');
};

const resolveSessionContext = (
  req: NextRequest,
): { userId: string; isAdmin: boolean } | null => {
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
  return {
    userId,
    isAdmin: Boolean(session.isAdmin),
  };
};

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
    visibilityOr.push({ state: 'UNPUBLISHED' });
  } else if (sessionUserId) {
    visibilityOr.push({
      state: 'UNPUBLISHED',
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
  let templateSession: Awaited<ReturnType<typeof requireSession>> | null = null;

  const normalizedStateRaw = typeof state === 'string' ? state.toUpperCase() : undefined;
  const normalizedState = normalizedStateRaw === 'DRAFT' ? 'UNPUBLISHED' : normalizedStateRaw;
  const sessionContext = resolveSessionContext(req);
  const sessionUserId = sessionContext?.userId ?? null;
  const isAdminSession = sessionContext?.isAdmin === true;
  if (normalizedState === 'TEMPLATE') {
    templateSession = await requireSession(req);
    if (!templateSession.isAdmin) {
      if (organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: organizationId },
          select: { id: true, ownerId: true, hostIds: true, officialIds: true },
        });
        if (!(await canManageOrganization(templateSession, organization))) {
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
      select: { id: true, ownerId: true, hostIds: true, officialIds: true },
    }).then((organization) => canManageOrganization(sessionContext, organization));
  })();
  const canViewOrganizationDrafts = await includeManagedOrganizationDrafts;

  const where: any = {};
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
  if (normalizedState === 'UNPUBLISHED' && !isAdminSession) {
    if (sessionUserId) {
      where.OR = [
        { hostId: sessionUserId },
        { assistantHostIds: { has: sessionUserId } },
      ];
    } else {
      where.id = { in: [] };
    }
  }

  const events = await prisma.events.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { start: 'asc' },
  });

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
      divisions: event.divisions,
      sportId: event.sportId,
    })),
  ).catch((error) => {
    console.error('Failed to enrich division details for events list', error);
    return new Map<string, Array<Record<string, unknown>>>();
  });

  const normalized = eventsWithAttendees.map((row) => {
    if (!Array.isArray(row.userIds)) {
      row.userIds = coerceArray(row.userIds) ?? [];
    }
    return withLegacyEvent({
      ...row,
      divisionDetails: divisionDetailsByEventId.get(row.id) ?? [],
    });
  });

  return NextResponse.json({ events: normalized }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
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

  const hostIdFromPayload = typeof commandEvent.hostId === 'string' && commandEvent.hostId.trim().length > 0
    ? commandEvent.hostId.trim()
    : session.userId;
  const eventPayload: Record<string, unknown> = {
    ...commandEvent,
    id: eventId,
    hostId: hostIdFromPayload,
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
    const context = buildContext();
    const event = await prisma.$transaction(async (tx) => {
      await upsertEventFromPayload(eventPayload, tx);

      const loaded = await loadEventWithRelations(eventId, tx);
      if (isSchedulableEventType(loaded.eventType)) {
        await acquireEventLock(tx, eventId);
        const scheduled = scheduleEvent({ event: loaded }, context);
        await persistScheduledRosterTeams({ eventId, scheduled: scheduled.event }, tx);
        await deleteMatchesByEvent(eventId, tx);
        await saveMatches(eventId, scheduled.matches, tx);
        await saveEventSchedule(scheduled.event, tx);
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to create event');
      }
      return fresh;
    }, CREATE_EVENT_TRANSACTION_OPTIONS);

    const payload = await buildEventResponsePayload(event);
    void notifySocialAudienceOfEventCreation({
      eventId: event.id,
      hostId: event.hostId,
      eventName: event.name,
      eventStart: event.start,
      location: event.location,
      baseUrl: req.nextUrl.origin,
    }).catch((notificationError) => {
      console.error('Post-create social notification failed', notificationError);
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
    console.error('Create event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
