import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { fieldService } from '@/lib/fieldService';
import { organizationService } from '@/lib/organizationService';
import { sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import type { Field, Organization } from '@/types';

import {
    mergeOrganizationFieldsIntoPool,
    removeOrganizationFieldsFromPool,
} from '../resourceGroups';

type SetFields = (
    updater: SetStateAction<Field[]>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseOrganizationFieldHydrationParams = {
    hasRestrictedImmutableFields: boolean;
    isEditMode: boolean;
    organizationFieldSignature: string;
    organizationId: string;
    resolvedOrganizationFields?: Field[] | null;
    resolvedOrganizationId?: string | null;
    sanitizeFields: (fields?: Field[] | null) => Field[];
    setFields: SetFields;
    setHydratedOrganization: Dispatch<SetStateAction<Organization | null>>;
};

export const useOrganizationFieldHydration = ({
    hasRestrictedImmutableFields,
    isEditMode,
    organizationFieldSignature: _organizationFieldSignature,
    organizationId,
    resolvedOrganizationFields,
    resolvedOrganizationId,
    sanitizeFields,
    setFields,
    setHydratedOrganization,
}: UseOrganizationFieldHydrationParams) => {
    const [fieldsLoading, setFieldsLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        if (isEditMode) {
            return () => {
                cancelled = true;
            };
        }

        if (hasRestrictedImmutableFields) {
            return () => {
                cancelled = true;
            };
        }

        if (!organizationId) {
            return () => {
                cancelled = true;
            };
        }

        const hydrateOrganizationFields = async () => {
            const seededFields = Array.isArray(resolvedOrganizationFields)
                ? sortFieldsByCreatedAt(sanitizeFields(resolvedOrganizationFields))
                : [];
            if (seededFields.length) {
                setFields(
                    (previous) => mergeOrganizationFieldsIntoPool(previous, seededFields, organizationId),
                    { shouldDirty: false, shouldValidate: false },
                );
                setFieldsLoading(false);
                return;
            }

            try {
                setFieldsLoading(true);
                const fetchedOrganization = await (
                    organizationService.getOrganizationByIdForEventForm
                        ? organizationService.getOrganizationByIdForEventForm(organizationId)
                        : organizationService.getOrganizationById(organizationId, true)
                );
                if (cancelled) return;
                if (fetchedOrganization) {
                    setHydratedOrganization(fetchedOrganization);
                }

                let resolvedFields = Array.isArray(fetchedOrganization?.fields)
                    ? sortFieldsByCreatedAt(sanitizeFields(fetchedOrganization.fields as Field[]))
                    : seededFields;
                if (!resolvedFields.length) {
                    const fallbackOrganizationId = fetchedOrganization?.$id
                        ?? resolvedOrganizationId
                        ?? organizationId;
                    if (fallbackOrganizationId) {
                        const fetchedFields = await fieldService.listFields({ organizationId: fallbackOrganizationId });
                        if (cancelled) return;
                        resolvedFields = sortFieldsByCreatedAt(sanitizeFields(fetchedFields));
                    }
                }
                if (resolvedFields.length) {
                    setFields(
                        (previous) => mergeOrganizationFieldsIntoPool(previous, resolvedFields, organizationId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                } else {
                    setFields(
                        (previous) => removeOrganizationFieldsFromPool(previous, organizationId),
                        { shouldDirty: false, shouldValidate: false },
                    );
                }
            } catch (error) {
                console.warn('Failed to hydrate organization fields for event form:', error);
            } finally {
                if (!cancelled) {
                    setFieldsLoading(false);
                }
            }
        };

        hydrateOrganizationFields();

        return () => {
            cancelled = true;
        };
    }, [
        _organizationFieldSignature,
        hasRestrictedImmutableFields,
        isEditMode,
        organizationId,
        resolvedOrganizationFields,
        resolvedOrganizationId,
        sanitizeFields,
        setFields,
        setHydratedOrganization,
    ]);

    return { fieldsLoading };
};
