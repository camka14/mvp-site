import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import type { Event } from '@/types';
import {
    formatLocalDateTime,
    normalizeTimeZone,
    parseLocalDateTime,
} from '@/lib/dateUtils';

import { normalizeDivisionKeys } from '../divisionForm';
import { normalizeFieldIds, normalizeWeekdays } from '../slotForm';
import type { EventSetupScheduleStyle } from './types';

type InferScheduleStyleInput = {
    eventType?: Event['eventType'];
    slots?: LeagueSlotForm[] | null;
    eventStart?: string | null;
    eventEnd?: string | null;
};

type NormalizeScheduleStyleInput = {
    style: EventSetupScheduleStyle;
    slots: LeagueSlotForm[];
    eventStart?: string | null;
    eventEnd?: string | null;
    timeZone?: string | null;
    fieldIds?: string[] | null;
    divisionKeys?: string[] | null;
};

const minutesFromDate = (value: Date): number => value.getHours() * 60 + value.getMinutes();

const dateTimesMatch = (left?: string | null, right?: string | null): boolean => {
    const parsedLeft = parseLocalDateTime(left ?? null);
    const parsedRight = parseLocalDateTime(right ?? null);
    return Boolean(parsedLeft && parsedRight && parsedLeft.getTime() === parsedRight.getTime());
};

const isFixedWindowSlot = (
    slot: LeagueSlotForm,
    eventStart?: string | null,
    eventEnd?: string | null,
): boolean => (
    slot.repeating === false
    && dateTimesMatch(slot.startDate, eventStart)
    && dateTimesMatch(slot.endDate, eventEnd)
);

export const scheduleSlotHasUserConfiguration = (slot: LeagueSlotForm): boolean => (
    Boolean(slot.$id)
    || normalizeWeekdays(slot).length > 0
    || Number.isFinite(slot.startTimeMinutes)
    || Number.isFinite(slot.endTimeMinutes)
    || Boolean(parseLocalDateTime(slot.startDate ?? null))
    || Boolean(parseLocalDateTime(slot.endDate ?? null))
);

export const inferEventSetupScheduleStyle = ({
    eventType,
    slots = [],
    eventStart,
    eventEnd,
}: InferScheduleStyleInput): EventSetupScheduleStyle => {
    const normalizedSlots = (Array.isArray(slots) ? slots : [])
        .filter(scheduleSlotHasUserConfiguration);
    const repeatingCount = normalizedSlots.filter((slot) => slot.repeating !== false).length;
    const fixedSlots = normalizedSlots.filter((slot) => slot.repeating === false);

    if (repeatingCount > 0 && fixedSlots.length > 0) {
        return 'MIXED_SLOTS';
    }
    if (fixedSlots.length > 0) {
        return fixedSlots.length === 1 && isFixedWindowSlot(fixedSlots[0], eventStart, eventEnd)
            ? 'FIXED_WINDOW'
            : 'FIXED_SLOTS';
    }
    if (repeatingCount > 0) {
        return 'WEEKLY_SLOTS';
    }
    return eventType === 'EVENT' ? 'FIXED_WINDOW' : 'WEEKLY_SLOTS';
};

export const scheduleStyleChangeDiscardsConfiguredSlots = (
    slots: LeagueSlotForm[],
    nextStyle: EventSetupScheduleStyle,
): boolean => {
    if (nextStyle === 'MIXED_SLOTS') {
        return false;
    }
    return slots.some((slot) => {
        if (!scheduleSlotHasUserConfiguration(slot)) {
            return false;
        }
        if (nextStyle === 'WEEKLY_SLOTS') {
            return slot.repeating === false;
        }
        if (nextStyle === 'FIXED_SLOTS') {
            return slot.repeating !== false;
        }
        return true;
    });
};

const buildFixedWindowSlot = ({
    base,
    eventStart,
    eventEnd,
    timeZone,
    fieldIds,
    divisionKeys,
}: {
    base?: LeagueSlotForm;
    eventStart?: string | null;
    eventEnd?: string | null;
    timeZone?: string | null;
    fieldIds: string[];
    divisionKeys: string[];
}): LeagueSlotForm => {
    const parsedStart = parseLocalDateTime(eventStart ?? null);
    const parsedEnd = parseLocalDateTime(eventEnd ?? null);
    const dayOfWeek = parsedStart ? ((parsedStart.getDay() + 6) % 7) : undefined;
    return {
        key: base?.key || 'simple-fixed-event-window',
        $id: base?.$id,
        scheduledFieldId: fieldIds[0],
        scheduledFieldIds: fieldIds,
        dayOfWeek,
        daysOfWeek: dayOfWeek === undefined ? [] : [dayOfWeek],
        divisions: divisionKeys,
        startDate: parsedStart ? formatLocalDateTime(parsedStart) : undefined,
        endDate: parsedEnd ? formatLocalDateTime(parsedEnd) : undefined,
        timeZone: normalizeTimeZone(timeZone),
        startTimeMinutes: parsedStart ? minutesFromDate(parsedStart) : undefined,
        endTimeMinutes: parsedEnd ? minutesFromDate(parsedEnd) : undefined,
        repeating: false,
        conflicts: [],
        checking: false,
        error: undefined,
    };
};

const createCompatibleSlot = ({
    style,
    eventStart,
    eventEnd,
    timeZone,
    fieldIds,
    divisionKeys,
}: Omit<NormalizeScheduleStyleInput, 'slots'>): LeagueSlotForm => {
    if (style === 'FIXED_SLOTS') {
        return buildFixedWindowSlot({
            eventStart,
            eventEnd,
            timeZone,
            fieldIds: normalizeFieldIds(fieldIds),
            divisionKeys: normalizeDivisionKeys(divisionKeys),
        });
    }
    return {
        key: 'simple-weekly-timeslot',
        scheduledFieldId: normalizeFieldIds(fieldIds)[0],
        scheduledFieldIds: normalizeFieldIds(fieldIds),
        divisions: normalizeDivisionKeys(divisionKeys),
        timeZone: normalizeTimeZone(timeZone),
        repeating: true,
        daysOfWeek: [],
        conflicts: [],
        checking: false,
    };
};

export const normalizeScheduleSlotsForStyle = ({
    style,
    slots,
    eventStart,
    eventEnd,
    timeZone,
    fieldIds,
    divisionKeys,
}: NormalizeScheduleStyleInput): LeagueSlotForm[] => {
    const normalizedFieldIds = normalizeFieldIds(fieldIds);
    const normalizedDivisionKeys = normalizeDivisionKeys(divisionKeys);
    if (style === 'FIXED_WINDOW') {
        return [buildFixedWindowSlot({
            base: slots[0],
            eventStart,
            eventEnd,
            timeZone,
            fieldIds: normalizedFieldIds,
            divisionKeys: normalizedDivisionKeys,
        })];
    }
    if (style === 'MIXED_SLOTS') {
        return slots.length > 0
            ? slots
            : [createCompatibleSlot({ style: 'WEEKLY_SLOTS', eventStart, eventEnd, timeZone, fieldIds, divisionKeys })];
    }

    const wantsRepeating = style === 'WEEKLY_SLOTS';
    const compatible = slots.filter((slot) => (slot.repeating !== false) === wantsRepeating);
    if (compatible.length > 0) {
        return compatible;
    }
    return [createCompatibleSlot({ style, eventStart, eventEnd, timeZone, fieldIds, divisionKeys })];
};
