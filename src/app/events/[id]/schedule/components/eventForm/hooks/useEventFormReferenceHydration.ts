import {
    useEffect,
    type SetStateAction,
} from 'react';

import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';

import {
    coordinatesAreSet,
    getLatitudeFromCoordinates,
    getLongitudeFromCoordinates,
} from '../locationHelpers';
import { getEventOfficialUserIds } from '../officials';
import type { EventFormValues } from '../formTypes';

type EventDataSetter = (
    updater: SetStateAction<EventFormValues>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventFormReferenceHydrationParams = {
    eventData: EventFormValues;
    isEditMode: boolean;
    setEventData: EventDataSetter;
};

/** Hydrates display-only references without creating another persisted form owner. */
export const useEventFormReferenceHydration = ({
    eventData,
    isEditMode,
    setEventData,
}: UseEventFormReferenceHydrationParams): void => {
    useEffect(() => {
        if (isEditMode) {
            return;
        }
        const ids = getEventOfficialUserIds(eventData.eventOfficials);
        const refs = eventData.officials || [];
        const missingIds = ids.filter((id) => !refs.some((ref) => ref.$id === id));
        if (!missingIds.length) {
            return;
        }

        let cancelled = false;
        void userService.getUsersByIds(missingIds)
            .then((fetched) => {
                if (cancelled || !fetched.length) {
                    return;
                }
                setEventData((previous) => ({
                    ...previous,
                    officials: [
                        ...(previous.officials || []),
                        ...fetched.filter((ref) => ref.$id),
                    ],
                }), { shouldDirty: false, shouldValidate: false });
            })
            .catch((error) => {
                if (!cancelled) {
                    console.warn('Failed to hydrate officials for event:', error);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [eventData.eventOfficials, eventData.officials, isEditMode, setEventData]);

    useEffect(() => {
        const latitude = getLatitudeFromCoordinates(eventData.coordinates);
        const longitude = getLongitudeFromCoordinates(eventData.coordinates);
        const hasCoordinates = coordinatesAreSet(eventData.coordinates);

        if (
            isEditMode
            || eventData.location.trim().length > 0
            || !hasCoordinates
            || typeof latitude !== 'number'
            || typeof longitude !== 'number'
        ) {
            return;
        }

        let cancelled = false;
        void locationService.reverseGeocode(latitude, longitude)
            .then((info) => {
                if (cancelled) {
                    return;
                }
                const label = [info.city, info.state].filter(Boolean).join(', ')
                    || `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`;
                setEventData((previous) => ({ ...previous, location: label }));
            })
            .catch(() => {
                // Location hydration is optional; users can still enter it manually.
            });

        return () => {
            cancelled = true;
        };
    }, [eventData.coordinates, eventData.location, isEditMode, setEventData]);
};
