import { Field } from '@/types';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeFieldId = (field?: Field | null): string | null => {
  if (!field || typeof field !== 'object') {
    return null;
  }

  const fromDocumentId = normalizeId((field as { $id?: unknown }).$id);
  if (fromDocumentId) {
    return fromDocumentId;
  }

  const fromLegacyId = normalizeId((field as { id?: unknown }).id);
  return fromLegacyId;
};

export const getFieldOrganizationId = (field?: Field | null): string | undefined => {
  if (!field) return undefined;

  const org = (field as any).organization;
  const organizationFromString = normalizeId(org);
  if (organizationFromString) {
    return organizationFromString;
  }

  if (org && typeof org === 'object') {
    const organizationFromObjectId = normalizeId((org as { $id?: unknown }).$id);
    if (organizationFromObjectId) {
      return organizationFromObjectId;
    }
    const organizationFromLegacyId = normalizeId((org as { id?: unknown }).id);
    if (organizationFromLegacyId) {
      return organizationFromLegacyId;
    }
  }

  const organizationId = normalizeId((field as any).organizationId);
  return organizationId ?? undefined;
};

export const hasExternalRentalFieldForEvent = (params: {
  eventOrganizationId: string;
  sourceFields: Field[];
  organizationFieldIds: string[];
  referencedFieldIds: string[];
  isEditMode: boolean;
}): boolean => {
  const normalizedEventOrganizationId = normalizeId(params.eventOrganizationId);

  const hasOrganizationOwnedField = params.sourceFields.some((field) => {
    const orgId = getFieldOrganizationId(field);
    return Boolean(orgId);
  });
  if (!normalizedEventOrganizationId) {
    return hasOrganizationOwnedField;
  }

  const hasExplicitCrossOrganizationField = params.sourceFields.some((field) => {
    const orgId = getFieldOrganizationId(field);
    return Boolean(orgId && orgId !== normalizedEventOrganizationId);
  });
  if (hasExplicitCrossOrganizationField) {
    return true;
  }

  if (!params.isEditMode) {
    return false;
  }

  const organizationFieldIdSet = new Set(
    params.organizationFieldIds
      .map((value) => normalizeId(value))
      .filter((value): value is string => Boolean(value)),
  );
  params.sourceFields.forEach((field) => {
    const fieldOrgId = getFieldOrganizationId(field);
    if (fieldOrgId !== normalizedEventOrganizationId) {
      return;
    }
    const fieldId = normalizeFieldId(field);
    if (fieldId) {
      organizationFieldIdSet.add(fieldId);
    }
  });
  if (!organizationFieldIdSet.size) {
    return false;
  }

  for (const fieldIdValue of params.referencedFieldIds) {
    const fieldId = normalizeId(fieldIdValue);
    if (!fieldId) {
      continue;
    }
    if (!organizationFieldIdSet.has(fieldId)) {
      return true;
    }
  }

  return false;
};
