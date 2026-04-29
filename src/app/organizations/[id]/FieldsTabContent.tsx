"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  SlotGroupPropGetter,
  View,
} from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { addHours, endOfDay, endOfMonth, endOfWeek, format, getDay, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import Loading from '@/components/ui/Loading';
import type { Field, Organization, TimeSlot, UserData } from '@/types';
import { formatPrice } from '@/types';
import { buildFieldCalendarEvents, type FieldCalendarEntry } from './fieldCalendar';
import { resolveFieldIdsForCalendarHydration } from './fieldCalendarHydration';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFieldDisplayName, sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import { notifications } from '@mantine/notifications';
import { organizationService } from '@/lib/organizationService';
import { createId } from '@/lib/id';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import { fieldService } from '@/lib/fieldService';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import SharedCalendarEvent from '@/components/calendar/SharedCalendarEvent';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import CreateRentalSlotModal from '@/components/ui/CreateRentalSlotModal';
import { getOrderedEntityColorPair } from '@/lib/entityColors';

type SelectionState = {
  fieldIds: string[];
  start: Date;
  end: Date;
};

type SelectionCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: { type: 'selection'; slotKey?: string };
  metaType: 'selection';
  fieldName: string;
};

type CalendarEventData = FieldCalendarEntry | SelectionCalendarEntry;

type RentalDraftSelection = {
  key: string;
  scheduledFieldIds: string[];
  dayOfWeek?: number;
  daysOfWeek: number[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string;
  repeating: boolean;
};

export type RentalSelectionCheckoutSelection = {
  key: string;
  scheduledFieldIds: string[];
  dayOfWeek: number;
  daysOfWeek: number[];
  startTimeMinutes: number;
  endTimeMinutes: number;
  startDate: string;
  endDate: string;
  repeating: boolean;
};

export type RentalSelectionCheckoutPayload = {
  eventId: string;
  manageEventUrl: string;
  organizationId: string | null;
  organizationName: string;
  totalRentalCents: number;
  rentalStart: string;
  rentalEnd: string;
  rentalSelections: RentalSelectionCheckoutSelection[];
  fieldIds: string[];
  primaryFieldId: string | null;
  primaryFieldName: string | null;
  location: string;
  coordinates?: [number, number];
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

type RentalSelectionValidation = {
  selection: RentalDraftSelection;
  totalCents: number;
  totalHours: number;
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
  conflictCount: number;
  conflictCheckPending: boolean;
  errors: string[];
};

type RentalSelectionConflictState = {
  signature: string;
  conflictCount: number;
  loading: boolean;
  error: string | null;
};

const MIN_FIELD_CALENDAR_HEIGHT = 800;
const MIN_SELECTION_MS = 60 * 60 * 1000;
const SLOT_STEP_MINUTES = 30;
const SELECTION_COLOR = 'var(--mvp-primary-100)';
const SELECTION_BORDER_COLOR = 'var(--mvp-primary-300)';
const SELECTION_TEXT_COLOR = 'var(--mvp-primary-900)';
const FIELD_CALENDAR_FORMATS = {
  dayFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayHeaderFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayDate(start, { year: '2-digit' })} - ${formatDisplayDate(end, { year: '2-digit' })}`,
  timeGutterFormat: (value: Date) => formatDisplayTime(value),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`,
};
const CALENDAR_VIEW_LABELS: Record<string, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
  work_week: 'Work week',
};

const minutesToDate = (base: Date, minutes: number): Date => {
  const copy = new Date(base.getTime());
  copy.setHours(0, 0, 0, 0);
  copy.setMinutes(minutes);
  return copy;
};

const compareRanges = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  Math.max(startA.getTime(), startB.getTime()) < Math.min(endA.getTime(), endB.getTime());

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeDaysOfWeek = (value: unknown, dayOfWeek?: number): number[] => {
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

const mondayDayOf = (date: Date): number => ((date.getDay() + 6) % 7);

const alignDateToWeekday = (seed: Date, dayOfWeek: number): Date => {
  const aligned = new Date(seed.getTime());
  aligned.setHours(0, 0, 0, 0);
  const current = mondayDayOf(aligned);
  let diff = dayOfWeek - current;
  if (diff < 0) diff += 7;
  aligned.setDate(aligned.getDate() + diff);
  return aligned;
};

const toValidDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

const resolveSelectionDateRange = (
  selection: Pick<RentalDraftSelection, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate' | 'repeating'>,
): { start: Date; end: Date } | null => {
  const explicitStart = parseLocalDateTime(selection.startDate ?? null);
  const explicitEnd = parseLocalDateTime(selection.endDate ?? null);
  if (selection.repeating === false && explicitStart && explicitEnd && explicitEnd.getTime() > explicitStart.getTime()) {
    return { start: explicitStart, end: explicitEnd };
  }

  const startBoundary = explicitStart;
  const days = normalizeDaysOfWeek(selection.daysOfWeek, selection.dayOfWeek);
  const day = days[0] ?? (startBoundary ? mondayDayOf(startBoundary) : null);
  if (!startBoundary || day === null) {
    return null;
  }
  const startMinutes = typeof selection.startTimeMinutes === 'number' ? selection.startTimeMinutes : null;
  const endMinutes = typeof selection.endTimeMinutes === 'number' ? selection.endTimeMinutes : null;
  if (startMinutes === null || endMinutes === null) {
    return null;
  }
  const baseDay = alignDateToWeekday(startBoundary, day);
  const start = minutesToDate(baseDay, startMinutes);
  const endCandidate = minutesToDate(baseDay, endMinutes);
  const end = endCandidate > start ? endCandidate : new Date(start.getTime() + MIN_SELECTION_MS);
  return { start, end };
};

const buildSelectionConflictSignature = (
  selection: RentalDraftSelection,
): {
  signature: string | null;
  fieldIds: string[];
  dateRange: { start: Date; end: Date } | null;
} => {
  const fieldIds = normalizeFieldIds(selection.scheduledFieldIds);
  const dateRange = resolveSelectionDateRange(selection);
  if (!fieldIds.length || !dateRange) {
    return { signature: null, fieldIds, dateRange };
  }
  const signature = `${fieldIds.join(',')}|${dateRange.start.toISOString()}|${dateRange.end.toISOString()}`;
  return { signature, fieldIds, dateRange };
};

const buildSelectionFromCalendarRange = (
  start: Date,
  end: Date,
  fieldId: string,
): RentalDraftSelection => {
  const startDate = new Date(start.getTime());
  const endDate = new Date(end.getTime());
  if (endDate.getTime() - startDate.getTime() < MIN_SELECTION_MS) {
    endDate.setTime(startDate.getTime() + MIN_SELECTION_MS);
  }
  const dayOfWeek = mondayDayOf(startDate);
  return {
    key: createId(),
    scheduledFieldIds: [fieldId],
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    startTimeMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
    endTimeMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    startDate: formatLocalDateTime(startDate),
    endDate: formatLocalDateTime(endDate),
    repeating: false,
  };
};

const updateSelectionWithCalendarRange = (
  selection: RentalDraftSelection,
  start: Date,
  end: Date,
): RentalDraftSelection => {
  const startDate = new Date(start.getTime());
  const endDate = new Date(end.getTime());
  if (endDate.getTime() - startDate.getTime() < MIN_SELECTION_MS) {
    endDate.setTime(startDate.getTime() + MIN_SELECTION_MS);
  }
  const dayOfWeek = mondayDayOf(startDate);
  return {
    ...selection,
    scheduledFieldIds: normalizeFieldIds(selection.scheduledFieldIds),
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    startTimeMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
    endTimeMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    startDate: formatLocalDateTime(startDate),
    endDate: formatLocalDateTime(endDate),
    repeating: false,
  };
};

type RentalSlotDragUpdate = Partial<TimeSlot> & {
  $id: string;
  dayOfWeek: NonNullable<TimeSlot['dayOfWeek']>;
};

const buildRentalSlotUpdateFromCalendarRange = (
  slot: TimeSlot,
  start: Date,
  end: Date,
  fieldId: string,
): RentalSlotDragUpdate | null => {
  if (!slot?.$id || !fieldId) {
    return null;
  }

  const nextStart = new Date(start.getTime());
  const nextEnd = end.getTime() > nextStart.getTime()
    ? new Date(end.getTime())
    : new Date(nextStart.getTime() + MIN_SELECTION_MS);
  const dayOfWeek = mondayDayOf(nextStart) as NonNullable<TimeSlot['dayOfWeek']>;
  const durationMinutes = Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / (60 * 1000)));
  const startTimeMinutes = nextStart.getHours() * 60 + nextStart.getMinutes();
  const endTimeMinutes = Math.min(24 * 60, startTimeMinutes + durationMinutes);
  const baseUpdate: RentalSlotDragUpdate = {
    $id: slot.$id,
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    repeating: Boolean(slot.repeating),
    scheduledFieldId: fieldId,
    scheduledFieldIds: [fieldId],
    requiredTemplateIds: Array.isArray(slot.requiredTemplateIds) ? slot.requiredTemplateIds : [],
    hostRequiredTemplateIds: Array.isArray(slot.hostRequiredTemplateIds) ? slot.hostRequiredTemplateIds : [],
    price: slot.price,
  };

  if (slot.repeating) {
    return {
      ...baseUpdate,
      startDate: slot.startDate ?? formatLocalDateTime(nextStart),
      endDate: slot.endDate ?? null,
      startTimeMinutes,
      endTimeMinutes: Math.max(startTimeMinutes + 1, endTimeMinutes),
    };
  }

  return {
    ...baseUpdate,
    startDate: formatLocalDateTime(nextStart),
    endDate: formatLocalDateTime(nextEnd),
    startTimeMinutes: undefined,
    endTimeMinutes: undefined,
  };
};

const applyRentalSlotDragUpdateToFields = (
  fields: Field[],
  slot: TimeSlot,
  targetFieldId: string,
  update: RentalSlotDragUpdate,
): Field[] => {
  const slotId = slot.$id;
  const nextSlot: TimeSlot = { ...slot, ...update };

  return fields.map((field) => {
    const rentalSlots = Array.isArray(field.rentalSlots) ? field.rentalSlots : [];
    const hasSlot = rentalSlots.some((candidate) => candidate?.$id === slotId);
    const isTargetField = field.$id === targetFieldId;
    if (!hasSlot && !isTargetField) {
      return field;
    }

    const nextRentalSlots = isTargetField
      ? hasSlot
        ? rentalSlots.map((candidate) => (candidate?.$id === slotId ? nextSlot : candidate))
        : [...rentalSlots, nextSlot]
      : rentalSlots.filter((candidate) => candidate?.$id !== slotId);
    const rentalSlotIds = Array.isArray(field.rentalSlotIds)
      ? field.rentalSlotIds
      : rentalSlots.map((candidate) => candidate?.$id).filter((id): id is string => Boolean(id));
    const nextRentalSlotIds = isTargetField
      ? Array.from(new Set([...rentalSlotIds, slotId]))
      : rentalSlotIds.filter((id) => id !== slotId);

    return {
      ...field,
      rentalSlots: nextRentalSlots,
      rentalSlotIds: nextRentalSlotIds,
    };
  });
};

const restoreRentalSlotDragInFields = (
  currentFields: Field[],
  originalFields: Field[],
  slotId: string,
): Field[] => {
  const originalByFieldId = new Map(originalFields.map((field) => [field.$id, field]));

  return currentFields.map((field) => {
    const originalField = originalByFieldId.get(field.$id);
    const currentSlots = Array.isArray(field.rentalSlots) ? field.rentalSlots : [];
    const originalSlots = Array.isArray(originalField?.rentalSlots) ? originalField.rentalSlots : [];
    const originalSlot = originalSlots.find((candidate) => candidate?.$id === slotId);
    const currentHasSlot = currentSlots.some((candidate) => candidate?.$id === slotId);
    const currentSlotIds = Array.isArray(field.rentalSlotIds) ? field.rentalSlotIds : [];
    const originalSlotIds = Array.isArray(originalField?.rentalSlotIds) ? originalField.rentalSlotIds : [];
    const originalHasSlotId = originalSlotIds.includes(slotId) || Boolean(originalSlot);

    if (!currentHasSlot && !originalSlot && !currentSlotIds.includes(slotId) && !originalHasSlotId) {
      return field;
    }

    const nextRentalSlots = originalSlot
      ? [...currentSlots.filter((candidate) => candidate?.$id !== slotId), originalSlot]
      : currentSlots.filter((candidate) => candidate?.$id !== slotId);
    const nextRentalSlotIds = originalHasSlotId
      ? Array.from(new Set([...currentSlotIds.filter((id) => id !== slotId), slotId]))
      : currentSlotIds.filter((id) => id !== slotId);

    return {
      ...field,
      rentalSlots: nextRentalSlots,
      rentalSlotIds: nextRentalSlotIds,
    };
  });
};

const rentalSlotCoversDraftDay = (
  slot: TimeSlot,
  params: {
    selectionStart: Date;
    selectionEnd: Date;
  },
): boolean => {
  if (slot.repeating === false) {
    const slotStart = parseLocalDateTime(slot.startDate ?? null);
    const slotEnd = parseLocalDateTime(slot.endDate ?? null);
    if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
      return false;
    }
    return params.selectionStart.getTime() >= slotStart.getTime() && params.selectionEnd.getTime() <= slotEnd.getTime();
  }

  const dayOfWeek = mondayDayOf(params.selectionStart);
  const startTimeMinutes = params.selectionStart.getHours() * 60 + params.selectionStart.getMinutes();
  const endTimeMinutes = params.selectionEnd.getHours() * 60 + params.selectionEnd.getMinutes();
  const slotDays = normalizeDaysOfWeek(slot.daysOfWeek, slot.dayOfWeek);
  if (!slotDays.includes(dayOfWeek)) {
    return false;
  }
  const slotStartMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
  const slotEndMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
  if (slotStartMinutes === null || slotEndMinutes === null || slotEndMinutes <= slotStartMinutes) {
    return false;
  }
  if (startTimeMinutes < slotStartMinutes || endTimeMinutes > slotEndMinutes) {
    return false;
  }

  const slotStartBoundary = parseLocalDateTime(slot.startDate ?? null);
  const slotEndBoundary = parseLocalDateTime(slot.endDate ?? null);

  const normalizeDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  if (slotStartBoundary && normalizeDay(params.selectionStart) < normalizeDay(slotStartBoundary)) {
    return false;
  }
  if (slotEndBoundary && normalizeDay(params.selectionStart) > normalizeDay(slotEndBoundary)) {
    return false;
  }
  if (slotEndBoundary && normalizeDay(params.selectionEnd) > normalizeDay(slotEndBoundary)) {
    return false;
  }
  return true;
};

type FieldsTabContentProps = {
  organization: Organization;
  organizationId: string;
  currentUser: UserData | null;
  backHref?: string;
  backLabel?: string;
  primaryActionLabel?: string;
  onRentalSelectionReady?: (payload: RentalSelectionCheckoutPayload) => void;
};

export default function FieldsTabContent({
  organization,
  organizationId,
  currentUser,
  backHref = '/discover',
  backLabel = 'Back to Discover',
  primaryActionLabel = 'Create Event',
  onRentalSelectionReady,
}: FieldsTabContentProps) {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(organization ?? null);
  const [orgLoading, setOrgLoading] = useState(!organization);
  const [orgError, setOrgError] = useState<string | null>(null);
  const organizationHasStripeAccount = canOrganizationUsePaidBilling(org);
  const canManage = Boolean(currentUser && org && currentUser.$id === org.ownerId);

  const localizer = useMemo(() => dateFnsLocalizer({
    format,
    parse: parse as any,
    startOfWeek,
    getDay,
    locales: {} as any,
  }), []);
  const DnDCalendar: any = useMemo(() => withDragAndDrop(BigCalendar), []);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [readonlyVisibleFieldIds, setReadonlyVisibleFieldIds] = useState<string[]>([]);
  const [rentalSelections, setRentalSelections] = useState<RentalDraftSelection[]>([]);
  const [calendarView, setCalendarView] = useState<View>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [hostOrganizations, setHostOrganizations] = useState<Organization[]>([]);
  const [hostOptionsLoading, setHostOptionsLoading] = useState(false);
  const [hostSelection, setHostSelection] = useState<string>('self');
  const [fieldEventsLoading, setFieldEventsLoading] = useState(false);
  const lastLoadedFieldEventsKeyRef = useRef<string | null>(null);
  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [editField, setEditField] = useState<Field | null>(null);
  const [createRentalOpen, setCreateRentalOpen] = useState(false);
  const [editingRentalSlot, setEditingRentalSlot] = useState<TimeSlot | null>(null);
  const [editingRentalField, setEditingRentalField] = useState<Field | null>(null);
  const [rentalDraftRange, setRentalDraftRange] = useState<{ start: Date; end: Date } | null>(null);
  const [selectionConflictStateByKey, setSelectionConflictStateByKey] = useState<Record<string, RentalSelectionConflictState>>({});
  const selectionConflictStateRef = useRef<Record<string, RentalSelectionConflictState>>({});

  useEffect(() => {
    selectionConflictStateRef.current = selectionConflictStateByKey;
  }, [selectionConflictStateByKey]);

  useEffect(() => {
    setOrg(organization ?? null);
  }, [organization?.$id, organization]);

  useEffect(() => {
    if (organization) return;
    if (!organizationId) {
      setOrgError('No organization selected.');
      setOrg(null);
      setOrgLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOrgLoading(true);
        setOrgError(null);
        const result = await organizationService.getOrganizationById(organizationId);
        if (cancelled) return;
        if (!result) {
          setOrgError('Organization not found.');
          setOrg(null);
        } else {
          setOrg(result);
        }
      } catch (error) {
        console.error('Failed to load organization:', error);
        if (!cancelled) {
          setOrgError('Failed to load organization. Please try again.');
          setOrg(null);
        }
      } finally {
        if (!cancelled) {
          setOrgLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organization, organizationId]);

  const fields = useMemo<Field[]>(() => sortFieldsByCreatedAt(org?.fields ?? []), [org?.fields]);
  const fieldIds = useMemo(() => fields.map((field) => field.$id), [fields]);
  const fieldOptions = useMemo(() => fields.map((field) => ({
    value: field.$id,
    label: getFieldDisplayName(field),
  })), [fields]);
  const fieldFilterItems = useMemo<FieldCalendarFilterItem[]>(() => fields.map((field) => {
    const label = getFieldDisplayName(field);
    const count = (field.events?.length ?? 0) + (field.matches?.length ?? 0) + (field.rentalSlots?.length ?? 0);
    return {
      id: field.$id,
      label,
      detail: field.location || null,
      count,
      colorSeed: label || field.$id,
      colorMatchKey: field.$id,
    };
  }), [fields]);
  const fieldColorReferenceList = useMemo(
    () => buildUniqueColorReferenceList(fields.map((field) => field.$id)),
    [fields],
  );
  const fieldLabelById = useMemo(
    () => new Map(fieldOptions.map((option) => [option.value, option.label])),
    [fieldOptions],
  );

  const rentalListings = useMemo(() => {
    if (!org) return [];
    const referenceDate = new Date();
    const listings: { field: Field; slot: TimeSlot; nextOccurrence: Date }[] = [];
    (org.fields || []).forEach((field) => {
      (field.rentalSlots || []).forEach((slot) => {
        const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
        if (!nextOccurrence) return;
        listings.push({ field, slot, nextOccurrence });
      });
    });
    listings.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
    return listings;
  }, [org]);

  useEffect(() => {
    if (!rentalListings.length || (selection?.fieldIds?.length ?? 0) > 0) return;

    const firstListing = rentalListings[0];
    const baseDate = new Date(firstListing.nextOccurrence);
    const startMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
    const endMinutes = typeof firstListing.slot.endTimeMinutes === 'number'
      ? firstListing.slot.endTimeMinutes
      : (firstListing.slot.startTimeMinutes ?? startMinutes + 60);
    const initialStart = minutesToDate(baseDate, startMinutes);
    const initialEndCandidate = minutesToDate(baseDate, endMinutes);
    const initialEnd = initialEndCandidate > initialStart ? initialEndCandidate : addHours(initialStart, 1);

    setSelection({
      fieldIds: [firstListing.field.$id],
      start: initialStart,
      end: initialEnd,
    });
    setCalendarDate(new Date(firstListing.nextOccurrence.getTime()));
  }, [rentalListings, selection?.fieldIds]);

  useEffect(() => {
    if ((selection?.fieldIds?.length ?? 0) > 0) return;
    if (!fields.length) return;
    if (rentalListings.length) return;

    setSelection(() => {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + MIN_SELECTION_MS);
      return { fieldIds: [fields[0].$id], start, end };
    });
  }, [fields, rentalListings.length, selection?.fieldIds]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    if (!fields.length || rentalSelections.length > 0) {
      return;
    }
    const firstField = fields[0];
    if (!firstField?.$id) {
      return;
    }

    const fallbackStart = new Date();
    fallbackStart.setMinutes(0, 0, 0);
    const fallbackEnd = new Date(fallbackStart.getTime() + MIN_SELECTION_MS);

    const firstListingForField = rentalListings.find((listing) => listing.field.$id === firstField.$id);
    if (firstListingForField?.nextOccurrence) {
      const start = new Date(firstListingForField.nextOccurrence.getTime());
      const endMinutes = typeof firstListingForField.slot.endTimeMinutes === 'number'
        ? firstListingForField.slot.endTimeMinutes
        : (firstListingForField.slot.startTimeMinutes ?? (start.getHours() * 60 + start.getMinutes() + 60));
      const end = minutesToDate(start, endMinutes);
      setRentalSelections([
        buildSelectionFromCalendarRange(start, end > start ? end : new Date(start.getTime() + MIN_SELECTION_MS), firstField.$id),
      ]);
      setCalendarDate(new Date(start));
      return;
    }

    setRentalSelections([
      buildSelectionFromCalendarRange(fallbackStart, fallbackEnd, firstField.$id),
    ]);
    setCalendarDate(new Date(fallbackStart));
  }, [canManage, fields, rentalListings, rentalSelections.length]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    setReadonlyVisibleFieldIds((prev) => {
      const validIds = prev.filter((fieldId) => fieldIds.includes(fieldId));
      return validIds.length ? validIds : fieldIds;
    });
  }, [canManage, fieldIds]);

  const selectedFieldIds = useMemo(
    () => normalizeFieldIds(selection?.fieldIds ?? []),
    [selection?.fieldIds],
  );
  const selectedFields = useMemo(
    () => fields.filter((field) => selectedFieldIds.includes(field.$id)),
    [fields, selectedFieldIds],
  );
  const selectedField = selectedFields[0] ?? null;
  const readonlyCalendarFieldIds = useMemo(() => {
    if (canManage) {
      return [];
    }
    const validIds = readonlyVisibleFieldIds.filter((fieldId) => fieldIds.includes(fieldId));
    return validIds.length ? validIds : fieldIds;
  }, [canManage, fieldIds, readonlyVisibleFieldIds]);
  const readonlyCalendarFields = useMemo(
    () => fields.filter((field) => readonlyCalendarFieldIds.includes(field.$id)),
    [fields, readonlyCalendarFieldIds],
  );
  const handleReadonlyVisibleFieldIdsChange = useCallback((values: string[]) => {
    setReadonlyVisibleFieldIds(normalizeFieldIds(values));
  }, []);
  const handleSelectedFieldIdsChange = useCallback((values: string[]) => {
    const nextValues = normalizeFieldIds(values);
    setSelection((prev) => {
      if (!nextValues.length) {
        return prev;
      }
      if (!prev) {
        const start = new Date();
        const end = new Date(start.getTime() + MIN_SELECTION_MS);
        return { fieldIds: nextValues, start, end };
      }
      return { ...prev, fieldIds: nextValues };
    });
  }, []);
  const selectionConflictInputs = useMemo(
    () => (
      canManage
        ? []
        : rentalSelections.map((selectionItem) => {
          const resolved = buildSelectionConflictSignature(selectionItem);
          return {
            key: selectionItem.key,
            signature: resolved.signature,
            fieldIds: resolved.fieldIds,
            dateRange: resolved.dateRange,
          };
        })
    ),
    [canManage, rentalSelections],
  );
  const selectionConflictInputByKey = useMemo(
    () => new Map(selectionConflictInputs.map((input) => [input.key, input])),
    [selectionConflictInputs],
  );

  const refreshOrganization = useCallback(async () => {
    if (!organizationId) return;
    try {
      const updated = await organizationService.getOrganizationById(organizationId, true);
      if (updated) setOrg(updated);
    } catch (error) {
      console.warn('Failed to refresh organization:', error);
    }
  }, [organizationId]);

  const computeCalendarRange = useMemo(() => {
    return (view: View, date: Date) => {
      switch (view) {
        case 'day':
          return { start: startOfDay(date), end: endOfDay(date) };
        case 'month':
          return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'agenda':
        case 'week':
        default:
          return {
            start: startOfWeek(date, { weekStartsOn: 0 }),
            end: endOfWeek(date, { weekStartsOn: 0 }),
          };
      }
    };
  }, []);

  const calendarRange = useMemo(() => computeCalendarRange(calendarView, calendarDate), [computeCalendarRange, calendarView, calendarDate]);
  const calendarRangeStartMs = calendarRange.start.getTime();
  const calendarRangeEndMs = calendarRange.end.getTime();
  const fieldIdsToHydrate = useMemo(
    () => resolveFieldIdsForCalendarHydration({
      canManage,
      fields: canManage ? fields : readonlyCalendarFields,
      selectedFieldIds,
      rentalSelections,
    }),
    [canManage, fields, readonlyCalendarFields, rentalSelections, selectedFieldIds],
  );
  const fieldEventsRequestKey = useMemo(
    () => (
      fieldIdsToHydrate.length
        ? `${fieldIdsToHydrate.slice().sort().join(',')}:${calendarRangeStartMs}:${calendarRangeEndMs}`
        : null
    ),
    [fieldIdsToHydrate, calendarRangeStartMs, calendarRangeEndMs],
  );

  const handleCalendarRangeChange = useCallback((range: any, _view?: View) => {
    if (!range) {
      return;
    }
    const nextDate = Array.isArray(range)
      ? toValidDate(range[0])
      : toValidDate(range?.start);
    if (nextDate) {
      setCalendarDate(nextDate);
    }
  }, []);

  const selectionCalendarEvents = useMemo<SelectionCalendarEntry[]>(() => {
    if (canManage) {
      if (!selectedField || !selection || !selectedFieldIds.length) {
        return [];
      }
      const selectionStart = selection.start;
      const selectionEnd = selection.end;
      return [{
        id: `selection-${selectionStart.getTime()}`,
        title: 'New Rental Slot',
        start: selectionStart,
        end: selectionEnd,
        resourceId: selectedFieldIds[0],
        resource: { type: 'selection' },
        metaType: 'selection',
        fieldName: getFieldDisplayName(selectedField),
      }];
    }

    if (!fields.length || !rentalSelections.length) {
      return [];
    }

    const byId = new Map(fields.map((field) => [field.$id, field]));
    const rangeStart = new Date(calendarRange.start.getTime());
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(calendarRange.end.getTime());
    rangeEnd.setHours(23, 59, 59, 999);

    const draftEvents: SelectionCalendarEntry[] = [];
    rentalSelections.forEach((selectionItem, slotIndex) => {
      const fieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds);
      const dateRange = resolveSelectionDateRange(selectionItem);
      if (!fieldIds.length || !dateRange) {
        return;
      }
      if (!compareRanges(dateRange.start, dateRange.end, rangeStart, rangeEnd)) {
        return;
      }

      const visibleFieldIdSet = new Set(readonlyCalendarFieldIds);
      fieldIds.forEach((fieldId) => {
        if (!visibleFieldIdSet.has(fieldId)) {
          return;
        }
        const field = byId.get(fieldId);
        if (!field) {
          return;
        }
        draftEvents.push({
          id: `selection-${selectionItem.key}-${fieldId}-${dateRange.start.getTime()}`,
          title: `Selection ${slotIndex + 1}`,
          start: dateRange.start,
          end: dateRange.end,
          resourceId: fieldId,
          resource: { type: 'selection', slotKey: selectionItem.key },
          metaType: 'selection',
          fieldName: getFieldDisplayName(field),
        });
      });
    });
    return draftEvents;
  }, [calendarRange.end, calendarRange.start, canManage, fields, readonlyCalendarFieldIds, rentalSelections, selectedField, selectedFieldIds, selection]);

  const baseCalendarEvents = useMemo<FieldCalendarEntry[]>(() => {
    const sourceFields = canManage ? selectedFields : readonlyCalendarFields;
    if (!sourceFields.length) {
      return [];
    }
    const events = buildFieldCalendarEvents(sourceFields, calendarRange) as FieldCalendarEntry[];
    if (!canManage) {
      return events;
    }
    const seenBookedKeys = new Set<string>();
    return events.filter((event) => {
      if (event.metaType !== 'booked') {
        return true;
      }
      const resource = event.resource as { $id?: string } | undefined;
      const resourceId = typeof resource?.$id === 'string' ? resource.$id : '';
      const entryType = event.id.includes('field-booked-match-') ? 'match' : 'event';
      const dedupeKey = `${entryType}:${resourceId || event.start.toISOString()}:${event.end.toISOString()}`;
      if (seenBookedKeys.has(dedupeKey)) {
        return false;
      }
      seenBookedKeys.add(dedupeKey);
      return true;
    });
  }, [calendarRange, canManage, readonlyCalendarFields, selectedFields]);

  const calendarEvents = useMemo<CalendarEventData[]>(
    () => [...baseCalendarEvents, ...selectionCalendarEvents],
    [baseCalendarEvents, selectionCalendarEvents],
  );

  const defaultTimeRange = useMemo<[number, number]>(() => [0, 24], []);
  const visibleHourSpan = useMemo(() => Math.max(1, defaultTimeRange[1] - defaultTimeRange[0]), [defaultTimeRange]);

  const slotGroupPropGetter = useCallback<SlotGroupPropGetter>(() => {
    const baseHeight = MIN_FIELD_CALENDAR_HEIGHT / visibleHourSpan;
    return {
      style: {
        height: `${baseHeight}px`,
        minHeight: `${baseHeight}px`,
        flex: '0 0 auto',
      },
    };
  }, [visibleHourSpan]);

  const minTime = useMemo(() => new Date(1970, 0, 1, defaultTimeRange[0], 0, 0), [defaultTimeRange]);
  const maxTime = useMemo(() => {
    const hour = Math.min(24, Math.max(defaultTimeRange[1], defaultTimeRange[0] + 1));
    if (hour >= 24) {
      return new Date(1970, 0, 1, 23, 59, 59, 999);
    }
    return new Date(1970, 0, 1, hour, 0, 0);
  }, [defaultTimeRange]);
  const scrollToTime = useMemo(
    () => {
      const base = selection?.start ?? new Date();
      return new Date(1970, 0, 1, base.getHours() || 0, base.getMinutes() || 0, 0);
    },
    [selection?.start],
  );
  const calendarBlockers = useMemo(
    () => baseCalendarEvents.filter((event) => event.metaType === 'booked'),
    [baseCalendarEvents],
  );
  const isBlockedRange = useCallback(
    (start: Date, end: Date, resourceId?: string) => {
      if (canManage) {
        return false;
      }
      const normalizedEnd = end.getTime() > start.getTime()
        ? end
        : new Date(start.getTime() + MIN_SELECTION_MS);
      return calendarBlockers.some((blocker) => (
        (!resourceId || blocker.resourceId === resourceId)
        && compareRanges(start, normalizedEnd, blocker.start, blocker.end)
      ));
    },
    [calendarBlockers, canManage],
  );

  const eventPropGetter = useCallback(
    (event: CalendarEventData) => {
      if (event.metaType === 'selection') {
        return {
          style: {
            backgroundColor: SELECTION_COLOR,
            border: `1px solid ${SELECTION_BORDER_COLOR}`,
            color: SELECTION_TEXT_COLOR,
            padding: 0,
            cursor: 'grab',
          },
        };
      }
      const colors = getOrderedEntityColorPair(fieldColorReferenceList, event.resourceId);
      return {
        style: {
          backgroundColor: colors.bg,
          border: `1px solid ${colors.bg}`,
          color: colors.text,
          padding: 0,
          cursor: canManage && event.metaType === 'rental' ? 'grab' : 'default',
        },
      };
    },
    [canManage, fieldColorReferenceList],
  );
  const slotPropGetter = useCallback(
    (date: Date, resourceId?: string | number) => {
      if (canManage) {
        return {};
      }
      const normalizedResourceId =
        typeof resourceId === 'string'
          ? resourceId
          : typeof resourceId === 'number'
            ? String(resourceId)
            : undefined;
      const slotStart = new Date(date.getTime());
      const slotEnd = new Date(slotStart.getTime() + SLOT_STEP_MINUTES * 60 * 1000);
      if (!isBlockedRange(slotStart, slotEnd, normalizedResourceId)) {
        return {};
      }
      return {
        style: {
          backgroundColor: 'rgba(148, 163, 184, 0.22)',
          cursor: 'not-allowed',
        },
      };
    },
    [canManage, isBlockedRange],
  );
  const handleSelecting = useCallback((slotInfo: any) => {
    if (canManage) {
      return true;
    }
    if (!slotInfo?.start) {
      return true;
    }
    const slotStart = new Date(slotInfo.start);
    const slotEnd = slotInfo?.end
      ? new Date(slotInfo.end)
      : new Date(slotStart.getTime() + MIN_SELECTION_MS);
    const resourceId =
      typeof slotInfo.resourceId === 'string'
        ? slotInfo.resourceId
        : typeof slotInfo.resourceId === 'number'
          ? String(slotInfo.resourceId)
          : undefined;
    return !isBlockedRange(slotStart, slotEnd, resourceId);
  }, [canManage, isBlockedRange]);

  const existingConflicts = useMemo(() => {
    if (!selectedFieldIds.length || !selection) return [];
    const selectionStart = selection.start;
    const selectionEnd = selection.end;
    return calendarEvents.filter((event) => {
      if (event.metaType === 'selection' || event.metaType === 'rental') return false;
      return selectedFieldIds.includes(event.resourceId)
        && compareRanges(selectionStart, selectionEnd, event.start, event.end);
    });
  }, [calendarEvents, selection, selectedFieldIds]);

  useEffect(() => {
    if (!fieldEventsRequestKey || !fieldIdsToHydrate.length) return;
    if (lastLoadedFieldEventsKeyRef.current === fieldEventsRequestKey) return;
    let cancelled = false;

    (async () => {
      try {
        setFieldEventsLoading(true);
        const sourceFieldsById = new Map(fields.map((field) => [field.$id, field]));
        const hydratedRows = await Promise.all(
          fieldIdsToHydrate.map(async (fieldId) => {
            const source = sourceFieldsById.get(fieldId);
            if (!source) {
              return null;
            }
            return fieldService.getFieldEventsMatches(
              source,
              {
                start: new Date(calendarRangeStartMs).toISOString(),
                end: new Date(calendarRangeEndMs).toISOString(),
              },
            );
          }),
        );
        if (cancelled) return;
        const hydratedById = new Map(
          hydratedRows
            .filter((row): row is Field => Boolean(row))
            .map((row) => [row.$id, row]),
        );

        setOrg((prev) => {
          if (!prev || !prev.fields) return prev;
          let changed = false;
          const nextFields = prev.fields.map((field) =>
            hydratedById.has(field.$id)
              ? (() => {
                const hydrated = hydratedById.get(field.$id) as Field;
                const eventsUnchanged =
                  (field.events?.length ?? 0) === (hydrated.events?.length ?? 0) &&
                  (field.events || []).every((event, idx) => event?.$id === hydrated.events?.[idx]?.$id);
                const matchesUnchanged =
                  (field.matches?.length ?? 0) === (hydrated.matches?.length ?? 0) &&
                  (field.matches || []).every((match, idx) => match?.$id === hydrated.matches?.[idx]?.$id);
                if (eventsUnchanged && matchesUnchanged) {
                  return field;
                }
                changed = true;
                return { ...field, events: hydrated.events, matches: hydrated.matches };
              })()
              : field,
          );
          return changed ? { ...prev, fields: nextFields } : prev;
        });
        lastLoadedFieldEventsKeyRef.current = fieldEventsRequestKey;
      } catch (error) {
        console.error('Failed to load events/matches for field', error);
      } finally {
        if (!cancelled) {
          setFieldEventsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [calendarRangeEndMs, calendarRangeStartMs, canManage, fieldEventsRequestKey, fieldIdsToHydrate, fields]);

  useEffect(() => {
    if (canManage) {
      if (Object.keys(selectionConflictStateRef.current).length > 0) {
        setSelectionConflictStateByKey({});
      }
      return;
    }

    const fieldsById = new Map(fields.map((field) => [field.$id, field]));
    const previousState = selectionConflictStateRef.current;
    const toFetch: Array<{
      key: string;
      signature: string;
      fieldIds: string[];
      dateRange: { start: Date; end: Date };
    }> = [];
    const nextState: Record<string, RentalSelectionConflictState> = {};

    selectionConflictInputs.forEach((input) => {
      if (!input.signature || !input.dateRange || !input.fieldIds.length) {
        return;
      }

      const existing = previousState[input.key];
      if (existing && existing.signature === input.signature && !existing.loading) {
        nextState[input.key] = existing;
        return;
      } else {
        nextState[input.key] = {
          signature: input.signature,
          conflictCount: 0,
          loading: true,
          error: null,
        };
        toFetch.push({
          key: input.key,
          signature: input.signature,
          fieldIds: input.fieldIds,
          dateRange: input.dateRange,
        });
      }
    });

    const stateChanged = (() => {
      const previousKeys = Object.keys(previousState);
      const nextKeys = Object.keys(nextState);
      if (previousKeys.length !== nextKeys.length) {
        return true;
      }
      return nextKeys.some((key) => {
        const previous = previousState[key];
        const next = nextState[key];
        return (
          !previous
          || previous.signature !== next.signature
          || previous.conflictCount !== next.conflictCount
          || previous.loading !== next.loading
          || previous.error !== next.error
        );
      });
    })();

    if (stateChanged) {
      setSelectionConflictStateByKey(nextState);
    }

    if (!toFetch.length) {
      return;
    }

    let cancelled = false;
    const fieldRequestCache = new Map<string, Promise<Field | null>>();

    const getFieldInSelectionWindow = (
      fieldId: string,
      range: { start: Date; end: Date },
    ): Promise<Field | null> => {
      const cacheKey = `${fieldId}:${range.start.toISOString()}:${range.end.toISOString()}`;
      if (!fieldRequestCache.has(cacheKey)) {
        fieldRequestCache.set(cacheKey, (async () => {
          const sourceField = fieldsById.get(fieldId);
          if (!sourceField) {
            return null;
          }
          return fieldService.getFieldEventsMatches(sourceField, {
            start: range.start.toISOString(),
            end: range.end.toISOString(),
          }, {
            rentalOverlapOnly: true,
            includeMatches: false,
          });
        })());
      }
      return fieldRequestCache.get(cacheKey)!;
    };

    Promise.all(
      toFetch.map(async (input) => {
        try {
          let conflictCount = 0;
          await Promise.all(
            input.fieldIds.map(async (fieldId) => {
              const hydratedField = await getFieldInSelectionWindow(fieldId, input.dateRange);
              if (!hydratedField) {
                return;
              }
              const blockers = buildFieldCalendarEvents([hydratedField], input.dateRange)
                .filter((entry) => entry.metaType === 'booked');
              const hasConflict = blockers.some((blocker) => (
                compareRanges(
                  input.dateRange.start,
                  input.dateRange.end,
                  blocker.start,
                  blocker.end,
                )
              ));
              if (hasConflict) {
                conflictCount += 1;
              }
            }),
          );

          return {
            key: input.key,
            signature: input.signature,
            conflictCount,
            error: null,
          };
        } catch (error) {
          return {
            key: input.key,
            signature: input.signature,
            conflictCount: 0,
            error: error instanceof Error ? error.message : 'Failed to load conflict data.',
          };
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setSelectionConflictStateByKey((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          const current = next[result.key];
          if (!current || current.signature !== result.signature) {
            return;
          }
          next[result.key] = {
            signature: result.signature,
            conflictCount: result.conflictCount,
            loading: false,
            error: result.error,
          };
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [canManage, fields, selectionConflictInputs]);

  const conflictCountsBySelectionKey = useMemo(() => {
    const counts = new Map<string, number>();
    if (canManage) {
      return counts;
    }
    selectionConflictInputs.forEach((input) => {
      if (!input.signature) {
        return;
      }
      const conflictState = selectionConflictStateByKey[input.key];
      if (!conflictState || conflictState.signature !== input.signature || conflictState.loading) {
        return;
      }
      if (conflictState.conflictCount > 0) {
        counts.set(input.key, conflictState.conflictCount);
      }
    });
    return counts;
  }, [canManage, selectionConflictInputs, selectionConflictStateByKey]);

  const hasPendingConflictChecks = useMemo(() => {
    if (canManage) {
      return false;
    }
    return selectionConflictInputs.some((input) => {
      if (!input.signature) {
        return false;
      }
      const conflictState = selectionConflictStateByKey[input.key];
      return !conflictState
        || conflictState.signature !== input.signature
        || conflictState.loading;
    });
  }, [canManage, selectionConflictInputs, selectionConflictStateByKey]);

  const rentalSelectionValidations = useMemo<RentalSelectionValidation[]>(() => {
    if (canManage) {
      return [];
    }
    const fieldsById = new Map(fields.map((field) => [field.$id, field]));
    return rentalSelections.map((selectionItem) => {
      const normalizedFieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds);
      const dateRange = resolveSelectionDateRange(selectionItem);
      const errors: string[] = [];
      const requiredTemplateIds = new Set<string>();
      const hostRequiredTemplateIds = new Set<string>();
      let totalCents = 0;

      if (!normalizedFieldIds.length) {
        errors.push('Select at least one field.');
      }
      if (!dateRange) {
        errors.push('Select a valid start and end date/time.');
      }

      if (!errors.length && dateRange) {
        const durationMinutes = Math.max(
          1,
          Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (60 * 1000)),
        );
        normalizedFieldIds.forEach((fieldId) => {
          const field = fieldsById.get(fieldId);
          if (!field) {
            errors.push(`Field ${fieldId} is unavailable.`);
            return;
          }
          const matchedRentalSlot = (field.rentalSlots || []).find((slot) => rentalSlotCoversDraftDay(slot, {
            selectionStart: dateRange.start,
            selectionEnd: dateRange.end,
          }));
          if (!matchedRentalSlot) {
            errors.push(
              `${getFieldDisplayName(field)} is unavailable for ${formatDisplayDateTime(dateRange.start)} - ${formatDisplayDateTime(dateRange.end)}.`,
            );
            return;
          }
          if (typeof matchedRentalSlot.price === 'number' && matchedRentalSlot.price > 0) {
            totalCents += Math.round((matchedRentalSlot.price * durationMinutes) / 60);
          }
          (matchedRentalSlot.requiredTemplateIds || []).forEach((id) => {
            const normalized = String(id ?? '').trim();
            if (normalized.length > 0) {
              requiredTemplateIds.add(normalized);
            }
          });
          (matchedRentalSlot.hostRequiredTemplateIds || []).forEach((id) => {
            const normalized = String(id ?? '').trim();
            if (normalized.length > 0) {
              hostRequiredTemplateIds.add(normalized);
            }
          });
        });
      }

      const conflictCount = conflictCountsBySelectionKey.get(selectionItem.key) ?? 0;
      const conflictState = selectionConflictStateByKey[selectionItem.key];
      const conflictInput = selectionConflictInputByKey.get(selectionItem.key);
      const isConflictCheckPending = Boolean(
        conflictInput?.signature
        && (
          !conflictState
          || conflictState.signature !== conflictInput.signature
          || conflictState.loading
        ),
      );
      if (conflictCount > 0) {
        errors.push('Selection overlaps an existing event or match on at least one field.');
      }
      if (conflictState?.error && conflictInput?.signature && conflictState.signature === conflictInput.signature) {
        errors.push('Unable to verify conflicts for this selection right now. Try again.');
      }

      return {
        selection: selectionItem,
        totalCents,
        totalHours: dateRange ? Math.max(0, (dateRange.end.getTime() - dateRange.start.getTime()) / (60 * 60 * 1000)) : 0,
        requiredTemplateIds: Array.from(requiredTemplateIds),
        hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
        conflictCount,
        conflictCheckPending: isConflictCheckPending,
        errors,
      };
    });
  }, [canManage, conflictCountsBySelectionKey, fields, rentalSelections, selectionConflictInputByKey, selectionConflictStateByKey]);

  const rentalSelectionValidationByKey = useMemo(
    () => new Map(rentalSelectionValidations.map((validation) => [validation.selection.key, validation])),
    [rentalSelectionValidations],
  );

  const totalRentalCents = useMemo(
    () => rentalSelectionValidations.reduce((sum, validation) => sum + validation.totalCents, 0),
    [rentalSelectionValidations],
  );

  const rentalRequiredTemplateIds = useMemo(
    () => Array.from(new Set(rentalSelectionValidations.flatMap((validation) => validation.requiredTemplateIds))),
    [rentalSelectionValidations],
  );
  const rentalHostRequiredTemplateIds = useMemo(
    () => Array.from(new Set(rentalSelectionValidations.flatMap((validation) => validation.hostRequiredTemplateIds))),
    [rentalSelectionValidations],
  );

  const canCreateRentalEvent = useMemo(() => {
    if (canManage || !currentUser) {
      return false;
    }
    if (hasPendingConflictChecks) {
      return false;
    }
    if (!rentalSelections.length || !rentalSelectionValidations.length) {
      return false;
    }
    return rentalSelectionValidations.every((validation) => validation.errors.length === 0);
  }, [canManage, currentUser, hasPendingConflictChecks, rentalSelectionValidations, rentalSelections.length]);

  const summaryColor = useMemo(() => {
    if (canManage) {
      if (!selectedFieldIds.length || !selection) return 'dimmed';
      return existingConflicts.length ? 'yellow' : 'teal';
    }
    if (!currentUser) return 'dimmed';
    if (hasPendingConflictChecks) return 'yellow';
    return canCreateRentalEvent ? 'teal' : 'red';
  }, [canManage, canCreateRentalEvent, currentUser, existingConflicts.length, hasPendingConflictChecks, selectedFieldIds.length, selection]);

  const summaryText = useMemo(() => {
    if (canManage) {
      if (!selectedFieldIds.length || !selection) {
        return 'Select at least one field to continue.';
      }
      const startLabel = formatDisplayDateTime(selection.start);
      const endLabel = formatDisplayTime(selection.end);
      const conflictSuffix = existingConflicts.length ? ' (overlaps an event or match on this date)' : '';
      const fieldsSuffix = selectedFieldIds.length > 1 ? ` across ${selectedFieldIds.length} fields` : '';
      return `Draft slot: ${startLabel} – ${endLabel}${fieldsSuffix}${conflictSuffix}. Click "Add Rental Slot" to set price, or click an existing rental slot to edit.`;
    }
    if (!currentUser) {
      return 'Sign in to create an event.';
    }
    if (!rentalSelections.length) {
      return 'Add at least one rental selection.';
    }
    if (hasPendingConflictChecks) {
      return 'Checking field conflicts for your selections...';
    }
    if (!canCreateRentalEvent) {
      return 'Resolve selection errors before creating an event.';
    }
    return `${rentalSelections.length} selection${rentalSelections.length === 1 ? '' : 's'} ready • Total ${formatPrice(totalRentalCents)}`;
  }, [canManage, canCreateRentalEvent, currentUser, existingConflicts.length, hasPendingConflictChecks, rentalSelections.length, selectedFieldIds.length, selection, totalRentalCents]);

  const updateRentalSelection = useCallback(
    (selectionKey: string, updater: (selectionItem: RentalDraftSelection) => RentalDraftSelection) => {
      setRentalSelections((prev) => prev.map((selectionItem) => (
        selectionItem.key === selectionKey ? updater(selectionItem) : selectionItem
      )));
    },
    [],
  );

  const handleAddRentalSelection = useCallback(() => {
    const seedSelection = rentalSelections[0];
    const fallbackFieldId = seedSelection
      ? normalizeFieldIds(seedSelection.scheduledFieldIds)[0]
      : fields[0]?.$id;
    if (!fallbackFieldId) {
      notifications.show({ color: 'red', message: 'No fields available for rental selection.' });
      return;
    }

    const seedRange = seedSelection ? resolveSelectionDateRange(seedSelection) : null;
    const defaultStart = new Date();
    defaultStart.setMinutes(0, 0, 0);
    const durationMs = seedRange
      ? Math.max(MIN_SELECTION_MS, seedRange.end.getTime() - seedRange.start.getTime())
      : MIN_SELECTION_MS;
    const nextStart = seedRange ? new Date(seedRange.end.getTime()) : defaultStart;
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    setRentalSelections((prev) => [buildSelectionFromCalendarRange(nextStart, nextEnd, fallbackFieldId), ...prev]);
  }, [fields, rentalSelections]);

  const handleRemoveRentalSelection = useCallback((selectionKey: string) => {
    setRentalSelections((prev) => prev.filter((selectionItem) => selectionItem.key !== selectionKey));
  }, []);

  const applySelectionWindow = useCallback(
    (start: Date, end: Date, params?: { slotKey?: string }) => {
      if (canManage) {
        setSelection((prev) => {
          if (!(prev?.fieldIds?.length)) return prev;
          const nextStart = new Date(start);
          const nextEnd = new Date(end);
          if (nextEnd.getTime() - nextStart.getTime() < MIN_SELECTION_MS) {
            nextEnd.setTime(nextStart.getTime() + MIN_SELECTION_MS);
          }
          return { ...prev, start: nextStart, end: nextEnd };
        });
      } else if (params?.slotKey) {
        let blockedByOccupancy = false;
        setRentalSelections((prev) => prev.map((item) => (
          item.key === params.slotKey
            ? (() => {
              const candidate = updateSelectionWithCalendarRange(item, start, end);
              const candidateFieldIds = normalizeFieldIds(candidate.scheduledFieldIds);
              const isBlocked = candidateFieldIds.some((fieldId) => isBlockedRange(start, end, fieldId));
              if (isBlocked) {
                blockedByOccupancy = true;
                return item;
              }
              return candidate;
            })()
            : item
        )));
        if (blockedByOccupancy) {
          notifications.show({
            color: 'red',
            message: 'That time range is already booked on at least one selected field.',
          });
          return;
        }
      }
      setCalendarDate(new Date(start));
    },
    [canManage, isBlockedRange],
  );

  const handleRentalSlotCalendarDrop = useCallback(
    async ({ event, start, end, resourceId }: any) => {
      if (!canManage || !event || event.metaType !== 'rental' || !start || !end) {
        return;
      }
      const slot = event.resource as TimeSlot | undefined;
      const nextStart = start instanceof Date ? start : new Date(start);
      const nextEnd = end instanceof Date ? end : new Date(end);
      if (!slot?.$id || Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
        return;
      }

      const fieldId =
        typeof resourceId === 'string' && resourceId.trim().length > 0
          ? resourceId.trim()
          : typeof event.resourceId === 'string'
            ? event.resourceId.trim()
            : '';
      const ownerField = fields.find((field) => field.$id === fieldId) ?? selectedField;
      if (!ownerField) {
        notifications.show({ color: 'red', message: 'Unable to resolve the rental slot field.' });
        return;
      }

      const updatePayload = buildRentalSlotUpdateFromCalendarRange(slot, nextStart, nextEnd, ownerField.$id);
      if (!updatePayload) {
        notifications.show({ color: 'red', message: 'Unable to move this rental slot.' });
        return;
      }

      const originalFields = fields;
      const originalStart = event.start instanceof Date ? new Date(event.start) : null;
      setOrg((prev) => {
        if (!prev) return prev;
        const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
        return {
          ...prev,
          fields: applyRentalSlotDragUpdateToFields(prevFields, slot, ownerField.$id, updatePayload),
        };
      });
      setCalendarDate(nextStart);

      try {
        const result = await fieldService.updateRentalSlot(ownerField, updatePayload);
        setOrg((prev) => {
          if (!prev) return prev;
          const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
          const nextFields = prevFields.map((field) => (
            field.$id === result.field.$id ? result.field : field
          ));
          return { ...prev, fields: nextFields };
        });
        notifications.show({ color: 'green', message: 'Rental slot moved.' });
        await refreshOrganization();
      } catch (error) {
        console.error('Failed to move rental slot:', error);
        setOrg((prev) => {
          if (!prev) return prev;
          const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
          return {
            ...prev,
            fields: restoreRentalSlotDragInFields(prevFields, originalFields, slot.$id),
          };
        });
        if (originalStart) {
          setCalendarDate(originalStart);
        }
        notifications.show({
          color: 'yellow',
          message: 'Rental slot could not be moved. It has been returned to its previous time.',
        });
      }
    },
    [canManage, fields, refreshOrganization, selectedField],
  );

  const handleSlotSelect = useCallback(
    (slotInfo: any) => {
      if (!slotInfo?.start) return;
      const slotStart = new Date(slotInfo.start);
      const slotEndRaw = slotInfo?.end ? new Date(slotInfo.end) : new Date(slotStart.getTime() + MIN_SELECTION_MS);
      if (canManage) {
        setSelection((prev) => {
          if (!(prev?.fieldIds?.length)) return prev;
          const proposedDuration = slotEndRaw.getTime() - slotStart.getTime();
          const duration = proposedDuration >= MIN_SELECTION_MS
            ? proposedDuration
            : Math.max(MIN_SELECTION_MS, prev.end.getTime() - prev.start.getTime());
          const nextEnd = new Date(slotStart.getTime() + duration);
          return { ...prev, start: slotStart, end: nextEnd };
        });
        setCalendarDate(slotStart);
        return;
      }

      const slotEnd = slotEndRaw;
      const resourceFieldIds = typeof slotInfo.resourceId === 'string'
        ? [slotInfo.resourceId]
        : readonlyCalendarFieldIds;
      const selectedResourceFieldIds = normalizeFieldIds(resourceFieldIds);
      const primaryResourceFieldId = selectedResourceFieldIds[0] ?? fields[0]?.$id;
      if (!primaryResourceFieldId) {
        return;
      }
      if (selectedResourceFieldIds.some((fieldId) => isBlockedRange(slotStart, slotEnd, fieldId))) {
        notifications.show({
          color: 'red',
          message: 'That time range is already booked for one of the selected fields.',
        });
        return;
      }
      const nextSelection = {
        ...buildSelectionFromCalendarRange(slotStart, slotEnd, primaryResourceFieldId),
        scheduledFieldIds: selectedResourceFieldIds.length ? selectedResourceFieldIds : [primaryResourceFieldId],
      };
      setRentalSelections((prev) => [nextSelection, ...prev]);
      setCalendarDate(slotStart);
    },
    [canManage, fields, isBlockedRange, readonlyCalendarFieldIds],
  );

  const handleEventDrop = useCallback(
    ({ event, start, end, resourceId }: any) => {
      if (event?.metaType === 'rental') {
        void handleRentalSlotCalendarDrop({ event, start, end, resourceId });
        return;
      }
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      const slotKey = event.resource?.slotKey;
      applySelectionWindow(new Date(start), new Date(end), {
        slotKey: typeof slotKey === 'string' ? slotKey : undefined,
      });
    },
    [applySelectionWindow, handleRentalSlotCalendarDrop],
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: any) => {
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      const slotKey = event.resource?.slotKey;
      applySelectionWindow(new Date(start), new Date(end), {
        slotKey: typeof slotKey === 'string' ? slotKey : undefined,
      });
    },
    [applySelectionWindow],
  );

  useEffect(() => {
    if (!currentUser) {
      setHostOrganizations([]);
      setHostSelection('self');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setHostOptionsLoading(true);
        const orgs = await organizationService.getOrganizationsByOwner(currentUser.$id);
        if (cancelled) return;
        setHostOrganizations(orgs);
        setHostSelection((prev) => {
          if (prev !== 'self' && !orgs.some((org) => org.$id === prev)) {
            return 'self';
          }
          return prev;
        });
      } catch (error) {
        console.warn('Failed to load organizations for user:', error);
        if (!cancelled) {
          setHostOrganizations([]);
          setHostSelection('self');
        }
      } finally {
        if (!cancelled) {
          setHostOptionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const hostSelectOptions = useMemo(() => {
    const base = [{ value: 'self', label: 'Host as Myself' }];
    if (!hostOrganizations.length) {
      return base;
    }
    return [
      ...base,
      ...hostOrganizations.map((org) => ({
        value: org.$id,
        label: org.name || 'Untitled Organization',
      })),
    ];
  }, [hostOrganizations]);

  const handleCreateEventClick = useCallback(() => {
    if (!currentUser) {
      notifications.show({ color: 'yellow', message: 'Sign in to create an event.' });
      return;
    }
    if (canManage) {
      return;
    }
    if (!canCreateRentalEvent || !rentalSelectionValidations.length) {
      notifications.show({ color: 'red', message: 'Resolve rental selection issues before creating an event.' });
      return;
    }

    const serializedSelections = rentalSelectionValidations
      .map(({ selection: selectionItem }) => {
        const dateRange = resolveSelectionDateRange(selectionItem);
        if (!dateRange) {
          return null;
        }
        const dayOfWeek = mondayDayOf(dateRange.start);
        return {
          key: selectionItem.key,
          scheduledFieldIds: normalizeFieldIds(selectionItem.scheduledFieldIds),
          dayOfWeek,
          daysOfWeek: [dayOfWeek],
          startTimeMinutes: dateRange.start.getHours() * 60 + dateRange.start.getMinutes(),
          endTimeMinutes: dateRange.end.getHours() * 60 + dateRange.end.getMinutes(),
          startDate: formatLocalDateTime(dateRange.start),
          endDate: formatLocalDateTime(dateRange.end),
          repeating: false,
        };
      })
      .filter((selectionItem): selectionItem is RentalSelectionCheckoutSelection => Boolean(selectionItem));
    if (!serializedSelections.length) {
      notifications.show({ color: 'red', message: 'No valid rental selections were found.' });
      return;
    }

    let earliestSelectionStart: Date | null = null;
    let latestSelectionEnd: Date | null = null;
    serializedSelections.forEach((selectionItem) => {
      const selectionStart = parseLocalDateTime(selectionItem.startDate);
      const selectionEnd = parseLocalDateTime(selectionItem.endDate);
      if (!selectionStart || !selectionEnd || selectionEnd.getTime() <= selectionStart.getTime()) {
        return;
      }
      if (!earliestSelectionStart || selectionStart < earliestSelectionStart) {
        earliestSelectionStart = selectionStart;
      }
      if (!latestSelectionEnd || selectionEnd > latestSelectionEnd) {
        latestSelectionEnd = selectionEnd;
      }
    });

    const allFieldIds = Array.from(
      new Set(serializedSelections.flatMap((selectionItem) => normalizeFieldIds(selectionItem.scheduledFieldIds))),
    );
    const primaryField = fields.find((field) => field.$id === allFieldIds[0]) ?? null;
    const newId = createId();
    const params = new URLSearchParams();
    params.set('create', '1');
    if (earliestSelectionStart) {
      params.set('rentalStart', formatLocalDateTime(earliestSelectionStart));
    }
    if (latestSelectionEnd) {
      params.set('rentalEnd', formatLocalDateTime(latestSelectionEnd));
    }
    if (primaryField) {
      params.set('rentalFieldId', primaryField.$id);
      params.set(
        'rentalFieldName',
        getFieldDisplayName(primaryField),
      );
      if (primaryField.location) {
        params.set('rentalLocation', primaryField.location);
      }
      if (typeof primaryField.lat === 'number' && Number.isFinite(primaryField.lat)) {
        params.set('rentalLat', String(primaryField.lat));
      }
      if (typeof primaryField.long === 'number' && Number.isFinite(primaryField.long)) {
        params.set('rentalLng', String(primaryField.long));
      }
    }
    if (totalRentalCents > 0) {
      params.set('rentalPriceCents', String(Math.round(totalRentalCents)));
    }
    if (rentalRequiredTemplateIds.length > 0) {
      params.set('rentalRequiredTemplateIds', rentalRequiredTemplateIds.join(','));
    }
    if (rentalHostRequiredTemplateIds.length > 0) {
      params.set('rentalHostRequiredTemplateIds', rentalHostRequiredTemplateIds.join(','));
    }
    if (serializedSelections.length > 0) {
      params.set('rentalSelections', JSON.stringify(serializedSelections));
    }
    if (org?.$id) {
      params.set('rentalOrgId', org.$id);
    }
    if (hostSelection && hostSelection !== 'self') {
      params.set('hostOrgId', hostSelection);
    }
    const manageEventUrl = `/events/${newId}/schedule?${params.toString()}`;
    if (onRentalSelectionReady) {
      onRentalSelectionReady({
        eventId: newId,
        manageEventUrl,
        organizationId: org?.$id ?? null,
        organizationName: org?.name ?? 'Organization',
        totalRentalCents: Math.round(totalRentalCents),
        rentalStart: earliestSelectionStart ? formatLocalDateTime(earliestSelectionStart) : '',
        rentalEnd: latestSelectionEnd ? formatLocalDateTime(latestSelectionEnd) : '',
        rentalSelections: serializedSelections,
        fieldIds: allFieldIds,
        primaryFieldId: primaryField?.$id ?? null,
        primaryFieldName: primaryField
          ? getFieldDisplayName(primaryField)
          : null,
        location: primaryField?.location || org?.location || '',
        coordinates: typeof primaryField?.lat === 'number'
          && Number.isFinite(primaryField.lat)
          && typeof primaryField?.long === 'number'
          && Number.isFinite(primaryField.long)
          ? [primaryField.long, primaryField.lat]
          : undefined,
        requiredTemplateIds: rentalRequiredTemplateIds,
        hostRequiredTemplateIds: rentalHostRequiredTemplateIds,
      });
      return;
    }
    router.push(manageEventUrl);
  }, [
    canCreateRentalEvent,
    canManage,
    currentUser,
    fields,
    hostSelection,
    org?.$id,
    org?.location,
    org?.name,
    rentalHostRequiredTemplateIds,
    rentalRequiredTemplateIds,
    rentalSelectionValidations,
    totalRentalCents,
    onRentalSelectionReady,
    router,
  ]);

  const handleAddRentalSlotClick = useCallback(() => {
    if (!canManage) return;
    if (!selectedFieldIds.length || !selection) {
      notifications.show({ color: 'red', message: 'Select at least one field and a time range first.' });
      return;
    }
    if (selection.start.toDateString() !== selection.end.toDateString()) {
      notifications.show({ color: 'red', message: 'Rental slots must stay within a single day. Adjust the selection.' });
      return;
    }

    setEditingRentalSlot(null);
    setEditingRentalField(null);
    setRentalDraftRange({ start: selection.start, end: selection.end });
    setCreateRentalOpen(true);
  }, [canManage, selectedFieldIds.length, selection]);

  const handleSelectCalendarEvent = useCallback((event: any) => {
    if (!canManage) return;
    if (!event || event.metaType !== 'rental') return;

    const slot = event.resource as TimeSlot | undefined;
    if (!slot?.$id) return;
    const eventFieldId = typeof event.resourceId === 'string' ? event.resourceId : '';
    const ownerField = fields.find((field) => field.$id === eventFieldId) ?? selectedField;
    if (!ownerField) return;
    setEditingRentalField(ownerField);
    setEditingRentalSlot(slot);
    setRentalDraftRange(null);
    setCreateRentalOpen(true);
  }, [canManage, fields, selectedField]);

  const CalendarEvent: any = ({ event }: any) => {
    const normalizedFieldName = typeof event?.fieldName === 'string' ? event.fieldName.trim() : '';
    const resource = event?.resource as any;
    const resourceName = typeof resource?.name === 'string' ? resource.name.trim() : '';
    const matchLabel = typeof resource?.matchId === 'number' ? `Match #${resource.matchId}` : '';
    const timeLabel = event?.start && event?.end
      ? `${formatDisplayTime(event.start)} - ${formatDisplayTime(event.end)}`
      : null;

    let title = event.title;
    let meta = timeLabel;
    if (event?.metaType === 'booked') {
      title = resourceName || matchLabel || 'Booked slot';
      meta = 'Booked';
    } else if (event?.metaType === 'rental') {
      title = 'Rental slot';
      meta = timeLabel;
    }

    const colors = event?.metaType === 'selection'
      ? { bg: SELECTION_COLOR, text: SELECTION_TEXT_COLOR }
      : undefined;

    return (
      <SharedCalendarEvent
        title={title}
        subtitle={normalizedFieldName || undefined}
        meta={meta}
        colors={colors}
        colorReferenceList={fieldColorReferenceList}
        colorMatchKey={event?.resourceId}
        compact
        muted={event?.metaType === 'booked' && !canManage}
        draggable={event?.metaType === 'selection' || (canManage && event?.metaType === 'rental')}
      />
    );
  };

  const CalendarToolbar: any = useCallback((toolbar: any) => {
    const views = Array.isArray(toolbar.views)
      ? toolbar.views
      : Object.keys(toolbar.views || {}).filter((viewKey) => Boolean(toolbar.views?.[viewKey]));

    return (
      <div className="rbc-toolbar">
        <span className="rbc-btn-group flex items-center gap-1">
          <button type="button" onClick={() => toolbar.onNavigate('PREV')}>Back</button>
          <button type="button" onClick={() => toolbar.onNavigate('TODAY')}>Today</button>
          <button type="button" onClick={() => toolbar.onNavigate('NEXT')}>Next</button>
          {fieldEventsLoading ? (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader size={14} />
              <span>Loading field…</span>
            </span>
          ) : null}
        </span>
        <span className="rbc-toolbar-label">{toolbar.label}</span>
        <span className="rbc-btn-group">
          {views.map((viewName: string) => (
            <button
              key={viewName}
              type="button"
              className={toolbar.view === viewName ? 'rbc-active' : ''}
              onClick={() => toolbar.onView(viewName)}
            >
              {CALENDAR_VIEW_LABELS[viewName] ?? `${viewName.charAt(0).toUpperCase()}${viewName.slice(1)}`}
            </button>
          ))}
        </span>
      </div>
    );
  }, [fieldEventsLoading]);
  const canRenderCalendar = canManage
    ? Boolean(selectedFieldIds.length > 0 && selection)
    : readonlyCalendarFields.length > 0;
  const fieldCalendarNode = canRenderCalendar ? (
    <div
      className="shared-calendar-shell shared-calendar-shell--fields"
      style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT, overflow: 'hidden' }}
    >
      <DnDCalendar
        localizer={localizer}
        events={calendarEvents}
        view={calendarView}
        date={calendarDate}
        onView={(view: any) => setCalendarView(view)}
        onNavigate={(date: any) => {
          const nextDate = toValidDate(date);
          if (nextDate) {
            setCalendarDate(nextDate);
          }
        }}
        onRangeChange={handleCalendarRangeChange}
        views={['week', 'day']}
        popup
        selectable
        resizable
        startAccessor="start"
        endAccessor="end"
        style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT }}
        slotGroupPropGetter={slotGroupPropGetter}
        min={minTime}
        max={maxTime}
        scrollToTime={scrollToTime}
        formats={FIELD_CALENDAR_FORMATS}
        eventPropGetter={eventPropGetter}
        slotPropGetter={slotPropGetter}
        draggableAccessor={(event: CalendarEventData) => (
          event.metaType === 'selection'
          || (canManage && event.metaType === 'rental')
        )}
        resizableAccessor={(event: CalendarEventData) => event.metaType === 'selection'}
        onEventDrop={handleEventDrop}
        onEventResize={handleEventResize}
        onSelecting={handleSelecting}
        onSelectSlot={handleSlotSelect}
        onSelectEvent={handleSelectCalendarEvent}
        components={{ event: CalendarEvent, toolbar: CalendarToolbar }}
      />
    </div>
  ) : (
    <Paper
      withBorder
      radius="md"
      style={{
        minHeight: MIN_FIELD_CALENDAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text c="dimmed">{canManage ? 'Select at least one field to view availability.' : 'No fields are available for rentals.'}</Text>
    </Paper>
  );

  if (orgLoading) {
    return <Loading fullScreen={false} text="Loading fields..." />;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Title order={5} mb={4}>
            {canManage ? 'Rental slots & pricing' : 'Field availability'}
          </Title>
          <Text c="dimmed">
            {canManage
              ? 'Select one or more fields, then pick a calendar range to add rental slots (and prices). Click an existing slot to edit.'
              : 'Choose a field and drag the calendar to set your rental time.'}
          </Text>
        </div>

        {canManage && (
          <Group gap="xs" className="md:justify-end">
            <Button
              size="xs"
              onClick={() => {
                setEditField(null);
                setCreateFieldOpen(true);
              }}
            >
              + Field
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={!selectedFieldIds.length}
              onClick={() => {
                setEditingRentalSlot(null);
                setEditingRentalField(null);
                setRentalDraftRange(selection ? { start: selection.start, end: selection.end } : null);
                setCreateRentalOpen(true);
              }}
            >
              + Rental Slot
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={!selectedField}
              onClick={() => {
                if (!selectedField) return;
                setEditField(selectedField);
                setCreateFieldOpen(true);
              }}
            >
              Edit field
            </Button>
          </Group>
        )}
      </div>

      {orgError && (
        <Alert color="red" mb="md">
          {orgError}
        </Alert>
      )}

      {!org || !(org.fields && org.fields.length) ? (
        <Paper withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Text c="dimmed">No fields available.</Text>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditField(null);
                  setCreateFieldOpen(true);
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Create your first field
              </Button>
            ) : (
              <Text size="sm" c="dimmed">
                Sign in as the organization owner to add fields and rental slots.
              </Text>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          {canManage ? (
            <div className="shared-calendar-layout">
              <FieldCalendarFilter
                items={fieldFilterItems}
                selectedIds={selectedFieldIds}
                onSelectedIdsChange={handleSelectedFieldIdsChange}
                colorReferenceList={fieldColorReferenceList}
              />
              <Stack gap="sm" className="min-w-0">
                <Text size="sm" c="dimmed">
                  Click a time slot to move the draft block, drag it to adjust, then add a rental slot.
                  Slots are colored by field so each selected field stays visible across the week.
                </Text>
                {fieldCalendarNode}
                <Text size="sm" c={summaryColor}>
                  {summaryText}
                </Text>
              </Stack>
            </div>
          ) : (
            <Paper withBorder radius="md" p="sm">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="sm">Rental Selections</Text>
                  <Button size="xs" variant="light" onClick={handleAddRentalSelection}>
                    + Add Selection
                  </Button>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                  {rentalSelections.map((selectionItem, index) => {
                    const validation = rentalSelectionValidationByKey.get(selectionItem.key);
                    const selectionRange = resolveSelectionDateRange(selectionItem);
                    const selectionFieldNames = normalizeFieldIds(selectionItem.scheduledFieldIds)
                      .map((fieldId) => fieldLabelById.get(fieldId) ?? fieldId);
                    const hasConflict = (validation?.conflictCount ?? 0) > 0;
                    return (
                      <Paper
                        key={selectionItem.key}
                        withBorder
                        radius="md"
                        p="md"
                        shadow="xs"
                        style={{
                          aspectRatio: '1 / 1',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          overflow: 'hidden',
                          borderColor: hasConflict ? 'var(--mantine-color-red-5)' : undefined,
                          backgroundColor: hasConflict ? 'var(--mantine-color-red-0)' : undefined,
                        }}
                      >
                        <div className="space-y-2 overflow-y-auto pr-1">
                          <Group justify="space-between" align="center">
                            <Group gap="xs">
                              <Badge color={validation?.errors.length ? 'red' : 'teal'} variant="light">
                                Selection {index + 1}
                              </Badge>
                              <Badge variant="dot">
                                {formatPrice(validation?.totalCents ?? 0)}
                              </Badge>
                              {hasConflict ? (
                                <Badge color="red" variant="filled">Conflict</Badge>
                              ) : null}
                              {validation?.conflictCheckPending ? (
                                <Badge color="yellow" variant="light">Checking</Badge>
                              ) : null}
                            </Group>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              onClick={() => handleRemoveRentalSelection(selectionItem.key)}
                            >
                              Remove
                            </Button>
                          </Group>
                          <MultiSelect
                            label="Fields"
                            data={fieldOptions}
                            value={normalizeFieldIds(selectionItem.scheduledFieldIds)}
                            onChange={(nextValues) => {
                              updateRentalSelection(selectionItem.key, (current) => ({
                                ...current,
                                scheduledFieldIds: normalizeFieldIds(nextValues),
                              }));
                            }}
                            searchable
                            placeholder="Select one or more fields"
                          />
                          <Group grow>
                            <DateTimePicker
                              label="Start"
                              value={formatLocalDateTime(selectionRange?.start ?? null) ?? null}
                              onChange={(value) => {
                                const nextStart = parseLocalDateTime(value ?? null);
                                if (!nextStart) return;
                                updateRentalSelection(
                                  selectionItem.key,
                                  (current) => updateSelectionWithCalendarRange(
                                    current,
                                    nextStart,
                                    selectionRange?.end && selectionRange.end.getTime() > nextStart.getTime()
                                      ? selectionRange.end
                                      : new Date(nextStart.getTime() + MIN_SELECTION_MS),
                                  ),
                                );
                              }}
                            />
                            <DateTimePicker
                              label="End"
                              value={formatLocalDateTime(selectionRange?.end ?? null) ?? null}
                              onChange={(value) => {
                                const nextEnd = parseLocalDateTime(value ?? null);
                                if (!nextEnd) return;
                                updateRentalSelection(
                                  selectionItem.key,
                                  (current) => updateSelectionWithCalendarRange(
                                    current,
                                    selectionRange?.start && selectionRange.start.getTime() < nextEnd.getTime()
                                      ? selectionRange.start
                                      : new Date(nextEnd.getTime() - MIN_SELECTION_MS),
                                    nextEnd,
                                  ),
                                );
                              }}
                            />
                          </Group>
                          <Text size="xs" c="dimmed">
                            {selectionRange
                              ? `${formatDisplayDateTime(selectionRange.start)} - ${formatDisplayDateTime(selectionRange.end)} • ${selectionFieldNames.join(', ')}`
                              : 'Select date/time and fields to validate availability.'}
                          </Text>
                          {validation?.errors.map((errorMessage, errorIndex) => (
                            <Text key={`${selectionItem.key}-${errorIndex}`} size="xs" c="red">
                              {errorMessage}
                            </Text>
                          ))}
                        </div>
                      </Paper>
                    );
                  })}
                </SimpleGrid>
              </Stack>
            </Paper>
          )}

          {!canManage && currentUser && (
            <Select
              label="Host Event As"
              data={hostSelectOptions}
              value={hostSelection}
              onChange={(value) => setHostSelection(value ?? 'self')}
              rightSection={hostOptionsLoading ? <Loader size="xs" /> : undefined}
              rightSectionWidth={hostOptionsLoading ? 36 : undefined}
              disabled={hostOptionsLoading && hostSelectOptions.length === 1}
            />
          )}

          {!canManage && (
            <div className="shared-calendar-layout">
              <FieldCalendarFilter
                items={fieldFilterItems}
                selectedIds={readonlyCalendarFieldIds}
                onSelectedIdsChange={handleReadonlyVisibleFieldIdsChange}
                colorReferenceList={fieldColorReferenceList}
              />
              <Stack gap="sm" className="min-w-0">
                <Text size="sm" c="dimmed">
                  Click empty time ranges in the calendar to add selections. Drag or resize a highlighted selection to update its date/time across selected fields.
                </Text>
                {fieldCalendarNode}
                <Text size="sm" c={summaryColor}>
                  {summaryText}
                </Text>
              </Stack>
            </div>
          )}

          {!canManage && (
            <Paper withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="sm">Rental Total</Text>
                  <Badge color={canCreateRentalEvent ? 'teal' : 'red'} size="lg">
                    {formatPrice(totalRentalCents)}
                  </Badge>
                </Group>
                {rentalSelectionValidations.map((validation, index) => {
                  const selectionRange = resolveSelectionDateRange(validation.selection);
                  return (
                    <Group key={validation.selection.key} justify="space-between" align="center">
                      <Text size="sm">
                        Selection {index + 1}: {selectionRange
                          ? `${formatDisplayDateTime(selectionRange.start)} - ${formatDisplayDateTime(selectionRange.end)}`
                          : 'Invalid date range'}
                      </Text>
                      <Badge color={validation.errors.length ? 'red' : 'teal'} variant="light">
                        {formatPrice(validation.totalCents)}
                      </Badge>
                    </Group>
                  );
                })}
              </Stack>
            </Paper>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => router.push(backHref)}>
              {backLabel}
            </Button>
            {canManage ? (
              <Button disabled={!selectedFieldIds.length || !selection} onClick={handleAddRentalSlotClick}>
                Add Rental Slot
              </Button>
            ) : (
              <Button disabled={!canCreateRentalEvent || !currentUser} onClick={handleCreateEventClick}>
                {primaryActionLabel}
              </Button>
            )}
          </Group>
        </Stack>
      )}

      <CreateFieldModal
        isOpen={createFieldOpen}
        onClose={() => setCreateFieldOpen(false)}
        organization={org ?? undefined}
        field={editField}
        onFieldSaved={async (savedField) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const nextFields = sortFieldsByCreatedAt(prevFields.some((field) => field.$id === savedField.$id)
              ? prevFields.map((field) => (field.$id === savedField.$id ? savedField : field))
              : [...prevFields, savedField]);

            return { ...prev, fields: nextFields };
          });

          setSelection(() => {
            const start = new Date();
            start.setMinutes(0, 0, 0);
            const end = new Date(start.getTime() + MIN_SELECTION_MS);
            return { fieldIds: [savedField.$id], start, end };
          });
          setCalendarDate(new Date());
          await refreshOrganization();
        }}
      />

      <CreateRentalSlotModal
        opened={createRentalOpen}
        onClose={() => {
          setCreateRentalOpen(false);
          setEditingRentalSlot(null);
          setEditingRentalField(null);
          setRentalDraftRange(null);
        }}
        field={editingRentalField ?? selectedField}
        selectedFields={!editingRentalSlot ? selectedFields : undefined}
        slot={editingRentalSlot}
        initialRange={editingRentalSlot ? null : rentalDraftRange}
        onSaved={async (updatedFields) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const updatedById = new Map(updatedFields.map((field) => [field.$id, field]));
            const nextFields = prevFields.map((field) => updatedById.get(field.$id) ?? field);
            return { ...prev, fields: nextFields };
          });
          await refreshOrganization();
        }}
        organizationHasStripeAccount={organizationHasStripeAccount}
        organizationId={organizationId}
        fieldColorReferenceList={fieldColorReferenceList}
      />
    </Paper>
  );
}
