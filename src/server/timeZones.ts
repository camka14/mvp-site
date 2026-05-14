import tzLookup from 'tz-lookup';
import {
  getDateTimePartsInTimeZone,
  hasExplicitTimeZoneOffset,
  normalizeTimeZone,
  parseDateTimeInTimeZone,
} from '@/lib/dateUtils';

export const DEFAULT_EVENT_TIME_ZONE = 'UTC';

export const resolveTimeZone = (
  value: unknown,
  fallback = DEFAULT_EVENT_TIME_ZONE,
): string => normalizeTimeZone(
  typeof value === 'string' ? value : null,
  fallback,
);

const resolveOptionalTimeZone = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const normalized = normalizeTimeZone(value, DEFAULT_EVENT_TIME_ZONE);
  return normalized === DEFAULT_EVENT_TIME_ZONE && value.trim() !== DEFAULT_EVENT_TIME_ZONE
    ? null
    : normalized;
};

export const resolveTimeZoneFromCoordinates = (
  coordinates: unknown,
  fallback = DEFAULT_EVENT_TIME_ZONE,
): string => {
  const fromArray = Array.isArray(coordinates)
    ? {
      lon: Number(coordinates[0]),
      lat: Number(coordinates[1]),
    }
    : null;
  const fromObject = coordinates && typeof coordinates === 'object'
    ? {
      lat: Number((coordinates as Record<string, unknown>).lat),
      lon: Number(
        (coordinates as Record<string, unknown>).lng
        ?? (coordinates as Record<string, unknown>).long
        ?? (coordinates as Record<string, unknown>).lon,
      ),
    }
    : null;
  const candidate = fromArray ?? fromObject;
  if (!candidate || !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lon)) {
    return resolveTimeZone(null, fallback);
  }

  try {
    return resolveTimeZone(tzLookup(candidate.lat, candidate.lon), fallback);
  } catch {
    return resolveTimeZone(null, fallback);
  }
};

export const resolveTimeZoneFromFieldOrOrganization = (
  field: Record<string, unknown> | null | undefined,
  organization: Record<string, unknown> | null | undefined,
  fallback = DEFAULT_EVENT_TIME_ZONE,
): string => {
  const fieldTimeZone = resolveOptionalTimeZone(field?.timeZone);
  if (fieldTimeZone) {
    return fieldTimeZone;
  }
  const fieldCoordinates = field
    ? [field.long ?? field.lng ?? field.lon, field.lat]
    : null;
  const hasFieldCoordinates = Array.isArray(fieldCoordinates)
    && Number.isFinite(Number(fieldCoordinates[0]))
    && Number.isFinite(Number(fieldCoordinates[1]));
  const fromFieldCoordinates = hasFieldCoordinates
    ? resolveTimeZoneFromCoordinates(fieldCoordinates, DEFAULT_EVENT_TIME_ZONE)
    : null;
  if (fromFieldCoordinates) {
    return fromFieldCoordinates;
  }
  const organizationTimeZone = resolveOptionalTimeZone(organization?.timeZone);
  if (organizationTimeZone) {
    return organizationTimeZone;
  }
  return resolveTimeZoneFromCoordinates(organization?.coordinates, fallback);
};

export const parseDateInputInTimeZone = (
  value: unknown,
  timeZone: string,
): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return parseDateTimeInTimeZone(value, timeZone);
  }
  return null;
};

export const localDatePartsInTimeZone = (
  value: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null =>
  getDateTimePartsInTimeZone(value, timeZone);

export const minutesInTimeZone = (
  value: Date,
  timeZone: string,
): number => {
  const parts = localDatePartsInTimeZone(value, timeZone);
  return parts ? parts.hour * 60 + parts.minute : value.getUTCHours() * 60 + value.getUTCMinutes();
};

export const mondayDayInTimeZone = (
  value: Date,
  timeZone: string,
): number => {
  const parts = localDatePartsInTimeZone(value, timeZone);
  if (!parts) {
    return (value.getUTCDay() + 6) % 7;
  }
  const localNoonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  return (localNoonUtc.getUTCDay() + 6) % 7;
};

export const isLocalDateTimeInput = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !hasExplicitTimeZoneOffset(value);
