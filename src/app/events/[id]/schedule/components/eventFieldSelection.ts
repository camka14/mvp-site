type EventType = 'EVENT' | 'TOURNAMENT' | 'LEAGUE' | 'WEEKLY_EVENT';

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
  return normalizeFieldIds(selectedFieldIds)
    .filter((fieldId) => allowedFieldIds.has(fieldId));
};

export const requiresOrganizationEventFieldSelection = (
  _eventType: EventType,
  _organizationId: unknown,
  _selectedFieldIds: unknown,
): boolean => {
  return false;
};

