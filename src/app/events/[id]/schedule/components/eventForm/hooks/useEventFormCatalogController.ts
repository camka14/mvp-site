import {
    useCallback,
    useEffect,
    useState,
    type SetStateAction,
} from 'react';

import type {
    EventTag,
    Organization,
} from '@/types';

type UseEventFormCatalogControllerParams = {
    organization?: Organization | null;
};

export const useEventFormCatalogController = ({
    organization,
}: UseEventFormCatalogControllerParams) => {
    const sourceOrganization = organization ?? null;
    const [organizationState, setOrganizationState] = useState(() => ({
        source: sourceOrganization,
        value: sourceOrganization,
    }));
    const [eventTagOptions, setEventTagOptions] = useState<EventTag[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        void fetch('/api/event-tags', { signal: controller.signal })
            .then((response) => (
                response.ok
                    ? response.json()
                    : Promise.reject(new Error('Failed to load tags'))
            ))
            .then((body) => {
                setEventTagOptions(Array.isArray(body?.tags) ? body.tags : []);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    setEventTagOptions([]);
                }
            });
        return () => controller.abort();
    }, []);

    const hydratedOrganization = organizationState.source === sourceOrganization
        ? organizationState.value
        : sourceOrganization;
    const setHydratedOrganization = useCallback((
        update: SetStateAction<Organization | null>,
    ) => {
        setOrganizationState((current) => {
            const currentValue = current.source === sourceOrganization
                ? current.value
                : sourceOrganization;
            return {
                source: sourceOrganization,
                value: typeof update === 'function' ? update(currentValue) : update,
            };
        });
    }, [sourceOrganization]);

    return {
        eventTagOptions,
        hydratedOrganization,
        setHydratedOrganization,
    };
};
