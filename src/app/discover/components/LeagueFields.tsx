import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  NumberInput,
  Switch,
  Select as MantineSelect,
  MultiSelect as MantineMultiSelect,
  Button,
  Card,
  Group,
  Text,
  Alert,
  Loader,
  Stack,
  Badge,
  SimpleGrid,
  Paper,
  Title,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { Field, LeagueConfig, Sport, TimeSlot } from '@/types';
import type { WeeklySlotConflict } from '@/lib/leagueService';
import { formatDisplayDate, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFacilityScopedFieldDisplayName, getFieldDisplayName } from '@/lib/fieldUtils';

const DROPDOWN_PROPS = { withinPortal: true, zIndex: 1800 };
const MAX_STANDARD_NUMBER = 99_999;

const parseOptionalDurationMinutes = (value: string | number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
  }
  return undefined;
};

const durationNeedsWarning = (value: number | null | undefined): boolean => (
  typeof value !== 'number' || !Number.isFinite(value) || value <= 0
);

const DAYS_OF_WEEK = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

const formatClockTime = (date: Date): string => new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}).format(date);

const formatMinutesLabel = (minutes: number): string => {
  const normalized = Math.max(0, Math.floor(minutes));
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setMinutes(normalized);
  return formatClockTime(date);
};

const MAX_TIME_SELECT_MINUTES = 24 * 60;

const TIME_SELECT_OPTIONS = Array.from({ length: MAX_TIME_SELECT_MINUTES / 5 + 1 }, (_, index) => {
  const minutes = index * 5;
  return {
    value: String(minutes),
    label: minutes === MAX_TIME_SELECT_MINUTES ? '12:00 AM (next day)' : formatMinutesLabel(minutes),
  };
});

const normalizeTimeSelectValue = (value: number | undefined): string | null => (
  typeof value === 'number' && Number.isFinite(value)
    ? String(Math.max(0, Math.min(MAX_TIME_SELECT_MINUTES, Math.trunc(value))))
    : null
);

type TimeOfDaySelectProps = {
  label: string;
  value?: number;
  onChange: (minutes: number | undefined) => void;
  disabled?: boolean;
  error?: string;
};

const TimeOfDaySelect = ({
  label,
  value,
  onChange,
  disabled,
  error,
}: TimeOfDaySelectProps) => (
  <MantineSelect
    label={label}
    withAsterisk
    placeholder="Select time"
    data={TIME_SELECT_OPTIONS}
    value={normalizeTimeSelectValue(value)}
    onChange={(nextValue) => {
      const parsed = typeof nextValue === 'string' ? Number(nextValue) : Number.NaN;
      onChange(Number.isFinite(parsed) ? parsed : undefined);
    }}
    searchable
    comboboxProps={DROPDOWN_PROPS}
    disabled={disabled}
    error={error}
    maw={220}
  />
);

const formatDateTimeLabel = (date: Date): string => `${formatDisplayDate(date)} ${formatClockTime(date)}`;

const formatRentalWindowLabel = (start: Date, end: Date): string => {
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  if (sameDay) {
    return `${formatDisplayDate(start)} ${formatClockTime(start)} - ${formatClockTime(end)}`;
  }
  return `${formatDateTimeLabel(start)} - ${formatDateTimeLabel(end)}`;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

const atStartOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const withMinutesOnDay = (day: Date, minutes: number): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);

const dateRangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const timeRangesOverlap = (startA?: number, endA?: number, startB?: number, endB?: number): boolean => (
  typeof startA === 'number' &&
  typeof endA === 'number' &&
  typeof startB === 'number' &&
  typeof endB === 'number' &&
  endA > startA &&
  endB > startB &&
  startA < endB &&
  endA > startB
);

const findFirstRecurringConflictOccurrence = (
  slot: Pick<LeagueSlotForm, 'dayOfWeek' | 'daysOfWeek' | 'startDate' | 'endDate' | 'startTimeMinutes' | 'endTimeMinutes' | 'repeating'> | undefined,
  schedule: TimeSlot,
  eventStartDate?: string,
): { start: Date; end: Date } | null => {
  if (!slot || slot.repeating === false || schedule?.repeating === false) {
    return null;
  }

  if (!timeRangesOverlap(slot.startTimeMinutes, slot.endTimeMinutes, schedule.startTimeMinutes, schedule.endTimeMinutes)) {
    return null;
  }

  const slotDays = normalizeSlotDays(slot);
  const scheduleDays = normalizeSlotDays(schedule);
  if (!slotDays.length || !scheduleDays.some((day) => slotDays.includes(day))) {
    return null;
  }

  const slotWindowStart = parseLocalDateTime(slot.startDate ?? eventStartDate ?? null);
  const scheduleWindowStart = parseLocalDateTime(schedule.startDate ?? null);
  if (!slotWindowStart || !scheduleWindowStart) {
    return null;
  }

  const slotWindowEnd = parseLocalDateTime(slot.endDate ?? null);
  const scheduleWindowEnd = parseLocalDateTime(schedule.endDate ?? null);
  const searchStart = atStartOfDay(
    new Date(Math.max(slotWindowStart.getTime(), scheduleWindowStart.getTime())),
  );
  const boundedEndCandidates = [slotWindowEnd, scheduleWindowEnd]
    .filter((value): value is Date => Boolean(value));
  const searchEnd = boundedEndCandidates.length
    ? new Date(Math.min(...boundedEndCandidates.map((value) => value.getTime())))
    : addDays(searchStart, 730);

  if (searchEnd.getTime() <= searchStart.getTime()) {
    return null;
  }

  let cursor = searchStart;
  let scannedDays = 0;
  while (cursor.getTime() <= searchEnd.getTime() && scannedDays <= 730) {
    const weekday = (cursor.getDay() + 6) % 7;
    if (slotDays.includes(weekday) && scheduleDays.includes(weekday)) {
      const slotStart = withMinutesOnDay(cursor, slot.startTimeMinutes!);
      const slotEnd = withMinutesOnDay(cursor, slot.endTimeMinutes!);
      const scheduleStart = withMinutesOnDay(cursor, schedule.startTimeMinutes!);
      const scheduleEnd = withMinutesOnDay(cursor, schedule.endTimeMinutes!);
      if (dateRangesOverlap(slotStart, slotEnd, scheduleStart, scheduleEnd)) {
        return { start: scheduleStart, end: scheduleEnd };
      }
    }
    cursor = addDays(cursor, 1);
    scannedDays += 1;
  }

  return null;
};

const formatConflictTimeRange = (
  { schedule, event }: WeeklySlotConflict,
  slot?: LeagueSlotForm,
  eventStartDate?: string,
): string => {
  const scheduleStart = parseLocalDateTime(schedule?.startDate ?? null);
  const scheduleEnd = parseLocalDateTime(schedule?.endDate ?? null);
  const scheduleHasTimeRange = (
    typeof schedule?.startTimeMinutes === 'number'
    && typeof schedule?.endTimeMinutes === 'number'
    && schedule.endTimeMinutes > schedule.startTimeMinutes
  );

  if (schedule?.repeating !== false && scheduleHasTimeRange) {
    const firstOccurrence = findFirstRecurringConflictOccurrence(slot, schedule, eventStartDate);
    if (firstOccurrence) {
      return `${formatDisplayDate(firstOccurrence.start)}, ${formatMinutesLabel(schedule.startTimeMinutes!)}-${formatMinutesLabel(schedule.endTimeMinutes!)}`;
    }

    const timeRange = `${formatMinutesLabel(schedule.startTimeMinutes!)}-${formatMinutesLabel(schedule.endTimeMinutes!)}`;
    if (scheduleStart && scheduleEnd && scheduleEnd.getTime() > scheduleStart.getTime()) {
      return `${formatDisplayDate(scheduleStart)} - ${formatDisplayDate(scheduleEnd)}, ${timeRange}`;
    }
    if (scheduleStart) {
      return `${formatDisplayDate(scheduleStart)}, ${timeRange}`;
    }
    return timeRange;
  }

  if (scheduleStart && scheduleEnd && scheduleEnd.getTime() > scheduleStart.getTime()) {
    return `${formatDateTimeLabel(scheduleStart)} - ${formatDateTimeLabel(scheduleEnd)}`;
  }

  const eventStart = parseLocalDateTime(event?.start ?? null);
  const eventEnd = parseLocalDateTime(event?.end ?? null);
  if (eventStart && eventEnd && eventEnd.getTime() > eventStart.getTime()) {
    return `${formatDateTimeLabel(eventStart)} - ${formatDateTimeLabel(eventEnd)}`;
  }
  if (eventStart) {
    return formatDateTimeLabel(eventStart);
  }

  return 'Time range unavailable';
};

const normalizeSlotDays = (slot: Pick<LeagueSlotForm, 'dayOfWeek' | 'daysOfWeek'>): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeSlotFieldIds = (slot: Pick<LeagueSlotForm, 'scheduledFieldId' | 'scheduledFieldIds'>): string[] => {
  const fromList = normalizeFieldIds(slot.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0
    ? [slot.scheduledFieldId]
    : [];
};

const createFieldStub = (fieldId: string, label?: string): Field => ({
  $id: fieldId,
  name: label ?? '',
  location: '',
  lat: 0,
  long: 0,
});

type SlotResourceOption = {
  value: string;
  fieldId: string;
  label: string;
  field: Field | null;
  rentalBookingId?: string | null;
  rentalBookingItemId?: string | null;
  rentalStart?: string | null;
  rentalEnd?: string | null;
  rentalTimeZone?: string | null;
  rentalPriceCents?: number | null;
  rentalRequiredTemplateIds?: string[];
  rentalHostRequiredTemplateIds?: string[];
};

type SlotResourceGroup = {
  key: string;
  name: string;
  location: string;
  isRental: boolean;
  options: SlotResourceOption[];
};

const normalizeResourceText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getFieldFacility = (field: Field | null): Record<string, unknown> | null => {
  const facility = field?.facility;
  return facility && typeof facility === 'object' ? facility as unknown as Record<string, unknown> : null;
};

const getFieldFacilityName = (field: Field | null): string => {
  const facility = getFieldFacility(field);
  return normalizeResourceText(facility?.name)
    || normalizeResourceText(field?.facilityId)
    || 'Unassigned resources';
};

const getFieldFacilityLocation = (field: Field | null): string => {
  const facility = getFieldFacility(field);
  return normalizeResourceText(facility?.address)
    || normalizeResourceText(facility?.location)
    || '';
};

const getFieldFacilityKey = (field: Field | null, fallback: string): string => {
  const facility = getFieldFacility(field);
  return normalizeResourceText(facility?.id)
    || normalizeResourceText((facility as { $id?: unknown } | null)?.$id)
    || normalizeResourceText(field?.facilityId)
    || `unassigned:${fallback}`;
};

const isRentalResourceField = (field: Field | null): boolean => {
  if (!field) return false;
  const marker = field as Field & {
    rentalResource?: boolean;
    _rentalResource?: boolean;
    rentalBookingId?: string | null;
    _rentalBookingId?: string | null;
    rentalBookingItemId?: string | null;
    _rentalBookingItemId?: string | null;
  };
  return Boolean(
    marker.rentalResource
    || marker._rentalResource
    || marker.rentalBookingId
    || marker._rentalBookingId
    || marker.rentalBookingItemId
    || marker._rentalBookingItemId,
  );
};

const getFieldRentalMetadata = (field: Field | null): Partial<SlotResourceOption> => {
  if (!field) return {};
  const marker = field as Field & {
    rentalBookingId?: string | null;
    _rentalBookingId?: string | null;
    rentalBookingItemId?: string | null;
    _rentalBookingItemId?: string | null;
    rentalStart?: string | null;
    _rentalStart?: string | null;
    rentalEnd?: string | null;
    _rentalEnd?: string | null;
    rentalTimeZone?: string | null;
    _rentalTimeZone?: string | null;
    rentalPriceCents?: number | null;
    _rentalPriceCents?: number | null;
    rentalRequiredTemplateIds?: string[];
    _rentalRequiredTemplateIds?: string[];
    rentalHostRequiredTemplateIds?: string[];
    _rentalHostRequiredTemplateIds?: string[];
  };
  return {
    rentalBookingId: normalizeResourceText(marker.rentalBookingId) || normalizeResourceText(marker._rentalBookingId) || null,
    rentalBookingItemId: normalizeResourceText(marker.rentalBookingItemId) || normalizeResourceText(marker._rentalBookingItemId) || null,
    rentalStart: normalizeResourceText(marker.rentalStart) || normalizeResourceText(marker._rentalStart) || null,
    rentalEnd: normalizeResourceText(marker.rentalEnd) || normalizeResourceText(marker._rentalEnd) || null,
    rentalTimeZone: normalizeResourceText(marker.rentalTimeZone) || normalizeResourceText(marker._rentalTimeZone) || null,
    rentalPriceCents: Number.isFinite(Number(marker.rentalPriceCents ?? marker._rentalPriceCents))
      ? Number(marker.rentalPriceCents ?? marker._rentalPriceCents)
      : null,
    rentalRequiredTemplateIds: Array.isArray(marker.rentalRequiredTemplateIds)
      ? marker.rentalRequiredTemplateIds
      : (Array.isArray(marker._rentalRequiredTemplateIds) ? marker._rentalRequiredTemplateIds : []),
    rentalHostRequiredTemplateIds: Array.isArray(marker.rentalHostRequiredTemplateIds)
      ? marker.rentalHostRequiredTemplateIds
      : (Array.isArray(marker._rentalHostRequiredTemplateIds) ? marker._rentalHostRequiredTemplateIds : []),
  };
};

const getOptionRentalMetadata = (option: SlotResourceOption): Partial<SlotResourceOption> => {
  const fieldMetadata = getFieldRentalMetadata(option.field);
  return {
    ...fieldMetadata,
    rentalBookingId: normalizeResourceText(option.rentalBookingId) || fieldMetadata.rentalBookingId || null,
    rentalBookingItemId: normalizeResourceText(option.rentalBookingItemId) || fieldMetadata.rentalBookingItemId || null,
    rentalStart: normalizeResourceText(option.rentalStart) || fieldMetadata.rentalStart || null,
    rentalEnd: normalizeResourceText(option.rentalEnd) || fieldMetadata.rentalEnd || null,
    rentalTimeZone: normalizeResourceText(option.rentalTimeZone) || fieldMetadata.rentalTimeZone || null,
    rentalPriceCents: Number.isFinite(Number(option.rentalPriceCents))
      ? Number(option.rentalPriceCents)
      : fieldMetadata.rentalPriceCents,
    rentalRequiredTemplateIds: Array.isArray(option.rentalRequiredTemplateIds) && option.rentalRequiredTemplateIds.length
      ? option.rentalRequiredTemplateIds
      : fieldMetadata.rentalRequiredTemplateIds,
    rentalHostRequiredTemplateIds: Array.isArray(option.rentalHostRequiredTemplateIds) && option.rentalHostRequiredTemplateIds.length
      ? option.rentalHostRequiredTemplateIds
      : fieldMetadata.rentalHostRequiredTemplateIds,
  };
};

const optionHasRentalLock = (option: SlotResourceOption): boolean => {
  const metadata = getOptionRentalMetadata(option);
  return Boolean(metadata.rentalBookingId && metadata.rentalBookingItemId && metadata.rentalStart && metadata.rentalEnd);
};

const isSlotResourceOptionSelected = (slot: LeagueSlotForm, option: SlotResourceOption): boolean => {
  const slotFieldIds = normalizeSlotFieldIds(slot);
  const metadata = getOptionRentalMetadata(option);
  if (metadata.rentalBookingItemId) {
    return slot.rentalBookingItemId === metadata.rentalBookingItemId
      && slotFieldIds.includes(option.fieldId);
  }
  return slotFieldIds.includes(option.fieldId);
};

const getRentalLockUpdates = (option: SlotResourceOption): Partial<LeagueSlotForm> => {
  const metadata = getOptionRentalMetadata(option);
  const start = parseLocalDateTime(metadata.rentalStart ?? null);
  const end = parseLocalDateTime(metadata.rentalEnd ?? null);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return {};
  }
  const dayOfWeek = ((start.getDay() + 6) % 7) as LeagueSlotForm['dayOfWeek'];
  return {
    sourceType: 'RENTAL_BOOKING',
    rentalBookingId: metadata.rentalBookingId ?? undefined,
    rentalBookingItemId: metadata.rentalBookingItemId ?? undefined,
    rentalLocked: true,
    price: metadata.rentalPriceCents ?? undefined,
    requiredTemplateIds: metadata.rentalRequiredTemplateIds ?? [],
    hostRequiredTemplateIds: metadata.rentalHostRequiredTemplateIds ?? [],
    repeating: false,
    dayOfWeek,
    daysOfWeek: [dayOfWeek] as LeagueSlotForm['daysOfWeek'],
    startDate: formatLocalDateTime(start) || metadata.rentalStart || undefined,
    endDate: formatLocalDateTime(end) || metadata.rentalEnd || undefined,
    timeZone: metadata.rentalTimeZone ?? undefined,
    startTimeMinutes: start.getHours() * 60 + start.getMinutes(),
    endTimeMinutes: end.getHours() * 60 + end.getMinutes(),
  };
};

const RENTAL_SLOT_MISMATCH_ERROR_PREFIX = 'This rental resource is only available for ';

const isRentalSlotMismatchError = (error?: string): boolean =>
  Boolean(error?.startsWith(RENTAL_SLOT_MISMATCH_ERROR_PREFIX));

const slotHasUserTiming = (slot: LeagueSlotForm): boolean => (
  slot.repeating !== undefined
  || typeof slot.dayOfWeek === 'number'
  || (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length > 0)
  || typeof slot.startTimeMinutes === 'number'
  || typeof slot.endTimeMinutes === 'number'
  || Boolean(parseLocalDateTime(slot.startDate ?? null))
  || Boolean(parseLocalDateTime(slot.endDate ?? null))
);

const buildRentalSlotMismatchError = (option: SlotResourceOption): string | null => {
  const metadata = getOptionRentalMetadata(option);
  const start = parseLocalDateTime(metadata.rentalStart ?? null);
  const end = parseLocalDateTime(metadata.rentalEnd ?? null);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }
  return `${RENTAL_SLOT_MISMATCH_ERROR_PREFIX}${formatRentalWindowLabel(start, end)}. Update this timeslot to match the rental before selecting it.`;
};

const slotMatchesRentalWindow = (slot: LeagueSlotForm, option: SlotResourceOption): boolean => {
  const rentalUpdates = getRentalLockUpdates(option);
  const slotStart = parseLocalDateTime(slot.startDate ?? null);
  const slotEnd = parseLocalDateTime(slot.endDate ?? null);
  const rentalStart = parseLocalDateTime(rentalUpdates.startDate ?? null);
  const rentalEnd = parseLocalDateTime(rentalUpdates.endDate ?? null);

  return slot.repeating === false
    && Boolean(slotStart && rentalStart && slotStart.getTime() === rentalStart.getTime())
    && Boolean(slotEnd && rentalEnd && slotEnd.getTime() === rentalEnd.getTime())
    && slot.startTimeMinutes === rentalUpdates.startTimeMinutes
    && slot.endTimeMinutes === rentalUpdates.endTimeMinutes;
};

const getRentalSelectionError = (slot: LeagueSlotForm, option: SlotResourceOption): string | null => {
  if (!slotHasUserTiming(slot) || slotMatchesRentalWindow(slot, option)) {
    return null;
  }
  return buildRentalSlotMismatchError(option);
};

const clearRentalLockUpdates = (): Partial<LeagueSlotForm> => ({
  sourceType: undefined,
  rentalBookingId: undefined,
  rentalBookingItemId: undefined,
  rentalLocked: false,
  price: undefined,
  requiredTemplateIds: [],
  hostRequiredTemplateIds: [],
});

const buildSlotResourceGroups = (
  options: SlotResourceOption[],
  search: string,
): SlotResourceGroup[] => {
  const query = search.trim().toLowerCase();
  const byKey = new Map<string, SlotResourceGroup>();

  options.forEach((option) => {
    const resourceLabel = option.label || getFieldDisplayName(option.field ?? createFieldStub(option.value), option.value);
    const facilityName = getFieldFacilityName(option.field);
    const facilityLocation = getFieldFacilityLocation(option.field);
    const searchable = [
      resourceLabel,
      facilityName,
      facilityLocation,
    ].join(' ').toLowerCase();
    if (query && !searchable.includes(query)) {
      return;
    }
    const groupKey = getFieldFacilityKey(option.field, facilityName);
    if (!byKey.has(groupKey)) {
      byKey.set(groupKey, {
        key: groupKey,
        name: facilityName,
        location: facilityLocation,
        isRental: isRentalResourceField(option.field),
        options: [],
      });
    }
    byKey.get(groupKey)?.options.push({
      ...option,
      label: resourceLabel,
    });
  });

  return Array.from(byKey.values()).map((group) => ({
    ...group,
    options: group.options.sort((left, right) => left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    })),
  }));
};

export interface LeagueSlotForm {
  key: string;
  $id?: string;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
  dayOfWeek?: number;
  daysOfWeek?: number[];
  divisions?: string[];
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  price?: number;
  sourceType?: string | null;
  rentalBookingId?: string | null;
  rentalBookingItemId?: string | null;
  rentalLocked?: boolean;
  requiredTemplateIds?: string[];
  hostRequiredTemplateIds?: string[];
  repeating?: boolean;
  conflicts: WeeklySlotConflict[];
  checking: boolean;
  error?: string;
}

export type LeagueFieldOption = {
  value: string;
  label: string;
  fieldId?: string;
  rentalBookingId?: string | null;
  rentalBookingItemId?: string | null;
  rentalStart?: string | null;
  rentalEnd?: string | null;
  rentalTimeZone?: string | null;
  rentalPriceCents?: number | null;
  rentalRequiredTemplateIds?: string[];
  rentalHostRequiredTemplateIds?: string[];
};

interface LeagueFieldsProps {
  leagueData: LeagueConfig;
  sport?: Sport;
  participantCount?: number;
  onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
  slots: LeagueSlotForm[];
  onAddSlot: () => void;
  onUpdateSlot: (index: number, updates: Partial<LeagueSlotForm>) => void;
  onRemoveSlot: (index: number) => void;
  fields: Field[];
  fieldsLoading: boolean;
  fieldOptions?: LeagueFieldOption[];
  divisionOptions?: { value: string; label: string }[];
  eventStartDate?: string;
  lockSlotDivisions?: boolean;
  lockedDivisionKeys?: string[];
  readOnly?: boolean;
  allowDivisionEditsWhenReadOnly?: boolean;
  allowResourceEditsWhenReadOnly?: boolean;
  onAutoResolveSlotConflict?: (index: number) => void;
  showLeagueConfiguration?: boolean;
  configurationTitle?: string;
  showPlayoffSettings?: boolean;
  showTimeslots?: boolean;
  unstyled?: boolean;
  emptyFieldsMessage?: string;
}

const LeagueFields: React.FC<LeagueFieldsProps> = ({
  leagueData,
  sport,
  participantCount,
  onLeagueDataChange,
  slots,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
  fields,
  fieldsLoading,
  fieldOptions,
  divisionOptions = [],
  eventStartDate,
  lockSlotDivisions = false,
  lockedDivisionKeys = [],
  readOnly = false,
  allowDivisionEditsWhenReadOnly = false,
  allowResourceEditsWhenReadOnly = false,
  onAutoResolveSlotConflict,
  showLeagueConfiguration = true,
  configurationTitle = 'League Configuration',
  showPlayoffSettings = true,
  showTimeslots = true,
  unstyled = false,
  emptyFieldsMessage = 'No resources found. Create a resource first so you can attach weekly availability.',
}) => {
  const fieldLookup = useMemo(
    () => new Map(fields.map((field) => [field.$id, field])),
    [fields],
  );
  const requiresSets = Boolean(sport?.usePointsPerSetWin);

  const availableFieldOptions: SlotResourceOption[] = useMemo(() => {
    const sourceOptions: LeagueFieldOption[] = (fieldOptions && fieldOptions.length > 0)
      ? fieldOptions
      : fields.map((field) => ({
          value: field.$id,
          label: getFacilityScopedFieldDisplayName(field, 'Unnamed resource'),
          fieldId: field.$id,
        }));

    return sourceOptions
      .map((option) => {
        const value = normalizeResourceText(option.value);
        const fieldId = normalizeResourceText(option.fieldId) || value;
        if (!value || !fieldId) {
          return null;
        }
        const field = fieldLookup.get(fieldId) ?? null;
        const rentalMetadata = getOptionRentalMetadata({
          value,
          fieldId,
          label: option.label,
          field,
          rentalBookingId: option.rentalBookingId,
          rentalBookingItemId: option.rentalBookingItemId,
          rentalStart: option.rentalStart,
          rentalEnd: option.rentalEnd,
          rentalTimeZone: option.rentalTimeZone,
          rentalPriceCents: option.rentalPriceCents,
          rentalRequiredTemplateIds: option.rentalRequiredTemplateIds,
          rentalHostRequiredTemplateIds: option.rentalHostRequiredTemplateIds,
        });
        return {
          value,
          fieldId,
          label: normalizeResourceText(option.label)
            || getFacilityScopedFieldDisplayName(field ?? createFieldStub(value), value),
          field,
          ...rentalMetadata,
        };
      })
      .filter((option): option is SlotResourceOption => Boolean(option));
  }, [fieldLookup, fieldOptions, fields]);

  const setsPerMatch = leagueData.setsPerMatch ?? 1;
  const pointsToVictory = leagueData.pointsToVictory ?? [];
  const playoffDefaultTeamCount = Math.max(2, Number.isFinite(participantCount) ? Number(participantCount) : 2);
  const normalizedLockedDivisionKeys = useMemo(
    () => normalizeDivisionKeys(lockedDivisionKeys),
    [lockedDivisionKeys],
  );
  const parsedEventStartDate = useMemo(() => {
    const parsed = parseLocalDateTime(eventStartDate);
    if (!parsed) {
      return null;
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }, [eventStartDate]);
  const [fieldSearchBySlot, setFieldSearchBySlot] = useState<Record<string, string>>({});
  const [fieldAnchorBySlot, setFieldAnchorBySlot] = useState<Record<string, string>>({});
  const [resourceGroupExpandedBySlot, setResourceGroupExpandedBySlot] = useState<Record<string, boolean>>({});
  const fieldItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const syncPoints = (targetLength: number) => {
    const next = pointsToVictory.slice(0, targetLength);
    while (next.length < targetLength) {
      next.push(21);
    }
    return next;
  };

  const handleSetsPerMatchChange = (value: string | null) => {
    const count = parseInt(value || '1', 10);
    const normalized = Number.isNaN(count) ? 1 : count;
    const nextPoints = syncPoints(normalized);
    onLeagueDataChange({
      setsPerMatch: normalized,
      pointsToVictory: nextPoints,
      usesSets: requiresSets,
    });
  };

  const handlePointChange = (index: number, value: number | string) => {
    const numeric = Number(value) || 1;
    const updated = syncPoints(setsPerMatch);
    updated[index] = numeric;
    onLeagueDataChange({
      pointsToVictory: updated,
      usesSets: requiresSets,
    });
  };

  const handleIncludePlayoffsChange = (checked: boolean) => {
    if (!checked) {
      onLeagueDataChange({
        includePlayoffs: false,
        playoffTeamCount: undefined,
      });
      return;
    }
    onLeagueDataChange({
      includePlayoffs: true,
      playoffTeamCount: playoffDefaultTeamCount,
    });
  };

  const setSlotSearch = (slotKey: string, value: string) => {
    setFieldSearchBySlot((prev) => ({ ...prev, [slotKey]: value }));
  };

  const toggleResourceGroup = (slotKey: string, groupKey: string) => {
    const key = `${slotKey}::${groupKey}`;
    setResourceGroupExpandedBySlot((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  const handleFieldToggle = (
    slotIndex: number,
    slot: LeagueSlotForm,
    fieldOptionsForSlot: SlotResourceOption[],
    optionValue: string,
    shiftKey: boolean,
  ) => {
    const current = normalizeSlotFieldIds(slot);
    const option = fieldOptionsForSlot.find((candidate) => candidate.value === optionValue);
    if (!option) {
      return;
    }
    const fieldId = option.fieldId;
    const optionIds = fieldOptionsForSlot.map((candidate) => candidate.value);
    const currentSet = new Set(current);
    let next = [...current];
    let rentalUpdates: Partial<LeagueSlotForm> = {};
    const optionSelected = isSlotResourceOptionSelected(slot, option);
    const slotHasSelectedResources = current.length > 0;
    const currentRentalFieldId = slot.rentalBookingItemId
      ? fieldOptionsForSlot.find((candidate) => getOptionRentalMetadata(candidate).rentalBookingItemId === slot.rentalBookingItemId)?.fieldId
      : null;

    if (shiftKey) {
      const anchorId = fieldAnchorBySlot[slot.key];
      const anchorIndex = anchorId ? optionIds.indexOf(anchorId) : -1;
      const targetIndex = optionIds.indexOf(optionValue);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const range = fieldOptionsForSlot
          .slice(start, end + 1)
          .filter((rangeOption) => !optionHasRentalLock(rangeOption))
          .map((rangeOption) => rangeOption.fieldId);
        next = Array.from(new Set([...next, ...range]));
      } else if (optionSelected) {
        next = next.filter((id) => id !== fieldId);
      } else {
        next = [...next, fieldId];
      }
    } else if (optionSelected) {
      next = next.filter((id) => id !== fieldId);
    } else {
      next = [...next, fieldId];
    }

    const metadata = getOptionRentalMetadata(option);
    if (metadata.rentalBookingItemId) {
      if (optionSelected) {
        rentalUpdates = clearRentalLockUpdates();
      } else {
        const rentalSelectionError = slotHasSelectedResources ? getRentalSelectionError(slot, option) : null;
        if (rentalSelectionError) {
          onUpdateSlot(slotIndex, { error: rentalSelectionError });
          return;
        }
        const currentRentalFieldIds = fieldOptionsForSlot
          .filter((candidate) => candidate.value !== option.value && getOptionRentalMetadata(candidate).rentalBookingItemId === slot.rentalBookingItemId)
          .map((candidate) => candidate.fieldId);
        const retainedFieldIds = next.filter((id) => !currentRentalFieldIds.includes(id));
        next = Array.from(new Set([...retainedFieldIds, fieldId]));
        rentalUpdates = getRentalLockUpdates(option);
      }
    } else if (slot.rentalLocked && currentRentalFieldId === fieldId && currentSet.has(fieldId) && !next.includes(fieldId)) {
      rentalUpdates = clearRentalLockUpdates();
    }

    setFieldAnchorBySlot((prev) => ({ ...prev, [slot.key]: optionValue }));
    onUpdateSlot(slotIndex, {
      scheduledFieldIds: next,
      scheduledFieldId: next[0],
      ...rentalUpdates,
      ...(isRentalSlotMismatchError(slot.error) ? { error: undefined } : {}),
    });
  };

  useEffect(() => {
    slots.forEach((slot) => {
      const search = (fieldSearchBySlot[slot.key] ?? '').trim().toLowerCase();
      if (!search) {
        return;
      }
      const slotFieldIds = normalizeSlotFieldIds(slot);
      const representedFieldIds = new Set(availableFieldOptions.map((option) => option.fieldId));
      const options = slotFieldIds.length
        ? Array.from(
            new Map(
              [
                ...availableFieldOptions,
                ...slotFieldIds
                  .filter((value) => !representedFieldIds.has(value))
                  .map((value) => ({
                    value,
                    fieldId: value,
                    label: value,
                    field: fieldLookup.get(value) ?? null,
                  })),
              ]
                .map((option) => [option.value, option]),
            ).values(),
          )
        : availableFieldOptions;
      const firstMatch = options.find((option) => option.label.toLowerCase().includes(search));
      if (!firstMatch) {
        return;
      }
      const refKey = `${slot.key}::${firstMatch.value}`;
      const node = fieldItemRefs.current[refKey];
      if (node) {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, [availableFieldOptions, fieldLookup, fieldSearchBySlot, slots]);

  const content = (
      <Stack gap="lg">
        {showLeagueConfiguration && (
          <div>
            <Title order={4} mb="md">
              {configurationTitle}
            </Title>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
              <div>
                <NumberInput
                  label="Games per Opponent"
                  min={1}
                  max={MAX_STANDARD_NUMBER}
                  value={leagueData.gamesPerOpponent}
                  onChange={(value) => onLeagueDataChange({ gamesPerOpponent: Number(value) || 1 })}
                  clampBehavior="strict"
                  maw={180}
                />
              </div>

              {!requiresSets && (
                <div>
                  <NumberInput
                    label="Match Duration (minutes)"
                    min={0}
                    max={MAX_STANDARD_NUMBER}
                    step={5}
                    value={leagueData.matchDurationMinutes ?? ''}
                    onChange={(value) => onLeagueDataChange({ matchDurationMinutes: parseOptionalDurationMinutes(value) })}
                    clampBehavior="none"
                    maw={220}
                  />
                  {durationNeedsWarning(leagueData.matchDurationMinutes) ? (
                    <Text size="xs" c="orange" mt={4}>
                      Match duration should be greater than 0 before scheduling.
                    </Text>
                  ) : null}
                </div>
              )}

              <div>
                <NumberInput
                  label="Rest Time Between Matches (minutes)"
                  min={0}
                  max={MAX_STANDARD_NUMBER}
                  step={5}
                  value={leagueData.restTimeMinutes ?? 0}
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onLeagueDataChange({
                      restTimeMinutes: Number.isFinite(numeric) && numeric >= 0 ? numeric : 0,
                    });
                  }}
                  clampBehavior="strict"
                  maw={220}
                />
              </div>

              {requiresSets && (
                <>
                  <div>
                    <MantineSelect
                      label="Sets per Match"
                      value={String(setsPerMatch)}
                      onChange={handleSetsPerMatchChange}
                      data={[
                        { value: '1', label: 'Best of 1' },
                        { value: '3', label: 'Best of 3' },
                        { value: '5', label: 'Best of 5' },
                      ]}
                      comboboxProps={DROPDOWN_PROPS}
                      maw={220}
                    />
                  </div>
                  <div>
                    <NumberInput
                      label="Set Duration (minutes)"
                      min={0}
                      max={MAX_STANDARD_NUMBER}
                      step={5}
                      value={leagueData.setDurationMinutes ?? ''}
                      onChange={(value) => onLeagueDataChange({ setDurationMinutes: parseOptionalDurationMinutes(value) })}
                      clampBehavior="none"
                      maw={220}
                    />
                    {durationNeedsWarning(leagueData.setDurationMinutes) ? (
                      <Text size="xs" c="orange" mt={4}>
                        Set duration should be greater than 0 before scheduling.
                      </Text>
                    ) : null}
                  </div>
                </>
              )}
            </div>

          {showPlayoffSettings && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Switch
                  label="Include Playoffs"
                  checked={leagueData.includePlayoffs}
                  onChange={(event) => handleIncludePlayoffsChange(event.currentTarget.checked)}
                />
              </div>

              {leagueData.includePlayoffs && (
                <NumberInput
                  className="mt-4"
                  label="Playoff Team Count"
                  min={2}
                  max={MAX_STANDARD_NUMBER}
                  value={typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined}
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onLeagueDataChange({
                      playoffTeamCount: Number.isFinite(numeric) ? numeric : undefined,
                    });
                  }}
                  clampBehavior="strict"
                  maw={220}
                  error={
                    leagueData.includePlayoffs &&
                    !(typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2)
                      ? 'Playoff team count is required'
                      : undefined
                  }
                />
              )}
            </>
          )}

          {requiresSets && (
            <div className="mt-6">
              <Text size="lg" fw={700} mb="sm">
                Points to Victory
              </Text>
              <Text size="sm" c="dimmed" mb="sm">
                Configure the points required to win each set.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" className="md:items-end">
                {Array.from({ length: setsPerMatch }).map((_, idx) => (
                  <NumberInput
                    key={`points-set-${idx}`}
                    label={`Set ${idx + 1}`}
                    min={1}
                    max={MAX_STANDARD_NUMBER}
                    value={pointsToVictory[idx] ?? 21}
                    onChange={(value) => handlePointChange(idx, value)}
                    clampBehavior="strict"
                    maw={160}
                  />
                ))}
              </SimpleGrid>
            </div>
          )}
        </div>
      )}

        {showTimeslots && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <Title order={4} className="m-0">
              Weekly Timeslots
            </Title>
            <Button variant="light" onClick={onAddSlot} disabled={readOnly}>
              Add Timeslot
            </Button>
          </div>

          {fieldsLoading && (
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
              <Loader size="sm" />
              Loading resources...
            </div>
          )}

          {!fieldsLoading && availableFieldOptions.length === 0 && (
            <Alert color="yellow" radius="md" className="mb-4">
              {emptyFieldsMessage}
            </Alert>
          )}

          {slots.length === 0 && (
            <Alert color="blue" radius="md" className="mb-4">
              Add at least one weekly timeslot so we know where to schedule matches.
            </Alert>
          )}

          <Stack gap="md">
            {slots.map((slot, index) => {
              const conflictCount = slot.conflicts.length;
              const slotFieldIds = normalizeSlotFieldIds(slot);
              const rentalFieldIds = new Set(
                availableFieldOptions
                  .filter(optionHasRentalLock)
                  .map((option) => option.fieldId),
              );
              const slotRentalBookingItemId = normalizeResourceText(slot.rentalBookingItemId);
              const rentalBookingItemIdsUsedByOtherSlots = new Set(
                slots
                  .filter((_, candidateIndex) => candidateIndex !== index)
                  .map((candidate) => normalizeResourceText(candidate.rentalBookingItemId))
                  .filter((bookingItemId): bookingItemId is string => Boolean(bookingItemId)),
              );
              const availableOptionsForSlot = availableFieldOptions.filter((option) => {
                const metadata = getOptionRentalMetadata(option);
                if (metadata.rentalBookingItemId) {
                  return metadata.rentalBookingItemId === slotRentalBookingItemId
                    || !rentalBookingItemIdsUsedByOtherSlots.has(metadata.rentalBookingItemId);
                }
                return !rentalFieldIds.has(option.fieldId);
              });
              const representedFieldIds = new Set(availableOptionsForSlot.map((option) => option.fieldId));
              const fieldOptionsForSlot = slotFieldIds.length
                ? Array.from(
                    new Map(
                      [
                        ...availableOptionsForSlot,
                        ...slotFieldIds
                          .filter((fieldId) => !representedFieldIds.has(fieldId) && !rentalFieldIds.has(fieldId))
                          .map((fieldId) => {
                            const field = fieldLookup.get(fieldId) ?? null;
                            return {
                              value: fieldId,
                              fieldId,
                              label: getFacilityScopedFieldDisplayName(field ?? createFieldStub(fieldId), fieldId),
                              field,
                            };
                          }),
                      ].map((option) => [option.value, option]),
                    ).values(),
                  )
                : availableOptionsForSlot;
            const fieldSearch = fieldSearchBySlot[slot.key] ?? '';
            const selectedDays = normalizeSlotDays(slot);
            const slotDivisions = normalizeDivisionKeys(slot.divisions);
            const effectiveSlotDivisions = lockSlotDivisions && normalizedLockedDivisionKeys.length
              ? normalizedLockedDivisionKeys
              : slotDivisions;
            const isRepeating = slot.repeating !== false;
            const slotStartDate = parseLocalDateTime(slot.startDate);
            const slotEndDate = parseLocalDateTime(slot.endDate);
            const divisionOptionsByKey = new Map<string, { value: string; label: string }>();
            divisionOptions.forEach((option) => {
              const value = String(option.value ?? '').trim();
              if (!value) return;
              const key = value.toLowerCase();
              if (!divisionOptionsByKey.has(key)) {
                divisionOptionsByKey.set(key, {
                  value,
                  label: String(option.label ?? value),
                });
              }
            });
            const divisionOptionsForSlot = (() => {
              const byKey = new Map<string, { value: string; label: string }>();
              effectiveSlotDivisions.forEach((value) => {
                const normalized = String(value ?? '').trim();
                if (!normalized) return;
                const key = normalized.toLowerCase();
                const existing = divisionOptionsByKey.get(key);
                byKey.set(key, {
                  value: normalized,
                  label: existing?.label ?? normalized,
                });
              });
              divisionOptions.forEach((option) => {
                const value = String(option.value ?? '').trim();
                if (!value) return;
                const key = value.toLowerCase();
                if (byKey.has(key)) return;
                byKey.set(key, {
                  value,
                  label: String(option.label ?? value),
                });
              });
              return Array.from(byKey.values());
            })();
            const fieldMissing = slotFieldIds.length === 0;
            const dayMissing = selectedDays.length === 0;
            const startMissing = !(typeof slot.startTimeMinutes === 'number' && Number.isFinite(slot.startTimeMinutes));
            const endMissing = !(typeof slot.endTimeMinutes === 'number' && Number.isFinite(slot.endTimeMinutes));
            const explicitStartMissing = !slotStartDate;
            const explicitEndMissing = !slotEndDate;
            const explicitRangeInvalid = Boolean(
              slotStartDate &&
              slotEndDate &&
              slotEndDate.getTime() <= slotStartDate.getTime(),
            );
            const divisionsReadOnly = readOnly && !allowDivisionEditsWhenReadOnly;
            const resourcesReadOnly = readOnly && !allowResourceEditsWhenReadOnly;
            const resourceError = isRentalSlotMismatchError(slot.error) ? slot.error : null;
            const hasConflicts = conflictCount > 0;
            const slotTimingReadOnly = readOnly || slot.rentalLocked === true;
            const resourceGroups = buildSlotResourceGroups(fieldOptionsForSlot, fieldSearch);
            return (
              <Card
                key={slot.key}
                shadow="xs"
                radius="md"
                padding="lg"
                withBorder
                className={hasConflicts ? 'border-yellow-500 bg-yellow-50/40' : undefined}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <Group gap="xs">
                      <Text fw={600}>Timeslot #{index + 1}</Text>
                      {slot.rentalLocked ? <Badge size="xs" color="green" variant="light">Rental locked</Badge> : null}
                    </Group>
                    <Group gap="xs">
                      {slot.checking && <Loader size="sm" />}
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={() => onRemoveSlot(index)}
                        disabled={slots.length === 1 || readOnly}
                      >
                        Remove
                      </Button>
                    </Group>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                      <Text fw={500} size="sm" mb={6}>Resources</Text>
                      <TextInput
                        placeholder="Search resources..."
                        value={fieldSearch}
                        onChange={(event) => setSlotSearch(slot.key, event.currentTarget.value)}
                        disabled={resourcesReadOnly}
                        maw={360}
                        mb="xs"
                      />
                      <div
                        className={`overflow-hidden rounded-xl border bg-white shadow-sm ${fieldMissing && !resourcesReadOnly ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <div className="max-h-44 overflow-y-auto [scrollbar-gutter:stable]">
                          {resourceGroups.length > 0 ? (
                            <Stack gap={0}>
                              {resourceGroups.map((group) => {
                                const selectedCount = group.options.filter((option) => isSlotResourceOptionSelected(slot, option)).length;
                                const groupStateKey = `${slot.key}::${group.key}`;
                                const expanded = fieldSearch.trim().length > 0
                                  ? true
                                  : (resourceGroupExpandedBySlot[groupStateKey] ?? true);
                                return (
                                  <div key={group.key} className="border-b border-gray-200 bg-white last:border-b-0">
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                      onClick={() => toggleResourceGroup(slot.key, group.key)}
                                      disabled={resourcesReadOnly && group.options.length === 0}
                                    >
                                      <span className="min-w-0">
                                        <span className="flex items-center gap-2 font-semibold text-gray-900">
                                          <span className="truncate">{group.name}</span>
                                          {group.isRental ? <Badge size="xs" color="green" variant="light">Rented</Badge> : null}
                                        </span>
                                        <span className="block truncate text-xs text-gray-500">
                                          {selectedCount} of {group.options.length} selected{group.location ? ` - ${group.location}` : ''}
                                        </span>
                                      </span>
                                      <ChevronRight
                                        aria-hidden="true"
                                        className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                                      />
                                    </button>
                                    {expanded ? (
                                      <Stack gap={0} className="border-t border-gray-100">
                                        {group.options.map((option) => {
                                          const selected = isSlotResourceOptionSelected(slot, option);
                                          const refKey = `${slot.key}::${option.value}`;
                                          const resourceName = option.label
                                            || getFieldDisplayName(option.field ?? createFieldStub(option.fieldId, option.label), option.fieldId);
                                          const highlighted = fieldSearch.trim().length > 0
                                            && [
                                              option.label,
                                              group.name,
                                              group.location,
                                            ].join(' ').toLowerCase().includes(fieldSearch.trim().toLowerCase());
                                          return (
                                            <button
                                              key={option.value}
                                              ref={(node) => {
                                                fieldItemRefs.current[refKey] = node;
                                              }}
                                              type="button"
                                              className={`w-full px-3 py-2 pl-12 text-left text-sm transition-colors ${selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'} ${highlighted ? 'ring-1 ring-blue-300' : ''}`}
                                              onClick={(event) => {
                                                handleFieldToggle(index, slot, fieldOptionsForSlot, option.value, event.shiftKey);
                                              }}
                                              disabled={resourcesReadOnly}
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="min-w-0">
                                                  <span className="block truncate font-medium">{resourceName}</span>
                                                  {option.field?.location ? (
                                                    <span className="block truncate text-xs text-gray-500">{option.field.location}</span>
                                                  ) : null}
                                                </span>
                                                {selected ? <Badge size="xs" color="blue" variant="light">Selected</Badge> : null}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </Stack>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </Stack>
                          ) : (
                            <Text size="sm" c="dimmed" p="sm">
                              No resources match this search.
                            </Text>
                          )}
                        </div>
                      </div>
                      {fieldMissing && !resourcesReadOnly ? (
                        <Text size="xs" c="red" mt={4}>Select at least one resource</Text>
                      ) : null}
                      {resourceError ? (
                        <Alert color="red" radius="md" mt="xs">
                          {resourceError}
                        </Alert>
                      ) : null}
                      <Text size="xs" c="dimmed" mt={4}>
                        Tip: Hold Shift and click another resource to select a range.
                      </Text>
                    </div>

                    <div className="md:col-span-6 space-y-4">
                      <MantineMultiSelect
                        label="Divisions"
                        placeholder="Select one or more divisions"
                        description={lockSlotDivisions
                          ? 'Single division is enabled, so every timeslot uses all selected event divisions.'
                          : undefined}
                        data={divisionOptionsForSlot}
                        value={effectiveSlotDivisions}
                        comboboxProps={DROPDOWN_PROPS}
                        onChange={(values) => {
                          onUpdateSlot(index, {
                            divisions: normalizeDivisionKeys(values),
                          });
                        }}
                        searchable
                        clearable={!lockSlotDivisions && !divisionsReadOnly}
                        disabled={divisionsReadOnly || lockSlotDivisions}
                        maw={360}
                      />

                      {isRepeating ? (
                        <>
                          <MantineMultiSelect
                            label="Days of Week"
                            withAsterisk
                            placeholder="Select one or more days"
                            data={DAYS_OF_WEEK}
                            value={selectedDays.map((day) => String(day))}
                            comboboxProps={DROPDOWN_PROPS}
                            onChange={(values) => {
                              const days = Array.from(
                                new Set(
                                  values
                                    .map((value) => Number(value))
                                    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
                                ),
                              ).sort((a, b) => a - b);
                              onUpdateSlot(index, {
                                dayOfWeek: days[0],
                                daysOfWeek: days,
                              });
                            }}
                            disabled={slotTimingReadOnly}
                            error={dayMissing && !slotTimingReadOnly ? 'Select at least one day' : undefined}
                            maw={320}
                          />

                          <DatePickerInput
                            label="Start Date Override"
                            placeholder="Use event start date"
                            description="Optional. Leave blank to use event start date."
                            value={slotStartDate}
                            onChange={(value) => onUpdateSlot(index, {
                              startDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            valueFormat="MM/DD/YYYY"
                            minDate={parsedEventStartDate ?? undefined}
                            clearable={!slotTimingReadOnly}
                            disabled={slotTimingReadOnly}
                            maw={320}
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-end">
                            <TimeOfDaySelect
                              label="Start Time"
                              value={slot.startTimeMinutes}
                              onChange={(minutes) => onUpdateSlot(index, { startTimeMinutes: minutes })}
                              disabled={slotTimingReadOnly}
                              error={startMissing && !slotTimingReadOnly ? 'Select a start time' : undefined}
                            />

                            <TimeOfDaySelect
                              label="End Time"
                              value={slot.endTimeMinutes}
                              onChange={(minutes) => onUpdateSlot(index, { endTimeMinutes: minutes })}
                              disabled={slotTimingReadOnly}
                              error={endMissing && !slotTimingReadOnly ? 'Select an end time' : undefined}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-end">
                          <DatePickerInput
                            label="Start Date"
                            withAsterisk
                            placeholder="Select start date"
                            value={slotStartDate}
                            onChange={(value) => onUpdateSlot(index, {
                              startDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            minDate={parsedEventStartDate ?? undefined}
                            valueFormat="MM/DD/YYYY"
                            clearable={!slotTimingReadOnly}
                            disabled={slotTimingReadOnly}
                            error={explicitStartMissing && !slotTimingReadOnly ? 'Select a start date' : undefined}
                            maw={260}
                          />
                          <TimeOfDaySelect
                            label="Start Time"
                            value={slot.startTimeMinutes}
                            onChange={(minutes) => onUpdateSlot(index, { startTimeMinutes: minutes })}
                            disabled={slotTimingReadOnly}
                            error={startMissing && !slotTimingReadOnly ? 'Select a start time' : undefined}
                          />
                          <DatePickerInput
                            label="End Date"
                            withAsterisk
                            placeholder="Select end date"
                            value={slotEndDate}
                            onChange={(value) => onUpdateSlot(index, {
                              endDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            minDate={slotStartDate ?? parsedEventStartDate ?? undefined}
                            valueFormat="MM/DD/YYYY"
                            clearable={!slotTimingReadOnly}
                            disabled={slotTimingReadOnly}
                            error={
                              explicitEndMissing && !slotTimingReadOnly
                                ? 'Select an end date'
                                : (explicitRangeInvalid && !slotTimingReadOnly ? 'End date/time must be after start date/time' : undefined)
                            }
                            maw={260}
                          />
                          <TimeOfDaySelect
                            label="End Time"
                            value={slot.endTimeMinutes}
                            onChange={(minutes) => onUpdateSlot(index, { endTimeMinutes: minutes })}
                            disabled={slotTimingReadOnly}
                            error={endMissing && !slotTimingReadOnly ? 'Select an end time' : undefined}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <Switch
                    label="Repeats weekly"
                    checked={slot.repeating !== false}
                    onChange={(event) => onUpdateSlot(index, { repeating: event.currentTarget.checked })}
                    disabled={slotTimingReadOnly}
                  />

                {conflictCount > 0 && (
                  <Alert color="yellow" radius="md">
                      <Stack gap="xs">
                        <Text fw={600}>Field conflict warning.</Text>
                        <Text size="sm">
                          This timeslot overlaps another event or rental on the same field. The scheduler will avoid the overlap when building matches; review it manually or auto resolve this slot.
                        </Text>
                        {slot.conflicts.map(({ event, schedule }, conflictIndex) => (
                          <div key={`${schedule.$id}-${conflictIndex}`} className="flex items-start gap-2 text-sm">
                            <Badge color="yellow" variant="light">{event.name}</Badge>
                            <span>
                              {formatConflictTimeRange({ event, schedule }, slot, eventStartDate)} overlaps this slot.
                            </span>
                          </div>
                        ))}
                        {onAutoResolveSlotConflict ? (
                          <Group justify="flex-end">
                            <Button
                              size="xs"
                              color="yellow"
                              variant="light"
                              onClick={() => onAutoResolveSlotConflict(index)}
                              disabled={readOnly}
                            >
                              Auto Resolve
                            </Button>
                          </Group>
                        ) : null}
                      </Stack>
                    </Alert>
                  )}

                  {slot.error && !resourceError && (
                    <Alert color="red" radius="md">
                      {slot.error}
                    </Alert>
                  )}
                </div>
              </Card>
            );
          })}
          </Stack>
        </div>
        )}
      </Stack>
  );

  if (unstyled) {
    return <div className={showLeagueConfiguration ? 'border-t border-gray-200 pt-5' : undefined}>{content}</div>;
  }

  return (
    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
      {content}
    </Paper>
  );
};

export default LeagueFields;
