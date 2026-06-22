import type { Field } from '@/types';
import { createClientId } from '@/lib/clientId';
import { sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import type { Event, Organization, TimeSlot } from '@/types';

import { getFieldOrganizationId } from '../externalRentalField';
import { supportsFieldCountForEvent, supportsOrganizationFieldSelectionForEvent } from './eventRules';
import {
    getRentalBookingSelectorId,
    isRentalLockedTimeSlot,
} from './rentalResources';
import {
    isEventLocalField,
    isGeneratedLocalFieldPlaceholder,
    isRentedResourceForOrganization,
    isSelectableOrganizationResource,
    mergeOrganizationFieldsIntoPool,
    toFieldIdList,
    withOrganizationFieldOwner,
} from './resourceGroups';
import { normalizeResourceText } from './shared';

// Drop match back-references to avoid circular data when React Hook Form clones defaults.
export const sanitizeFieldForForm = (field: Field): Field => {
    const { matches: _matches, ...rest } = field as Field & { matches?: unknown };
    return { ...rest } as Field;
};

export const sanitizeFieldsForForm = (fields?: Field[] | null): Field[] =>
    Array.isArray(fields) ? fields.map(sanitizeFieldForForm) : [];

export const defaultFieldLocationForEvent = (eventLocation?: string | null): string => {
    const trimmed = typeof eventLocation === 'string' ? eventLocation.trim() : '';
    return trimmed.length ? trimmed : '';
};

export const withEventFieldLocationDefault = (
    field: Field,
    eventLocation?: string | null,
    previousEventLocation?: string | null,
): Field => {
    const defaultLocation = defaultFieldLocationForEvent(eventLocation);
    const previousDefaultLocation = defaultFieldLocationForEvent(previousEventLocation);
    const currentLocation = typeof field.location === 'string' ? field.location.trim() : '';

    if (!defaultLocation) {
        return previousDefaultLocation && currentLocation === previousDefaultLocation
            ? { ...field, location: '' }
            : field;
    }

    if (!currentLocation || (previousDefaultLocation && currentLocation === previousDefaultLocation)) {
        return { ...field, location: defaultLocation };
    }

    return field;
};

type DefaultFieldStateBase = {
    eventType: Event['eventType'];
    parentEvent?: string | null;
    organizationId?: string | null;
    location?: string | null;
    fields?: Field[] | null;
    selectedFieldIds?: string[] | null;
};

type DefaultFieldStateOptions = {
    base: DefaultFieldStateBase;
    activeEditingEvent?: Event | null;
    immutableDefaults?: Partial<Event> | null;
    immutableFields: Field[];
    hasImmutableFields: boolean;
    resolvedOrganizationFields?: Field[] | null;
    resolvedOrganizationId?: string | null;
    isCreateMode: boolean;
};

type DefaultFieldState = {
    defaultFields: Field[];
    defaultFieldCount: number;
    defaultSelectedFieldIds: string[];
    allDefaultFieldIds: string[];
};

export const buildDefaultFieldState = ({
    base,
    activeEditingEvent,
    immutableDefaults,
    immutableFields,
    hasImmutableFields,
    resolvedOrganizationFields,
    resolvedOrganizationId,
    isCreateMode,
}: DefaultFieldStateOptions): DefaultFieldState => {
    const hostedOrganizationId = (
        (resolvedOrganizationId ?? '')
        || base.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    ).trim();

    const defaultFieldLocation = defaultFieldLocationForEvent(base.location);
    const defaultOrganizationFields = hostedOrganizationId && Array.isArray(resolvedOrganizationFields)
        ? sortFieldsByCreatedAt(
            sanitizeFieldsForForm(resolvedOrganizationFields)
                .map((field) => withOrganizationFieldOwner(field, hostedOrganizationId)),
        )
        : [];
    const inputEventFields = Array.isArray(base.fields)
        ? sortFieldsByCreatedAt(sanitizeFieldsForForm(base.fields))
        : [];
    const activeEventFields = Array.isArray(activeEditingEvent?.fields)
        ? sortFieldsByCreatedAt(sanitizeFieldsForForm(activeEditingEvent.fields))
        : inputEventFields;
    const activeEventLocalFields = activeEventFields.filter(isEventLocalField);
    const supportsOrganizationFieldSelectionForDefault = supportsOrganizationFieldSelectionForEvent(
        base.eventType,
        base.parentEvent,
    );
    const supportsFieldCountForDefault = supportsFieldCountForEvent(base.eventType);
    const hasReusableOrganizationFieldsForDefaultCount = Boolean(
        hostedOrganizationId
        && (
            defaultOrganizationFields.length > 0
            || activeEventFields.some((field) => getFieldOrganizationId(field) === hostedOrganizationId)
        ),
    );
    const allowsDefaultLocalFields = supportsFieldCountForDefault
        || supportsOrganizationFieldSelectionForDefault;
    const defaults = immutableDefaults ?? {};
    const hasRentalBackedSlotsForDefaultCount = Boolean(
        (Array.isArray(defaults.timeSlots) && (defaults.timeSlots as TimeSlot[]).some(isRentalLockedTimeSlot))
        || (activeEditingEvent?.timeSlots ?? []).some(isRentalLockedTimeSlot)
    );
    const activeLocalFieldsAreOnlyPlaceholders = activeEventLocalFields.length > 0
        && activeEventLocalFields.every((field, index) => isGeneratedLocalFieldPlaceholder(field, index));
    const shouldKeepActiveLocalFieldDefaults = activeEventLocalFields.length > 0 && (
        !hostedOrganizationId
        || !isCreateMode
        || !activeLocalFieldsAreOnlyPlaceholders
        || (!hasReusableOrganizationFieldsForDefaultCount && !hasRentalBackedSlotsForDefaultCount)
    );

    const defaultFieldCount = (() => {
        if (shouldKeepActiveLocalFieldDefaults) {
            return activeEventLocalFields.length;
        }
        if (hostedOrganizationId && isCreateMode) {
            return hasReusableOrganizationFieldsForDefaultCount || hasRentalBackedSlotsForDefaultCount ? 0 : 1;
        }
        if (
            activeEditingEvent
            && !hasReusableOrganizationFieldsForDefaultCount
            && !hasRentalBackedSlotsForDefaultCount
            && typeof (activeEditingEvent as { fieldCount?: unknown })?.fieldCount === 'number'
        ) {
            const parsed = Number((activeEditingEvent as { fieldCount?: number }).fieldCount);
            return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
        }
        if (hasReusableOrganizationFieldsForDefaultCount || hasRentalBackedSlotsForDefaultCount) {
            return 0;
        }
        return allowsDefaultLocalFields || !hostedOrganizationId ? 1 : 0;
    })();

    const defaultFields: Field[] = (() => {
        if (hasImmutableFields) {
            return sanitizeFieldsForForm(immutableFields);
        }
        if (hostedOrganizationId && defaultOrganizationFields.length) {
            const retainedActiveFields = activeEventFields.filter((field) => {
                if (isEventLocalField(field)) {
                    return shouldKeepActiveLocalFieldDefaults;
                }
                const fieldOrganizationId = getFieldOrganizationId(field);
                return !fieldOrganizationId || fieldOrganizationId !== hostedOrganizationId;
            });
            return mergeOrganizationFieldsIntoPool(
                retainedActiveFields,
                defaultOrganizationFields,
                hostedOrganizationId,
            );
        }
        if (activeEventFields.length) {
            return activeEventFields;
        }
        if ((allowsDefaultLocalFields || !hostedOrganizationId) && defaultFieldCount > 0) {
            return Array.from({ length: defaultFieldCount }, (_, idx) => ({
                $id: createClientId(),
                name: `Field ${idx + 1}`,
                location: defaultFieldLocation,
            } as Field));
        }
        return [];
    })();
    const allDefaultFieldIds = toFieldIdList(defaultFields);
    const defaultOrganizationFieldIds = hostedOrganizationId
        ? toFieldIdList(defaultFields.filter((field) => isSelectableOrganizationResource(field, hostedOrganizationId)))
        : [];
    const defaultHasRentalLockedTimeSlots = Array.isArray(defaults.timeSlots)
        && (defaults.timeSlots as TimeSlot[]).some(isRentalLockedTimeSlot);
    const activeRentalSelectorFieldIds = Array.from(
        new Set(
            (activeEditingEvent?.timeSlots ?? [])
                .map((slot) => normalizeResourceText(slot?.rentalBookingItemId))
                .filter(Boolean)
                .map(getRentalBookingSelectorId),
        ),
    );
    const includeActiveRentalSelectors = (fieldIds: string[]) => Array.from(
        new Set([...fieldIds, ...activeRentalSelectorFieldIds]),
    );
    const defaultSelectedFieldIds = (() => {
        if (isCreateMode && defaultHasRentalLockedTimeSlots && !activeRentalSelectorFieldIds.length) {
            return [];
        }
        const selectableFieldIds = hostedOrganizationId && supportsOrganizationFieldSelectionForDefault
            ? defaultOrganizationFieldIds
            : allDefaultFieldIds;
        const selectableFieldIdSet = new Set(selectableFieldIds);
        const defaultFieldById = new Map(defaultFields.map((field) => [field.$id, field] as const));
        const canSelectFieldId = (fieldId: string): boolean => {
            if (selectableFieldIdSet.has(fieldId)) {
                return true;
            }
            const field = defaultFieldById.get(fieldId);
            return Boolean(field && hostedOrganizationId && isRentedResourceForOrganization(field, hostedOrganizationId));
        };
        if (Array.isArray(base.selectedFieldIds)) {
            return includeActiveRentalSelectors(
                Array.from(new Set(base.selectedFieldIds.filter(canSelectFieldId))),
            );
        }
        if (Array.isArray(activeEditingEvent?.fieldIds)) {
            return includeActiveRentalSelectors(
                Array.from(
                    new Set(
                        activeEditingEvent.fieldIds
                            .map((fieldId) => String(fieldId))
                            .filter(canSelectFieldId),
                    ),
                ),
            );
        }
        return includeActiveRentalSelectors([]);
    })();

    return {
        defaultFields,
        defaultFieldCount,
        defaultSelectedFieldIds,
        allDefaultFieldIds,
    };
};
