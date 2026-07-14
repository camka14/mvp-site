import {
    useCallback,
    useState,
} from 'react';
import {
    renderHook,
    waitFor,
} from '@testing-library/react';

import type { EventFormValues } from '../../formTypes';
import { useEventFormInvariantSynchronization } from '../useEventFormInvariantSynchronization';

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    noFixedEndDateTime: false,
    teamSignup: false,
    joinAsParticipant: false,
    teamCheckInMode: 'OFF',
    allowMatchRosterEdits: false,
    allowTemporaryMatchPlayers: false,
    ...overrides,
} as EventFormValues);

type HarnessParams = {
    eventData: EventFormValues;
    hasExternalRentalField?: boolean;
    isEditMode?: boolean;
    isRentalCreateFlow?: boolean;
    supportsNoFixedEndDateTime?: boolean;
};

const useInvariantSynchronizationHarness = ({
    eventData: initialEventData,
    hasExternalRentalField = false,
    isEditMode = false,
    isRentalCreateFlow = false,
    supportsNoFixedEndDateTime = false,
}: HarnessParams) => {
    const [eventData, setEventDataState] = useState(initialEventData);
    const setEventData = useCallback((
        updater: React.SetStateAction<EventFormValues>,
    ) => {
        setEventDataState((previous) => (
            typeof updater === 'function' ? updater(previous) : updater
        ));
    }, []);
    const setValue = useCallback((name: string, value: unknown) => {
        setEventDataState((previous) => ({ ...previous, [name]: value }));
    }, []);
    const setJoinAsParticipant = useCallback((value: boolean) => {
        setValue('joinAsParticipant', value);
    }, [setValue]);

    useEventFormInvariantSynchronization({
        eventData,
        hasExternalRentalField,
        isEditMode,
        isRentalCreateFlow,
        joinAsParticipant: eventData.joinAsParticipant,
        setEventData,
        setJoinAsParticipant,
        setValue,
        supportsNoFixedEndDateTime,
    });

    return eventData;
};

describe('useEventFormInvariantSynchronization', () => {
    it('normalizes rental weekly events and enables a supported open-ended schedule', async () => {
        const { result } = renderHook(() => useInvariantSynchronizationHarness({
            eventData: buildEventData({ eventType: 'WEEKLY_EVENT' }),
            isRentalCreateFlow: true,
            supportsNoFixedEndDateTime: true,
        }));

        await waitFor(() => {
            expect(result.current.eventType).toBe('EVENT');
            expect(result.current.noFixedEndDateTime).toBe(true);
        });
    });

    it('enforces team registration and removes duplicate creator participation', async () => {
        const { result } = renderHook(() => useInvariantSynchronizationHarness({
            eventData: buildEventData({
                eventType: 'LEAGUE',
                joinAsParticipant: true,
            }),
        }));

        await waitFor(() => {
            expect(result.current.teamSignup).toBe(true);
            expect(result.current.joinAsParticipant).toBe(false);
        });
    });

    it('clears team-only check-in and roster settings for individual registration', async () => {
        const { result } = renderHook(() => useInvariantSynchronizationHarness({
            eventData: buildEventData({
                teamCheckInMode: 'MATCH',
                allowMatchRosterEdits: true,
                allowTemporaryMatchPlayers: true,
            }),
        }));

        await waitFor(() => {
            expect(result.current.teamCheckInMode).toBe('OFF');
            expect(result.current.allowMatchRosterEdits).toBe(false);
            expect(result.current.allowTemporaryMatchPlayers).toBe(false);
        });
    });

    it('disables temporary players when match roster edits are disabled', async () => {
        const { result } = renderHook(() => useInvariantSynchronizationHarness({
            eventData: buildEventData({
                teamSignup: true,
                allowMatchRosterEdits: false,
                allowTemporaryMatchPlayers: true,
            }),
        }));

        await waitFor(() => expect(result.current.allowTemporaryMatchPlayers).toBe(false));
    });
});
