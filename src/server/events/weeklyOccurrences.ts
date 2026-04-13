import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { parseDateInput } from '@/server/legacyFormat';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type WeeklyEventLike = {
  id: string;
  eventType?: unknown;
  parentEvent?: unknown;
  divisions?: unknown;
  timeSlotIds?: unknown;
};

export type WeeklyOccurrenceInput = {
  slotId?: string | null;
  occurrenceDate?: string | null;
};

export type ResolvedWeeklyOccurrence = {
  slotId: string;
  occurrenceDate: string;
  slot: any;
  divisionIds: string[];
};

export const WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR = 'This weekly occurrence has already started. Joining is closed.';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .map((entry) => normalizeId(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    )
    : []
);

const normalizeOccurrenceDateInternal = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return normalized;
};

const parseOccurrenceDateValue = (value: string): Date | null => {
  const normalized = normalizeOccurrenceDateInternal(value);
  if (!normalized) {
    return null;
  }
  const [year, month, day] = normalized.split('-').map(Number);
  if ([year, month, day].some(Number.isNaN)) {
    return null;
  }
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const dateOnlyFromInput = (value: unknown): string | null => {
  const parsed = parseDateInput(value);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
};

const normalizeSlotDays = (slot: any): number[] => {
  const days: unknown[] = Array.isArray(slot?.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : Number.isInteger(slot?.dayOfWeek)
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      days
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  );
};

const toMondayIndex = (occurrenceDate: string): number => {
  const parsed = new Date(`${occurrenceDate}T00:00:00.000Z`);
  return (parsed.getUTCDay() + 6) % 7;
};

const matchesSlotOccurrenceDate = (slot: any, occurrenceDate: string): boolean => {
  const slotDays = normalizeSlotDays(slot);
  if (!slotDays.length) {
    return false;
  }

  if (!slotDays.includes(toMondayIndex(occurrenceDate))) {
    return false;
  }

  const slotStartDate = dateOnlyFromInput(slot?.startDate);
  if (!slotStartDate || occurrenceDate < slotStartDate) {
    return false;
  }

  const slotEndDate = dateOnlyFromInput(slot?.endDate);
  if (slotEndDate && slotEndDate > slotStartDate && occurrenceDate > slotEndDate) {
    return false;
  }

  return true;
};

export const normalizeOccurrenceDate = (value: unknown): string | null => normalizeOccurrenceDateInternal(value);

export const occurrenceDateFromDate = (value: Date): string => value.toISOString().slice(0, 10);

export const resolveWeeklyOccurrenceStartAt = (slot: any, occurrenceDate: string): Date | null => {
  const occurrenceStart = parseOccurrenceDateValue(occurrenceDate);
  if (!occurrenceStart) {
    return null;
  }

  const startMinutes = typeof slot?.startTimeMinutes === 'number' && Number.isFinite(slot.startTimeMinutes)
    ? Math.max(0, Math.trunc(slot.startTimeMinutes))
    : 0;
  occurrenceStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  return occurrenceStart;
};

export const isWeeklyOccurrenceJoinClosed = (
  occurrence: Pick<ResolvedWeeklyOccurrence, 'slot' | 'occurrenceDate'> | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!occurrence) {
    return false;
  }

  const startsAt = resolveWeeklyOccurrenceStartAt(occurrence.slot, occurrence.occurrenceDate);
  if (!startsAt) {
    return false;
  }
  return now.getTime() >= startsAt.getTime();
};

export const isWeeklyParentEvent = (event: WeeklyEventLike | null | undefined): boolean => {
  const normalizedType = typeof event?.eventType === 'string' ? event.eventType.trim().toUpperCase() : '';
  return normalizedType === 'WEEKLY_EVENT' && !normalizeId(event?.parentEvent);
};

export const resolveWeeklyOccurrence = async (
  params: {
    event: WeeklyEventLike;
    occurrence: WeeklyOccurrenceInput;
  },
  client: PrismaLike = prisma,
): Promise<{ ok: true; value: ResolvedWeeklyOccurrence } | { ok: false; error: string }> => {
  if (!isWeeklyParentEvent(params.event)) {
    return { ok: false, error: 'Weekly occurrence context is only available on parent weekly events.' };
  }

  const slotId = normalizeId(params.occurrence.slotId);
  const occurrenceDate = normalizeOccurrenceDateInternal(params.occurrence.occurrenceDate);
  if (!slotId || !occurrenceDate) {
    return { ok: false, error: 'slotId and occurrenceDate are required for weekly event actions.' };
  }

  const eventSlotIds = normalizeIdList(params.event.timeSlotIds);
  if (!eventSlotIds.includes(slotId)) {
    return { ok: false, error: 'Selected weekly occurrence does not belong to this event.' };
  }

  const slot = await client.timeSlots.findUnique({
    where: { id: slotId },
  });
  if (!slot) {
    return { ok: false, error: 'Selected weekly timeslot was not found.' };
  }

  if (!matchesSlotOccurrenceDate(slot, occurrenceDate)) {
    return { ok: false, error: 'Selected date is not valid for the chosen weekly timeslot.' };
  }

  const divisionIds = normalizeIdList((slot as any).divisions);
  const fallbackDivisionIds = normalizeIdList(params.event.divisions);
  return {
    ok: true,
    value: {
      slotId,
      occurrenceDate,
      slot,
      divisionIds: divisionIds.length ? divisionIds : fallbackDivisionIds,
    },
  };
};
