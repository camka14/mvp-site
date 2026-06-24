import { useEffect, useState } from 'react';
import type { SetStateAction } from 'react';

import { apiRequest } from '@/lib/apiClient';
import type { Field } from '@/types';

import {
    mapRentalBookingsToResourceOptions,
    type RentalBookingResourceOption,
    type RentalBookingsResponse,
} from '../rentalResources';
import { mergeFieldsById } from '../resourceGroups';

type SetFields = (
    updater: SetStateAction<Field[]>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseRentalBookingResourcesParams = {
    eventId?: string | null;
    isEditMode: boolean;
    open: boolean;
    organizationId?: string | null;
    shouldLoad: boolean;
    setFields: SetFields;
};

export const useRentalBookingResources = ({
    eventId,
    isEditMode,
    open,
    organizationId,
    shouldLoad,
    setFields,
}: UseRentalBookingResourcesParams) => {
    const [options, setOptions] = useState<RentalBookingResourceOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !shouldLoad) {
            setOptions([]);
            setError(null);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const params = new URLSearchParams();
        if (isEditMode && eventId) {
            params.set('eventId', eventId);
        }
        if (organizationId) {
            params.set('organizationId', organizationId);
        }

        const loadRentalResources = async () => {
            try {
                setLoading(true);
                setError(null);
                const suffix = params.toString();
                const response = await apiRequest<RentalBookingsResponse>(
                    `/api/rentals/bookings${suffix ? `?${suffix}` : ''}`,
                );
                if (cancelled) {
                    return;
                }
                const nextOptions = mapRentalBookingsToResourceOptions(response);
                setOptions(nextOptions);
                const rentalFields = nextOptions.map((option) => option.field);
                setFields((previous) => {
                    const withoutPreviousRentalFields = previous.filter((field) => {
                        const marker = (field as { rentalResource?: boolean; _rentalResource?: boolean });
                        return !marker.rentalResource && !marker._rentalResource;
                    });
                    return rentalFields.length
                        ? mergeFieldsById(withoutPreviousRentalFields, rentalFields)
                        : withoutPreviousRentalFields;
                }, { shouldDirty: false, shouldValidate: false });
            } catch (loadError) {
                if (cancelled) {
                    return;
                }
                setOptions([]);
                setError(loadError instanceof Error ? loadError.message : 'Failed to load reserved resources.');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadRentalResources();

        return () => {
            cancelled = true;
        };
    }, [
        eventId,
        isEditMode,
        open,
        organizationId,
        setFields,
        shouldLoad,
    ]);

    return {
        options,
        loading,
        error,
    };
};
