import { advisoryLockId } from '@/server/repositories/locks';
import {
  EventFieldConflictError,
  assertNoEventFieldSchedulingConflicts,
} from '@/server/repositories/events';
import {
  parseDateInputInTimeZone,
  resolveTimeZone,
} from '@/server/timeZones';

export const RENTAL_CHECKOUT_LOCK_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER = 12;

type PrismaLike = any;

export type RentalCheckoutWindow = {
  eventId: string;
  fieldIds: string[];
  start: Date;
  end: Date;
  timeZone: string;
  noFixedEndDateTime: boolean;
  organizationId: string | null;
  eventType: string;
  parentEvent: string | null;
};

export type RentalCheckoutLockReserveResult =
  | {
    ok: true;
    ownerToken: string;
    lockIds: string[];
    expiresAt: Date;
  }
  | {
    ok: false;
    status: number;
    error: string;
    conflictFieldIds?: string[];
    conflicts?: Array<{ fieldId: string; start: string; end: string; parentId: string | null }>;
  };

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((entry) => normalizeString(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ));
};

const extractEntityId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return normalizeString(value);
  }
  const row = value as Record<string, unknown>;
  return normalizeString(row.$id ?? row.id);
};

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null
);

const toDate = (value: unknown, timeZone: string): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return parseDateInputInTimeZone(value, timeZone);
};

const extractFieldIds = (
  eventPayload: Record<string, unknown> | null,
  timeSlotPayload: Record<string, unknown> | null,
): string[] => {
  const fromSlot = normalizeStringArray(timeSlotPayload?.scheduledFieldIds);
  if (fromSlot.length > 0) return fromSlot;
  const fromSlotSingle = normalizeString(timeSlotPayload?.scheduledFieldId);
  if (fromSlotSingle) return [fromSlotSingle];
  const fromEvent = normalizeStringArray(eventPayload?.fieldIds);
  if (fromEvent.length > 0) return fromEvent;
  const fromFields = Array.isArray(eventPayload?.fields)
    ? eventPayload.fields
      .map((field) => extractEntityId(field))
      .filter((entry): entry is string => Boolean(entry))
    : [];
  return Array.from(new Set(fromFields));
};

export const extractRentalCheckoutWindow = ({
  event,
  timeSlot,
}: {
  event: unknown;
  timeSlot: unknown;
}): { ok: true; window: RentalCheckoutWindow } | { ok: false; status: number; error: string } => {
  const eventPayload = toRecord(event);
  if (!eventPayload) {
    return { ok: false, status: 400, error: 'Event payload is required for rental checkout.' };
  }
  const timeSlotPayload = toRecord(timeSlot);
  const eventId = extractEntityId(eventPayload);
  if (!eventId) {
    return { ok: false, status: 400, error: 'Event id is required for rental checkout.' };
  }

  const timeZone = resolveTimeZone(timeSlotPayload?.timeZone ?? eventPayload.timeZone);
  const start = toDate(timeSlotPayload?.startDate ?? eventPayload.start, timeZone);
  const end = toDate(timeSlotPayload?.endDate ?? eventPayload.end, timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return { ok: false, status: 400, error: 'Rental checkout requires a valid start/end time window.' };
  }
  const fieldIds = extractFieldIds(eventPayload, timeSlotPayload);
  if (!fieldIds.length) {
    return { ok: false, status: 400, error: 'Rental checkout requires at least one field selection.' };
  }

  return {
    ok: true,
    window: {
      eventId,
      fieldIds,
      start,
      end,
      timeZone,
      noFixedEndDateTime: Boolean(eventPayload.noFixedEndDateTime),
      organizationId: normalizeString(eventPayload.organizationId ?? extractEntityId(eventPayload.organization)),
      eventType: (normalizeString(eventPayload.eventType) ?? 'EVENT').toUpperCase(),
      parentEvent: normalizeString(eventPayload.parentEvent),
    },
  };
};

export const buildRentalCheckoutLockOwnerToken = (userId: string, eventId: string): string =>
  `rental:${userId}:${eventId}`;

const buildRentalCheckoutLockId = (fieldId: string, start: Date, end: Date): string =>
  `rental-checkout:${fieldId}:${start.toISOString()}:${end.toISOString()}`;

type NormalizedWindowSet = {
  eventId: string;
  windows: RentalCheckoutWindow[];
  fieldIds: string[];
  lockIds: string[];
};

const normalizeRentalCheckoutWindowSet = (
  windows: RentalCheckoutWindow[],
): { ok: true; value: NormalizedWindowSet } | { ok: false; result: RentalCheckoutLockReserveResult } => {
  if (!Array.isArray(windows) || windows.length === 0) {
    return {
      ok: false,
      result: { ok: false, status: 400, error: 'Rental checkout requires at least one time window.' },
    };
  }
  const eventIds = new Set<string>();
  const distinctRows = new Map<string, RentalCheckoutWindow>();

  for (const window of windows) {
    const eventId = normalizeString(window?.eventId);
    const start = window?.start instanceof Date && !Number.isNaN(window.start.getTime()) ? window.start : null;
    const end = window?.end instanceof Date && !Number.isNaN(window.end.getTime()) ? window.end : null;
    const fieldIds = normalizeStringArray(window?.fieldIds);
    if (!eventId || !start || !end || end.getTime() <= start.getTime() || !fieldIds.length) {
      return {
        ok: false,
        result: { ok: false, status: 400, error: 'Rental checkout contains an invalid field or time window.' },
      };
    }
    eventIds.add(eventId);
    for (const fieldId of fieldIds) {
      const key = buildRentalCheckoutLockId(fieldId, start, end);
      if (!distinctRows.has(key)) {
        distinctRows.set(key, {
          ...window,
          eventId,
          fieldIds: [fieldId],
          start,
          end,
        });
      }
    }
  }
  if (eventIds.size !== 1) {
    return {
      ok: false,
      result: { ok: false, status: 400, error: 'Rental checkout windows must belong to one event.' },
    };
  }
  if (distinctRows.size > MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER) {
    return {
      ok: false,
      result: {
        ok: false,
        status: 429,
        error: 'You have too many active rental checkout reservations. Complete or cancel an existing checkout first.',
      },
    };
  }

  const normalizedWindows = Array.from(distinctRows.values()).sort((left, right) => {
    const fieldComparison = left.fieldIds[0].localeCompare(right.fieldIds[0]);
    if (fieldComparison !== 0) return fieldComparison;
    const startComparison = left.start.getTime() - right.start.getTime();
    return startComparison !== 0 ? startComparison : left.end.getTime() - right.end.getTime();
  });
  return {
    ok: true,
    value: {
      eventId: normalizedWindows[0].eventId,
      windows: normalizedWindows,
      fieldIds: Array.from(new Set(normalizedWindows.map((window) => window.fieldIds[0]))).sort(),
      lockIds: normalizedWindows.map((window) => (
        buildRentalCheckoutLockId(window.fieldIds[0], window.start, window.end)
      )),
    },
  };
};

type ParsedRentalCheckoutLock = {
  fieldId: string;
  start: Date;
  end: Date;
};

const ISO_INSTANT = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z';
const RENTAL_LOCK_ID_PATTERN = new RegExp(`^rental-checkout:(.+):(${ISO_INSTANT}):(${ISO_INSTANT})$`);

const parseRentalCheckoutLockId = (id: string): ParsedRentalCheckoutLock | null => {
  const match = RENTAL_LOCK_ID_PATTERN.exec(id);
  if (!match) return null;
  const start = new Date(match[2]);
  const end = new Date(match[3]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  return { fieldId: match[1], start, end };
};

const windowsOverlap = (
  left: Pick<ParsedRentalCheckoutLock, 'start' | 'end'>,
  right: Pick<ParsedRentalCheckoutLock, 'start' | 'end'>,
): boolean => left.start.getTime() < right.end.getTime() && right.start.getTime() < left.end.getTime();

const conflictResponseFromError = (error: EventFieldConflictError): RentalCheckoutLockReserveResult => ({
  ok: false,
  status: 409,
  error: error.message,
  conflictFieldIds: Array.from(new Set(error.conflicts.map((conflict) => conflict.fieldId))),
  conflicts: error.conflicts.map((conflict) => ({
    fieldId: conflict.fieldId,
    parentId: conflict.parentId,
    start: conflict.start.toISOString(),
    end: conflict.end.toISOString(),
  })),
});

export const reserveRentalCheckoutWindowLocks = async ({
  client,
  windows,
  userId,
  now = new Date(),
  ttlMs = RENTAL_CHECKOUT_LOCK_TTL_MS,
}: {
  client: PrismaLike;
  windows: RentalCheckoutWindow[];
  userId: string;
  now?: Date;
  ttlMs?: number;
}): Promise<RentalCheckoutLockReserveResult> => {
  const normalized = normalizeRentalCheckoutWindowSet(windows);
  if (!normalized.ok) return normalized.result;
  const { eventId, windows: desiredWindows, fieldIds, lockIds } = normalized.value;
  const ownerToken = buildRentalCheckoutLockOwnerToken(userId, eventId);
  const expiresAt = new Date(now.getTime() + ttlMs);

  return client.$transaction(async (tx: PrismaLike) => {
    const userLockId = advisoryLockId(`rental-checkout-user:${userId}`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userLockId})`;
    for (const fieldId of fieldIds) {
      const fieldLockId = advisoryLockId(`rental-checkout-field:${fieldId}`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${fieldLockId})`;
    }

    for (const window of desiredWindows) {
      try {
        await assertNoEventFieldSchedulingConflicts({
          client: tx,
          eventId: window.eventId,
          organizationId: window.organizationId,
          fieldIds: window.fieldIds,
          timeSlotIds: [],
          start: window.start,
          end: window.end,
          noFixedEndDateTime: window.noFixedEndDateTime,
          eventType: window.eventType,
          parentEvent: window.parentEvent,
        });
      } catch (error) {
        if (error instanceof EventFieldConflictError) {
          return conflictResponseFromError(error);
        }
        throw error;
      }
    }

    const relevantLocks = await tx.lockFiles.findMany({
      where: {
        OR: fieldIds.map((fieldId) => ({
          id: { startsWith: `rental-checkout:${fieldId}:` },
        })),
      },
      select: { id: true, docId: true, expires: true },
    }) as Array<{ id: string; docId: string | null; expires: Date }>;
    const activeRelevantLocks = relevantLocks.filter((lock) => (
      lock.expires.getTime() > now.getTime()
    ));
    const heldByOthers = activeRelevantLocks.filter((lock) => {
      if (lock.docId === ownerToken) return false;
      const parsed = parseRentalCheckoutLockId(lock.id);
      return Boolean(parsed && desiredWindows.some((window) => (
        window.fieldIds[0] === parsed.fieldId && windowsOverlap(window, parsed)
      )));
    });
    if (heldByOthers.length > 0) {
      const conflictFieldIds = Array.from(new Set(
        heldByOthers
          .map((lock) => parseRentalCheckoutLockId(lock.id)?.fieldId ?? null)
          .filter((fieldId): fieldId is string => Boolean(fieldId)),
      ));
      return {
        ok: false,
        status: 409,
        error: 'Selected fields and time range are temporarily reserved by another checkout.',
        conflictFieldIds,
      };
    }

    const activeUserLocks = await tx.lockFiles.findMany({
      where: {
        docId: { startsWith: `rental:${userId}:` },
        expires: { gt: now },
      },
      select: { id: true, docId: true },
    }) as Array<{ id: string; docId: string | null }>;
    const retainedOtherCheckoutLockIds = new Set(
      activeUserLocks
        .filter((lock) => lock.docId !== ownerToken)
        .map((lock) => lock.id),
    );
    const projectedActiveLockCount = retainedOtherCheckoutLockIds.size
      + lockIds.filter((lockId) => !retainedOtherCheckoutLockIds.has(lockId)).length;
    if (projectedActiveLockCount > MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER) {
      return {
        ok: false,
        status: 429,
        error: 'You have too many active rental checkout reservations. Complete or cancel an existing checkout first.',
      };
    }

    await tx.lockFiles.deleteMany({
      where: {
        docId: ownerToken,
        id: {
          startsWith: 'rental-checkout:',
          notIn: lockIds,
        },
      },
    });
    const expiredRelevantLockIds = relevantLocks
      .filter((lock) => lock.expires.getTime() <= now.getTime())
      .map((lock) => lock.id);
    if (expiredRelevantLockIds.length > 0) {
      await tx.lockFiles.deleteMany({
        where: { id: { in: expiredRelevantLockIds } },
      });
    }

    for (const lockId of lockIds) {
      await tx.lockFiles.upsert({
        where: { id: lockId },
        create: {
          id: lockId,
          createdAt: now,
          updatedAt: now,
          docId: ownerToken,
          expires: expiresAt,
        },
        update: {
          updatedAt: now,
          docId: ownerToken,
          expires: expiresAt,
        },
      });
    }

    return { ok: true, ownerToken, lockIds, expiresAt };
  });
};

export const releaseRentalCheckoutWindowLocks = async ({
  client,
  windows,
  userId,
}: {
  client: PrismaLike;
  windows: RentalCheckoutWindow[];
  userId: string;
}): Promise<void> => {
  const normalized = normalizeRentalCheckoutWindowSet(windows);
  if (!normalized.ok) return;
  const ownerToken = buildRentalCheckoutLockOwnerToken(userId, normalized.value.eventId);
  await client.lockFiles.deleteMany({
    where: {
      id: { in: normalized.value.lockIds },
      docId: ownerToken,
    },
  });
};

/** Compatibility wrapper for callers that still submit one aggregate window. */
export const reserveRentalCheckoutLocks = async ({
  client,
  window,
  userId,
  now = new Date(),
  ttlMs = RENTAL_CHECKOUT_LOCK_TTL_MS,
}: {
  client: PrismaLike;
  window: RentalCheckoutWindow;
  userId: string;
  now?: Date;
  ttlMs?: number;
}): Promise<RentalCheckoutLockReserveResult> => reserveRentalCheckoutWindowLocks({
  client,
  windows: [window],
  userId,
  now,
  ttlMs,
});

/** Compatibility wrapper for callers that still submit one aggregate window. */
export const releaseRentalCheckoutLocks = async ({
  client,
  window,
  userId,
}: {
  client: PrismaLike;
  window: RentalCheckoutWindow;
  userId: string;
}): Promise<void> => releaseRentalCheckoutWindowLocks({ client, windows: [window], userId });
