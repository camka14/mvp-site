import {
    formatDateTimeInTimeZone,
    formatLocalDateTime,
    hasExplicitTimeZoneOffset,
} from '@/lib/dateUtils';

export const formatEventDateTimeForForm = (
    value: Date | string | null | undefined,
    timeZone: string,
): string => {
    if (typeof value === 'string' && value.trim() && !hasExplicitTimeZoneOffset(value)) {
        return formatLocalDateTime(value);
    }
    return formatDateTimeInTimeZone(value, timeZone) || formatLocalDateTime(value);
};

export const parseDateValue = (value?: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
