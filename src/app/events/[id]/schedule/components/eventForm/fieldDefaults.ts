import type { Field } from '@/types';

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
