import { addMinutes } from 'date-fns';
import type { Field, Match, Event as EventRecord, TimeSlot } from '@/types';

const ONE_HOUR_IN_MINUTES = 60;

const parseToDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const ensureEndDate = (start: Date, rawEnd?: string | Date | null, fallbackMinutes: number = ONE_HOUR_IN_MINUTES): Date => {
  const parsed = parseToDate(rawEnd);
  if (parsed && parsed.getTime() > start.getTime()) {
    return parsed;
  }
  return addMinutes(start, fallbackMinutes);
};

export type FieldCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: EventRecord | Match | TimeSlot;
  metaType: 'event' | 'match' | 'rental';
  fieldName: string;
};

const normalizeToMondayIndex = (date: Date): number => {
  return (date.getDay() + 6) % 7;
};

const alignDateToSlot = (seed: Date, slotDay: number): Date => {
  const aligned = new Date(seed.getTime());
  aligned.setHours(0, 0, 0, 0);
  const seedIndex = normalizeToMondayIndex(aligned);
  let diff = slotDay - seedIndex;
  if (diff < 0) {
    diff += 7;
  }
  aligned.setDate(aligned.getDate() + diff);
  return aligned;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

type CalendarRange = { start: Date; end: Date } | null;

export const buildFieldCalendarEvents = (fields: Field[], range: CalendarRange = null): FieldCalendarEntry[] => {
  return fields.flatMap((field) => {
    const baseTitle = field.name || `Field ${field.fieldNumber}`;
    const events = (field.events || []).filter((evt) => evt.eventType !== 'league' && evt.eventType !== 'tournament');
    const matches = (field.matches || []).filter((match) => {
      const eventRef = typeof match.event === 'object' ? (match.event as EventRecord | null) : null;
      const eventType = eventRef?.eventType;
      return eventType !== 'league' && eventType !== 'tournament';
    });

    const eventEntries: FieldCalendarEntry[] = events.map((evt) => {
      const start = parseToDate(evt.start) ?? new Date();
      const end = ensureEndDate(start, evt.end, ONE_HOUR_IN_MINUTES);
      return {
        id: `field-event-${field.$id}-${evt.$id}`,
        title: evt.name,
        start,
        end,
        resourceId: field.$id,
        resource: evt,
        metaType: 'event',
        fieldName: baseTitle,
      };
    });

    const matchEntries: FieldCalendarEntry[] = matches.map((match) => {
      const start = parseToDate(match.start) ?? new Date();
      const end = ensureEndDate(start, match.end, ONE_HOUR_IN_MINUTES);
      const eventRef = typeof match.event === 'object' && match.event ? (match.event as EventRecord) : null;
      return {
        id: `field-match-${field.$id}-${match.$id}`,
        title: eventRef?.name ? `${eventRef.name} Match` : 'Match',
        start,
        end,
        resourceId: field.$id,
        resource: match,
        metaType: 'match',
        fieldName: baseTitle,
      };
    });

    const rentalEntries: FieldCalendarEntry[] = [];
    (field.rentalSlots || []).forEach((slot) => {
      const baseStart = parseToDate(slot.startDate ?? null);
      if (!baseStart) {
        return;
      }

      if (
        slot.repeating &&
        typeof slot.dayOfWeek === 'number' &&
        typeof slot.startTimeMinutes === 'number' &&
        typeof slot.endTimeMinutes === 'number'
      ) {
        const rangeStart = range ? new Date(range.start.getTime()) : new Date(baseStart.getTime());
        const rangeEnd = range ? new Date(range.end.getTime()) : new Date(baseStart.getTime());
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);

        const normalizedBase = new Date(baseStart.getTime());
        normalizedBase.setHours(0, 0, 0, 0);

        if (rangeEnd < normalizedBase) {
          return;
        }

        if (rangeStart < normalizedBase) {
          rangeStart.setTime(normalizedBase.getTime());
        }

        const slotEndBoundaryRaw = parseToDate(slot.endDate ?? null);
        const slotEndBoundary = slotEndBoundaryRaw ? new Date(slotEndBoundaryRaw.getTime()) : null;
        if (slotEndBoundary) {
          slotEndBoundary.setHours(23, 59, 59, 999);
          if (slotEndBoundary < rangeStart) {
            return;
          }
        }

        let occurrence = alignDateToSlot(rangeStart, slot.dayOfWeek);
        if (occurrence < normalizedBase) {
          const weeksToCatchUp = Math.ceil((normalizedBase.getTime() - occurrence.getTime()) / (7 * 24 * 60 * 60 * 1000));
          occurrence = addDays(occurrence, weeksToCatchUp * 7);
        }

        const duration = Math.max(1, slot.endTimeMinutes - slot.startTimeMinutes);

        while (occurrence <= rangeEnd && (!slotEndBoundary || occurrence <= slotEndBoundary)) {
          const effectiveStart = new Date(occurrence.getTime());
          effectiveStart.setMinutes(slot.startTimeMinutes);
          const effectiveEnd = addMinutes(effectiveStart, duration);

          rentalEntries.push({
            id: `field-rental-${field.$id}-${slot.$id}-${effectiveStart.getTime()}`,
            title: 'Rental Slot',
            start: effectiveStart,
            end: effectiveEnd,
            resourceId: field.$id,
            resource: slot,
            metaType: 'rental',
            fieldName: baseTitle,
          });

          occurrence = addDays(occurrence, 7);
        }

        return;
      }

      const durationMinutes = typeof slot.endTimeMinutes === 'number' && typeof slot.startTimeMinutes === 'number'
        ? Math.max(1, slot.endTimeMinutes - slot.startTimeMinutes)
        : ONE_HOUR_IN_MINUTES;
      const end = ensureEndDate(
        baseStart,
        slot.endDate ?? null,
        durationMinutes > 0 ? durationMinutes : ONE_HOUR_IN_MINUTES,
      );

      rentalEntries.push({
        id: `field-rental-${field.$id}-${slot.$id}`,
        title: 'Rental Slot',
        start: baseStart,
        end,
        resourceId: field.$id,
        resource: slot,
        metaType: 'rental',
        fieldName: baseTitle,
      });
    });

    return [...eventEntries, ...matchEntries, ...rentalEntries];
  });
};
