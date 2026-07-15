import type { Event } from '@/types';

type EventType = Event['eventType'];
type EventTypeOption = {
    value: EventType;
    label: string;
};

export const supportsScheduleSlots = (eventType: EventType): boolean =>
    eventType === 'LEAGUE' || eventType === 'TOURNAMENT' || eventType === 'WEEKLY_EVENT' || eventType === 'TRYOUT';

export const hasParentEventRef = (value?: string | null): boolean =>
    typeof value === 'string' && value.trim().length > 0;

export const hasAffiliateUrl = (value?: string | null): boolean =>
    typeof value === 'string' && value.trim().length > 0;

export const supportsScheduleSlotsForEvent = (eventType: EventType, parentEvent?: string | null): boolean => (
    supportsScheduleSlots(eventType)
    && !(eventType === 'WEEKLY_EVENT' && hasParentEventRef(parentEvent))
);

export const supportsFieldCountForEvent = (eventType: EventType): boolean =>
    eventType === 'EVENT' || eventType === 'LEAGUE' || eventType === 'TOURNAMENT' || eventType === 'TRYOUT';

export const supportsOrganizationFieldSelectionForEvent = (eventType: EventType, parentEvent?: string | null): boolean =>
    eventType === 'EVENT' || eventType === 'TRYOUT' || (eventType === 'WEEKLY_EVENT' && !hasParentEventRef(parentEvent));

export const isTournamentPoolPlayFormEnabled = (eventType: EventType, includePlayoffs: boolean): boolean => (
    eventType === 'TOURNAMENT' && includePlayoffs
);

export const buildEventTypeOptions = (
    isRentalCreateFlow: boolean,
    isOrganizationHostedEvent: boolean = false,
    clubFeaturesEnabled: boolean = false,
): EventTypeOption[] => [
    { value: 'EVENT', label: 'Event' },
    { value: 'TOURNAMENT', label: 'Tournament' },
    { value: 'LEAGUE', label: 'League' },
    ...(isOrganizationHostedEvent && clubFeaturesEnabled ? [{ value: 'TRYOUT' as const, label: 'Tryout' }] : []),
    ...(isRentalCreateFlow ? [] : [{ value: 'WEEKLY_EVENT' as const, label: 'Weekly Event' }]),
];

export const shouldShowOrganizationFieldsInEventDetails = ({
    isOrganizationHostedEvent,
    hasRentalResourceOptions,
    supportsOrganizationFieldSelection,
}: {
    isOrganizationHostedEvent: boolean;
    hasRentalResourceOptions: boolean;
    supportsOrganizationFieldSelection: boolean;
}): boolean => (
    (isOrganizationHostedEvent || hasRentalResourceOptions)
    && supportsOrganizationFieldSelection
);
