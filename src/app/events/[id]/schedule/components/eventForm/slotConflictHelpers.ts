import type { Event, TimeSlot } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';

import { formatEventDateTimeForForm } from './dateHelpers';
import { normalizeDivisionKeys } from './divisionForm';
import { hasParentEventRef } from './eventRules';
import { normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';
import { slotDateTimeRangesOverlap, slotsOverlap } from './slotValidation';

type EventType = Event['eventType'];

export const CONFLICT_LOOKUP_START = '1970-01-01T00:00:00.000Z';
export const CONFLICT_LOOKUP_END = '2100-01-01T00:00:00.000Z';

const AUTO_RESOLVE_STEP_MINUTES = 15;
const AUTO_RESOLVE_MAX_STEPS = 96;
const MAX_REPEATING_CONFLICT_SCAN_DAYS = 730;

export type SlotConflictSnapshot = {
    key: string;
    $id?: string;
    scheduledFieldId?: string;
    scheduledFieldIds: string[];
    dayOfWeek?: number;
    daysOfWeek: number[];
    divisions: string[];
    startDate?: string;
    endDate?: string;
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    repeating: boolean;
};

export type SlotConflictPayload = {
    eventId: string;
    eventType: EventType;
    parentEvent?: string | null;
    eventStart?: string;
    eventEnd?: string;
    slots: SlotConflictSnapshot[];
};

export type SlotConflictContext = {
    eventId: string;
    eventStart?: string;
    eventEnd?: string;
};

type BuildSlotConflictPayloadOptions = {
    eventId?: string | null;
    eventType: EventType;
    parentEvent?: string | null;
    eventStart?: string | null;
    eventEnd?: string | null;
    slots: LeagueSlotForm[];
};

type ComparableConflictSlot = {
    repeating?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    dayOfWeek?: number;
    daysOfWeek?: number[];
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    scheduledFieldId?: string;
    scheduledFieldIds?: string[];
};

const addMinutesToDate = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60 * 1000);

const atStartOfDay = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const withMinutesOnDay = (day: Date, minutes: number): Date =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);

const mondayFirstDay = (date: Date): number => (date.getDay() + 6) % 7;

const parseEventRange = (event: Event): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(event.start ?? null);
    const end = parseLocalDateTime(event.end ?? null);
    if (!start || !end || end.getTime() <= start.getTime()) {
        return null;
    }
    return { start, end };
};

const resolveSlotWindowRange = (
    slot: Pick<ComparableConflictSlot, 'startDate' | 'endDate'>,
    eventStart?: string,
    eventEnd?: string,
): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(slot.startDate ?? eventStart ?? null);
    if (!start) {
        return null;
    }

    const end = parseLocalDateTime(slot.endDate ?? eventEnd ?? null)
        ?? addMinutesToDate(start, 90 * 24 * 60);
    if (end.getTime() <= start.getTime()) {
        return null;
    }

    return { start, end };
};

const repeatingSlotOverlapsEvent = (
    slot: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    eventRange: { start: Date; end: Date },
    eventStart?: string,
    eventEnd?: string,
): boolean => {
    const slotDays = normalizeWeekdays(slot);
    if (
        !slotDays.length ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number' ||
        slot.endTimeMinutes <= slot.startTimeMinutes
    ) {
        return false;
    }

    const slotWindow = resolveSlotWindowRange(slot, eventStart, eventEnd);
    if (!slotWindow || !slotDateTimeRangesOverlap(slotWindow.start, slotWindow.end, eventRange.start, eventRange.end)) {
        return false;
    }

    const overlapStart = new Date(Math.max(slotWindow.start.getTime(), eventRange.start.getTime()));
    const overlapEnd = new Date(Math.min(slotWindow.end.getTime(), eventRange.end.getTime()));
    if (overlapEnd.getTime() <= overlapStart.getTime()) {
        return false;
    }

    let cursor = atStartOfDay(overlapStart);
    const lastDay = atStartOfDay(overlapEnd);
    let scannedDays = 0;

    while (cursor.getTime() <= lastDay.getTime() && scannedDays <= MAX_REPEATING_CONFLICT_SCAN_DAYS) {
        if (slotDays.includes(mondayFirstDay(cursor))) {
            const slotStart = withMinutesOnDay(cursor, slot.startTimeMinutes);
            const slotEnd = withMinutesOnDay(cursor, slot.endTimeMinutes);
            if (slotDateTimeRangesOverlap(slotStart, slotEnd, eventRange.start, eventRange.end)) {
                return true;
            }
        }
        cursor = addMinutesToDate(cursor, 24 * 60);
        scannedDays += 1;
    }

    return false;
};

const parseExplicitSlotRange = (
    slot: Pick<ComparableConflictSlot, 'startDate' | 'endDate'>,
): { start: Date; end: Date } | null => {
    const start = parseLocalDateTime(slot.startDate ?? null);
    const end = parseLocalDateTime(slot.endDate ?? null);
    if (!start || !end || end.getTime() <= start.getTime()) {
        return null;
    }
    return { start, end };
};

export const buildSlotConflictSnapshot = (slot: LeagueSlotForm): SlotConflictSnapshot => {
    const normalizedDays = normalizeWeekdays(slot);
    const normalizedFieldIds = normalizeSlotFieldIds(slot);
    return {
        key: slot.key,
        $id: slot.$id,
        scheduledFieldId: normalizedFieldIds[0],
        scheduledFieldIds: normalizedFieldIds,
        dayOfWeek: normalizedDays[0],
        daysOfWeek: normalizedDays,
        divisions: normalizeDivisionKeys(slot.divisions),
        startDate: formatLocalDateTime(slot.startDate ?? null) || undefined,
        endDate: formatLocalDateTime(slot.endDate ?? null) || undefined,
        startTimeMinutes: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : undefined,
        endTimeMinutes: typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : undefined,
        repeating: slot.repeating !== false,
    };
};

export const buildSlotConflictPayload = ({
    eventId,
    eventType,
    parentEvent,
    eventStart,
    eventEnd,
    slots,
}: BuildSlotConflictPayloadOptions): SlotConflictPayload => ({
    eventId: eventId ?? '',
    eventType,
    parentEvent: parentEvent ?? null,
    eventStart: eventStart ?? undefined,
    eventEnd: eventEnd ?? undefined,
    slots: slots.map(buildSlotConflictSnapshot),
});

export const buildSlotConflictCheckKey = (options: BuildSlotConflictPayloadOptions): string => (
    JSON.stringify(buildSlotConflictPayload(options))
);

export const buildSlotConflictContext = ({
    eventId,
    eventStart,
    eventEnd,
}: Pick<BuildSlotConflictPayloadOptions, 'eventId' | 'eventStart' | 'eventEnd'>): SlotConflictContext => ({
    eventId: eventId ?? '',
    eventStart: eventStart ?? undefined,
    eventEnd: eventEnd ?? undefined,
});

export const normalizeSlotBoundaryOverrideForForm = (
    slotValue: string | Date | null | undefined,
    eventBoundary: string | Date | null | undefined,
    timeZone: string,
): string | undefined => {
    const normalizedSlotValue = formatEventDateTimeForForm(slotValue ?? null, timeZone);
    if (!normalizedSlotValue) {
        return undefined;
    }

    const normalizedEventBoundary = formatEventDateTimeForForm(eventBoundary ?? null, timeZone);
    return normalizedEventBoundary && normalizedSlotValue === normalizedEventBoundary
        ? undefined
        : normalizedSlotValue;
};

const repeatingSlotsOverlap = (
    slotA: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    contextA: { eventStart?: string; eventEnd?: string },
    slotB: Pick<ComparableConflictSlot, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    contextB: { eventStart?: string; eventEnd?: string },
): boolean => {
    const slotADays = normalizeWeekdays(slotA);
    const slotBDays = normalizeWeekdays(slotB);
    if (!slotADays.length || !slotBDays.length) {
        return false;
    }

    if (
        typeof slotA.startTimeMinutes !== 'number'
        || typeof slotA.endTimeMinutes !== 'number'
        || typeof slotB.startTimeMinutes !== 'number'
        || typeof slotB.endTimeMinutes !== 'number'
        || slotA.endTimeMinutes <= slotA.startTimeMinutes
        || slotB.endTimeMinutes <= slotB.startTimeMinutes
    ) {
        return false;
    }

    if (!slotsOverlap(slotA.startTimeMinutes, slotA.endTimeMinutes, slotB.startTimeMinutes, slotB.endTimeMinutes)) {
        return false;
    }

    const slotAWindow = resolveSlotWindowRange(slotA, contextA.eventStart, contextA.eventEnd);
    const slotBWindow = resolveSlotWindowRange(slotB, contextB.eventStart, contextB.eventEnd);
    if (!slotAWindow || !slotBWindow || !slotDateTimeRangesOverlap(slotAWindow.start, slotAWindow.end, slotBWindow.start, slotBWindow.end)) {
        return false;
    }

    const overlapStart = new Date(Math.max(slotAWindow.start.getTime(), slotBWindow.start.getTime()));
    const overlapEnd = new Date(Math.min(slotAWindow.end.getTime(), slotBWindow.end.getTime()));
    if (overlapEnd.getTime() <= overlapStart.getTime()) {
        return false;
    }

    let cursor = atStartOfDay(overlapStart);
    const lastDay = atStartOfDay(overlapEnd);
    let scannedDays = 0;

    while (cursor.getTime() <= lastDay.getTime() && scannedDays <= MAX_REPEATING_CONFLICT_SCAN_DAYS) {
        const weekday = mondayFirstDay(cursor);
        if (slotADays.includes(weekday) && slotBDays.includes(weekday)) {
            const slotAStart = withMinutesOnDay(cursor, slotA.startTimeMinutes);
            const slotAEnd = withMinutesOnDay(cursor, slotA.endTimeMinutes);
            const slotBStart = withMinutesOnDay(cursor, slotB.startTimeMinutes);
            const slotBEnd = withMinutesOnDay(cursor, slotB.endTimeMinutes);
            if (
                slotDateTimeRangesOverlap(slotAStart, slotAEnd, slotBStart, slotBEnd)
                && slotDateTimeRangesOverlap(slotAStart, slotAEnd, overlapStart, overlapEnd)
                && slotDateTimeRangesOverlap(slotBStart, slotBEnd, overlapStart, overlapEnd)
            ) {
                return true;
            }
        }

        cursor = addMinutesToDate(cursor, 24 * 60);
        scannedDays += 1;
    }

    return false;
};

const slotOverlapsExistingSlot = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    slotContext: { eventStart?: string; eventEnd?: string },
    existingSlot: Pick<ComparableConflictSlot, 'repeating' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate'>,
    existingSlotContext: { eventStart?: string; eventEnd?: string },
): boolean => {
    const slotRepeating = slot.repeating !== false;
    const existingRepeating = existingSlot.repeating !== false;

    if (!slotRepeating && !existingRepeating) {
        const slotRange = parseExplicitSlotRange(slot);
        const existingRange = parseExplicitSlotRange(existingSlot);
        if (!slotRange || !existingRange) {
            return false;
        }
        return slotDateTimeRangesOverlap(slotRange.start, slotRange.end, existingRange.start, existingRange.end);
    }

    if (slotRepeating && existingRepeating) {
        return repeatingSlotsOverlap(slot, slotContext, existingSlot, existingSlotContext);
    }

    if (slotRepeating) {
        const existingRange = parseExplicitSlotRange(existingSlot)
            ?? resolveSlotWindowRange(existingSlot, existingSlotContext.eventStart, existingSlotContext.eventEnd);
        if (!existingRange) {
            return false;
        }
        return repeatingSlotOverlapsEvent(slot, existingRange, slotContext.eventStart, slotContext.eventEnd);
    }

    const slotRange = parseExplicitSlotRange(slot)
        ?? resolveSlotWindowRange(slot, slotContext.eventStart, slotContext.eventEnd);
    if (!slotRange) {
        return false;
    }
    return repeatingSlotOverlapsEvent(existingSlot, slotRange, existingSlotContext.eventStart, existingSlotContext.eventEnd);
};

const findOverlappingEventSlotForField = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'startDate' | 'endDate' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes'>,
    event: Event,
    context: SlotConflictContext,
    fieldId?: string,
): TimeSlot | null => {
    if (!event?.$id || event.$id === context.eventId) {
        return null;
    }
    if (!Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
        return null;
    }
    const normalizedFieldId = typeof fieldId === 'string' ? fieldId.trim() : '';
    if (!normalizedFieldId) {
        return null;
    }

    const eventSlotContext = {
        eventStart: event.start ?? undefined,
        eventEnd: event.end ?? undefined,
    };

    for (const eventSlot of event.timeSlots) {
        const eventSlotFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: eventSlot.scheduledFieldId,
            scheduledFieldIds: eventSlot.scheduledFieldIds,
        });
        if (!eventSlotFieldIds.includes(normalizedFieldId)) {
            continue;
        }
        if (slotOverlapsExistingSlot(slot, context, eventSlot, eventSlotContext)) {
            return eventSlot;
        }
    }

    return null;
};

const slotOverlapsExistingEvent = (
    slot: Pick<ComparableConflictSlot, 'repeating' | 'startDate' | 'endDate' | 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes'>,
    event: Event,
    context: SlotConflictContext,
    fieldId?: string,
): boolean => {
    if (!event?.$id || event.$id === context.eventId) {
        return false;
    }

    const normalizedEventType = typeof event.eventType === 'string' ? event.eventType.toUpperCase() : '';
    const isSlotBasedEventType = (
        normalizedEventType === 'LEAGUE'
        || normalizedEventType === 'TOURNAMENT'
        || (normalizedEventType === 'WEEKLY_EVENT' && !hasParentEventRef(event.parentEvent ?? null))
    );
    const overlappingEventSlot = findOverlappingEventSlotForField(slot, event, context, fieldId);
    if (overlappingEventSlot) {
        return true;
    }
    if (isSlotBasedEventType) {
        return false;
    }

    const eventRange = parseEventRange(event);
    if (!eventRange) {
        return false;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
            return false;
        }
        return slotDateTimeRangesOverlap(slotStart, slotEnd, eventRange.start, eventRange.end);
    }

    return repeatingSlotOverlapsEvent(slot, eventRange, context.eventStart, context.eventEnd);
};

export const snapshotToSlotForm = (slot: SlotConflictSnapshot): LeagueSlotForm => ({
    key: slot.key,
    $id: slot.$id,
    scheduledFieldId: slot.scheduledFieldId,
    scheduledFieldIds: slot.scheduledFieldIds,
    dayOfWeek: slot.dayOfWeek as LeagueSlotForm['dayOfWeek'],
    daysOfWeek: slot.daysOfWeek as LeagueSlotForm['daysOfWeek'],
    divisions: slot.divisions,
    startDate: slot.startDate,
    endDate: slot.endDate,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    repeating: slot.repeating,
    conflicts: [],
    checking: false,
    error: undefined,
});

export const slotCanCheckExternalConflicts = (
    slot: LeagueSlotForm,
    context: SlotConflictContext,
): boolean => {
    if (!normalizeSlotFieldIds(slot).length) {
        return false;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
    }

    const hasTimeRange = (
        typeof slot.startTimeMinutes === 'number' &&
        typeof slot.endTimeMinutes === 'number' &&
        slot.endTimeMinutes > slot.startTimeMinutes
    );
    if (!hasTimeRange || normalizeWeekdays(slot).length === 0) {
        return false;
    }

    return Boolean(resolveSlotWindowRange(slot, context.eventStart, context.eventEnd));
};

const minutesFromDate = (value: Date | null): number | undefined => {
    if (!value) {
        return undefined;
    }
    return value.getHours() * 60 + value.getMinutes();
};

const buildConflictEntry = (
    slot: LeagueSlotForm,
    event: Event,
    fieldId: string,
    context: SlotConflictContext,
): LeagueSlotForm['conflicts'][number] => {
    const overlappingEventSlot = findOverlappingEventSlotForField(slot, event, context, fieldId);
    if (overlappingEventSlot) {
        const overlappingFieldIds = normalizeSlotFieldIds({
            scheduledFieldId: overlappingEventSlot.scheduledFieldId,
            scheduledFieldIds: overlappingEventSlot.scheduledFieldIds,
        });
        return {
            event,
            schedule: {
                $id: overlappingEventSlot.$id || `event-${event.$id}-field-${fieldId}`,
                repeating: overlappingEventSlot.repeating !== false,
                dayOfWeek: overlappingEventSlot.dayOfWeek,
                daysOfWeek: overlappingEventSlot.daysOfWeek,
                startDate: overlappingEventSlot.startDate,
                endDate: overlappingEventSlot.endDate ?? undefined,
                startTimeMinutes: overlappingEventSlot.startTimeMinutes,
                endTimeMinutes: overlappingEventSlot.endTimeMinutes,
                scheduledFieldId: overlappingFieldIds[0] ?? fieldId,
                scheduledFieldIds: overlappingFieldIds.length ? overlappingFieldIds : [fieldId],
            },
        };
    }

    const eventStart = parseLocalDateTime(event.start ?? null);
    const eventEnd = parseLocalDateTime(event.end ?? null);

    return {
        event,
        schedule: {
            $id: `event-${event.$id}-field-${fieldId}`,
            repeating: false,
            startDate: event.start ?? undefined,
            endDate: event.end ?? undefined,
            startTimeMinutes: minutesFromDate(eventStart),
            endTimeMinutes: minutesFromDate(eventEnd),
            scheduledFieldId: fieldId,
            scheduledFieldIds: [fieldId],
        },
    };
};

export const buildExternalSlotConflicts = (
    slot: LeagueSlotForm,
    eventsByFieldId: Map<string, Event[]>,
    context: SlotConflictContext,
): LeagueSlotForm['conflicts'] => {
    const seen = new Set<string>();
    const conflicts: LeagueSlotForm['conflicts'] = [];

    normalizeSlotFieldIds(slot).forEach((fieldId) => {
        const fieldEvents = eventsByFieldId.get(fieldId) ?? [];
        fieldEvents.forEach((event) => {
            if (!slotOverlapsExistingEvent(slot, event, context, fieldId)) {
                return;
            }
            const key = `${event.$id}:${fieldId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            conflicts.push(buildConflictEntry(slot, event, fieldId, context));
        });
    });

    return conflicts.sort((left, right) => {
        const leftStart = parseLocalDateTime(left.event.start ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightStart = parseLocalDateTime(right.event.start ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftStart - rightStart;
    });
};

const hasConflictingEvents = (
    slot: LeagueSlotForm,
    conflicts: LeagueSlotForm['conflicts'],
    context: SlotConflictContext,
): boolean => conflicts.some((conflict) => slotOverlapsExistingEvent(
    slot,
    conflict.event,
    context,
    normalizeSlotFieldIds({
        scheduledFieldId: conflict.schedule?.scheduledFieldId,
        scheduledFieldIds: conflict.schedule?.scheduledFieldIds,
    })[0],
));

export const buildAutoResolvedSlotUpdate = (
    slot: LeagueSlotForm,
    context: SlotConflictContext,
): Partial<LeagueSlotForm> | null => {
    if (!slot.conflicts.length) {
        return null;
    }

    if (slot.repeating === false) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
            return null;
        }
        const durationMinutes = Math.max(
            AUTO_RESOLVE_STEP_MINUTES,
            Math.ceil((slotEnd.getTime() - slotStart.getTime()) / (60 * 1000)),
        );
        const latestConflictEnd = slot.conflicts
            .map((conflict) => parseLocalDateTime(conflict.event.end ?? null))
            .filter((value): value is Date => Boolean(value))
            .sort((left, right) => right.getTime() - left.getTime())[0];
        let candidateStart = latestConflictEnd && latestConflictEnd.getTime() > slotStart.getTime()
            ? addMinutesToDate(latestConflictEnd, AUTO_RESOLVE_STEP_MINUTES)
            : addMinutesToDate(slotStart, AUTO_RESOLVE_STEP_MINUTES);

        for (let step = 0; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
            const candidateEnd = addMinutesToDate(candidateStart, durationMinutes);
            const candidateSlot: LeagueSlotForm = {
                ...slot,
                startDate: formatLocalDateTime(candidateStart) || undefined,
                endDate: formatLocalDateTime(candidateEnd) || undefined,
            };
            if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
                return {
                    startDate: candidateSlot.startDate,
                    endDate: candidateSlot.endDate,
                };
            }
            candidateStart = addMinutesToDate(candidateStart, AUTO_RESOLVE_STEP_MINUTES);
        }

        return null;
    }

    if (
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number' ||
        slot.endTimeMinutes <= slot.startTimeMinutes
    ) {
        return null;
    }

    const durationMinutes = slot.endTimeMinutes - slot.startTimeMinutes;
    for (let step = 1; step < AUTO_RESOLVE_MAX_STEPS; step += 1) {
        const candidateStart = slot.startTimeMinutes + step * AUTO_RESOLVE_STEP_MINUTES;
        const candidateEnd = candidateStart + durationMinutes;
        if (candidateEnd > 24 * 60) {
            break;
        }
        const candidateSlot: LeagueSlotForm = {
            ...slot,
            startTimeMinutes: candidateStart,
            endTimeMinutes: candidateEnd,
        };
        if (!hasConflictingEvents(candidateSlot, slot.conflicts, context)) {
            return {
                startTimeMinutes: candidateStart,
                endTimeMinutes: candidateEnd,
            };
        }
    }

    return null;
};
