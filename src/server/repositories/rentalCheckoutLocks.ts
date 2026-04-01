import { advisoryLockId } from '@/server/repositories/locks';
import {
  EventFieldConflictError,
  assertNoEventFieldSchedulingConflicts,
} from '@/server/repositories/events';

export const RENTAL_CHECKOUT_LOCK_TTL_MS = 10 * 60 * 1000;

type PrismaLike = any;

export type RentalCheckoutWindow = {
  eventId: string;
  fieldIds: string[];
  start: Date;
  end: Date;
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
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
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

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractFieldIds = (eventPayload: Record<string, unknown> | null, timeSlotPayload: Record<string, unknown> | null): string[] => {
  const fromSlot = normalizeStringArray(timeSlotPayload?.scheduledFieldIds);
  if (fromSlot.length > 0) {
    return fromSlot;
  }

  const fromSlotSingle = normalizeString(timeSlotPayload?.scheduledFieldId);
  if (fromSlotSingle) {
    return [fromSlotSingle];
  }

  const fromEvent = normalizeStringArray(eventPayload?.fieldIds);
  if (fromEvent.length > 0) {
    return fromEvent;
  }

  const fromFields = Array.isArray(eventPayload?.fields)
    ? eventPayload?.fields
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

  const start = toDate(timeSlotPayload?.startDate ?? eventPayload.start);
  const end = toDate(timeSlotPayload?.endDate ?? eventPayload.end);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return { ok: false, status: 400, error: 'Rental checkout requires a valid start/end time window.' };
  }

  const fieldIds = extractFieldIds(eventPayload, timeSlotPayload);
  if (!fieldIds.length) {
    return { ok: false, status: 400, error: 'Rental checkout requires at least one field selection.' };
  }

  const organizationId = normalizeString(
    eventPayload.organizationId
    ?? extractEntityId(eventPayload.organization),
  );
  const eventType = (normalizeString(eventPayload.eventType) ?? 'EVENT').toUpperCase();
  const parentEvent = normalizeString(eventPayload.parentEvent);
  const noFixedEndDateTime = Boolean(eventPayload.noFixedEndDateTime);

  return {
    ok: true,
    window: {
      eventId,
      fieldIds,
      start,
      end,
      noFixedEndDateTime,
      organizationId,
      eventType,
      parentEvent,
    },
  };
};

export const buildRentalCheckoutLockOwnerToken = (userId: string, eventId: string): string =>
  `rental:${userId}:${eventId}`;

const buildRentalCheckoutLockId = (fieldId: string, start: Date, end: Date): string =>
  `rental-checkout:${fieldId}:${start.toISOString()}:${end.toISOString()}`;

const buildRentalCheckoutLockIds = (window: RentalCheckoutWindow): string[] => (
  window.fieldIds.map((fieldId) => buildRentalCheckoutLockId(fieldId, window.start, window.end))
);

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
}): Promise<RentalCheckoutLockReserveResult> => {
  const ownerToken = buildRentalCheckoutLockOwnerToken(userId, window.eventId);
  const lockIds = buildRentalCheckoutLockIds(window);
  const expiresAt = new Date(now.getTime() + ttlMs);

  return client.$transaction(async (tx: PrismaLike) => {
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

    const lockGroupId = advisoryLockId(`rental-checkout-group:${lockIds.slice().sort().join('|')}`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockGroupId})`;

    await tx.lockFiles.deleteMany({
      where: {
        id: { in: lockIds },
        expires: { lte: now },
      },
    });

    const existingLocks = await tx.lockFiles.findMany({
      where: {
        id: { in: lockIds },
      },
      select: { id: true, docId: true, expires: true },
    });

    const heldByOthers = existingLocks.filter((lock: { docId: string | null; expires: Date }) => (
      lock.expires.getTime() > now.getTime()
      && lock.docId !== null
      && lock.docId !== ownerToken
    ));

    if (heldByOthers.length > 0) {
      const conflictingLockIds = new Set(heldByOthers.map((lock: { id: string }) => lock.id));
      const conflictFieldIds = window.fieldIds.filter((fieldId) => (
        conflictingLockIds.has(buildRentalCheckoutLockId(fieldId, window.start, window.end))
      ));
      return {
        ok: false,
        status: 409,
        error: 'Selected fields and time range are temporarily reserved by another checkout.',
        conflictFieldIds,
      };
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

    return {
      ok: true,
      ownerToken,
      lockIds,
      expiresAt,
    };
  });
};

export const releaseRentalCheckoutLocks = async ({
  client,
  window,
  userId,
}: {
  client: PrismaLike;
  window: RentalCheckoutWindow;
  userId: string;
}): Promise<void> => {
  const ownerToken = buildRentalCheckoutLockOwnerToken(userId, window.eventId);
  const lockIds = buildRentalCheckoutLockIds(window);
  if (!lockIds.length) {
    return;
  }
  await client.lockFiles.deleteMany({
    where: {
      id: { in: lockIds },
      docId: ownerToken,
    },
  });
};
