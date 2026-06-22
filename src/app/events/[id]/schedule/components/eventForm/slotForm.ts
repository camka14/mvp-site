import type { Event, Field, TimeSlot } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { createClientId } from '@/lib/clientId';
import {
    getSystemTimeZone,
    normalizeTimeZone,
} from '@/lib/dateUtils';

import { mergeSlotPayloadsForForm } from '../slotPayloadMerge';
import { formatEventDateTimeForForm } from './dateHelpers';
import { normalizeDivisionKeys } from './divisionForm';
import { supportsScheduleSlotsForEvent } from './eventRules';
import { normalizeSlotBoundaryOverrideForForm } from './slotConflictHelpers';
import { stringSetsEqual } from './shared';

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
