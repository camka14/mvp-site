import { useRef, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { apiRequest } from '@/lib/apiClient';
import type { Event, Field, Organization, TimeSlot } from '@/types';

import { buildEvent } from '../../../../../../../../../test/factories';
import type { EventFormValues } from '../../formTypes';
import type { RentalBookingsResponse } from '../../rentalResources';
import { useEventResourceController } from '../useEventResourceController';

jest.mock('@/lib/apiClient', () => ({
    apiRequest: jest.fn(),
}));

let localFieldSequence = 0;
jest.mock('@/lib/clientId', () => ({
    createClientId: jest.fn(() => `local_field_${++localFieldSequence}`),
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const EMPTY_FIELDS: Field[] = [];
const EMPTY_TIME_SLOTS: TimeSlot[] = [];
const SLOT_DIVISION_KEYS = ['open'];

type HarnessProps = {
    activeEditingEvent: Event;
    eventData: EventFormValues;
    open?: boolean;
    organization?: Organization | null;
};

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    $id: 'event_1',
    eventType: 'EVENT',
    organizationId: '',
    location: 'Initial Gym',
    timeZone: 'America/Los_Angeles',
    fields: [],
    fieldCount: 0,
    selectedFieldIds: [],
    divisionFieldIds: {},
    divisions: ['open'],
    leagueSlots: [],
    ...overrides,
} as EventFormValues);

const buildOrganization = (fields: Field[] = []): Organization => ({
    $id: 'org_1',
    name: 'Home Organization',
    fields,
} as Organization);

const buildRentalResponse = (): RentalBookingsResponse => ({
    bookings: [{
        $id: 'booking_1',
        items: [{
            $id: 'booking_item_1',
            fieldId: 'rental_field_1',
            start: '2026-07-20T18:00:00.000Z',
            end: '2026-07-20T20:00:00.000Z',
            timeZone: 'America/Los_Angeles',
            field: {
                $id: 'rental_field_1',
                name: 'Rental Court',
                organization: 'rental_org_1',
                location: 'Rental Center',
                lat: 0,
                long: 0,
            } as Field,
        }],
    }],
});

const useResourceHarness = ({
    activeEditingEvent,
    eventData,
    open = true,
    organization = null,
}: HarnessProps) => {
    const [, setHydratedOrganization] = useState<Organization | null>(organization);
    const form = useForm<EventFormValues>({ defaultValues: eventData });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const previousEventFieldLocationRef = useRef('');
    const previousEventTypeRef = useRef<Event['eventType'] | null>(null);
    const controller = useEventResourceController({
        activeEditingEvent,
        eventData: formValues,
        fieldCountDirty: Boolean(form.formState.dirtyFields.fieldCount),
        fieldsDirty: Boolean(form.formState.dirtyFields.fields),
        getValues: form.getValues,
        hasImmutableFields: false,
        immutableFields: EMPTY_FIELDS,
        immutableTimeSlotsFromDefaults: EMPTY_TIME_SLOTS,
        isAffiliateEvent: false,
        isCreateMode: true,
        isEditMode: false,
        open,
        previousEventFieldLocationRef,
        previousEventTypeRef,
        resolvedOrganization: organization,
        setHydratedOrganization,
        setValue: form.setValue as unknown as (
            name: string,
            value: unknown,
            options?: { shouldDirty?: boolean; shouldValidate?: boolean },
        ) => void,
        slotDivisionKeys: SLOT_DIVISION_KEYS,
    });
    return { ...controller, ...form, formValues };
};

describe('useEventResourceController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localFieldSequence = 0;
        mockedApiRequest.mockResolvedValue({ bookings: [] });
    });

    it('creates, relocates, and renames only event-local resources through React Hook Form', async () => {
        const eventData = buildEventData({ fieldCount: 2 });
        const activeEditingEvent = buildEvent({
            $id: eventData.$id,
            eventType: 'EVENT',
            location: eventData.location,
            fields: [],
        });
        const { result } = renderHook(() => useResourceHarness({
            activeEditingEvent,
            eventData,
        }));

        await waitFor(() => expect(result.current.formValues.fields).toEqual([
            expect.objectContaining({ name: 'Field 1', location: 'Initial Gym' }),
            expect.objectContaining({ name: 'Field 2', location: 'Initial Gym' }),
        ]));
        expect(result.current.showLocalFieldCreationControls).toBe(true);

        const firstFieldId = result.current.formValues.fields[0].$id;
        act(() => result.current.handleLocalFieldNameChange(firstFieldId, 'Championship Court'));
        await waitFor(() => expect(result.current.formValues.fields[0].name).toBe('Championship Court'));

        act(() => result.current.setValue('location', 'Updated Gym', { shouldDirty: true }));
        await waitFor(() => expect(result.current.formValues.fields).toEqual([
            expect.objectContaining({ name: 'Championship Court', location: 'Updated Gym' }),
            expect.objectContaining({ name: 'Field 2', location: 'Updated Gym' }),
        ]));
    });

    it('hydrates organization and rental resources and derives locked selected slots', async () => {
        mockedApiRequest.mockResolvedValue(buildRentalResponse());
        const homeField = {
            $id: 'home_field_1',
            name: 'Home Court',
            organization: 'org_1',
            location: 'Home Gym',
        } as Field;
        const organization = buildOrganization([homeField]);
        const eventData = buildEventData({
            organizationId: organization.$id,
            fieldCount: 1,
            selectedFieldIds: ['rental:booking_item_1'],
        });
        const activeEditingEvent = buildEvent({
            $id: eventData.$id,
            eventType: 'EVENT',
            organizationId: organization.$id,
            fields: [],
        });
        const { result } = renderHook(() => useResourceHarness({
            activeEditingEvent,
            eventData,
            organization,
        }));

        await waitFor(() => expect(result.current.rentalResourceOptions).toHaveLength(1));
        await waitFor(() => expect(result.current.formValues.fieldCount).toBe(0));
        await waitFor(() => expect(result.current.rentalLockedSlotsForDraft).toEqual([
            expect.objectContaining({
                rentalBookingId: 'booking_1',
                rentalBookingItemId: 'booking_item_1',
                scheduledFieldIds: ['rental_field_1'],
                rentalLocked: true,
            }),
        ]));

        expect(mockedApiRequest).toHaveBeenCalledWith('/api/rentals/bookings?organizationId=org_1');
        expect(result.current.selectedRentedFieldIds).toEqual(['rental_field_1']);
        expect(result.current.organizationResourcePool.map((field) => field.$id)).toEqual([
            'home_field_1',
            'rental:booking_item_1',
        ]);
        expect(result.current.showLocalFieldCreationControls).toBe(false);
    });

    it('surfaces rental loading failures without replacing organization resources', async () => {
        mockedApiRequest.mockRejectedValue(new Error('Rental lookup failed'));
        const homeField = {
            $id: 'home_field_1',
            name: 'Home Court',
            organization: 'org_1',
        } as Field;
        const organization = buildOrganization([homeField]);
        const eventData = buildEventData({ organizationId: organization.$id });
        const { result } = renderHook(() => useResourceHarness({
            activeEditingEvent: buildEvent({
                $id: eventData.$id,
                eventType: 'EVENT',
                organizationId: organization.$id,
            }),
            eventData,
            organization,
        }));

        await waitFor(() => expect(result.current.rentalResourcesError).toBe('Rental lookup failed'));
        expect(result.current.rentalResourceOptions).toEqual([]);
        expect(result.current.resourceSelectorLoading).toBe(false);
        expect(result.current.formValues.fields).toEqual([
            expect.objectContaining({ $id: 'home_field_1', name: 'Home Court' }),
        ]);
    });

    it('rejects a deferred rental response after the form closes', async () => {
        let resolveRentalRequest!: (response: RentalBookingsResponse) => void;
        mockedApiRequest.mockReturnValue(new Promise((resolve) => {
            resolveRentalRequest = resolve;
        }));
        const homeField = {
            $id: 'home_field_1',
            name: 'Home Court',
            organization: 'org_1',
        } as Field;
        const organization = buildOrganization([homeField]);
        const eventData = buildEventData({ organizationId: organization.$id });
        const activeEditingEvent = buildEvent({
            $id: eventData.$id,
            eventType: 'EVENT',
            organizationId: organization.$id,
        });
        const { result, rerender } = renderHook(
            (props: HarnessProps) => useResourceHarness(props),
            {
                initialProps: {
                    activeEditingEvent,
                    eventData,
                    open: true,
                    organization,
                },
            },
        );
        await waitFor(() => expect(result.current.resourceSelectorLoading).toBe(true));

        rerender({ activeEditingEvent, eventData, open: false, organization });
        await act(async () => {
            resolveRentalRequest(buildRentalResponse());
            await Promise.resolve();
        });

        expect(result.current.rentalResourceOptions).toEqual([]);
        expect(result.current.rentalResourcesError).toBeNull();
        expect(result.current.resourceSelectorLoading).toBe(false);
        expect(result.current.formValues.fields.some((field) => field.$id === 'rental_field_1')).toBe(false);
    });
});
