import type { Event } from '@/types';
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { parseLocalDateTime } from '@/lib/dateUtils';

import { supportsScheduleSlotsForEvent } from './eventRules';
import { normalizeSlotFieldIds, normalizeWeekdays } from './slotForm';

type EventType = Event['eventType'];

// Compares two numeric start/end pairs to detect overlapping minutes within the same day.
export const slotsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
    Math.max(startA, startB) < Math.min(endA, endB);

export const slotDateTimeRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
    startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

// Evaluates the current slot against other form slots to surface inline validation errors for schedulable event types.
export const computeSlotError = (
    slots: LeagueSlotForm[],
    index: number,
    eventType: EventType,
    parentEvent?: string | null,
): string | undefined => {
    if (!supportsScheduleSlotsForEvent(eventType, parentEvent)) {
        return undefined;
    }

    const slot = slots[index];
    if (!slot) {
        return undefined;
    }

    const slotFieldIds = normalizeSlotFieldIds(slot);
    if (!slotFieldIds.length) {
        return undefined;
    }

    const isRepeating = slot.repeating !== false;
    if (!isRepeating) {
        const slotStart = parseLocalDateTime(slot.startDate ?? null);
        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
        if (!slotStart || !slotEnd) {
            return undefined;
        }
        if (slotEnd.getTime() <= slotStart.getTime()) {
            return 'Timeslot must end after it starts.';
        }

        const hasOverlap = slots.some((other, otherIndex) => {
            if (otherIndex === index || other.repeating !== false) {
                return false;
            }
            const otherFieldIds = normalizeSlotFieldIds(other);
            if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
                return false;
            }
            const otherStart = parseLocalDateTime(other.startDate ?? null);
            const otherEnd = parseLocalDateTime(other.endDate ?? null);
            if (!otherStart || !otherEnd) {
                return false;
            }
            return slotDateTimeRangesOverlap(slotStart, slotEnd, otherStart, otherEnd);
        });

        return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
    }

    const slotDays = normalizeWeekdays(slot);
    if (
        slotDays.length === 0 ||
        typeof slot.startTimeMinutes !== 'number' ||
        typeof slot.endTimeMinutes !== 'number'
    ) {
        return undefined;
    }

    const slotStartTime = slot.startTimeMinutes;
    const slotEndTime = slot.endTimeMinutes;
    if (slotEndTime <= slotStartTime) {
        return 'Timeslot must end after it starts.';
    }

    const hasOverlap = slots.some((other, otherIndex) => {
        if (otherIndex === index || other.repeating === false) {
            return false;
        }
        const otherFieldIds = normalizeSlotFieldIds(other);
        if (!otherFieldIds.length || !otherFieldIds.some((fieldId) => slotFieldIds.includes(fieldId))) {
            return false;
        }
        const otherDays = normalizeWeekdays(other);
        if (otherDays.length === 0 || !otherDays.some((day) => slotDays.includes(day))) {
            return false;
        }
        if (
            typeof other.startTimeMinutes !== 'number' ||
            typeof other.endTimeMinutes !== 'number'
        ) {
            return false;
        }
        return slotsOverlap(slotStartTime, slotEndTime, other.startTimeMinutes, other.endTimeMinutes);
    });

    return hasOverlap ? 'Overlaps with another timeslot in this form.' : undefined;
};

// Resets conflict bookkeeping and assigns slot errors so UI can block submission when overlaps exist.
export const normalizeSlotState = (slots: LeagueSlotForm[], eventType: EventType, parentEvent?: string | null): LeagueSlotForm[] => {
    let mutated = false;

    const normalized = slots.map((slot, index) => {
        const error = computeSlotError(slots, index, eventType, parentEvent);
        const needsUpdate = slot.error !== error;

        if (!needsUpdate) {
            return slot;
        }

        mutated = true;
        return {
            ...slot,
            error,
        };
    });

    return mutated ? normalized : slots;
};
