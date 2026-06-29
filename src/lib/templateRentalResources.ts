import type { Event, Field, TimeSlot } from '@/types';

const TEMPLATE_RENTAL_RESOURCE_PREFIX = 'BRACKETIQ_TEMPLATE_RENTAL_RESOURCE:';

export type TemplateRentalResourceHint = {
  fieldId?: string;
  fieldName?: string;
  facilityName?: string;
  organizationId?: string;
  organizationSlug?: string;
  location?: string;
};

const normalizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const buildTemplateRentalResourceSourceType = (
  hint: TemplateRentalResourceHint,
): string => {
  const normalized: TemplateRentalResourceHint = {
    fieldId: normalizeText(hint.fieldId),
    fieldName: normalizeText(hint.fieldName),
    facilityName: normalizeText(hint.facilityName),
    organizationId: normalizeText(hint.organizationId),
    organizationSlug: normalizeText(hint.organizationSlug),
    location: normalizeText(hint.location),
  };
  return `${TEMPLATE_RENTAL_RESOURCE_PREFIX}${encodeURIComponent(JSON.stringify(normalized))}`;
};

export const parseTemplateRentalResourceSourceType = (
  sourceType: unknown,
): TemplateRentalResourceHint | null => {
  const normalizedSourceType = normalizeText(sourceType);
  if (!normalizedSourceType?.startsWith(TEMPLATE_RENTAL_RESOURCE_PREFIX)) {
    return null;
  }

  const encoded = normalizedSourceType.slice(TEMPLATE_RENTAL_RESOURCE_PREFIX.length);
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const row = parsed as Record<string, unknown>;
    return {
      fieldId: normalizeText(row.fieldId),
      fieldName: normalizeText(row.fieldName),
      facilityName: normalizeText(row.facilityName),
      organizationId: normalizeText(row.organizationId),
      organizationSlug: normalizeText(row.organizationSlug),
      location: normalizeText(row.location),
    };
  } catch {
    return {};
  }
};

export const isTemplateRentalResourceSourceType = (sourceType: unknown): boolean =>
  parseTemplateRentalResourceSourceType(sourceType) !== null;

export const getTemplateRentalResourceHintsFromEvent = (
  event: Pick<Event, 'timeSlots'> | null | undefined,
): TemplateRentalResourceHint[] => {
  const seen = new Set<string>();
  const hints: TemplateRentalResourceHint[] = [];
  const slots = Array.isArray(event?.timeSlots) ? event?.timeSlots as TimeSlot[] : [];

  slots.forEach((slot) => {
    const hint = parseTemplateRentalResourceSourceType(slot.sourceType);
    if (!hint) {
      return;
    }
    const key = [
      hint.fieldId,
      hint.fieldName,
      hint.facilityName,
      hint.organizationSlug,
      hint.organizationId,
    ].filter(Boolean).join('|');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hints.push(hint);
  });

  return hints;
};

export const buildTemplateRentalResourceHref = (
  hint: TemplateRentalResourceHint,
): string | null => {
  if (hint.organizationSlug) {
    return `/o/${encodeURIComponent(hint.organizationSlug)}/rentals`;
  }
  if (hint.organizationId) {
    return `/organizations/${encodeURIComponent(hint.organizationId)}`;
  }
  return null;
};

export const buildTemplateRentalResourceHintFromField = (
  field: Field | null | undefined,
  event: Pick<Event, 'organization' | 'organizationId' | 'location'>,
): TemplateRentalResourceHint => {
  const fieldOrganization = field && typeof (field as any).organization === 'object'
    ? (field as any).organization as Record<string, unknown>
    : null;
  const eventOrganization = event.organization && typeof event.organization === 'object'
    ? event.organization as unknown as Record<string, unknown>
    : null;
  const facility = field && typeof (field as any).facility === 'object'
    ? (field as any).facility as Record<string, unknown>
    : null;

  return {
    fieldId: normalizeText(field?.$id),
    fieldName: normalizeText(field?.name),
    facilityName: normalizeText(facility?.name) ?? normalizeText((field as any)?.facilityName),
    organizationId: normalizeText((field as any)?.organizationId)
      ?? normalizeText(fieldOrganization?.$id)
      ?? normalizeText(fieldOrganization?.id)
      ?? normalizeText(event.organizationId),
    organizationSlug: normalizeText(fieldOrganization?.publicSlug)
      ?? normalizeText(eventOrganization?.publicSlug),
    location: normalizeText(field?.location) ?? normalizeText(event.location),
  };
};
