import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type MutableRefObject,
} from 'react';
import type {
    UseFormGetValues,
    UseFormReset,
} from 'react-hook-form';

import type { Event, Field, Sport } from '@/types';

import { buildEventFormDefaultValues } from '../defaultValues';
import { defaultFieldLocationForEvent } from '../fieldDefaults';
import type { EventFormState, EventFormValues } from '../formTypes';
import {
    applyImmutableEventDefaults,
    normalizeImmutableFields,
    normalizeImmutableTimeSlots,
} from '../immutableDefaults';
import type { DefaultLocation } from '../types';

type DraftState = {
    draft: Partial<Event>;
    baselineDraft: Partial<Event>;
};

type UseEventFormDefaultsOptions = {
    activeEditingEvent: Event;
    defaultLocation?: DefaultLocation;
    immutableDefaults?: Partial<Event>;
    isCreateMode: boolean;
    resolvedOrganizationFields?: Field[] | null;
    resolvedOrganizationId: string;
    sportsById: Map<string, Sport>;
};

type UseEventFormLifecycleOptions = {
    activeEditingEvent: Event;
    buildDefaultFormValues: () => EventFormValues;
    formValues: EventFormValues;
    getValues: UseFormGetValues<EventFormValues>;
    isCreateMode: boolean;
    isDirty: boolean;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: DraftState) => void;
    open: boolean;
    reset: UseFormReset<EventFormValues>;
};

export type EventFormLifecycleStabilizationState = {
    buildDraftForDirtyTrackingRef: MutableRefObject<(values: EventFormValues) => Partial<Event>>;
    dirtyBaselineValuesRef: MutableRefObject<EventFormValues | null>;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    pendingInitialDirtyRebaseRef: MutableRefObject<boolean>;
    pendingInitialDirtyRebaseTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
    setIsDirtyTrackingReady: (ready: boolean) => void;
};

type UseEventFormLifecycleStabilizationOptions = {
    buildDraftEvent: (values?: EventFormValues) => Partial<Event>;
    fieldsLoading: boolean;
    formValues: EventFormValues;
    getValues: UseFormGetValues<EventFormValues>;
    lifecycle: EventFormLifecycleStabilizationState;
    open: boolean;
    reset: UseFormReset<EventFormValues>;
    sportsLoading: boolean;
};

export const useEventFormDefaults = ({
    activeEditingEvent,
    defaultLocation,
    immutableDefaults,
    isCreateMode,
    resolvedOrganizationFields,
    resolvedOrganizationId,
    sportsById,
}: UseEventFormDefaultsOptions) => {
    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);
    const immutableFields = useMemo(
        () => normalizeImmutableFields(immutableDefaultsMemo.fields),
        [immutableDefaultsMemo.fields],
    );
    const hasImmutableFields = immutableFields.length > 0;
    const immutableTimeSlotsFromDefaults = useMemo(
        () => normalizeImmutableTimeSlots(immutableDefaultsMemo.timeSlots, immutableFields),
        [immutableDefaultsMemo.timeSlots, immutableFields],
    );
    const isImmutableField = useCallback(
        (key: keyof Event) => immutableDefaultsMemo[key] !== undefined,
        [immutableDefaultsMemo],
    );
    const applyImmutableDefaults = useCallback((state: EventFormState): EventFormState => (
        applyImmutableEventDefaults({
            state,
            defaults: immutableDefaultsMemo,
            sportsById,
        })
    ), [immutableDefaultsMemo, sportsById]);
    const buildDefaultFormValues = useCallback((): EventFormValues => (
        buildEventFormDefaultValues({
            activeEditingEvent,
            applyImmutableDefaults,
            defaultLocation: {
                location: defaultLocation?.location,
                address: defaultLocation?.address,
                coordinates: defaultLocation?.coordinates,
            },
            hasImmutableFields,
            immutableDefaults,
            immutableFields,
            isCreateMode,
            resolvedOrganizationFields: Array.isArray(resolvedOrganizationFields)
                ? resolvedOrganizationFields
                : [],
            resolvedOrganizationId,
            sportsById,
        })
    ), [
        activeEditingEvent,
        applyImmutableDefaults,
        defaultLocation?.address,
        defaultLocation?.coordinates,
        defaultLocation?.location,
        hasImmutableFields,
        immutableDefaults,
        immutableFields,
        isCreateMode,
        resolvedOrganizationFields,
        resolvedOrganizationId,
        sportsById,
    ]);

    return {
        buildDefaultFormValues,
        hasImmutableFields,
        immutableFields,
        immutableTimeSlotsFromDefaults,
        isImmutableField,
    };
};

export const useEventFormLifecycle = ({
    activeEditingEvent,
    buildDefaultFormValues,
    formValues,
    getValues,
    isCreateMode,
    isDirty,
    onDirtyStateChange,
    onDraftStateChange,
    open,
    reset,
}: UseEventFormLifecycleOptions) => {
    const lastResetSourceRef = useRef<string | null>(null);
    const dirtyBaselineValuesRef = useRef<EventFormValues | null>(null);
    const pendingInitialDirtyRebaseRef = useRef(false);
    const pendingInitialDirtyRebaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buildDraftForDirtyTrackingRef = useRef<(values: EventFormValues) => Partial<Event>>(
        () => ({}),
    );
    const previousEventTypeRef = useRef<Event['eventType'] | null>(null);
    const previousEventFieldLocationRef = useRef('');
    const [isDirtyTrackingReady, setIsDirtyTrackingReady] = useState(false);

    useEffect(() => {
        if (!open) {
            // Source transitions must suspend dirty notifications before React Hook Form is reset.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDirtyTrackingReady(false);
            lastResetSourceRef.current = null;
            previousEventTypeRef.current = null;
            previousEventFieldLocationRef.current = '';
            dirtyBaselineValuesRef.current = null;
            pendingInitialDirtyRebaseRef.current = false;
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            onDirtyStateChange?.(false);
            onDraftStateChange?.({
                draft: {},
                baselineDraft: {},
            });
            return;
        }
        const sourceKey = isCreateMode
            ? 'create'
            : `event:${String(activeEditingEvent?.$id ?? '')}`;
        const sourceChanged = lastResetSourceRef.current !== sourceKey;
        if (!sourceChanged) {
            return;
        }
        lastResetSourceRef.current = sourceKey;
        setIsDirtyTrackingReady(false);
        pendingInitialDirtyRebaseRef.current = true;
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
            pendingInitialDirtyRebaseTimeoutRef.current = null;
        }
        onDirtyStateChange?.(false);
        const nextDefaults = buildDefaultFormValues();
        previousEventTypeRef.current = nextDefaults.eventType;
        previousEventFieldLocationRef.current = defaultFieldLocationForEvent(nextDefaults.location);
        dirtyBaselineValuesRef.current = null;
        reset(nextDefaults);
    }, [
        activeEditingEvent,
        buildDefaultFormValues,
        isCreateMode,
        onDirtyStateChange,
        onDraftStateChange,
        open,
        reset,
    ]);

    useEffect(() => {
        const baselineValues = dirtyBaselineValuesRef.current ?? formValues;
        onDraftStateChange?.({
            draft: buildDraftForDirtyTrackingRef.current(formValues),
            baselineDraft: buildDraftForDirtyTrackingRef.current(baselineValues),
        });
        if (!isDirtyTrackingReady) {
            onDirtyStateChange?.(false);
            return;
        }
        onDirtyStateChange?.(isDirty);
    }, [formValues, isDirty, isDirtyTrackingReady, onDirtyStateChange, onDraftStateChange]);

    const commitDirtyBaseline = useCallback(() => {
        const currentValues = getValues();
        dirtyBaselineValuesRef.current = currentValues;
        reset(currentValues);
        onDirtyStateChange?.(false);
    }, [getValues, onDirtyStateChange, reset]);

    const stabilization: EventFormLifecycleStabilizationState = {
        buildDraftForDirtyTrackingRef,
        dirtyBaselineValuesRef,
        onDirtyStateChange,
        pendingInitialDirtyRebaseRef,
        pendingInitialDirtyRebaseTimeoutRef,
        setIsDirtyTrackingReady,
    };

    return {
        commitDirtyBaseline,
        previousEventFieldLocationRef,
        previousEventTypeRef,
        stabilization,
    };
};

export const useEventFormLifecycleStabilization = ({
    buildDraftEvent,
    fieldsLoading,
    formValues,
    getValues,
    lifecycle,
    open,
    reset,
    sportsLoading,
}: UseEventFormLifecycleStabilizationOptions) => {
    const {
        buildDraftForDirtyTrackingRef,
        dirtyBaselineValuesRef,
        onDirtyStateChange,
        pendingInitialDirtyRebaseRef,
        pendingInitialDirtyRebaseTimeoutRef,
        setIsDirtyTrackingReady,
    } = lifecycle;

    useLayoutEffect(() => {
        buildDraftForDirtyTrackingRef.current = buildDraftEvent;
    }, [buildDraftEvent, buildDraftForDirtyTrackingRef]);

    useEffect(() => {
        if (!open || !pendingInitialDirtyRebaseRef.current || sportsLoading || fieldsLoading) {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            return;
        }

        const expectedDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
        }

        // Rebase only after normalization effects stop mutating draft-backed values.
        pendingInitialDirtyRebaseTimeoutRef.current = setTimeout(() => {
            pendingInitialDirtyRebaseTimeoutRef.current = null;
            if (!pendingInitialDirtyRebaseRef.current) {
                return;
            }

            const latestDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
            if (latestDraftFingerprint !== expectedDraftFingerprint) {
                return;
            }

            const stabilizedValues = getValues();
            dirtyBaselineValuesRef.current = stabilizedValues;
            pendingInitialDirtyRebaseRef.current = false;
            reset(stabilizedValues);
            setIsDirtyTrackingReady(true);
            onDirtyStateChange?.(false);
        }, 0);

        return () => {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
        };
    }, [
        buildDraftEvent,
        dirtyBaselineValuesRef,
        fieldsLoading,
        formValues,
        getValues,
        onDirtyStateChange,
        open,
        pendingInitialDirtyRebaseRef,
        pendingInitialDirtyRebaseTimeoutRef,
        reset,
        setIsDirtyTrackingReady,
        sportsLoading,
    ]);
};
