const OFFSET_SUFFIX = /([+-]\d{2}:?\d{2}|Z)$/i;
const MILLISECONDS_SUFFIX = /\.\d+$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
const DEFAULT_TIME_ZONE = 'UTC';

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

export const hasExplicitTimeZoneOffset = (value: string): boolean => OFFSET_SUFFIX.test(value.trim());

export const normalizeTimeZone = (
  value: string | null | undefined,
  fallback = DEFAULT_TIME_ZONE,
): string => {
  const candidate = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    if (candidate !== DEFAULT_TIME_ZONE) {
      return normalizeTimeZone(fallback, DEFAULT_TIME_ZONE);
    }
    return DEFAULT_TIME_ZONE;
  }
};

export const getSystemTimeZone = (): string => {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, DEFAULT_TIME_ZONE);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const parseLocalDateTimeParts = (value: string): DateTimeParts | null => {
  const trimmed = value.trim();
  if (!trimmed || hasExplicitTimeZoneOffset(trimmed)) {
    return null;
  }
  const match = LOCAL_DATE_TIME_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  if (
    !Number.isInteger(parts.year)
    || !Number.isInteger(parts.month)
    || !Number.isInteger(parts.day)
    || !Number.isInteger(parts.hour)
    || !Number.isInteger(parts.minute)
    || !Number.isInteger(parts.second)
    || parts.month < 1
    || parts.month > 12
    || parts.day < 1
    || parts.day > 31
    || parts.hour < 0
    || parts.hour > 23
    || parts.minute < 0
    || parts.minute > 59
    || parts.second < 0
    || parts.second > 59
  ) {
    return null;
  }
  return parts;
};

const zonedDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getZonedDateFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const normalized = normalizeTimeZone(timeZone);
  const existing = zonedDateFormatterCache.get(normalized);
  if (existing) {
    return existing;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalized,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  zonedDateFormatterCache.set(normalized, formatter);
  return formatter;
};

export const getDateTimePartsInTimeZone = (
  value: Date | string | number,
  timeZone: string,
): DateTimeParts | null => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const partMap = new Map<string, string>();
  getZonedDateFormatter(timeZone).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      partMap.set(part.type, part.value);
    }
  });
  const parts = {
    year: Number(partMap.get('year')),
    month: Number(partMap.get('month')),
    day: Number(partMap.get('day')),
    hour: Number(partMap.get('hour')),
    minute: Number(partMap.get('minute')),
    second: Number(partMap.get('second')),
  };
  return Object.values(parts).every((entry) => Number.isFinite(entry))
    ? parts
    : null;
};

const timeZoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(instant, timeZone);
  if (!parts) {
    return 0;
  }
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return zonedAsUtc - instant.getTime();
};

export const zonedTimeToUtcDate = (
  value: string | Date,
  timeZone: string,
): Date | null => {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const parts = value instanceof Date
    ? {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    }
    : parseLocalDateTimeParts(value);
  if (!parts) {
    return null;
  }

  const localAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let utcMs = localAsUtcMs;
  for (let index = 0; index < 3; index += 1) {
    const offsetMs = timeZoneOffsetMs(new Date(utcMs), normalizedTimeZone);
    const nextUtcMs = localAsUtcMs - offsetMs;
    if (Math.abs(nextUtcMs - utcMs) < 1) {
      utcMs = nextUtcMs;
      break;
    }
    utcMs = nextUtcMs;
  }

  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
};

export const parseDateTimeInTimeZone = (
  value: Date | string | number | null | undefined,
  timeZone: string | null | undefined,
): Date | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!hasExplicitTimeZoneOffset(trimmed)) {
    const parsedLocal = zonedTimeToUtcDate(trimmed, normalizeTimeZone(timeZone));
    if (parsedLocal) {
      return parsedLocal;
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateTimeInTimeZone = (
  value: Date | string | number | null | undefined,
  timeZone: string | null | undefined,
): string => {
  const parsed = parseDisplayInput(value);
  if (!parsed) {
    return '';
  }
  const parts = getDateTimePartsInTimeZone(parsed, normalizeTimeZone(timeZone));
  if (!parts) {
    return '';
  }
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
};

export const instantToCalendarDateInTimeZone = (
  value: Date | string | number | null | undefined,
  timeZone: string | null | undefined,
): Date | null => {
  const parsed = parseDisplayInput(value);
  if (!parsed) {
    return null;
  }
  const parts = getDateTimePartsInTimeZone(parsed, normalizeTimeZone(timeZone));
  if (!parts) {
    return null;
  }
  const calendarDate = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Number.isNaN(calendarDate.getTime()) ? null : calendarDate;
};

export const calendarDateInTimeZoneToInstant = (
  value: Date | string | null | undefined,
  timeZone: string | null | undefined,
): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : parseLocalDateTime(value);
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return zonedTimeToUtcDate(date, normalizeTimeZone(timeZone));
};

type DisplayYearFormat = '2-digit' | 'numeric';

type DisplayDateOptions = {
  year?: DisplayYearFormat;
  timeZone?: string;
};

type DisplayTimeOptions = {
  includeSeconds?: boolean;
  timeZone?: string;
};

type DisplayDateTimeOptions = DisplayDateOptions & DisplayTimeOptions;

const parseDisplayInput = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDisplayDate = (
  value: Date | string | number | null | undefined,
  options: DisplayDateOptions = {},
): string => {
  const parsed = parseDisplayInput(value);
  if (!parsed) {
    return '';
  }

  const { year = 'numeric', timeZone } = options;
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year,
    ...(timeZone ? { timeZone } : {}),
  }).format(parsed);
};

export const formatDisplayTime = (
  value: Date | string | number | null | undefined,
  options: DisplayTimeOptions = {},
): string => {
  const parsed = parseDisplayInput(value);
  if (!parsed) {
    return '';
  }

  const { includeSeconds = false, timeZone } = options;
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(parsed);
};

export const formatDisplayDateTime = (
  value: Date | string | number | null | undefined,
  options: DisplayDateTimeOptions = {},
): string => {
  const date = formatDisplayDate(value, { year: options.year, timeZone: options.timeZone });
  const time = formatDisplayTime(value, {
    includeSeconds: options.includeSeconds,
    timeZone: options.timeZone,
  });

  if (!date || !time) {
    return '';
  }

  return `${date} ${time}`;
};
