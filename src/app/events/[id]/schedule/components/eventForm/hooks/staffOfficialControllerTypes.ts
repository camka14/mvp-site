import type { SetStateAction } from 'react';

import type {
    Event,
    Field,
    Organization,
    Sport,
    UserData,
} from '@/types';

import type { EventFormValues } from '../formTypes';
import type { PendingStaffInvite } from '../staffInvites';

export type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

export type EventFormGetValues = (name: string) => unknown;

export type EventFormStateSetter<T> = (
    updater: SetStateAction<T>,
    options?: Record<string, unknown>,
) => void;

export type UseStaffOfficialControllerParams = {
    eventData: EventFormValues;
    activeEditingEvent: Event | null;
    incomingEvent: Event | null | undefined;
    currentUser?: UserData | null;
    resolvedOrganization: Organization | null;
    isOrganizationHostedEvent: boolean;
    selectedSportForOfficials?: Sport | null;
    fields: Field[];
    selectedFieldIds: string[];
    setValue: EventFormSetValue;
    getValues: EventFormGetValues;
    setEventData: EventFormStateSetter<EventFormValues>;
    setPendingStaffInvites: EventFormStateSetter<PendingStaffInvite[]>;
};
