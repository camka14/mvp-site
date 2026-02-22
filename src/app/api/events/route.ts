import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageOrganization } from '@/server/accessControl';
import { deleteMatchesByEvent, loadEventWithRelations, saveEventSchedule, saveMatches, upsertEventFromPayload } from '@/server/repositories/events';
import { acquireEventLock } from '@/server/repositories/locks';
import { scheduleEvent, ScheduleError } from '@/server/scheduler/scheduleEvent';
import { SchedulerContext } from '@/server/scheduler/types';
import { withLegacyFields } from '@/server/legacyFormat';
import { evaluateDivisionAgeEligibility, extractDivisionTokenFromId, inferDivisionDetails } from '@/lib/divisionTypes';
import { notifySocialAudienceOfEventCreation } from '@/server/eventCreationNotifications';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string().optional(),
  event: z.record(z.string(), z.any()).optional(),
}).passthrough();

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
      price: typeof row?.price === 'number' ? row.price : null,
      maxParticipants: typeof row?.maxParticipants === 'number' ? row.maxParticipants : null,
      playoffTeamCount: typeof row?.playoffTeamCount === 'number' ? row.playoffTeamCount : null,
      ageCutoffDate,
      ageCutoffLabel: row?.ageCutoffLabel ?? ageEligibility.message ?? null,
      ageCutoffSource: row?.ageCutoffSource ?? (ageEligibility.applies ? ageEligibility.cutoffRule.source : null),
      fieldIds: normalizeFieldIds(row?.fieldIds ?? []),
    };
  });

  return details;
};

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
    const start = legacy.start ? new Date(legacy.start) : null;
    const end = legacy.end ? new Date(legacy.end) : null;
    (legacy as any).noFixedEndDateTime = Boolean(
      start
      && end
      && !Number.isNaN(start.getTime())
      && !Number.isNaN(end.getTime())
      && start.getTime() === end.getTime(),
    );
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

const isFixedEndValidationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('No fixed end date/time')
    || message.includes('End date/time must be after start date/time');
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

  const normalizedState = typeof state === 'string' ? state.toUpperCase() : undefined;
  if (normalizedState === 'TEMPLATE') {
    templateSession = await requireSession(req);
    if (!templateSession.isAdmin) {
      if (organizationId) {
        const organization = await prisma.organizations.findUnique({
          where: { id: organizationId },
          select: { ownerId: true, hostIds: true },
        });
        if (!canManageOrganization(templateSession, organization)) {
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

  const where: any = {};
  // Event templates are not real events and should not appear in normal lists.
  if (!normalizedState) {
    where.NOT = { state: 'TEMPLATE' };
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

  const events = await prisma.events.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { start: 'asc' },
  });

  const normalized = events.map((row) => {
    if (!Array.isArray(row.userIds)) {
      row.userIds = coerceArray(row.userIds) ?? [];
    }
    return withLegacyEvent(row);
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

  const payload = parsed.data.event ?? parsed.data;
  const eventId = parsed.data.id ?? payload?.id ?? payload?.$id;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const eventPayload = {
    ...payload,
    id: eventId,
    hostId: payload?.hostId ?? session.userId,
  } as Record<string, unknown>;

  try {
    const context = buildContext();
    const event = await prisma.$transaction(async (tx) => {
      await upsertEventFromPayload(eventPayload, tx);

      const loaded = await loadEventWithRelations(eventId, tx);
      if (isSchedulableEventType(loaded.eventType)) {
        await acquireEventLock(tx, eventId);
        const scheduled = scheduleEvent({ event: loaded }, context);
        await deleteMatchesByEvent(eventId, tx);
        await saveMatches(eventId, scheduled.matches, tx);
        await saveEventSchedule(scheduled.event, tx);
      }

      const fresh = await tx.events.findUnique({ where: { id: eventId } });
      if (!fresh) {
        throw new Error('Failed to create event');
      }
      return fresh;
    });

    const divisionKeys = normalizeDivisionKeys(event.divisions);
    const [divisionFieldIds, divisionDetails] = await Promise.all([
      getDivisionFieldMapForEvent(event.id, divisionKeys),
      getDivisionDetailsForEvent(event.id, divisionKeys, event.start),
    ]);
    await notifySocialAudienceOfEventCreation({
      eventId: event.id,
      hostId: event.hostId,
      eventName: event.name,
      eventStart: event.start,
      location: event.location,
      baseUrl: req.nextUrl.origin,
    });
    return NextResponse.json(
      { event: withLegacyEvent({ ...event, divisionFieldIds, divisionDetails }) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ScheduleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isFixedEndValidationError(error)) {
      const message = error instanceof Error ? error.message : 'Invalid schedule window';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('Create event failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
