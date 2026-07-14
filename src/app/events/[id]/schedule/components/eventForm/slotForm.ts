import type { Event, Field, TimeSlot } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { createClientId } from '@/lib/clientId';
import {
    formatLocalDateTime,
    getSystemTimeZone,
    normalizeTimeZone,
    parseLocalDateTime,
} from '@/lib/dateUtils';

import { mergeSlotPayloadsForForm } from '../slotPayloadMerge';
import { formatEventDateTimeForForm } from './dateHelpers';
import {
    normalizeDivisionKeys,
    normalizeSlotDivisionKeysWithLookup,
    type SlotDivisionLookup,
} from './divisionForm';
import { supportsScheduleSlotsForEvent } from './eventRules';
import { normalizeSlotBoundaryOverrideForForm } from './slotConflictHelpers';
import { stringArraysEqual, stringSetsEqual } from './shared';

export const normalizeWeekdays = (slot: { dayOfWeek?: number; daysOfWeek?: number[] }): number[] => {
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

export const normalizeFieldIds = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(
        new Set(
            values
                .map((value) => String(value).trim())
                .filter((value) => value.length > 0),
        ),
    );
};

export const normalizeSlotFieldIds = (slot: { scheduledFieldId?: string; scheduledFieldIds?: string[] }): string[] => {
    const fromList = normalizeFieldIds(slot.scheduledFieldIds);
    if (fromList.length) {
        return fromList;
    }
    return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0
        ? [slot.scheduledFieldId]
        : [];
};

export const createLeagueSlotForm = (
    slot?: Partial<TimeSlot>,
    fallbackDivisions: string[] = [],
    fallbackEventStart?: string | Date | null,
    fallbackEventEnd?: string | Date | null,
    fallbackTimeZone?: string | null,
): LeagueSlotForm => {
    const slotTimeZone = normalizeTimeZone(slot?.timeZone, fallbackTimeZone || getSystemTimeZone());
    const normalizedDays = normalizeWeekdays({
        dayOfWeek: typeof slot?.dayOfWeek === 'number' ? slot.dayOfWeek : undefined,
        daysOfWeek: Array.isArray(slot?.daysOfWeek) ? slot.daysOfWeek : undefined,
    });
    const normalizedDivisions = normalizeDivisionKeys(slot?.divisions);
    const normalizedFieldIds = normalizeSlotFieldIds({
        scheduledFieldId: slot?.scheduledFieldId,
        scheduledFieldIds: slot?.scheduledFieldIds,
    });
    const isRepeating = slot?.repeating ?? true;
    const normalizedStartDate = isRepeating
        ? normalizeSlotBoundaryOverrideForForm(slot?.startDate ?? null, fallbackEventStart ?? null, slotTimeZone)
        : formatEventDateTimeForForm(slot?.startDate ?? null, slotTimeZone) || undefined;
    const normalizedEndDate = isRepeating
        ? normalizeSlotBoundaryOverrideForForm(slot?.endDate ?? null, fallbackEventEnd ?? null, slotTimeZone)
        : formatEventDateTimeForForm(slot?.endDate ?? null, slotTimeZone) || undefined;
    return {
        key: slot?.$id ?? createClientId(),
        $id: slot?.$id,
        timeZone: slotTimeZone,
        scheduledFieldId: normalizedFieldIds[0],
        scheduledFieldIds: normalizedFieldIds,
        dayOfWeek: normalizedDays[0],
        daysOfWeek: normalizedDays,
        divisions: normalizedDivisions.length ? normalizedDivisions : fallbackDivisions,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        startTimeMinutes: slot?.startTimeMinutes,
        endTimeMinutes: slot?.endTimeMinutes,
        price: typeof slot?.price === 'number' && Number.isFinite(slot.price) ? slot.price : undefined,
        sourceType: typeof slot?.sourceType === 'string' && slot.sourceType.trim().length > 0 ? slot.sourceType : undefined,
        rentalBookingId: typeof slot?.rentalBookingId === 'string' && slot.rentalBookingId.trim().length > 0 ? slot.rentalBookingId : undefined,
        rentalBookingItemId: typeof slot?.rentalBookingItemId === 'string' && slot.rentalBookingItemId.trim().length > 0 ? slot.rentalBookingItemId : undefined,
        rentalLocked: Boolean(slot?.rentalLocked),
        requiredTemplateIds: normalizeFieldIds(slot?.requiredTemplateIds),
        hostRequiredTemplateIds: normalizeFieldIds(slot?.hostRequiredTemplateIds),
        repeating: isRepeating,
        conflicts: [],
        checking: false,
        error: undefined,
    };
};

const minutesFromDate = (value: Date): number => value.getHours() * 60 + value.getMinutes();

const withMinutesOnDate = (date: Date, minutes: number): Date => {
    const normalized = Math.max(0, Math.trunc(minutes));
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(normalized / 60),
        normalized % 60,
        0,
        0,
    );
};

type NormalizeLeagueSlotUpdateOptions = {
    slot: LeagueSlotForm;
    updates: Partial<LeagueSlotForm>;
    eventStart?: string | null;
    eventEnd?: string | null;
    singleDivision: boolean;
    slotDivisionKeys: string[];
    slotDivisionLookup: Pick<SlotDivisionLookup, 'valueToId'>;
};

export const normalizeLeagueSlotUpdate = ({
    slot,
    updates,
    eventStart,
    eventEnd,
    singleDivision,
    slotDivisionKeys,
    slotDivisionLookup,
}: NormalizeLeagueSlotUpdateOptions): LeagueSlotForm => {
    const updated: LeagueSlotForm = {
        ...slot,
        ...updates,
    };
    const normalizedDays = normalizeWeekdays(updated);
    const normalizedFieldIds = normalizeSlotFieldIds(updated);
    const normalizedDivisions = normalizeSlotDivisionKeysWithLookup(updated.divisions, slotDivisionLookup);
    const normalizedStartDate = formatLocalDateTime(updated.startDate ?? null);
    const normalizedEndDate = formatLocalDateTime(updated.endDate ?? null);
    updated.scheduledFieldId = normalizedFieldIds[0];
    updated.scheduledFieldIds = normalizedFieldIds;
    updated.divisions = singleDivision
        ? slotDivisionKeys
        : (normalizedDivisions.length ? normalizedDivisions : slotDivisionKeys);
    updated.startDate = normalizedStartDate || undefined;
    updated.endDate = normalizedEndDate || undefined;

    const repeating = updated.repeating !== false;
    if (repeating) {
        const parsedStart = parseLocalDateTime(updated.startDate ?? null);
        const parsedEnd = parseLocalDateTime(updated.endDate ?? null);
        const nextDays = normalizedDays.length
            ? normalizedDays
            : parsedStart
                ? [((parsedStart.getDay() + 6) % 7)]
                : [];
        if (nextDays.length) {
            updated.dayOfWeek = nextDays[0] as LeagueSlotForm['dayOfWeek'];
            updated.daysOfWeek = nextDays as LeagueSlotForm['daysOfWeek'];
        } else {
            updated.dayOfWeek = undefined;
            updated.daysOfWeek = [];
        }

        if (!Number.isFinite(updated.startTimeMinutes) && parsedStart) {
            updated.startTimeMinutes = minutesFromDate(parsedStart);
        }
        if (!Number.isFinite(updated.endTimeMinutes) && parsedEnd) {
            updated.endTimeMinutes = minutesFromDate(parsedEnd);
        }
        return updated;
    }

    let slotStart = parseLocalDateTime(updated.startDate ?? null);
    let slotEnd = parseLocalDateTime(updated.endDate ?? null);
    let startMinutes = Number.isFinite(updated.startTimeMinutes) ? Number(updated.startTimeMinutes) : null;
    let endMinutes = Number.isFinite(updated.endTimeMinutes) ? Number(updated.endTimeMinutes) : null;
    if (!slotStart) {
        const fallbackEventStart = parseLocalDateTime(eventStart ?? null);
        if (fallbackEventStart) {
            slotStart = fallbackEventStart;
        }
    }
    if (startMinutes === null && slotStart) {
        startMinutes = minutesFromDate(slotStart);
    }
    if (!slotEnd && slotStart) {
        const fallbackEventEnd = parseLocalDateTime(eventEnd ?? null);
        if (fallbackEventEnd && fallbackEventEnd.getTime() > slotStart.getTime()) {
            slotEnd = fallbackEventEnd;
        } else {
            const durationMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                ? endMinutes - startMinutes
                : 60;
            slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
        }
    }
    if (!slotEnd && slotStart) {
        slotEnd = new Date(slotStart);
    }
    if (endMinutes === null && slotEnd) {
        endMinutes = minutesFromDate(slotEnd);
    }

    if (slotStart && startMinutes !== null) {
        const normalizedStart = withMinutesOnDate(slotStart, startMinutes);
        const dayOfWeek = ((normalizedStart.getDay() + 6) % 7);
        updated.dayOfWeek = dayOfWeek as LeagueSlotForm['dayOfWeek'];
        updated.daysOfWeek = [dayOfWeek] as LeagueSlotForm['daysOfWeek'];
        updated.startDate = formatLocalDateTime(normalizedStart);
        updated.startTimeMinutes = startMinutes;
    } else {
        updated.dayOfWeek = undefined;
        updated.daysOfWeek = [];
        updated.startDate = undefined;
        updated.startTimeMinutes = undefined;
    }

    if (slotEnd && endMinutes !== null) {
        const normalizedEnd = withMinutesOnDate(slotEnd, endMinutes);
        updated.endDate = formatLocalDateTime(normalizedEnd);
        updated.endTimeMinutes = endMinutes;
    } else {
        updated.endDate = undefined;
        updated.endTimeMinutes = undefined;
    }

    return updated;
};

export const normalizeLeagueSlotDivisions = (
    slots: LeagueSlotForm[],
    slotDivisionKeys: string[],
    slotDivisionLookup: Pick<SlotDivisionLookup, 'valueToId'>,
    singleDivision: boolean,
): LeagueSlotForm[] => {
    if (!slotDivisionKeys.length) {
        return slots;
    }
    const selectedDivisionSet = new Set(slotDivisionKeys);
    const hasMismatch = slots.some((slot) => {
        const currentRaw = normalizeDivisionKeys(slot.divisions);
        const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
        if (!stringArraysEqual(currentRaw, current)) {
            return true;
        }
        if (singleDivision) {
            return !stringSetsEqual(current, slotDivisionKeys);
        }
        const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
        return filtered.length === 0 || !stringArraysEqual(current, filtered);
    });
    if (!hasMismatch) {
        return slots;
    }
    return slots.map((slot) => {
        const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
        const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
        return {
            ...slot,
            divisions: singleDivision
                ? slotDivisionKeys
                : (filtered.length ? filtered : slotDivisionKeys),
        };
    });
};

export const normalizeLeagueSlotFieldReferences = (
    slots: LeagueSlotForm[],
    availableFieldIds: string[],
): LeagueSlotForm[] => {
    if (!availableFieldIds.length) {
        return slots;
    }
    const validIds = new Set(availableFieldIds);
    const hasInvalidSlots = slots.some((slot) => (
        normalizeSlotFieldIds(slot).some((fieldId) => !validIds.has(fieldId))
    ));
    if (!hasInvalidSlots) {
        return slots;
    }
    return slots.map((slot) => {
        const slotFieldIds = normalizeSlotFieldIds(slot);
        const nextFieldIds = slotFieldIds.filter((fieldId) => validIds.has(fieldId));
        if (stringSetsEqual(slotFieldIds, nextFieldIds)) {
            return slot;
        }
        return {
            ...slot,
            scheduledFieldId: nextFieldIds[0],
            scheduledFieldIds: nextFieldIds,
        };
    });
};

export const slotMatchesLockedRental = (slot: LeagueSlotForm, lockedSlot: TimeSlot): boolean => {
    const slotFieldIds = normalizeSlotFieldIds(slot);
    const lockedFieldIds = normalizeSlotFieldIds(lockedSlot);
    if (!slotFieldIds.length || !stringSetsEqual(slotFieldIds, lockedFieldIds)) {
        return false;
    }

    const dateValuesMatch = (left?: string | null, right?: string | null): boolean => {
        const parsedLeft = parseLocalDateTime(left ?? null);
        const parsedRight = parseLocalDateTime(right ?? null);
        if (!parsedLeft && !parsedRight) {
            return true;
        }
        return Boolean(parsedLeft && parsedRight && parsedLeft.getTime() === parsedRight.getTime());
    };
    if (dateValuesMatch(slot.startDate, lockedSlot.startDate) && dateValuesMatch(slot.endDate, lockedSlot.endDate)) {
        return true;
    }
    return slot.startTimeMinutes === lockedSlot.startTimeMinutes
        && slot.endTimeMinutes === lockedSlot.endTimeMinutes
        && normalizeWeekdays(slot).some((day) => normalizeWeekdays(lockedSlot).includes(day));
};

export const timeSlotsEqual = (left: TimeSlot[], right: TimeSlot[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const first = left[index];
        const second = right[index];
        if (
            first.$id !== second.$id
            || first.startDate !== second.startDate
            || first.endDate !== second.endDate
            || first.startTimeMinutes !== second.startTimeMinutes
            || first.endTimeMinutes !== second.endTimeMinutes
            || Boolean(first.repeating) !== Boolean(second.repeating)
            || first.sourceType !== second.sourceType
            || first.rentalBookingId !== second.rentalBookingId
            || first.rentalBookingItemId !== second.rentalBookingItemId
            || Boolean(first.rentalLocked) !== Boolean(second.rentalLocked)
            || !stringSetsEqual(normalizeSlotFieldIds(first), normalizeSlotFieldIds(second))
            || !stringSetsEqual(normalizeWeekdays(first).map(String), normalizeWeekdays(second).map(String))
            || !stringSetsEqual(normalizeDivisionKeys(first.divisions), normalizeDivisionKeys(second.divisions))
        ) {
            return false;
        }
    }
    return true;
};

type DefaultSlotFormBase = {
    eventType: Event['eventType'];
    parentEvent?: string | null;
    start?: string | null;
    end?: string | null;
    timeZone?: string | null;
};

type CreateSlotForm = (
    slot?: Partial<TimeSlot>,
    fallbackDivisions?: string[],
    fallbackEventStart?: string | Date | null,
    fallbackEventEnd?: string | Date | null,
    fallbackTimeZone?: string | null,
) => LeagueSlotForm;

type BuildDefaultSlotFormsOptions = {
    base: DefaultSlotFormBase;
    activeEditingEvent?: Event | null;
    immutableDefaults?: Partial<Event> | null;
    defaultSlotDivisionKeys: string[];
    createSlotForm: CreateSlotForm;
};

export const buildDefaultSlotForms = ({
    base,
    activeEditingEvent,
    immutableDefaults,
    defaultSlotDivisionKeys,
    createSlotForm,
}: BuildDefaultSlotFormsOptions): LeagueSlotForm[] => {
    const defaults = immutableDefaults ?? {};
    const defaultFieldId = Array.isArray(defaults.fields) && defaults.fields.length > 0
        ? (defaults.fields[0] as Field).$id
        : undefined;
    const defaultUsesEditableScheduleSlots = supportsScheduleSlotsForEvent(base.eventType, base.parentEvent);

    if (!defaultUsesEditableScheduleSlots && Array.isArray(defaults.timeSlots) && defaults.timeSlots.length > 0) {
        return mergeSlotPayloadsForForm(defaults.timeSlots as TimeSlot[], defaultFieldId)
            .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys, base.start, base.end, base.timeZone));
    }

    if (
        activeEditingEvent
        && supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)
        && activeEditingEvent.timeSlots?.length
    ) {
        return mergeSlotPayloadsForForm(activeEditingEvent.timeSlots || [])
            .map((slot) => createSlotForm(slot, defaultSlotDivisionKeys, base.start, base.end, base.timeZone));
    }

    return [createSlotForm(undefined, defaultSlotDivisionKeys, base.start, base.end, base.timeZone)];
};
