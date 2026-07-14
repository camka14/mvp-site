import { useMemo } from 'react';

import { buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { Event } from '@/types';
import {
    buildWeeklySessionOptions,
    resolveSelectedWeeklySessionOption,
} from '../weeklySessions';

type UseWeeklyEventSelectionModelArgs = {
    event: Event;
    selectedOccurrence: WeeklyOccurrenceSelection | null | undefined;
};

export function useWeeklyEventSelectionModel({
    event,
    selectedOccurrence,
}: UseWeeklyEventSelectionModelArgs) {
    const eventPublicUrl = useMemo(
        () => (event.$id ? buildEventPublicUrl(event.$id) : ''),
        [event.$id],
    );
    const organizationLogoId = useMemo(() => {
        const organization = event.organization;
        if (
            organization
            && typeof organization === 'object'
            && typeof organization.logoId === 'string'
        ) {
            return organization.logoId;
        }
        return null;
    }, [event.organization]);
    const isWeeklyParentEvent = event.eventType === 'WEEKLY_EVENT' && !event.parentEvent;
    const weeklySessionOptions = useMemo(
        () => (isWeeklyParentEvent ? buildWeeklySessionOptions(event, 3) : []),
        [event, isWeeklyParentEvent],
    );
    const normalizedSelectedOccurrence = useMemo<WeeklyOccurrenceSelection | null>(() => {
        const slotId = typeof selectedOccurrence?.slotId === 'string'
            ? selectedOccurrence.slotId.trim()
            : '';
        const occurrenceDate = typeof selectedOccurrence?.occurrenceDate === 'string'
            ? selectedOccurrence.occurrenceDate.trim()
            : '';
        return slotId && occurrenceDate ? { slotId, occurrenceDate } : null;
    }, [selectedOccurrence]);
    const selectedWeeklyOccurrenceOption = useMemo(
        () => normalizedSelectedOccurrence
            ? weeklySessionOptions.find((option) => (
                option.slotId === normalizedSelectedOccurrence.slotId
                && option.occurrenceDate === normalizedSelectedOccurrence.occurrenceDate
            )) ?? resolveSelectedWeeklySessionOption(event, normalizedSelectedOccurrence)
            : null,
        [event, normalizedSelectedOccurrence, weeklySessionOptions],
    );
    const selectedWeeklyOccurrence = useMemo<WeeklyOccurrenceSelection | undefined>(
        () => selectedWeeklyOccurrenceOption
            ? {
                slotId: selectedWeeklyOccurrenceOption.slotId,
                occurrenceDate: selectedWeeklyOccurrenceOption.occurrenceDate,
            }
            : undefined,
        [selectedWeeklyOccurrenceOption],
    );

    return {
        eventPublicUrl,
        organizationLogoId,
        isWeeklyParentEvent,
        weeklySessionOptions,
        selectedWeeklyOccurrenceOption,
        selectedWeeklyOccurrence,
        weeklySelectionRequired: isWeeklyParentEvent && !selectedWeeklyOccurrence,
    };
}
