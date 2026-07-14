import {
    useCallback,
    useState,
} from 'react';
import {
    renderHook,
    waitFor,
} from '@testing-library/react';

import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';
import type { UserData } from '@/types';

import type { EventFormValues } from '../../formTypes';
import { useEventFormReferenceHydration } from '../useEventFormReferenceHydration';

jest.mock('@/lib/locationService', () => ({
    locationService: {
        reverseGeocode: jest.fn(),
    },
}));

jest.mock('@/lib/userService', () => ({
    userService: {
        getUsersByIds: jest.fn(),
    },
}));

const getUsersByIdsMock = jest.mocked(userService.getUsersByIds);
const reverseGeocodeMock = jest.mocked(locationService.reverseGeocode);

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventOfficials: [],
    officials: [],
    coordinates: [0, 0],
    location: '',
    ...overrides,
} as EventFormValues);

const useReferenceHydrationHarness = (
    initialEventData: EventFormValues,
    isEditMode = false,
) => {
    const [eventData, setEventDataState] = useState(initialEventData);
    const setEventData = useCallback((
        updater: React.SetStateAction<EventFormValues>,
    ) => {
        setEventDataState((previous) => (
            typeof updater === 'function' ? updater(previous) : updater
        ));
    }, []);

    useEventFormReferenceHydration({
        eventData,
        isEditMode,
        setEventData,
    });

    return eventData;
};

describe('useEventFormReferenceHydration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getUsersByIdsMock.mockResolvedValue([]);
        reverseGeocodeMock.mockResolvedValue({
            city: '',
            state: '',
            lat: 0,
            lng: 0,
        });
    });

    it('hydrates missing official references without replacing existing officials', async () => {
        const existingOfficial = { $id: 'official_existing' } as UserData;
        const hydratedOfficial = { $id: 'official_missing' } as UserData;
        getUsersByIdsMock.mockResolvedValue([hydratedOfficial]);

        const { result } = renderHook(() => useReferenceHydrationHarness(buildEventData({
            officials: [existingOfficial],
            eventOfficials: [{
                id: 'assignment_1',
                userId: hydratedOfficial.$id,
                positionIds: [],
                fieldIds: [],
                isActive: true,
            }],
        })));

        await waitFor(() => expect(result.current.officials).toEqual([
            existingOfficial,
            hydratedOfficial,
        ]));
        expect(getUsersByIdsMock).toHaveBeenCalledWith([hydratedOfficial.$id]);
    });

    it('does not hydrate official or location references while editing', async () => {
        renderHook(() => useReferenceHydrationHarness(buildEventData({
            eventOfficials: [{
                id: 'assignment_1',
                userId: 'official_missing',
                positionIds: [],
                fieldIds: [],
                isActive: true,
            }],
            coordinates: [-122.67, 45.52],
        }), true));

        await Promise.resolve();
        expect(getUsersByIdsMock).not.toHaveBeenCalled();
        expect(reverseGeocodeMock).not.toHaveBeenCalled();
    });

    it('fills an empty create-form location from coordinates', async () => {
        reverseGeocodeMock.mockResolvedValue({
            city: 'Portland',
            state: 'OR',
            lat: 45.52,
            lng: -122.67,
        });
        const { result } = renderHook(() => useReferenceHydrationHarness(buildEventData({
            coordinates: [-122.67, 45.52],
        })));

        await waitFor(() => expect(result.current.location).toBe('Portland, OR'));
        expect(reverseGeocodeMock).toHaveBeenCalledWith(45.52, -122.67);
    });
});
