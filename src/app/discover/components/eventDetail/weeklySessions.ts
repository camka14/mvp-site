import type { Event } from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import {
    buildDivisionDisplayNameIndex,
    resolveDivisionDisplayName,
} from '@/lib/divisionDisplay';
import { getDivisionIdFromEventEntry } from './divisionRegistration';

export type WeeklySessionOption = {
    id: string;
    slotId: string;
    occurrenceDate: string;
    start: Date;
    end: Date;
    label: string;
    divisionLabel: string;
};

export const parseDateValue = (value?: string | Date | number | null): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value === 'number') {
        const parsedNumber = new Date(value);
        return Number.isNaN(parsedNumber.getTime()) ? null : parsedNumber;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        if (![year, month, day].some(Number.isNaN)) {
            return new Date(year, (month ?? 1) - 1, day ?? 1);
        }
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const startOfWeekMonday = (value: Date): Date => {
    const copy = new Date(value.getTime());
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - toMondayIndex(copy));
    return copy;
};

const addDays = (value: Date, days: number): Date => {
    const copy = new Date(value.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
};

const toIsoDateString = (value: Date): string => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatWeeklyTimeLabel = (value: Date): string => (
    value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        .replace(' ', '')
        .toLowerCase()
);

const formatWeeklySessionLabel = (start: Date, end: Date): string => {
    const dateLabel = `${start.toLocaleDateString('en-US', { weekday: 'short' })} ${start.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}`;
    return `${dateLabel}, ${formatWeeklyTimeLabel(start)}-${formatWeeklyTimeLabel(end)}`;
};

const resolveDivisionNames = (
    entries: unknown[],
    divisionNameIndex: Map<string, string>,
    sportInput: string | null,
): string[] => {
    const labels: string[] = [];
    const seen = new Set<string>();

    entries.forEach((entry) => {
        const divisionId = getDivisionIdFromEventEntry(entry);
        const fromDivisionId = divisionId
            ? resolveDivisionDisplayName({
                division: divisionId,
                divisionNameIndex,
                sportInput,
            })
            : null;
        const fromEntryString = typeof entry === 'string'
            ? resolveDivisionDisplayName({
                division: entry,
                divisionNameIndex,
                sportInput,
            })
            : null;
        const fromObjectName = entry && typeof entry === 'object'
            ? (() => {
                const row = entry as Record<string, unknown>;
                return typeof row.name === 'string' ? row.name : null;
            })()
            : null;

        const label = (fromDivisionId ?? fromEntryString ?? fromObjectName ?? '').trim();
        if (!label.length) {
            return;
        }
        const dedupeKey = label.toLowerCase();
        if (seen.has(dedupeKey)) {
            return;
        }
        seen.add(dedupeKey);
        labels.push(label);
    });

    return labels;
};

export const buildWeeklySessionOptions = (
    event: Event | null,
    weeks: number = 3,
    referenceDate: Date = new Date(),
): WeeklySessionOption[] => {
    if (!event || event.eventType !== 'WEEKLY_EVENT' || !Array.isArray(event.timeSlots) || event.timeSlots.length === 0) {
        return [];
    }

    const now = new Date(referenceDate.getTime());
    now.setHours(0, 0, 0, 0);
    const sessions: WeeklySessionOption[] = [];
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? null;
    const divisionNameIndex = buildDivisionDisplayNameIndex(event.divisionDetails);
    const fallbackDivisionNames = resolveDivisionNames(
        Array.isArray(event.divisions) ? event.divisions : [],
        divisionNameIndex,
        sportInput,
    );

    event.timeSlots.forEach((slot) => {
        const slotStartDate = parseDateValue(slot.startDate ?? null);
        if (!slotStartDate) {
            return;
        }
        slotStartDate.setHours(0, 0, 0, 0);
        const slotEndDate = parseDateValue(slot.endDate ?? null);
        if (slotEndDate) {
            slotEndDate.setHours(0, 0, 0, 0);
        }

        const normalizedDays = Array.from(
            new Set(
                (
                    Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
                        ? slot.daysOfWeek
                        : typeof slot.dayOfWeek === 'number'
                            ? [slot.dayOfWeek]
                            : []
                )
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
            ),
        ).sort((left, right) => left - right);
        const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
        const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
        if (!normalizedDays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
            return;
        }
        const slotDivisionNames = resolveDivisionNames(
            Array.isArray(slot.divisions) && slot.divisions.length
                ? slot.divisions
                : (Array.isArray(event.divisions) ? event.divisions : []),
            divisionNameIndex,
            sportInput,
        );
        const divisionLabel = (slotDivisionNames.length ? slotDivisionNames : fallbackDivisionNames).join(', ') || 'All divisions';

        const anchor = new Date(Math.max(now.getTime(), slotStartDate.getTime()));
        const anchorWeek = startOfWeekMonday(anchor);

        for (let weekOffset = 0; weekOffset < weeks; weekOffset += 1) {
            const weekStart = addDays(anchorWeek, weekOffset * 7);
            normalizedDays.forEach((weekday) => {
                const occurrence = addDays(weekStart, weekday);
                if (occurrence < anchor || occurrence < slotStartDate) {
                    return;
                }
                if (slotEndDate && occurrence > slotEndDate) {
                    return;
                }
                const sessionStart = new Date(occurrence.getTime());
                sessionStart.setHours(0, startMinutes, 0, 0);
                const sessionEnd = new Date(occurrence.getTime());
                sessionEnd.setHours(0, endMinutes, 0, 0);

                sessions.push({
                    id: `${slot.$id}-${toIsoDateString(occurrence)}`,
                    slotId: String(slot.$id ?? ''),
                    occurrenceDate: toIsoDateString(occurrence),
                    start: sessionStart,
                    end: sessionEnd,
                    label: formatWeeklySessionLabel(sessionStart, sessionEnd),
                    divisionLabel,
                });
            });
        }
    });

    return sessions.sort((left, right) => left.start.getTime() - right.start.getTime());
};

export const resolveSelectedWeeklySessionOption = (
    event: Event | null,
    selection: WeeklyOccurrenceSelection | null,
): WeeklySessionOption | null => {
    if (!event || !selection) {
        return null;
    }
    const selectedSlotId = typeof selection.slotId === 'string' ? selection.slotId.trim() : '';
    const selectedOccurrenceDate = typeof selection.occurrenceDate === 'string' ? selection.occurrenceDate.trim() : '';
    if (!selectedSlotId || !selectedOccurrenceDate) {
        return null;
    }

    const occurrenceDate = parseDateValue(selectedOccurrenceDate);
    if (!occurrenceDate) {
        return null;
    }
    occurrenceDate.setHours(0, 0, 0, 0);

    const originalTimeSlots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
    const matchingSlot = originalTimeSlots.find((slot) => String(slot?.$id ?? '').trim() === selectedSlotId);
    if (!matchingSlot) {
        return null;
    }

    const slotStartDate = parseDateValue(matchingSlot.startDate ?? null);
    const slotEndDate = parseDateValue(matchingSlot.endDate ?? null);
    if (!slotStartDate) {
        return null;
    }
    slotStartDate.setHours(0, 0, 0, 0);
    if (slotEndDate) {
        slotEndDate.setHours(0, 0, 0, 0);
    }

    const normalizedDays = Array.from(
        new Set(
            (Array.isArray(matchingSlot.daysOfWeek) && matchingSlot.daysOfWeek.length
                ? matchingSlot.daysOfWeek
                : Number.isInteger(matchingSlot.dayOfWeek)
                    ? [matchingSlot.dayOfWeek]
                    : [])
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
        ),
    ).sort((left, right) => left - right);
    const startMinutes = typeof matchingSlot.startTimeMinutes === 'number' ? matchingSlot.startTimeMinutes : null;
    const endMinutes = typeof matchingSlot.endTimeMinutes === 'number' ? matchingSlot.endTimeMinutes : null;
    if (!normalizedDays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
    }
    if (!normalizedDays.includes(toMondayIndex(occurrenceDate))) {
        return null;
    }
    if (occurrenceDate < slotStartDate) {
        return null;
    }
    if (slotEndDate && occurrenceDate > slotEndDate) {
        return null;
    }

    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? null;
    const divisionNameIndex = buildDivisionDisplayNameIndex(event.divisionDetails);
    const slotDivisionEntries = Array.isArray(matchingSlot.divisions) && matchingSlot.divisions.length
        ? matchingSlot.divisions
        : (Array.isArray(event.divisions) ? event.divisions : []);
    const divisionLabel = resolveDivisionNames(
        slotDivisionEntries,
        divisionNameIndex,
        sportInput,
    ).join(', ') || 'All divisions';

    const start = new Date(occurrenceDate.getTime());
    start.setHours(0, startMinutes, 0, 0);
    const end = new Date(occurrenceDate.getTime());
    end.setHours(0, endMinutes, 0, 0);

    return {
        id: `${selectedSlotId}-${selectedOccurrenceDate}`,
        slotId: selectedSlotId,
        occurrenceDate: selectedOccurrenceDate,
        start,
        end,
        label: formatWeeklySessionLabel(start, end),
        divisionLabel,
    };
};
