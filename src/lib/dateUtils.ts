const OFFSET_SUFFIX = /([+-]\d{2}:?\d{2}|Z)$/i;
const MILLISECONDS_SUFFIX = /\.\d+$/;

const pad = (value: number): string => value.toString().padStart(2, '0');

const buildFromDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const coerceStringToLocalFormat = (raw: string): string | null => {
  if (!raw) {
    return null;
  }

  let working = raw.trim();
  if (!working) {
    return null;
  }

  if (MILLISECONDS_SUFFIX.test(working)) {
    working = working.replace(MILLISECONDS_SUFFIX, '');
  }

  if (OFFSET_SUFFIX.test(working)) {
    working = working.replace(OFFSET_SUFFIX, '');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(working)) {
    return `${working}T00:00:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(working)) {
    return `${working}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(working)) {
    return working;
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return buildFromDate(fallback);
};

export const parseLocalDateTime = (value: string | Date | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = coerceStringToLocalFormat(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatLocalDateTime = (value: Date | string | null | undefined): string => {
  if (value instanceof Date) {
    return buildFromDate(value);
  }

  if (typeof value === 'string') {
    const normalized = coerceStringToLocalFormat(value);
    if (normalized) {
      return normalized;
    }
  }

  const parsed = parseLocalDateTime(value ?? null);
  return parsed ? buildFromDate(parsed) : '';
};

export const ensureLocalDateTimeString = (value: Date | string | null | undefined): string | null => {
  const formatted = formatLocalDateTime(value);
  return formatted || null;
};

export const nowLocalDateTimeString = (): string => buildFromDate(new Date());
