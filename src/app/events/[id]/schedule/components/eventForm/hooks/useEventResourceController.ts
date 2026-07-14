import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UseFormGetValues } from 'react-hook-form';

import { createClientId } from '@/lib/clientId';
import { sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import type { Event, Field, Organization, TimeSlot } from '@/types';

import {
    shouldShowOrganizationFieldsInEventDetails,
    supportsFieldCountForEvent,
    supportsOrganizationFieldSelectionForEvent,
    supportsScheduleSlotsForEvent,
} from '../eventRules';
import {
    divisionFieldIdsEqual,
    normalizeDivisionFieldIds,
    normalizeDivisionKeys,
} from '../divisionForm';
import {
    defaultFieldLocationForEvent,
    sanitizeFieldsForForm,
    withEventFieldLocationDefault,
} from '../fieldDefaults';
import type { EventFormValues } from '../formTypes';
import {
    buildFieldById,
    buildOrganizationResourcePool,
    buildResolvedOrganizationFieldSignature,
    fieldsEqual,
    isEventLocalField,
    isGeneratedLocalFieldPlaceholder,
    isRentedResourceForOrganization,
    isSelectableOrganizationResource,
    resolveFieldsReferencedInSlots,
    resolveHasExternalRentalField,
    resolveSelectedRentedFieldIds,
    toFieldIdList,
} from '../resourceGroups';
import {
    buildRentalBookingTimeSlot,
    buildEventRentalLockedTimeSlots,
    buildRentalLeagueFieldOptions,
    buildRentalResourceFields,
    buildRentalResourceOptionsByFieldId,
    buildRentalResourceOptionsBySelectorId,
    buildRentalResourceSelectorFields,
    buildSelectedRentalFieldIds,
    isRentalBookingSelectorId,
    isRentalLockedTimeSlot,
    mergeRentalLockedTimeSlots,
    resolveSelectedRentalResourceOptions,
} from '../rentalResources';
import { timeSlotsEqual } from '../slotForm';
import {
    normalizeResourceText,
    stringArraysEqual,
} from '../shared';
import { useOrganizationFieldHydration } from './useOrganizationFieldHydration';
import { useRentalBookingResources } from './useRentalBookingResources';

type SetEventFormValue = (
    name: string,
    value: unknown,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type SetFields = (
    updater: SetStateAction<Field[]>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventResourceControllerOptions = {
    activeEditingEvent?: Event | null;
    eventData: EventFormValues;
    fieldCountDirty: boolean;
    fieldsDirty: boolean;
    getValues: UseFormGetValues<EventFormValues>;
    hasImmutableFields: boolean;
    immutableFields: Field[];
    immutableTimeSlotsFromDefaults: TimeSlot[];
    isAffiliateEvent: boolean;
    isCreateMode: boolean;
    isEditMode: boolean;
    open: boolean;
    previousEventFieldLocationRef: MutableRefObject<string>;
    previousEventTypeRef: MutableRefObject<Event['eventType'] | null>;
    rentalPurchaseFieldId?: string | null;
    resolvedOrganization: Organization | null;
    setHydratedOrganization: Dispatch<SetStateAction<Organization | null>>;
    setValue: SetEventFormValue;
    slotDivisionKeys: string[];
};

const RESET_FIELD_OPTIONS = { shouldDirty: false, shouldValidate: true } as const;

export const useEventResourceController = ({
    activeEditingEvent,
    eventData,
    fieldCountDirty,
    fieldsDirty,
    getValues,
    hasImmutableFields,
    immutableFields,
    immutableTimeSlotsFromDefaults,
    isAffiliateEvent,
    isCreateMode,
    isEditMode,
    open,
    previousEventFieldLocationRef,
    previousEventTypeRef,
    rentalPurchaseFieldId,
    resolvedOrganization,
    setHydratedOrganization,
    setValue,
    slotDivisionKeys,
}: UseEventResourceControllerOptions) => {
    const fields = useMemo(
        () => (Array.isArray(eventData.fields) ? eventData.fields : []),
        [eventData.fields],
    );
    const fieldCount = eventData.fieldCount;
    const selectedFieldIds = useMemo(
        () => (Array.isArray(eventData.selectedFieldIds) ? eventData.selectedFieldIds : []),
        [eventData.selectedFieldIds],
    );
    const divisionFieldIds = useMemo(
        () => (
            eventData.divisionFieldIds && typeof eventData.divisionFieldIds === 'object'
                ? eventData.divisionFieldIds
                : {}
        ),
        [eventData.divisionFieldIds],
    );
    const [rentalLockedTimeSlots, setRentalLockedTimeSlots] = useState<TimeSlot[]>([]);

    const setFields = useCallback<SetFields>((updater, options = {}) => {
        const current = getValues('fields') ?? [];
        const next = typeof updater === 'function'
            ? (updater as (previous: Field[]) => Field[])(current)
            : updater;
        if (fieldsEqual(current, next)) {
            return;
        }
        setValue('fields', next, {
            shouldDirty: options.shouldDirty ?? true,
            shouldValidate: options.shouldValidate ?? true,
        });
    }, [getValues, setValue]);

    const setFieldCount = useCallback((value: number) => {
        if (Object.is(getValues('fieldCount'), value)) {
            return;
        }
        setValue('fieldCount', value, { shouldDirty: true, shouldValidate: true });
    }, [getValues, setValue]);

    const organizationHostedEventId = (
        resolvedOrganization?.$id
        || eventData.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    );
    const isOrganizationHostedEvent = organizationHostedEventId.length > 0;
    const eventSupportsScheduleSlots = !isAffiliateEvent && supportsScheduleSlotsForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const hasRestrictedImmutableFields = hasImmutableFields && !eventSupportsScheduleSlots;
    const supportsOrganizationFieldSelection = !isAffiliateEvent && supportsOrganizationFieldSelectionForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const shouldLoadRentalResources = !isAffiliateEvent
        && (supportsOrganizationFieldSelection || eventSupportsScheduleSlots);
    const shouldManageLocalFields = !isAffiliateEvent
        && !hasRestrictedImmutableFields
        && supportsFieldCountForEvent(eventData.eventType);
    const shouldProvisionFields = shouldManageLocalFields;
    const isOrganizationManagedEvent = isOrganizationHostedEvent && !shouldManageLocalFields;
    const resolvedOrganizationFields = Array.isArray(resolvedOrganization?.fields)
        ? resolvedOrganization.fields as Field[]
        : null;
    const resolvedOrganizationFieldSignature = useMemo(
        () => buildResolvedOrganizationFieldSignature(resolvedOrganizationFields),
        [resolvedOrganizationFields],
    );

    const { fieldsLoading } = useOrganizationFieldHydration({
        hasRestrictedImmutableFields,
        isEditMode,
        organizationFieldSignature: resolvedOrganizationFieldSignature,
        organizationId: organizationHostedEventId,
        resolvedOrganizationFields,
        resolvedOrganizationId: resolvedOrganization?.$id,
        sanitizeFields: sanitizeFieldsForForm,
        setFields,
        setHydratedOrganization,
    });

    const {
        options: rentalResourceOptions,
        loading: rentalResourcesLoading,
        error: rentalResourcesError,
    } = useRentalBookingResources({
        eventId: activeEditingEvent?.$id,
        isEditMode,
        open,
        organizationId: organizationHostedEventId,
        shouldLoad: shouldLoadRentalResources,
        setFields,
    });

    const immutableDefaultRentalTimeSlots = useMemo(
        () => immutableTimeSlotsFromDefaults.filter(isRentalLockedTimeSlot),
        [immutableTimeSlotsFromDefaults],
    );
    const immutableTimeSlots = useMemo(() => {
        if (eventSupportsScheduleSlots) {
            return [];
        }
        if (rentalLockedTimeSlots.length) {
            return rentalLockedTimeSlots;
        }
        return immutableTimeSlotsFromDefaults;
    }, [eventSupportsScheduleSlots, immutableTimeSlotsFromDefaults, rentalLockedTimeSlots]);
    const hasImmutableTimeSlots = immutableTimeSlots.length > 0;
    const rentalLockedSlotsForDraft = useMemo(
        () => eventSupportsScheduleSlots
            ? mergeRentalLockedTimeSlots([...immutableDefaultRentalTimeSlots, ...rentalLockedTimeSlots])
            : rentalLockedTimeSlots,
        [eventSupportsScheduleSlots, immutableDefaultRentalTimeSlots, rentalLockedTimeSlots],
    );

    useEffect(() => {
        if (
            !isCreateMode
            || rentalResourcesLoading
            || rentalResourceOptions.length === 0
            || hasRestrictedImmutableFields
            || fieldCountDirty
            || fieldsDirty
        ) {
            return;
        }

        const currentFieldCount = Number(getValues('fieldCount'));
        if (!Number.isFinite(currentFieldCount) || currentFieldCount <= 0) {
            return;
        }

        const currentLocalFields = (getValues('fields') ?? []).filter((field) => isEventLocalField(field));
        const onlyGeneratedLocalFields = currentLocalFields.every((field, index) => (
            isGeneratedLocalFieldPlaceholder(field, index)
        ));
        if (onlyGeneratedLocalFields) {
            setValue('fieldCount', 0, RESET_FIELD_OPTIONS);
        }
    }, [
        fieldCountDirty,
        fieldsDirty,
        getValues,
        hasRestrictedImmutableFields,
        isCreateMode,
        rentalResourceOptions.length,
        rentalResourcesLoading,
        setValue,
    ]);

    useEffect(() => {
        const previousEventType = previousEventTypeRef.current;
        previousEventTypeRef.current = eventData.eventType;

        if (!previousEventType || previousEventType === eventData.eventType) {
            return;
        }
        if (!isCreateMode || !isOrganizationHostedEvent || hasRestrictedImmutableFields) {
            return;
        }
        if (!supportsFieldCountForEvent(eventData.eventType) || supportsFieldCountForEvent(previousEventType)) {
            return;
        }
        setFieldCount(0);
    }, [
        eventData.eventType,
        hasRestrictedImmutableFields,
        isCreateMode,
        isOrganizationHostedEvent,
        previousEventTypeRef,
        setFieldCount,
    ]);

    useEffect(() => {
        if (hasRestrictedImmutableFields) {
            setFields(sanitizeFieldsForForm(immutableFields), { shouldDirty: false });
        }
    }, [hasRestrictedImmutableFields, immutableFields, setFields]);

    useEffect(() => {
        const previousEventLocation = previousEventFieldLocationRef.current;
        const eventFieldLocation = defaultFieldLocationForEvent(eventData.location);
        previousEventFieldLocationRef.current = eventFieldLocation;

        if (!shouldManageLocalFields) {
            return;
        }
        setFields((previous) => {
            const retainedFields = previous.filter((field) => !isEventLocalField(field));
            const normalizedLocalFields: Field[] = previous
                .filter(isEventLocalField)
                .slice(0, fieldCount)
                .map((field) => withEventFieldLocationDefault(
                    field,
                    eventFieldLocation,
                    previousEventLocation,
                ));

            if (normalizedLocalFields.length < fieldCount) {
                for (let index = normalizedLocalFields.length; index < fieldCount; index += 1) {
                    normalizedLocalFields.push({
                        $id: createClientId(),
                        name: `Field ${index + 1}`,
                        location: eventFieldLocation,
                        lat: 0,
                        long: 0,
                    } as Field);
                }
            }
            return [...retainedFields, ...normalizedLocalFields];
        }, { shouldDirty: false });
    }, [
        eventData.location,
        fieldCount,
        previousEventFieldLocationRef,
        setFields,
        shouldManageLocalFields,
    ]);

    useEffect(() => {
        if (shouldManageLocalFields || isOrganizationManagedEvent || !activeEditingEvent?.fields?.length) {
            return;
        }
        setFields(
            sortFieldsByCreatedAt(sanitizeFieldsForForm(activeEditingEvent.fields)),
            { shouldDirty: false },
        );
    }, [activeEditingEvent?.fields, isOrganizationManagedEvent, setFields, shouldManageLocalFields]);

    useEffect(() => {
        const availableFields = isOrganizationHostedEvent && supportsOrganizationFieldSelection
            ? fields.filter((field) => isSelectableOrganizationResource(field, organizationHostedEventId))
            : fields;
        const availableFieldIds = toFieldIdList(availableFields);
        const rentalSelectorFieldIds = rentalResourceOptions
            .map((option) => normalizeResourceText(option.selectorId))
            .filter(Boolean);
        const pendingRentalSelectorFieldIds = rentalResourcesLoading || rentalResourceOptions.length === 0
            ? selectedFieldIds.filter(isRentalBookingSelectorId)
            : [];
        const allowed = new Set([...availableFieldIds, ...rentalSelectorFieldIds, ...pendingRentalSelectorFieldIds]);
        const normalizedSelected = Array.from(new Set(
            selectedFieldIds
                .map((fieldId) => String(fieldId))
                .filter((fieldId) => allowed.has(fieldId)),
        ));
        if (!stringArraysEqual(selectedFieldIds, normalizedSelected)) {
            setValue('selectedFieldIds', normalizedSelected, RESET_FIELD_OPTIONS);
        }
    }, [
        fields,
        isOrganizationHostedEvent,
        organizationHostedEventId,
        rentalResourceOptions,
        rentalResourcesLoading,
        selectedFieldIds,
        setValue,
        supportsOrganizationFieldSelection,
    ]);

    useEffect(() => {
        const nextDivisionFieldIds = normalizeDivisionFieldIds(
            divisionFieldIds,
            normalizeDivisionKeys(eventData.divisions),
            toFieldIdList(fields),
        );
        if (!divisionFieldIdsEqual(divisionFieldIds, nextDivisionFieldIds)) {
            setValue('divisionFieldIds', nextDivisionFieldIds, RESET_FIELD_OPTIONS);
        }
    }, [divisionFieldIds, eventData.divisions, fields, setValue]);

    useEffect(() => {
        if (isEditMode || hasRestrictedImmutableFields || !activeEditingEvent?.fields) {
            return;
        }
        setFields((previous) => {
            const incoming = sanitizeFieldsForForm(activeEditingEvent.fields as Field[]);
            const byId = new Map<string, Field>();
            [...previous, ...incoming].forEach((field) => {
                if (field?.$id) {
                    byId.set(field.$id, field);
                }
            });
            return Array.from(byId.values());
        }, { shouldDirty: false });
    }, [activeEditingEvent?.fields, hasRestrictedImmutableFields, isEditMode, setFields]);

    const rentalResourceFields = useMemo(
        () => buildRentalResourceFields(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const rentalResourceSelectorFields = useMemo(
        () => buildRentalResourceSelectorFields(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const rentalResourceOptionsBySelectorId = useMemo(
        () => buildRentalResourceOptionsBySelectorId(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const rentalResourceOptionsByFieldId = useMemo(
        () => buildRentalResourceOptionsByFieldId(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const selectedRentalResourceOptions = useMemo(() => resolveSelectedRentalResourceOptions({
        selectedFieldIds,
        optionsBySelectorId: rentalResourceOptionsBySelectorId,
        optionsByFieldId: rentalResourceOptionsByFieldId,
    }), [rentalResourceOptionsByFieldId, rentalResourceOptionsBySelectorId, selectedFieldIds]);
    const selectedRentalFieldIds = useMemo(
        () => buildSelectedRentalFieldIds(selectedRentalResourceOptions),
        [selectedRentalResourceOptions],
    );
    const selectedRentedFieldIds = useMemo(() => resolveSelectedRentedFieldIds({
        organizationHostedEventId,
        selectedFieldIds,
        selectedRentalFieldIds,
        fields,
        activeEventFields: Array.isArray(activeEditingEvent?.fields) ? activeEditingEvent.fields : [],
        immutableFields,
        rentalResourceFields,
    }), [
        activeEditingEvent,
        fields,
        immutableFields,
        organizationHostedEventId,
        rentalResourceFields,
        selectedFieldIds,
        selectedRentalFieldIds,
    ]);
    const fieldById = useMemo(() => buildFieldById(fields), [fields]);
    const hasSelectedRentalResource = useMemo(() => selectedFieldIds.some((fieldId) => {
        if (isRentalBookingSelectorId(fieldId)) {
            return true;
        }
        const field = fieldById.get(normalizeResourceText(fieldId));
        return field ? isRentedResourceForOrganization(field, organizationHostedEventId) : false;
    }), [fieldById, organizationHostedEventId, selectedFieldIds]);
    const selectedRentalLockedSlots = useMemo(() => selectedRentalResourceOptions
        .map((option) => buildRentalBookingTimeSlot(option, slotDivisionKeys, eventData.timeZone))
        .filter((slot): slot is TimeSlot => Boolean(slot)), [
        eventData.timeZone,
        selectedRentalResourceOptions,
        slotDivisionKeys,
    ]);
    const selectedFields = fields;
    const organizationResourcePool = useMemo(() => buildOrganizationResourcePool({
        organizationHostedEventId,
        fields,
        rentalResourceFields,
        rentalResourceSelectorFields,
        selectedFieldIds,
    }), [
        fields,
        organizationHostedEventId,
        rentalResourceFields,
        rentalResourceSelectorFields,
        selectedFieldIds,
    ]);
    const eventLocalFields = useMemo(() => fields.filter(isEventLocalField), [fields]);
    const leagueFieldOptions = useMemo(
        () => buildRentalLeagueFieldOptions({ rentalResourceOptions, selectedFields }),
        [rentalResourceOptions, selectedFields],
    );

    const hasExternalRentalField = useMemo(() => resolveHasExternalRentalField({
        activeEventFieldIds: activeEditingEvent?.fieldIds,
        activeEventFields: activeEditingEvent?.fields,
        activeEventTimeSlots: activeEditingEvent?.timeSlots,
        eventOrganizationId: organizationHostedEventId,
        fields,
        immutableFields,
        isEditMode,
        organizationFields: resolvedOrganization?.fields,
        selectedFieldIds: eventData.selectedFieldIds,
    }), [
        activeEditingEvent?.fieldIds,
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        eventData.selectedFieldIds,
        fields,
        immutableFields,
        isEditMode,
        organizationHostedEventId,
        resolvedOrganization?.fields,
    ]);

    useEffect(() => {
        const nextSlots = buildEventRentalLockedTimeSlots({
            activeEventFields: activeEditingEvent?.fields,
            activeEventTimeSlots: activeEditingEvent?.timeSlots,
            hasExternalRentalField,
            immutableFields,
            selectedRentalLockedSlots,
        });
        // This state is the transient bridge between resource selection and the slot controller.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRentalLockedTimeSlots((previous) => (timeSlotsEqual(previous, nextSlots) ? previous : nextSlots));
    }, [
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        hasExternalRentalField,
        immutableFields,
        selectedRentalLockedSlots,
    ]);

    const restrictLocalFieldCreationForRentalEvent = eventData.eventType === 'EVENT' && (
        hasSelectedRentalResource
        || hasImmutableTimeSlots
        || Boolean(rentalPurchaseFieldId)
        || (activeEditingEvent?.timeSlots ?? []).some(isRentalLockedTimeSlot)
    );
    const showLocalFieldCreationControls = shouldManageLocalFields
        && !restrictLocalFieldCreationForRentalEvent;
    const fieldsReferencedInSlots = useMemo(() => resolveFieldsReferencedInSlots({
        selectedFields,
        immutableFields,
        slots: eventData.leagueSlots,
        hasRestrictedImmutableFields,
    }), [
        eventData.leagueSlots,
        hasRestrictedImmutableFields,
        immutableFields,
        selectedFields,
    ]);
    const resourceSelectorLoading = fieldsLoading || rentalResourcesLoading;
    const showOrganizationFieldsInEventDetails = shouldShowOrganizationFieldsInEventDetails({
        isOrganizationHostedEvent,
        hasRentalResourceOptions: rentalResourceOptions.length > 0,
        supportsOrganizationFieldSelection,
    });
    const usesRentalSlots = hasExternalRentalField
        || hasImmutableTimeSlots
        || Boolean(rentalPurchaseFieldId);

    const handleLocalFieldNameChange = useCallback((fieldId: string, name: string) => {
        if (!shouldManageLocalFields || hasRestrictedImmutableFields) {
            return;
        }
        setFields((previous) => previous.map((field) => (
            field.$id === fieldId && isEventLocalField(field)
                ? { ...field, name }
                : field
        )));
    }, [hasRestrictedImmutableFields, setFields, shouldManageLocalFields]);

    return {
        eventLocalFields,
        eventSupportsScheduleSlots,
        fieldCount,
        fields,
        fieldsLoading,
        fieldsReferencedInSlots,
        handleLocalFieldNameChange,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        immutableTimeSlots,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        leagueFieldOptions,
        organizationHostedEventId,
        organizationResourcePool,
        rentalLockedSlotsForDraft,
        rentalResourceOptions,
        rentalResourcesError,
        rentalResourcesLoading,
        resourceSelectorLoading,
        selectedFieldIds,
        selectedFields,
        selectedRentedFieldIds,
        setFieldCount,
        shouldManageLocalFields,
        shouldProvisionFields,
        showLocalFieldCreationControls,
        showOrganizationFieldsInEventDetails,
        supportsOrganizationFieldSelection,
        usesRentalSlots,
    };
};
