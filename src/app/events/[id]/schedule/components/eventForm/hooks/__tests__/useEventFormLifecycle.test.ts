import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm, type Resolver } from 'react-hook-form';

import type { Event, Field, Sport } from '@/types';

import { buildEvent } from '../../../../../../../../../test/factories';
import type { EventFormValues } from '../../formTypes';
import {
    useEventFormDefaults,
    useEventFormLifecycle,
    useEventFormLifecycleStabilization,
} from '../useEventFormLifecycle';

const volleyball = {
    $id: 'volleyball',
    name: 'Volleyball',
} as Sport;
const sportsById = new Map([[volleyball.$id, volleyball]]);
const resolver: Resolver<EventFormValues> = async (values) => ({
    values: values as EventFormValues,
    errors: {},
});

type HarnessProps = {
    event: Event;
    fieldsLoading?: boolean;
    immutableDefaults?: Partial<Event>;
    isCreateMode?: boolean;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: {
        draft: Partial<Event>;
        baselineDraft: Partial<Event>;
    }) => void;
    open?: boolean;
    sportsLoading?: boolean;
};

const projectDraft = (values?: EventFormValues): Partial<Event> => ({
    $id: values?.$id ?? '',
    name: values?.name ?? '',
    location: values?.location ?? '',
});

const useLifecycleHarness = ({
    event,
    fieldsLoading = false,
    immutableDefaults,
    isCreateMode = false,
    onDirtyStateChange,
    onDraftStateChange,
    open = true,
    sportsLoading = false,
}: HarnessProps) => {
    const defaults = useEventFormDefaults({
        activeEditingEvent: event,
        immutableDefaults,
        isCreateMode,
        resolvedOrganizationFields: [],
        resolvedOrganizationId: '',
        sportsById,
    });
    const form = useForm<EventFormValues>({
        defaultValues: defaults.buildDefaultFormValues(),
        resolver,
    });
    // eslint-disable-next-line react-hooks/incompatible-library -- exercise the production React Hook Form subscription boundary.
    const formValues = form.watch();
    const lifecycle = useEventFormLifecycle({
        activeEditingEvent: event,
        buildDefaultFormValues: defaults.buildDefaultFormValues,
        formValues,
        getValues: form.getValues,
        isCreateMode,
        isDirty: form.formState.isDirty,
        onDirtyStateChange,
        onDraftStateChange,
        open,
        reset: form.reset,
    });
    useEventFormLifecycleStabilization({
        buildDraftEvent: projectDraft,
        fieldsLoading,
        formValues,
        getValues: form.getValues,
        lifecycle: lifecycle.stabilization,
        open,
        reset: form.reset,
        sportsLoading,
    });
    return { ...defaults, ...form, ...lifecycle, formValues };
};

const settleInitialBaseline = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const buildLifecycleEvent = (overrides: Partial<Event> = {}): Event => buildEvent({
    $id: 'event_1',
    name: 'Initial Event',
    location: 'Initial Gym',
    eventType: 'EVENT',
    sport: volleyball,
    sportId: volleyball.$id,
    singleDivision: true,
    divisions: [],
    divisionDetails: [],
    timeSlots: [],
    ...overrides,
});

describe('useEventFormLifecycle', () => {
    it('builds form defaults with immutable fields, slots, and values applied', () => {
        const lockedField = {
            $id: 'field_locked',
            name: 'Locked Court',
        } as Field;
        const event = buildLifecycleEvent();
        const { result } = renderHook(() => useLifecycleHarness({
            event,
            immutableDefaults: {
                name: 'Locked Event Name',
                fields: [lockedField],
                timeSlots: [{
                    $id: 'slot_locked',
                    name: 'Locked Slot',
                } as NonNullable<Event['timeSlots']>[number]],
            },
        }));

        expect(result.current.formValues.name).toBe('Locked Event Name');
        expect(result.current.isImmutableField('name')).toBe(true);
        expect(result.current.hasImmutableFields).toBe(true);
        expect(result.current.immutableFields).toEqual([
            expect.objectContaining({ $id: 'field_locked', name: 'Locked Court' }),
        ]);
        expect(result.current.immutableTimeSlotsFromDefaults).toEqual([
            expect.objectContaining({
                $id: 'slot_locked',
                scheduledFieldId: 'field_locked',
                scheduledFieldIds: ['field_locked'],
            }),
        ]);
    });

    it('preserves local edits for the same source and resets when the event id changes', async () => {
        const onDirtyStateChange = jest.fn();
        const event = buildLifecycleEvent();
        const { result, rerender } = renderHook(
            (props: HarnessProps) => useLifecycleHarness(props),
            { initialProps: { event, onDirtyStateChange } },
        );
        await settleInitialBaseline();

        act(() => {
            result.current.setValue('name', 'Local Edit', {
                shouldDirty: true,
                shouldValidate: true,
            });
        });
        await waitFor(() => expect(onDirtyStateChange).toHaveBeenLastCalledWith(true));

        rerender({
            event: { ...event, name: 'Server Update With Same Id' },
            onDirtyStateChange,
        });
        expect(result.current.formValues.name).toBe('Local Edit');

        rerender({
            event: buildLifecycleEvent({ $id: 'event_2', name: 'Different Event' }),
            onDirtyStateChange,
        });
        await waitFor(() => expect(result.current.formValues.name).toBe('Different Event'));
        expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
    });

    it('clears external dirty and draft state when the form closes', async () => {
        const onDirtyStateChange = jest.fn();
        const onDraftStateChange = jest.fn();
        const event = buildLifecycleEvent();
        const { rerender } = renderHook(
            (props: HarnessProps) => useLifecycleHarness(props),
            {
                initialProps: {
                    event,
                    onDirtyStateChange,
                    onDraftStateChange,
                    open: true,
                },
            },
        );
        await settleInitialBaseline();

        rerender({
            event,
            onDirtyStateChange,
            onDraftStateChange,
            open: false,
        });

        expect(onDirtyStateChange).toHaveBeenCalledWith(false);
        expect(onDraftStateChange).toHaveBeenCalledWith({
            draft: {},
            baselineDraft: {},
        });
    });

    it('publishes draft changes against the stabilized baseline and commits a new baseline', async () => {
        const onDirtyStateChange = jest.fn();
        const onDraftStateChange = jest.fn();
        const { result } = renderHook(() => useLifecycleHarness({
            event: buildLifecycleEvent(),
            onDirtyStateChange,
            onDraftStateChange,
        }));
        await settleInitialBaseline();

        act(() => {
            result.current.setValue('name', 'First Edit', {
                shouldDirty: true,
                shouldValidate: true,
            });
        });
        await waitFor(() => {
            expect(onDraftStateChange).toHaveBeenLastCalledWith({
                draft: expect.objectContaining({ name: 'First Edit' }),
                baselineDraft: expect.objectContaining({ name: 'Initial Event' }),
            });
            expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
        });

        act(() => result.current.commitDirtyBaseline());
        expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);

        act(() => {
            result.current.setValue('name', 'Second Edit', {
                shouldDirty: true,
                shouldValidate: true,
            });
        });
        await waitFor(() => expect(onDraftStateChange).toHaveBeenLastCalledWith({
            draft: expect.objectContaining({ name: 'Second Edit' }),
            baselineDraft: expect.objectContaining({ name: 'First Edit' }),
        }));
    });

    it('waits for catalog hydration before enabling dirty tracking', async () => {
        const onDirtyStateChange = jest.fn();
        const event = buildLifecycleEvent();
        const { result, rerender } = renderHook(
            (props: HarnessProps) => useLifecycleHarness(props),
            {
                initialProps: {
                    event,
                    onDirtyStateChange,
                    sportsLoading: true,
                },
            },
        );

        act(() => {
            result.current.setValue('location', 'Hydrated Gym', {
                shouldDirty: true,
                shouldValidate: true,
            });
        });
        await settleInitialBaseline();
        expect(onDirtyStateChange).not.toHaveBeenCalledWith(true);

        rerender({ event, onDirtyStateChange, sportsLoading: false });
        await settleInitialBaseline();
        expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);

        act(() => {
            result.current.setValue('location', 'User Selected Gym', {
                shouldDirty: true,
                shouldValidate: true,
            });
        });
        await waitFor(() => expect(onDirtyStateChange).toHaveBeenLastCalledWith(true));
    });
});
