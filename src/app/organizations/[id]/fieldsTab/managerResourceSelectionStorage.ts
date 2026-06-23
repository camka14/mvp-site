import { normalizeFieldIds } from './facilityFormUtils';

type StoredManagerResourceSelection = {
  fieldIds?: unknown;
  updatedAt?: unknown;
};

const MANAGER_RESOURCE_SELECTION_STORAGE_PREFIX = 'bracketiq.facilities.managerResourceSelection';

export const buildManagerResourceSelectionStorageKey = (organizationId?: string | null): string | null => {
  const normalizedOrganizationId = typeof organizationId === 'string' ? organizationId.trim() : '';
  return normalizedOrganizationId
    ? `${MANAGER_RESOURCE_SELECTION_STORAGE_PREFIX}:${normalizedOrganizationId}`
    : null;
};

export const readStoredManagerResourceFieldIds = (storageKey: string, validFieldIds: string[]): string[] | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as StoredManagerResourceSelection | string[];
    const rawFieldIds = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.fieldIds)
        ? parsed.fieldIds
        : [];
    const validFieldIdSet = new Set(validFieldIds);
    const storedFieldIds = normalizeFieldIds(
      rawFieldIds.filter((fieldId): fieldId is string => typeof fieldId === 'string'),
    ).filter((fieldId) => validFieldIdSet.has(fieldId));
    return storedFieldIds.length ? storedFieldIds : null;
  } catch {
    return null;
  }
};

export const writeStoredManagerResourceFieldIds = (storageKey: string, fieldIds: string[]): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      fieldIds: normalizeFieldIds(fieldIds),
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore local storage failures so calendar selection still works.
  }
};
