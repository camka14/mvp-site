const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/;

const atUtcStartOfDay = (value: Date): Date => new Date(Date.UTC(
  value.getUTCFullYear(),
  value.getUTCMonth(),
  value.getUTCDate(),
));

/**
 * Parses a date of birth as a calendar date, independent of the client's timezone.
 * Date-only strings are intentionally validated strictly so values such as 2026-02-30
 * cannot roll into a different calendar day.
 */
export const parseDateOfBirth = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : atUtcStartOfDay(value);
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = normalized.match(DATE_ONLY_PREFIX);
  if (dateOnlyMatch) {
    const dateOnly = dateOnlyMatch[1];
    const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOnly
      ? null
      : parsed;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : atUtcStartOfDay(parsed);
};

export const isFutureDateOfBirth = (dateOfBirth: Date, now: Date = new Date()): boolean => {
  if (Number.isNaN(dateOfBirth.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }

  return atUtcStartOfDay(dateOfBirth).getTime() > atUtcStartOfDay(now).getTime();
};
