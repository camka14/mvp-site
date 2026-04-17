import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);
const DAY_MS = 24 * 60 * 60 * 1000;

type TimeSlotRow = {
  id: string;
  dayOfWeek?: number | null;
  daysOfWeek?: number[] | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  repeating?: boolean | null;
  scheduledFieldId?: string | null;
  scheduledFieldIds?: string[] | null;
};

type EventRow = {
  id: string;
  eventType?: string | null;
  parentEvent?: string | null;
  start?: Date | string | null;
  end?: Date | string | null;
  noFixedEndDateTime?: boolean | null;
  timeSlotIds?: string[] | null;
  [key: string]: unknown;
};

type TimeWindow = {
  start: Date;
  end: Date;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseBooleanQueryParam = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const normalizeStringList = (value: unknown): string[] => {
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

const normalizeWeekdays = (slot: Pick<TimeSlotRow, 'dayOfWeek' | 'daysOfWeek'>): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

const normalizeToDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toMondayIndex = (date: Date): number => (date.getDay() + 6) % 7;

const setMinutesOnDay = (day: Date, minutes: number): Date => {
  const result = new Date(day.getTime());
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
};

const rangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const slotFieldIds = (slot: Pick<TimeSlotRow, 'scheduledFieldId' | 'scheduledFieldIds'>): string[] => {
  const fromList = normalizeStringList(slot.scheduledFieldIds);
  if (fromList.length > 0) {
    return fromList;
  }
  const fallback = normalizeId(slot.scheduledFieldId);
  return fallback ? [fallback] : [];
};

const isSchedulableSlotEventType = (eventType: string): boolean =>
  eventType === 'LEAGUE' || eventType === 'TOURNAMENT';

const isWeeklyParentEventType = (eventType: string, parentEvent: string | null): boolean =>
  eventType === 'WEEKLY_EVENT' && !parentEvent;

const hasOpenEndedScheduling = (event: EventRow): boolean =>
  event.noFixedEndDateTime === true;

const shouldIncludeEventType = (eventType: string, parentEvent: string | null): boolean => {
  if (eventType === 'EVENT') {
    return true;
  }
  if (isSchedulableSlotEventType(eventType)) {
    return true;
  }
  if (isWeeklyParentEventType(eventType, parentEvent)) {
    return true;
  }
  return false;
};

const slotOverlapsRange = (
  slot: TimeSlotRow,
  rangeStart: Date,
  rangeEnd: Date,
  fallbackStart?: Date | null,
  fallbackEnd?: Date | null,
): boolean => {
  const slotStart = normalizeToDate(slot.startDate ?? fallbackStart ?? null);
  if (!slotStart) {
    return false;
  }

  const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
  const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
  const repeating = slot.repeating !== false;

  if (!repeating) {
    const inferredEnd = normalizeToDate(slot.endDate ?? fallbackEnd ?? null);
    const derivedEnd = inferredEnd
      ?? (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
        ? new Date(slotStart.getTime() + (endMinutes - startMinutes) * 60 * 1000)
        : null);
    if (!derivedEnd || derivedEnd.getTime() <= slotStart.getTime()) {
      return false;
    }
    return rangesOverlap(slotStart, derivedEnd, rangeStart, rangeEnd);
  }

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return false;
  }

  const days = normalizeWeekdays(slot);
  if (!days.length) {
    return false;
  }

  const slotEnd = normalizeToDate(slot.endDate ?? fallbackEnd ?? null) ?? MAX_DATE;
  if (!rangesOverlap(slotStart, slotEnd, rangeStart, rangeEnd)) {
    return false;
  }

  const overlapStart = new Date(Math.max(slotStart.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(slotEnd.getTime(), rangeEnd.getTime()));
  if (overlapEnd.getTime() <= overlapStart.getTime()) {
    return false;
  }

  const overlapDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / DAY_MS);
  if (overlapDays >= 7) {
    return true;
  }

  const cursor = new Date(overlapStart.getTime());
  cursor.setHours(0, 0, 0, 0);
  const finalDay = new Date(overlapEnd.getTime());
  finalDay.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= finalDay.getTime()) {
    if (days.includes(toMondayIndex(cursor))) {
      const occurrenceStart = setMinutesOnDay(cursor, startMinutes);
      const occurrenceEnd = setMinutesOnDay(cursor, endMinutes);
      if (
        occurrenceEnd.getTime() > occurrenceStart.getTime()
        && rangesOverlap(occurrenceStart, occurrenceEnd, overlapStart, overlapEnd)
      ) {
        return true;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return false;
};

const eventOverlapsRange = (
  event: EventRow & { timeSlots?: TimeSlotRow[] },
  fieldId: string,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => {
  const eventType = String(event.eventType ?? '').toUpperCase();
  const parentEvent = normalizeId(event.parentEvent);
  const eventStart = normalizeToDate(event.start ?? null);
  const eventEnd = normalizeToDate(event.end ?? null);

  if (eventType === 'EVENT') {
    if (!eventStart || !eventEnd || eventEnd.getTime() <= eventStart.getTime()) {
      return false;
    }
    return rangesOverlap(eventStart, eventEnd, rangeStart, rangeEnd);
  }

  if (isSchedulableSlotEventType(eventType) || isWeeklyParentEventType(eventType, parentEvent)) {
    if (!Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
      return false;
    }
    const fallbackEnd = hasOpenEndedScheduling(event) ? null : eventEnd;

    return event.timeSlots.some((slot) => (
      slotFieldIds(slot).includes(fieldId)
      && slotOverlapsRange(slot, rangeStart, rangeEnd, eventStart, fallbackEnd)
    ));
  }

  return false;
};

const buildSlotWindowsInRange = (
  slot: TimeSlotRow,
  rangeStart: Date,
  rangeEnd: Date,
  fallbackStart?: Date | null,
  fallbackEnd?: Date | null,
): TimeWindow[] => {
  const windows: TimeWindow[] = [];
  const slotStart = normalizeToDate(slot.startDate ?? fallbackStart ?? null);
  if (!slotStart) {
    return windows;
  }

  const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
  const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
  const repeating = slot.repeating !== false;

  if (!repeating) {
    const inferredEnd = normalizeToDate(slot.endDate ?? fallbackEnd ?? null);
    const derivedEnd = inferredEnd
      ?? (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
        ? new Date(slotStart.getTime() + (endMinutes - startMinutes) * 60 * 1000)
        : null);
    if (!derivedEnd || derivedEnd.getTime() <= slotStart.getTime()) {
      return windows;
    }
    if (rangesOverlap(slotStart, derivedEnd, rangeStart, rangeEnd)) {
      windows.push({
        start: new Date(Math.max(slotStart.getTime(), rangeStart.getTime())),
        end: new Date(Math.min(derivedEnd.getTime(), rangeEnd.getTime())),
      });
    }
    return windows;
  }

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return windows;
  }

  const days = normalizeWeekdays(slot);
  if (!days.length) {
    return windows;
  }

  const slotEnd = normalizeToDate(slot.endDate ?? fallbackEnd ?? null) ?? MAX_DATE;
  if (!rangesOverlap(slotStart, slotEnd, rangeStart, rangeEnd)) {
    return windows;
  }

  const overlapStart = new Date(Math.max(slotStart.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(slotEnd.getTime(), rangeEnd.getTime()));
  if (overlapEnd.getTime() <= overlapStart.getTime()) {
    return windows;
  }

  const cursor = new Date(overlapStart.getTime());
  cursor.setHours(0, 0, 0, 0);
  const finalDay = new Date(overlapEnd.getTime());
  finalDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= finalDay.getTime()) {
    if (days.includes(toMondayIndex(cursor))) {
      const occurrenceStart = setMinutesOnDay(cursor, startMinutes);
      const occurrenceEnd = setMinutesOnDay(cursor, endMinutes);
      if (
        occurrenceEnd.getTime() > occurrenceStart.getTime()
        && rangesOverlap(occurrenceStart, occurrenceEnd, overlapStart, overlapEnd)
      ) {
        windows.push({
          start: new Date(Math.max(occurrenceStart.getTime(), overlapStart.getTime())),
          end: new Date(Math.min(occurrenceEnd.getTime(), overlapEnd.getTime())),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
};

const rangesOverlapAnyWindow = (start: Date, end: Date, windows: TimeWindow[]): boolean =>
  windows.some((window) => rangesOverlap(start, end, window.start, window.end));

const eventOverlapsRentalWindows = (
  event: EventRow & { timeSlots?: TimeSlotRow[] },
  fieldId: string,
  rentalWindows: TimeWindow[],
  rangeStart: Date,
  rangeEnd: Date,
): boolean => {
  if (!rentalWindows.length) {
    return false;
  }

  const eventType = String(event.eventType ?? '').toUpperCase();
  const parentEvent = normalizeId(event.parentEvent);
  const eventStart = normalizeToDate(event.start ?? null);
  const eventEnd = normalizeToDate(event.end ?? null);

  if (eventType === 'EVENT') {
    if (!eventStart || !eventEnd || eventEnd.getTime() <= eventStart.getTime()) {
      return false;
    }
    return rangesOverlapAnyWindow(eventStart, eventEnd, rentalWindows);
  }

  if (isSchedulableSlotEventType(eventType) || isWeeklyParentEventType(eventType, parentEvent)) {
    if (!Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
      return false;
    }
    const fallbackEnd = hasOpenEndedScheduling(event) ? null : eventEnd;
    return event.timeSlots.some((slot) => {
      if (!slotFieldIds(slot).includes(fieldId)) {
        return false;
      }
      const slotWindows = buildSlotWindowsInRange(slot, rangeStart, rangeEnd, eventStart, fallbackEnd);
      return slotWindows.some((window) => rangesOverlapAnyWindow(window.start, window.end, rentalWindows));
    });
  }

  return false;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;
  const search = req.nextUrl.searchParams;
  const requestedStart = parseDateInput(search.get('start'));
  const requestedEnd = parseDateInput(search.get('end'));
  const rangeStart = requestedStart instanceof Date && !Number.isNaN(requestedStart.getTime()) ? requestedStart : MIN_DATE;
  const rangeEnd = requestedEnd instanceof Date && !Number.isNaN(requestedEnd.getTime()) ? requestedEnd : MAX_DATE;
  const organizationId = normalizeId(search.get('organizationId'));
  const excludeEventId = normalizeId(search.get('excludeEventId'));
  const rentalOverlapOnly = parseBooleanQueryParam(search.get('rentalOverlapOnly'));

  const where: Record<string, unknown> = {
    fieldIds: { has: fieldId },
    NOT: { state: 'TEMPLATE' },
    start: { lte: rangeEnd },
    OR: [
      { noFixedEndDateTime: true },
      { end: null },
      { end: { gte: rangeStart } },
    ],
  };
  if (organizationId) {
    where.organizationId = organizationId;
  }
  if (excludeEventId) {
    where.id = { not: excludeEventId };
  }

  const events = await prisma.events.findMany({
    where: where as any,
    orderBy: { start: 'asc' },
    ...(rentalOverlapOnly
      ? {
        select: {
          id: true,
          eventType: true,
          parentEvent: true,
          start: true,
          end: true,
          noFixedEndDateTime: true,
          timeSlotIds: true,
        },
      }
      : {}),
  });

  const filteredByType = events.filter((event) => {
    const eventType = String(event.eventType ?? '').toUpperCase();
    const parentEvent = normalizeId((event as any).parentEvent);
    return shouldIncludeEventType(eventType, parentEvent);
  });

  const fieldsDelegate = ((prisma as any).fields ?? (prisma as any).volleyBallFields) as {
    findFirst?: (args: any) => Promise<{ rentalSlotIds?: string[] | null } | null>;
  };
  const field = fieldsDelegate?.findFirst
    ? await fieldsDelegate.findFirst({
      where: {
        id: fieldId,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        rentalSlotIds: true,
      },
    })
    : null;
  const rentalSlotIds = normalizeStringList(field?.rentalSlotIds);
  const allFieldRentalSlotRows = rentalSlotIds.length > 0
    ? await prisma.timeSlots.findMany({
      where: {
        id: { in: rentalSlotIds },
      },
      ...(rentalOverlapOnly
        ? {
          select: {
            id: true,
            dayOfWeek: true,
            daysOfWeek: true,
            startTimeMinutes: true,
            endTimeMinutes: true,
            startDate: true,
            endDate: true,
            repeating: true,
            scheduledFieldId: true,
            scheduledFieldIds: true,
          },
        }
        : {}),
    })
    : [];
  const rentalSlotRowsInRange = allFieldRentalSlotRows.filter((slot) => (
    slotFieldIds(slot).includes(fieldId)
    && slotOverlapsRange(slot, rangeStart, rangeEnd)
  ));
  const rentalWindows = rentalOverlapOnly
    ? rentalSlotRowsInRange.flatMap((slot) => buildSlotWindowsInRange(slot, rangeStart, rangeEnd))
    : [];

  const allEventSlotIds = Array.from(
    new Set(
      filteredByType.flatMap((event) => normalizeStringList((event as any).timeSlotIds)),
    ),
  );
  const eventSlotRows = allEventSlotIds.length > 0
    ? await prisma.timeSlots.findMany({
      where: { id: { in: allEventSlotIds } },
      ...(rentalOverlapOnly
        ? {
          select: {
            id: true,
            dayOfWeek: true,
            daysOfWeek: true,
            startTimeMinutes: true,
            endTimeMinutes: true,
            startDate: true,
            endDate: true,
            repeating: true,
            scheduledFieldId: true,
            scheduledFieldIds: true,
          },
        }
        : {}),
    })
    : [];
  const eventSlotById = new Map<string, TimeSlotRow>(eventSlotRows.map((slot) => [slot.id, slot]));
  const hydratedEvents = filteredByType.map((event) => {
    const slotIds = normalizeStringList((event as any).timeSlotIds);
    const timeSlots = slotIds.flatMap((slotId) => {
      const slot = eventSlotById.get(slotId);
      return slot ? [slot] : [];
    });
    return {
      ...event,
      timeSlots,
    };
  });

  const filteredEvents = hydratedEvents
    .filter((event) => eventOverlapsRange(event, fieldId, rangeStart, rangeEnd))
    .filter((event) => (
      !rentalOverlapOnly || eventOverlapsRentalWindows(event, fieldId, rentalWindows, rangeStart, rangeEnd)
    ));

  const eventBoundSlotIds = new Set(
    filteredEvents.flatMap((event) => normalizeStringList((event as any).timeSlotIds)),
  );
  const filteredRentalSlots = rentalSlotRowsInRange.filter((slot) => !eventBoundSlotIds.has(slot.id));

  return NextResponse.json({
    events: filteredEvents.map((event) => withLegacyFields(event)),
    rentalSlots: filteredRentalSlots.map((slot) => withLegacyFields(slot)),
  }, { status: 200 });
}
