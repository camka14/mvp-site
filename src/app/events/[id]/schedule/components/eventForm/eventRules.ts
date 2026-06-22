import type { Event } from '@/types';

type EventType = Event['eventType'];

export const supportsScheduleSlots = (eventType: EventType): boolean =>
    eventType === 'LEAGUE' || eventType === 'TOURNAMENT' || eventType === 'WEEKLY_EVENT';

export const hasParentEventRef = (value?: string | null): boolean =>
    typeof value === 'string' && value.trim().length > 0;

export const supportsScheduleSlotsForEvent = (eventType: EventType, parentEvent?: string | null): boolean => (
    supportsScheduleSlots(eventType)
    && !(eventType === 'WEEKLY_EVENT' && hasParentEventRef(parentEvent))
);

export const supportsFieldCountForEvent = (eventType: EventType): boolean =>
    eventType === 'EVENT' || eventType === 'LEAGUE' || eventType === 'TOURNAMENT';

export const supportsOrganizationFieldSelectionForEvent = (eventType: EventType, parentEvent?: string | null): boolean =>
    eventType === 'EVENT' || (eventType === 'WEEKLY_EVENT' && !hasParentEventRef(parentEvent));

export const isTournamentPoolPlayFormEnabled = (eventType: EventType, includePlayoffs: boolean): boolean => (
    eventType === 'TOURNAMENT' && includePlayoffs
);
