import type { Facility } from '@/types';

export const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

export const normalizeDaysOfWeek = (value: unknown, dayOfWeek?: number): number[] => {
  const source = Array.isArray(value) && value.length
    ? value
    : typeof dayOfWeek === 'number'
      ? [dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((a, b) => a - b);
};

export const FACILITY_DAY_OPTIONS = [
  { value: '0', label: 'Mon', longLabel: 'Monday', dayOfWeek: 0 },
  { value: '1', label: 'Tue', longLabel: 'Tuesday', dayOfWeek: 1 },
  { value: '2', label: 'Wed', longLabel: 'Wednesday', dayOfWeek: 2 },
  { value: '3', label: 'Thu', longLabel: 'Thursday', dayOfWeek: 3 },
  { value: '4', label: 'Fri', longLabel: 'Friday', dayOfWeek: 4 },
  { value: '5', label: 'Sat', longLabel: 'Saturday', dayOfWeek: 5 },
  { value: '6', label: 'Sun', longLabel: 'Sunday', dayOfWeek: 6 },
];

export const FACILITY_DAY_LABELS = FACILITY_DAY_OPTIONS.map((option) => option.label);
export const STAFF_TIMESLOT_REPEAT_DAY_OPTIONS = FACILITY_DAY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.longLabel,
}));
export const DEFAULT_FACILITY_OPEN_TIME = '08:00';
export const DEFAULT_FACILITY_CLOSE_TIME = '22:00';
export const ALL_FACILITIES_FILTER_VALUE = '__all_facilities__';
export const UNASSIGNED_FACILITY_FILTER_VALUE = '__unassigned_resources__';
export const FACILITY_LOCATION_REQUIRED_ERROR = 'Facility location is required.';
export const FACILITY_LOCATION_SELECTION_ERROR = 'Select a facility address from suggestions or the map.';
export const EMPTY_FACILITY_COORDINATES = { lat: 0, lng: 0 };

export type FacilityWeeklyHoursFormRow = {
  dayOfWeek: number;
  closed: boolean;
  openTime: string;
  closeTime: string;
};

export const normalizeTimeInput = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : '';
};

export const coerceDatePickerValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const facilityCoordinatesToInput = (value: Facility['coordinates'] | unknown): { lat: number; lng: number } => {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lat = Number(record.lat ?? record.latitude);
    const lng = Number(record.lng ?? record.long ?? record.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return EMPTY_FACILITY_COORDINATES;
};

export const facilityCoordinatesFromInput = (value: { lat: number; lng: number }): [number, number] | null => {
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return [lng, lat];
};

export const hasFacilityCoordinates = (value: { lat: number; lng: number }): boolean =>
  facilityCoordinatesFromInput(value) !== null;

export const timeToMinutes = (value: string): number | null => {
  const normalized = normalizeTimeInput(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map((part) => Number(part));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

export const minutesToTimeInput = (minutes: unknown): string => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return '';
  }
  const normalized = Math.trunc(minutes);
  if (normalized === 1440) {
    return '00:00';
  }
  if (normalized < 0 || normalized > 1439) {
    return '';
  }
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
};

export const buildDefaultFacilityWeeklyHours = (): FacilityWeeklyHoursFormRow[] => (
  FACILITY_DAY_OPTIONS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    closed: true,
    openTime: '',
    closeTime: '',
  }))
);

const resolveCloseMinutes = (openMinutes: number, closeTime: string): number | null => {
  const closeMinutes = timeToMinutes(closeTime);
  if (closeMinutes === null) {
    return null;
  }
  if (closeMinutes === 0 && openMinutes > 0) {
    return 1440;
  }
  return closeMinutes;
};

export const normalizeFacilityOperatingHours = (value: Facility['operatingHours'] | unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    version?: unknown;
    weekly?: unknown;
    daysOfWeek?: unknown;
    openTime?: unknown;
    closeTime?: unknown;
  };

  const rawWeekly = record.weekly;
  if (record.version === 1 && Array.isArray(rawWeekly)) {
    const weekly = FACILITY_DAY_OPTIONS.map((day) => {
      const rawDay = rawWeekly.find((entry: unknown) => (
        entry
        && typeof entry === 'object'
        && Number((entry as { dayOfWeek?: unknown }).dayOfWeek) === day.dayOfWeek
      )) as { closed?: unknown; intervals?: unknown } | undefined;
      const intervals = Array.isArray(rawDay?.intervals)
        ? rawDay.intervals.flatMap((interval) => {
            if (!interval || typeof interval !== 'object') {
              return [];
            }
            const openMinutes = Number((interval as { openMinutes?: unknown }).openMinutes);
            const closeMinutes = Number((interval as { closeMinutes?: unknown }).closeMinutes);
            if (
              !Number.isInteger(openMinutes)
              || !Number.isInteger(closeMinutes)
              || openMinutes < 0
              || openMinutes > 1439
              || closeMinutes <= openMinutes
              || closeMinutes > 1440
            ) {
              return [];
            }
            return [{ openMinutes, closeMinutes }];
          })
        : [];
      const closed = rawDay ? Boolean(rawDay.closed) || intervals.length === 0 : true;
      return {
        dayOfWeek: day.dayOfWeek,
        closed,
        intervals: closed ? [] : intervals,
      };
    });
    return { version: 1 as const, weekly };
  }

  const legacyDaysOfWeek = normalizeDaysOfWeek(record.daysOfWeek);
  const legacyOpenTime = normalizeTimeInput(record.openTime);
  const legacyCloseTime = normalizeTimeInput(record.closeTime);
  const legacyOpenMinutes = timeToMinutes(legacyOpenTime);
  const legacyCloseMinutes = legacyOpenMinutes === null ? null : resolveCloseMinutes(legacyOpenMinutes, legacyCloseTime);
  if (!legacyDaysOfWeek.length || legacyOpenMinutes === null || legacyCloseMinutes === null || legacyCloseMinutes <= legacyOpenMinutes) {
    return null;
  }
  return {
    version: 1 as const,
    weekly: FACILITY_DAY_OPTIONS.map((day) => {
      const isOpen = legacyDaysOfWeek.includes(day.dayOfWeek);
      return {
        dayOfWeek: day.dayOfWeek,
        closed: !isOpen,
        intervals: isOpen
          ? [{ openMinutes: legacyOpenMinutes, closeMinutes: legacyCloseMinutes }]
          : [],
      };
    }),
  };
};

export const facilityOperatingHoursToFormRows = (value: Facility['operatingHours'] | unknown): FacilityWeeklyHoursFormRow[] => {
  const normalized = normalizeFacilityOperatingHours(value);
  if (!normalized) {
    return buildDefaultFacilityWeeklyHours();
  }
  return FACILITY_DAY_OPTIONS.map((day) => {
    const schedule = normalized.weekly.find((entry) => entry.dayOfWeek === day.dayOfWeek);
    const interval = schedule?.intervals[0] ?? null;
    return {
      dayOfWeek: day.dayOfWeek,
      closed: !schedule || schedule.closed || !interval,
      openTime: interval ? minutesToTimeInput(interval.openMinutes) : '',
      closeTime: interval ? minutesToTimeInput(interval.closeMinutes) : '',
    };
  });
};

export const buildOperatingHoursFromFormRows = (
  rows: FacilityWeeklyHoursFormRow[],
): { operatingHours: Facility['operatingHours'] | null; error: string | null } => {
  const weekly = rows.map((row) => {
    if (row.closed) {
      return {
        dayOfWeek: row.dayOfWeek,
        closed: true,
        intervals: [],
      };
    }

    const openTime = normalizeTimeInput(row.openTime);
    const closeTime = normalizeTimeInput(row.closeTime);
    if (!openTime || !closeTime) {
      return { error: `${FACILITY_DAY_LABELS[row.dayOfWeek] ?? 'Day'} needs open and close times.` };
    }
    const openMinutes = timeToMinutes(openTime);
    const closeMinutes = openMinutes === null ? null : resolveCloseMinutes(openMinutes, closeTime);
    if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
      return { error: `${FACILITY_DAY_LABELS[row.dayOfWeek] ?? 'Day'} close time must be after open time.` };
    }
    return {
      dayOfWeek: row.dayOfWeek,
      closed: false,
      intervals: [{ openMinutes, closeMinutes }],
    };
  });

  const errorEntry = weekly.find((row): row is { error: string } => 'error' in row);
  if (errorEntry) {
    return { operatingHours: null, error: errorEntry.error };
  }

  const typedWeekly = weekly.filter((row): row is NonNullable<Facility['operatingHours']>['weekly'][number] => !('error' in row));
  const hasOpenDay = typedWeekly.some((day) => !day.closed && day.intervals.length > 0);
  return {
    operatingHours: hasOpenDay ? { version: 1, weekly: typedWeekly } : null,
    error: null,
  };
};

export const formatFacilityOperatingHours = (value: Facility['operatingHours'] | unknown): string | null => {
  const hours = normalizeFacilityOperatingHours(value);
  if (!hours) {
    return null;
  }
  const openDays = hours.weekly.filter((day) => !day.closed && day.intervals.length > 0);
  if (!openDays.length) {
    return null;
  }
  const firstInterval = openDays[0]?.intervals[0];
  const sameInterval = Boolean(firstInterval) && openDays.every((day) => (
    day.intervals.length === 1
    && day.intervals[0]?.openMinutes === firstInterval?.openMinutes
    && day.intervals[0]?.closeMinutes === firstInterval?.closeMinutes
  ));
  if (!sameInterval || !firstInterval) {
    return `${openDays.length} day${openDays.length === 1 ? '' : 's'} open; hours vary`;
  }
  const daysOfWeek = openDays.map((day) => day.dayOfWeek).sort((a, b) => a - b);
  const dayLabel = daysOfWeek.length === 7
    ? 'Daily'
    : daysOfWeek.length === 5 && daysOfWeek.every((day, index) => day === index)
      ? 'Weekdays'
      : daysOfWeek.map((day) => FACILITY_DAY_LABELS[day]).filter(Boolean).join(', ');
  return `${dayLabel} ${minutesToTimeInput(firstInterval.openMinutes)}-${minutesToTimeInput(firstInterval.closeMinutes)}`;
};
