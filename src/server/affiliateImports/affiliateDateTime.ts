import { getDateTimePartsInTimeZone, hasExplicitTimeZoneOffset } from '@/lib/dateUtils';

export const AFFILIATE_DATE_TIME_CONTRACT_VERSION = 1;

export type AffiliateDateTimeStartPrecision = 'DATE_TIME' | 'DATE_ONLY' | 'NONE';
export type AffiliateEndDerivation = 'EXPLICIT_END' | 'EXPLICIT_DURATION' | 'NONE';
export type AffiliateDateTimeError =
  | 'EMPTY_VALUE'
  | 'INVALID_DATE'
  | 'INVALID_TIME_ZONE'
  | 'MISSING_TIME_ZONE'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'NONEXISTENT_LOCAL_TIME';

export type AffiliateDateTimeParseResult = {
  iso: string | null;
  hasCalendarDate: boolean;
  hasClockTime: boolean;
  error: AffiliateDateTimeError | null;
  timeZoneEvidence: 'EXPLICIT_OFFSET' | 'IANA_TIME_ZONE' | 'NONE';
};

export type AffiliateDurationParseResult = {
  minutes: number | null;
  reason: 'EMPTY' | 'INVALID_FORMAT' | 'NON_POSITIVE' | 'TOO_LARGE' | null;
};

export type AffiliateDateTimeMetadata = {
  contractVersion: number;
  startPrecision: AffiliateDateTimeStartPrecision;
  timeZone: string | null;
  timeZoneEvidence: 'SOURCE_FIELD' | 'COORDINATES' | 'EXPLICIT_OFFSET' | 'NONE';
  endDerivation: AffiliateEndDerivation;
  durationText: string | null;
  durationMinutes: number | null;
  durationWarning: string | null;
  warnings: string[];
};

export type AffiliateDateTimeNormalization = {
  startsAt: string | null;
  endsAt: string | null;
  dateDisplayMode: 'SCHEDULED' | 'DATE_ONLY' | 'NO_FIXED_DATE' | 'ONGOING' | null;
  metadata: AffiliateDateTimeMetadata;
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MAX_DURATION_MINUTES = 14 * 24 * 60;
const IANA_TIME_ZONE_PATTERN = /^(?:UTC|GMT|[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)+)$/;
const ISO_ORDERING_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

const normalizeSourceText = (value: string): string => value
  .replace(/\s+/g, ' ')
  .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
  .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/gi, '')
  .replace(/\bSept\.?\b/gi, 'September')
  .trim();

const datePartsToEpochMs = (parts: DateTimeParts): number => {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
};

const isValidDateTimeParts = (parts: DateTimeParts): boolean => {
  if (
    !Number.isInteger(parts.year)
    || !Number.isInteger(parts.month)
    || !Number.isInteger(parts.day)
    || !Number.isInteger(parts.hour)
    || !Number.isInteger(parts.minute)
    || !Number.isInteger(parts.second)
    || parts.month < 1
    || parts.month > 12
    || parts.hour < 0
    || parts.hour > 23
    || parts.minute < 0
    || parts.minute > 59
    || parts.second < 0
    || parts.second > 59
  ) {
    return false;
  }

  const epoch = datePartsToEpochMs(parts);
  const roundTrip = new Date(epoch);
  return roundTrip.getUTCFullYear() === parts.year
    && roundTrip.getUTCMonth() === parts.month - 1
    && roundTrip.getUTCDate() === parts.day
    && roundTrip.getUTCHours() === parts.hour
    && roundTrip.getUTCMinutes() === parts.minute
    && roundTrip.getUTCSeconds() === parts.second;
};

export const isValidAffiliateTimeZone = (timeZone: string): boolean => {
  const normalized = timeZone.trim();
  if (!IANA_TIME_ZONE_PATTERN.test(normalized)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

const isStoredOrderingInstant = (value: string | null | undefined): boolean => (
  typeof value === 'string' && ISO_ORDERING_INSTANT_PATTERN.test(value.trim())
);

const parseClockTime = (
  value: string,
  rangeEnd = false,
): { hour: number; minute: number; second: number } | null => {
  const twelveHourMatches = Array.from(value.matchAll(
    /\b(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([AP])M\b/gi,
  ));
  const twelveHour = twelveHourMatches[rangeEnd ? twelveHourMatches.length - 1 : 0];
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? 0);
    const second = Number(twelveHour[3] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59 || second > 59) return null;
    const normalizedHour = hour % 12 + (twelveHour[4].toUpperCase() === 'P' ? 12 : 0);
    return { hour: normalizedHour, minute, second };
  }

  const twentyFourHourMatches = Array.from(value.matchAll(
    /(?:^|[T\s])(\d{1,2}):(\d{2})(?::(\d{2}))?(?=$|\s|[-–])/g,
  ));
  const twentyFourHour = twentyFourHourMatches[rangeEnd ? twentyFourHourMatches.length - 1 : 0];
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  const second = Number(twentyFourHour[3] ?? 0);
  return hour <= 23 && minute <= 59 && second <= 59 ? { hour, minute, second } : null;
};

const parseDateParts = (
  value: string,
  referenceDate: Date,
  timeZone: string | null | undefined,
  rangeEnd: boolean,
): { year: number; month: number; day: number } | null => {
  const normalized = normalizeSourceText(value);
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const numericMatches = Array.from(normalized.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/g));
  if (numericMatches.length > 0) {
    const match = numericMatches[rangeEnd ? numericMatches.length - 1 : 0];
    const rawYear = Number(match[3]);
    return {
      year: match[3].length === 2 ? 2000 + rawYear : rawYear,
      month: Number(match[1]),
      day: Number(match[2]),
    };
  }

  const monthMatches = Array.from(normalized.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:,?\s*((?:19|20)\d{2}))?/gi,
  ));
  const monthMatch = monthMatches[rangeEnd ? monthMatches.length - 1 : 0];
  if (!monthMatch) return null;

  let day = Number(monthMatch[2]);
  if (rangeEnd && monthMatches.length === 1) {
    const rangeDay = normalized.match(
      new RegExp(`${monthMatch[1]}\\.?\\s+${monthMatch[2]}(?:\\s*,?\\s*(?:19|20)\\d{2})?\\s*(?:[-–&]|\\band\\b)\\s*(?!\\d{1,2}:)(\\d{1,2})\\b`, 'i'),
    );
    if (rangeDay) day = Number(rangeDay[1]);
  }

  const firstMonthMatch = monthMatches[0];
  const lastMonthMatch = monthMatches[monthMatches.length - 1];
  const firstMonth = Number(MONTHS[firstMonthMatch[1].toLowerCase().replace('.', '')]);
  const lastMonth = Number(MONTHS[lastMonthMatch[1].toLowerCase().replace('.', '')]);
  const isCrossYearRange = monthMatches.length > 1 && firstMonth > lastMonth;
  const referenceParts = timeZone && isValidAffiliateTimeZone(timeZone)
    ? getDateTimePartsInTimeZone(referenceDate, timeZone)
    : null;
  const referenceYear = referenceParts?.year ?? referenceDate.getUTCFullYear();
  const referenceMonth = referenceParts?.month ?? referenceDate.getUTCMonth() + 1;
  const explicitYear = monthMatches.some((match) => Boolean(match[3]));
  const inferredBaseYear = !explicitYear && isCrossYearRange && referenceMonth <= 2 && firstMonth >= 10
    ? referenceYear - 1
    : !explicitYear
      && !isCrossYearRange
      && referenceMonth >= 10
      && firstMonth <= 2
      && firstMonth < referenceMonth
      ? referenceYear + 1
      : referenceYear;
  const trailingYear = Number(normalized.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? inferredBaseYear);
  const rangeEndYear = Number(lastMonthMatch?.[3]
    ?? (isCrossYearRange
      ? (firstMonthMatch[3] ? Number(firstMonthMatch[3]) + 1 : inferredBaseYear + 1)
      : trailingYear));
  const inferredStartYear = isCrossYearRange ? rangeEndYear - 1 : rangeEndYear;
  const year = Number(monthMatch[3] ?? (rangeEnd ? rangeEndYear : inferredStartYear));
  return { year, month: MONTHS[monthMatch[1].toLowerCase().replace('.', '')], day };
};

const timeZoneOffsetMs = (instantMs: number, timeZone: string): number => {
  const parts = getDateTimePartsInTimeZone(new Date(instantMs), timeZone);
  if (!parts) return Number.NaN;
  return datePartsToEpochMs(parts) - instantMs;
};

const parseLocalTimeInTimeZone = (parts: DateTimeParts, timeZone: string): { date: Date | null; error: AffiliateDateTimeError | null } => {
  if (!isValidAffiliateTimeZone(timeZone)) {
    return { date: null, error: 'INVALID_TIME_ZONE' };
  }

  const localAsUtcMs = datePartsToEpochMs(parts);
  const offsets = new Set<number>();
  for (let hours = -72; hours <= 72; hours += 1) {
    const offset = timeZoneOffsetMs(localAsUtcMs + hours * 60 * 60 * 1000, timeZone);
    if (Number.isFinite(offset)) offsets.add(offset);
  }

  const matchingInstants = Array.from(offsets)
    .map((offset) => localAsUtcMs - offset)
    .filter((instantMs) => {
      const candidate = getDateTimePartsInTimeZone(new Date(instantMs), timeZone);
      return candidate
        && candidate.year === parts.year
        && candidate.month === parts.month
        && candidate.day === parts.day
        && candidate.hour === parts.hour
        && candidate.minute === parts.minute
        && candidate.second === parts.second;
    })
    .sort((left, right) => left - right);

  if (matchingInstants.length === 0) {
    return { date: null, error: 'NONEXISTENT_LOCAL_TIME' };
  }
  if (matchingInstants.length > 1) {
    return { date: null, error: 'AMBIGUOUS_LOCAL_TIME' };
  }
  return { date: new Date(matchingInstants[0]), error: null };
};

const addCalendarDays = (parts: DateTimeParts, days: number): DateTimeParts => {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

const clockSeconds = (parts: DateTimeParts): number => (
  parts.hour * 60 * 60 + parts.minute * 60 + parts.second
);

const parseAffiliateDateParts = (
  value: string,
  referenceDate: Date,
  timeZone: string | null | undefined,
  rangeEnd: boolean,
): AffiliateDateTimeParseResult & { parts: DateTimeParts | null } => {
  const trimmed = value.trim();
  const normalizedTimeZone = typeof timeZone === 'string' ? timeZone.trim() : timeZone;
  if (!trimmed) {
    return { iso: null, hasCalendarDate: false, hasClockTime: false, error: 'EMPTY_VALUE', timeZoneEvidence: 'NONE', parts: null };
  }

  if (hasExplicitTimeZoneOffset(trimmed)) {
    const parsed = new Date(trimmed);
    const hasInvalidTimeZone = Boolean(normalizedTimeZone && !isValidAffiliateTimeZone(normalizedTimeZone));
    return {
      iso: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      hasCalendarDate: !Number.isNaN(parsed.getTime()),
      hasClockTime: Boolean(parseClockTime(trimmed, rangeEnd)) || /T\d{2}:\d{2}/.test(trimmed),
      error: Number.isNaN(parsed.getTime())
        ? 'INVALID_DATE'
        : hasInvalidTimeZone
          ? 'INVALID_TIME_ZONE'
          : null,
      timeZoneEvidence: 'EXPLICIT_OFFSET',
      parts: null,
    };
  }

  const date = parseDateParts(trimmed, referenceDate, normalizedTimeZone, rangeEnd);
  const clock = parseClockTime(trimmed, rangeEnd);
  if (!date || !isValidDateTimeParts({ ...date, hour: clock?.hour ?? 0, minute: clock?.minute ?? 0, second: clock?.second ?? 0 })) {
    return {
      iso: null,
      hasCalendarDate: false,
      hasClockTime: Boolean(clock),
      error: 'INVALID_DATE',
      timeZoneEvidence: normalizedTimeZone && isValidAffiliateTimeZone(normalizedTimeZone) ? 'IANA_TIME_ZONE' : 'NONE',
      parts: null,
    };
  }

  const parts = { ...date, hour: clock?.hour ?? 0, minute: clock?.minute ?? 0, second: clock?.second ?? 0 };
  if (!normalizedTimeZone) {
    return {
      iso: null,
      hasCalendarDate: true,
      hasClockTime: Boolean(clock),
      error: 'MISSING_TIME_ZONE',
      timeZoneEvidence: 'NONE',
      parts,
    };
  }

  const converted = parseLocalTimeInTimeZone(parts, normalizedTimeZone);
  return {
    iso: converted.date?.toISOString() ?? null,
    hasCalendarDate: true,
    hasClockTime: Boolean(clock),
    error: converted.error,
    timeZoneEvidence: isValidAffiliateTimeZone(normalizedTimeZone) ? 'IANA_TIME_ZONE' : 'NONE',
    parts,
  };
};

type AffiliateDateTimeParseWithParts = AffiliateDateTimeParseResult & { parts: DateTimeParts | null };

const parseAffiliateDateTimeValueWithParts = (
  value: string | null | undefined,
  params: { referenceDate: Date; timeZone?: string | null; rangeEnd?: boolean },
): AffiliateDateTimeParseWithParts => {
  if (typeof value !== 'string') {
    return {
      iso: null,
      hasCalendarDate: false,
      hasClockTime: false,
      error: 'EMPTY_VALUE',
      timeZoneEvidence: 'NONE',
      parts: null,
    };
  }
  return parseAffiliateDateParts(value, params.referenceDate, params.timeZone, params.rangeEnd ?? false);
};

export const parseAffiliateDurationText = (value: string | null | undefined): AffiliateDurationParseResult => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { minutes: null, reason: 'EMPTY' };
  if (/-\s*\d/.test(text)) return { minutes: null, reason: 'NON_POSITIVE' };

  const normalized = text.toLowerCase().replace(/\band\b/g, ' ').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tokenPattern = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi;
  const tokens = Array.from(normalized.matchAll(tokenPattern));
  const remainder = normalized.replace(tokenPattern, '').replace(/[\s()+-]+/g, '').trim();
  if (!tokens.length || remainder.length > 0) return { minutes: null, reason: 'INVALID_FORMAT' };

  const minutes = tokens.reduce((total, token) => {
    const amount = Number(token[1]);
    const unit = token[2].toLowerCase();
    const multiplier = unit.startsWith('day') || unit === 'd'
      ? 24 * 60
      : unit.startsWith('hour') || unit === 'hr' || unit === 'hrs' || unit === 'h'
        ? 60
        : 1;
    return total + amount * multiplier;
  }, 0);

  if (!Number.isFinite(minutes) || minutes <= 0) return { minutes: null, reason: 'NON_POSITIVE' };
  if (!Number.isInteger(minutes) || minutes > MAX_DURATION_MINUTES) {
    return { minutes: null, reason: 'TOO_LARGE' };
  }
  return { minutes, reason: null };
};

export const parseAffiliateDateTimeValue = (
  value: string | null | undefined,
  params: { referenceDate: Date; timeZone?: string | null; rangeEnd?: boolean },
): AffiliateDateTimeParseResult => {
  const parsed = parseAffiliateDateTimeValueWithParts(value, params);
  return {
    iso: parsed.iso,
    hasCalendarDate: parsed.hasCalendarDate,
    hasClockTime: parsed.hasClockTime,
    error: parsed.error,
    timeZoneEvidence: parsed.timeZoneEvidence,
  };
};

export const normalizeAffiliateEventDateTime = (params: {
  startsAt?: string | null;
  endsAt?: string | null;
  durationText?: string | null;
  timeZone?: string | null;
  timeZoneEvidence?: 'SOURCE_FIELD' | 'COORDINATES';
  dateDisplayMode?: string | null;
  referenceDate: Date;
}): AffiliateDateTimeNormalization => {
  const start = parseAffiliateDateTimeValueWithParts(params.startsAt, {
    referenceDate: params.referenceDate,
    timeZone: params.timeZone,
  });
  const explicitEnd = parseAffiliateDateTimeValueWithParts(params.endsAt, {
    referenceDate: params.referenceDate,
    timeZone: params.timeZone,
    rangeEnd: true,
  });
  const duration = parseAffiliateDurationText(params.durationText);
  const normalizedMode = params.dateDisplayMode?.trim().toUpperCase();
  const sourceContainsClock = start.hasClockTime && !isStoredOrderingInstant(params.startsAt);
  const sourcePrecisionMode = start.hasCalendarDate
    ? (start.hasClockTime ? 'SCHEDULED' : 'DATE_ONLY')
    : null;
  const dateDisplayMode = normalizedMode === 'NO_FIXED_DATE' || normalizedMode === 'ONGOING'
    ? normalizedMode
    : normalizedMode === 'DATE_ONLY' && !sourceContainsClock
      ? 'DATE_ONLY'
      : sourcePrecisionMode
        ?? (normalizedMode === 'SCHEDULED' ? normalizedMode : null);
  const warnings: string[] = [];

  if (start.error && start.error !== 'EMPTY_VALUE') warnings.push(`start:${start.error}`);
  if (explicitEnd.error && explicitEnd.error !== 'EMPTY_VALUE') warnings.push(`end:${explicitEnd.error}`);
  if (duration.reason && duration.reason !== 'EMPTY') warnings.push(`duration:${duration.reason}`);
  if (normalizedMode === 'DATE_ONLY' && sourceContainsClock) {
    warnings.push('dateDisplayMode:DATE_ONLY_CONFLICTS_WITH_SOURCE_TIME');
  }
  if ((dateDisplayMode === 'SCHEDULED' || dateDisplayMode === 'DATE_ONLY') && !params.timeZone) {
    warnings.push('timeZone:MISSING_IANA_TIME_ZONE');
  }

  let endsAt = explicitEnd.iso;
  let endDerivation: AffiliateEndDerivation = explicitEnd.iso ? 'EXPLICIT_END' : 'NONE';
  if (
    endsAt
    && params.timeZone
    && start.parts
    && explicitEnd.parts
    && start.parts.year === explicitEnd.parts.year
    && start.parts.month === explicitEnd.parts.month
    && start.parts.day === explicitEnd.parts.day
    && clockSeconds(explicitEnd.parts) < clockSeconds(start.parts)
  ) {
    const overnightEnd = parseLocalTimeInTimeZone(
      addCalendarDays(explicitEnd.parts, 1),
      params.timeZone.trim(),
    );
    if (overnightEnd.date) endsAt = overnightEnd.date.toISOString();
  }
  if (endsAt && start.iso && new Date(endsAt).getTime() < new Date(start.iso).getTime()) {
    warnings.push('end:BEFORE_START');
    endsAt = null;
    endDerivation = 'NONE';
  }
  const explicitWholeDayDuration = /^\s*\d+\s*days?\s*$/i.test(params.durationText ?? '');
  const canDeriveDurationEnd = dateDisplayMode === 'SCHEDULED'
    || (dateDisplayMode === 'DATE_ONLY' && explicitWholeDayDuration);
  const hasExplicitEndText = Boolean(params.endsAt?.trim());
  if (!endsAt && !hasExplicitEndText && start.iso && duration.minutes != null && canDeriveDurationEnd) {
    const isWholeDayDateOnly = dateDisplayMode === 'DATE_ONLY'
      && explicitWholeDayDuration
      && duration.minutes % (24 * 60) === 0;
    const dateOnlyStartParts = isWholeDayDateOnly && params.timeZone && isValidAffiliateTimeZone(params.timeZone)
      ? start.parts ?? getDateTimePartsInTimeZone(new Date(start.iso), params.timeZone.trim())
      : null;
    if (isWholeDayDateOnly && dateOnlyStartParts && params.timeZone) {
      const calendarEnd = parseLocalTimeInTimeZone(
        addCalendarDays(dateOnlyStartParts, duration.minutes / (24 * 60)),
        params.timeZone.trim(),
      );
      if (calendarEnd.date) {
        endsAt = calendarEnd.date.toISOString();
        endDerivation = 'EXPLICIT_DURATION';
      } else if (calendarEnd.error) {
        warnings.push(`end:${calendarEnd.error}`);
      }
    } else {
      endsAt = new Date(new Date(start.iso).getTime() + duration.minutes * 60 * 1000).toISOString();
      endDerivation = 'EXPLICIT_DURATION';
    }
  }

  const timeZoneEvidence = params.timeZone
    && isValidAffiliateTimeZone(params.timeZone)
      ? params.timeZoneEvidence ?? 'SOURCE_FIELD'
      : start.timeZoneEvidence === 'EXPLICIT_OFFSET' || explicitEnd.timeZoneEvidence === 'EXPLICIT_OFFSET'
        ? 'EXPLICIT_OFFSET'
        : 'NONE';

  return {
    startsAt: start.iso,
    endsAt,
    dateDisplayMode,
    metadata: {
      contractVersion: AFFILIATE_DATE_TIME_CONTRACT_VERSION,
      startPrecision: dateDisplayMode === 'DATE_ONLY' && (start.iso || start.hasCalendarDate)
        ? 'DATE_ONLY'
        : start.iso || start.hasCalendarDate
          ? (start.hasClockTime ? 'DATE_TIME' : 'DATE_ONLY')
        : 'NONE',
      timeZone: params.timeZone && isValidAffiliateTimeZone(params.timeZone)
        ? params.timeZone.trim()
        : null,
      timeZoneEvidence,
      endDerivation,
      durationText: params.durationText?.trim() || null,
      durationMinutes: duration.minutes,
      durationWarning: duration.reason && duration.reason !== 'EMPTY' ? duration.reason : null,
      warnings,
    },
  };
};
