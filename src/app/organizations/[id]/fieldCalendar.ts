import { addMinutes } from 'date-fns';
import type { Field, Match, Event as EventRecord } from '@/types';

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
  resource: EventRecord | Match;
  metaType: 'event' | 'match';
  fieldName: string;
};

export const buildFieldCalendarEvents = (fields: Field[]): FieldCalendarEntry[] => {
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

    return [...eventEntries, ...matchEntries];
  });
};
