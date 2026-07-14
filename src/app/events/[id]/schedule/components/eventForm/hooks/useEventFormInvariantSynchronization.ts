import {
    useEffect,
    type SetStateAction,
} from 'react';

import type { EventFormValues } from '../formTypes';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type EventDataSetter = (
    updater: SetStateAction<EventFormValues>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventFormInvariantSynchronizationParams = {
    eventData: EventFormValues;
    hasExternalRentalField: boolean;
    isEditMode: boolean;
    isRentalCreateFlow: boolean;
    joinAsParticipant: boolean;
    setEventData: EventDataSetter;
    setJoinAsParticipant: (value: boolean) => void;
    setValue: EventFormSetValue;
    supportsNoFixedEndDateTime: boolean;
};

/** Keeps dependent form fields valid while React Hook Form remains the only draft owner. */
export const useEventFormInvariantSynchronization = ({
    eventData,
    hasExternalRentalField,
    isEditMode,
    isRentalCreateFlow,
    joinAsParticipant,
    setEventData,
    setJoinAsParticipant,
    setValue,
    supportsNoFixedEndDateTime,
}: UseEventFormInvariantSynchronizationParams): void => {
    useEffect(() => {
        if (isRentalCreateFlow && eventData.eventType === 'WEEKLY_EVENT') {
            setValue('eventType', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, isRentalCreateFlow, setValue]);

    useEffect(() => {
        if (
            !isEditMode
            && !hasExternalRentalField
            && supportsNoFixedEndDateTime
            && !eventData.noFixedEndDateTime
        ) {
            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
        }
    }, [
        eventData.noFixedEndDateTime,
        hasExternalRentalField,
        isEditMode,
        setValue,
        supportsNoFixedEndDateTime,
    ]);

    useEffect(() => {
        const requiresTeamSignup = eventData.eventType === 'LEAGUE'
            || eventData.eventType === 'TOURNAMENT';
        if (!requiresTeamSignup || eventData.teamSignup) {
            return;
        }
        setEventData((previous) => previous.teamSignup
            ? previous
            : { ...previous, teamSignup: true }, { shouldDirty: false });
    }, [eventData.eventType, eventData.teamSignup, setEventData]);

    useEffect(() => {
        if (eventData.teamSignup) {
            if (!eventData.allowMatchRosterEdits && eventData.allowTemporaryMatchPlayers) {
                setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
            }
            return;
        }
        if (
            eventData.teamCheckInMode !== 'OFF'
            || eventData.allowMatchRosterEdits
            || eventData.allowTemporaryMatchPlayers
        ) {
            setValue('teamCheckInMode', 'OFF', { shouldDirty: true, shouldValidate: true });
            setValue('allowMatchRosterEdits', false, { shouldDirty: true, shouldValidate: true });
            setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
        }
    }, [
        eventData.allowMatchRosterEdits,
        eventData.allowTemporaryMatchPlayers,
        eventData.teamCheckInMode,
        eventData.teamSignup,
        setValue,
    ]);

    useEffect(() => {
        if (eventData.teamSignup && joinAsParticipant) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup, joinAsParticipant, setJoinAsParticipant]);
};
