import type { Field, Organization } from '@/types';
import { getFieldDisplayName, sortFieldsByCreatedAt } from '@/lib/fieldUtils';

import { getFieldOrganizationId } from '../externalRentalField';
import { normalizeDivisionKeys } from './divisionForm';
import { normalizeResourceText, stringSetsEqual } from './shared';

export type FacilityResourceGroup = {
    key: string;
    label: string;
    description?: string;
    isRental: boolean;
    resources: Array<Field & { $id: string }>;
};

export const getFieldFacilityId = (field: Field): string | null => {
    const directId = normalizeResourceText((field as { facilityId?: string | null }).facilityId);
    if (directId) {
        return directId;
    }
    const facility = field.facility;
    if (facility && typeof facility === 'object') {
        return normalizeResourceText((facility as { $id?: string | null }).$id)
            || normalizeResourceText((facility as { id?: string | null }).id);
    }
    return null;
};

export const getFieldFacilityLabel = (field: Field): string => {
    const facility = field.facility;
    if (typeof facility === 'string') {
        return normalizeResourceText(facility);
    }
    if (facility && typeof facility === 'object') {
        return normalizeResourceText(facility.name)
            || normalizeResourceText(facility.location)
            || normalizeResourceText(facility.address);
    }
    return '';
};

export const getFieldFacilityDescription = (field: Field): string => {
    const facility = field.facility;
    if (facility && typeof facility === 'object') {
        return normalizeResourceText(facility.address)
            || normalizeResourceText(facility.location);
    }
    return normalizeResourceText(field.location);
};

export const isRentedResourceForOrganization = (
    field: Field,
    eventOrganizationId?: string | null,
): boolean => {
    if ((field as { rentalResource?: boolean; _rentalResource?: boolean }).rentalResource
        || (field as { rentalResource?: boolean; _rentalResource?: boolean })._rentalResource) {
        return true;
    }
    const hostOrganizationId = normalizeResourceText(eventOrganizationId);
    if (!hostOrganizationId) {
        return false;
    }
    const fieldOrganizationId = normalizeResourceText(getFieldOrganizationId(field));
    return fieldOrganizationId.length > 0 && fieldOrganizationId !== hostOrganizationId;
};

export const isSelectableOrganizationResource = (
    field: Field,
    eventOrganizationId?: string | null,
): boolean => {
    const hostOrganizationId = normalizeResourceText(eventOrganizationId);
    if (!hostOrganizationId) {
        return true;
    }
    const fieldOrganizationId = normalizeResourceText(getFieldOrganizationId(field));
    return fieldOrganizationId === hostOrganizationId || isRentedResourceForOrganization(field, hostOrganizationId);
};

export const buildFacilityResourceGroups = (
    fields: Field[],
    eventOrganizationId?: string | null,
): FacilityResourceGroup[] => {
    const groups = new Map<string, FacilityResourceGroup>();

    fields
        .filter((field): field is Field & { $id: string } => (
            typeof field?.$id === 'string' && field.$id.trim().length > 0
        ))
        .forEach((field) => {
            const isRental = isRentedResourceForOrganization(field, eventOrganizationId);
            const facilityId = getFieldFacilityId(field);
            const facilityLabel = getFieldFacilityLabel(field);
            const fallbackLabel = isRental ? 'Rented facility' : 'Ungrouped resources';
            const groupLabel = facilityLabel || fallbackLabel;
            const groupKey = [
                isRental ? 'rental' : 'facility',
                facilityId || groupLabel.toLowerCase(),
            ].join(':');

            const existing = groups.get(groupKey);
            if (existing) {
                existing.resources.push(field);
                return;
            }

            groups.set(groupKey, {
                key: groupKey,
                label: groupLabel,
                description: getFieldFacilityDescription(field),
                isRental,
                resources: [field],
            });
        });

    return Array.from(groups.values()).map((group) => ({
        ...group,
        resources: [...group.resources].sort((left, right) => (
            getFieldDisplayName(left).localeCompare(getFieldDisplayName(right), undefined, { numeric: true, sensitivity: 'base' })
        )),
    })).sort((left, right) => {
        if (left.isRental !== right.isRental) {
            return left.isRental ? 1 : -1;
        }
        return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    });
};

export const mergeFieldsById = (baseFields: Field[], incomingFields: Field[]): Field[] => {
    const byId = new Map<string, Field>();
    [...baseFields, ...incomingFields].forEach((field) => {
        const fieldId = normalizeResourceText(field?.$id);
        if (!fieldId) {
            return;
        }
        byId.set(fieldId, field);
    });
    return sortFieldsByCreatedAt(Array.from(byId.values()));
};

export const toFieldIdList = (fields: Field[]): string[] => {
    return Array.from(
        new Set(
            fields
                .map((field) => field?.$id)
                .filter((fieldId): fieldId is string => typeof fieldId === 'string' && fieldId.length > 0),
        ),
    );
};

export const buildFieldCountOptions = (
    isOrganizationHostedEvent: boolean,
): Array<{ value: string; label: string }> => {
    const start = isOrganizationHostedEvent ? 0 : 1;
    return Array.from({ length: 13 - start }, (_, index) => {
        const value = start + index;
        return { value: String(value), label: String(value) };
    });
};

export const fieldHasOrganization = (field?: Field | null): boolean => Boolean(getFieldOrganizationId(field));

export const isEventLocalField = (field?: Field | null): boolean => !fieldHasOrganization(field);

export const isGeneratedLocalFieldPlaceholder = (field?: Field | null, index?: number): boolean => {
    if (!field) {
        return false;
    }
    const name = normalizeResourceText(field.name);
    if (!name) {
        return true;
    }
    if (typeof index === 'number') {
        return name === `Field ${index + 1}`;
    }
    return /^Field\s+\d+$/i.test(name);
};

export const withOrganizationFieldOwner = (field: Field, organizationId: string): Field => {
    if (!organizationId || getFieldOrganizationId(field)) {
        return field;
    }
    return {
        ...field,
        organization: organizationId as unknown as Organization,
    };
};

export const mergeOrganizationFieldsIntoPool = (
    currentFields: Field[],
    organizationFields: Field[],
    organizationId: string,
): Field[] => {
    const normalizedOrganizationFields = sortFieldsByCreatedAt(
        organizationFields.map((field) => withOrganizationFieldOwner(field, organizationId)),
    );
    const organizationFieldIds = new Set(toFieldIdList(normalizedOrganizationFields));
    const retainedFields = currentFields.filter((field) => {
        const fieldId = typeof field?.$id === 'string' ? field.$id : '';
        if (organizationFieldIds.has(fieldId)) {
            return false;
        }
        return getFieldOrganizationId(field) !== organizationId;
    });
    return [...normalizedOrganizationFields, ...retainedFields];
};

export const removeOrganizationFieldsFromPool = (
    currentFields: Field[],
    organizationId: string,
): Field[] => currentFields.filter((field) => getFieldOrganizationId(field) !== organizationId);

export const fieldsEqual = (left: Field[], right: Field[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const first = left[index];
        const second = right[index];
        if (
            first?.$id !== second?.$id
            || (first?.name ?? '') !== (second?.name ?? '')
            || (first?.$createdAt ?? first?.createdAt ?? '') !== (second?.$createdAt ?? second?.createdAt ?? '')
            || (first?.location ?? '') !== (second?.location ?? '')
            || Number(first?.lat ?? 0) !== Number(second?.lat ?? 0)
            || Number(first?.long ?? 0) !== Number(second?.long ?? 0)
            || !stringSetsEqual(
                normalizeDivisionKeys(first?.divisions),
                normalizeDivisionKeys(second?.divisions),
            )
        ) {
            return false;
        }
    }
    return true;
};
