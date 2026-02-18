type EventType = 'EVENT' | 'TOURNAMENT' | 'LEAGUE';

const normalizeFieldIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0),
    ),
  );
};

export const resolveOrganizationEventFieldIds = (
  selectedFieldIds: unknown,
  availableFieldIds: unknown,
): string[] => {
  const normalizedAvailable = normalizeFieldIds(availableFieldIds);
  const allowedFieldIds = new Set(normalizedAvailable);
  const normalizedSelected = normalizeFieldIds(selectedFieldIds)
    .filter((fieldId) => allowedFieldIds.has(fieldId));
  return normalizedSelected.length ? normalizedSelected : normalizedAvailable;
};

export const requiresOrganizationEventFieldSelection = (
  eventType: EventType,
  organizationId: unknown,
  selectedFieldIds: unknown,
): boolean => {
  const hasOrganization = typeof organizationId === 'string' && organizationId.trim().length > 0;
  return eventType === 'EVENT' && hasOrganization && normalizeFieldIds(selectedFieldIds).length === 0;
};

