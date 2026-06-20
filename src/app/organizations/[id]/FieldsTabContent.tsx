"use client";

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DatePickerInput, DateTimePicker } from '@mantine/dates';
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
import type { Facility, Field, Organization, TimeSlot, UserData } from '@/types';
import { formatPrice } from '@/types';
import {
  buildFacilityCalendarFeed,
  buildFieldCalendarEvents,
  type FacilityCalendarFeedItem,
  type FacilityCalendarFeedItemType,
  type FieldCalendarEntry,
} from './fieldCalendar';
import { resolveFieldIdsForCalendarHydration } from './fieldCalendarHydration';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFacilityScopedFieldDisplayName, getFieldResolvedLocation, sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import { notifications } from '@mantine/notifications';
import { organizationService } from '@/lib/organizationService';
import { createId } from '@/lib/id';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import { fieldService } from '@/lib/fieldService';
import { facilityService } from '@/lib/facilityService';
import { apiRequest } from '@/lib/apiClient';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import { buildUniqueColorReferenceList } from '@/lib/calendarColorReferences';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import CreateRentalSlotModal, { type CreateRentalSlotModalSubmitPayload } from '@/components/ui/CreateRentalSlotModal';
import LocationSelector, { type LocationSelectionMeta } from '@/components/location/LocationSelector';

type SelectionState = {
  fieldIds: string[];
  start: Date;
  end: Date;
};

type ManagerCalendarSelectionMode = 'rental' | 'staff_assignment' | 'official_assignment';

type ManagerCalendarDraftRentalOptions = {
  repeating?: boolean;
  dayOfWeek?: NonNullable<TimeSlot['dayOfWeek']>;
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  price?: number;
  requiredTemplateIds?: string[];
  hostRequiredTemplateIds?: string[];
};

type ManagerCalendarDraftStaffOptions = {
  userId?: string | null;
  userName?: string | null;
  parentDraftId?: string | null;
  rateOverrideCents?: number | null;
  notes?: string;
  repeating?: boolean;
  daysOfWeek?: number[];
  repeatEndDate?: string | null;
};

type ManagerCalendarDraft = {
  id: string;
  mode: ManagerCalendarSelectionMode;
  fieldIds: string[];
  start: Date;
  end: Date;
  rental?: ManagerCalendarDraftRentalOptions;
  staff?: ManagerCalendarDraftStaffOptions;
};

type ManagerRentalSlotPendingUpdate = {
  key: string;
  fieldId: string;
  slotId: string;
} & (
  | { action: 'update'; slot: RentalSlotDragUpdate }
  | { action: 'delete' }
);

type ManagerStaffAssignmentPendingOverride =
  | { action: 'create'; assignment: StaffScheduleAssignment }
  | { action: 'update'; assignment: StaffScheduleAssignment }
  | { action: 'unassign'; assignmentId: string }
  | { action: 'delete'; assignmentId: string };

type ManagerStaffAssignmentPendingOverrideBatch = Record<string, {
  previous: ManagerStaffAssignmentPendingOverride | null;
  next: ManagerStaffAssignmentPendingOverride;
}>;

type ManagerCalendarPendingChange =
  | { id: string; type: 'create_draft'; label: string; draft: ManagerCalendarDraft }
  | { id: string; type: 'draft_update'; label: string; draftId: string; previous: ManagerCalendarDraft; next: ManagerCalendarDraft }
  | { id: string; type: 'draft_scope'; label: string; draftId: string; previous: ManagerCalendarDraft; parentNext: ManagerCalendarDraft; childDraft: ManagerCalendarDraft }
  | { id: string; type: 'rental_update'; label: string; key: string; previous: ManagerRentalSlotPendingUpdate | null; next: ManagerRentalSlotPendingUpdate }
  | { id: string; type: 'staff_override'; label: string; assignmentId: string; previous: ManagerStaffAssignmentPendingOverride | null; next: ManagerStaffAssignmentPendingOverride }
  | { id: string; type: 'staff_override_batch'; label: string; changes: ManagerStaffAssignmentPendingOverrideBatch };

type BuildStaffAssignmentCalendarRangeOptions = {
  preserveRepeatingPattern?: boolean;
};

type OpenStaffDeleteScope = 'following' | 'all';

type OpenStaffDeleteConfirmationState = {
  assignmentId: string;
  occurrenceStart: string;
  occurrenceEnd: string;
  scope: OpenStaffDeleteScope;
};

type StaffAssignmentScopePromptState =
  | {
      source: 'assignment';
      parentAssignment: StaffScheduleAssignment;
      parentOverride: ManagerStaffAssignmentPendingOverride;
      childOverride: ManagerStaffAssignmentPendingOverride;
      staffName: string;
      occurrenceLabel: string;
      kindLabel: 'staff' | 'official';
    }
  | {
      source: 'draft';
      draftId: string;
      previousDraft: ManagerCalendarDraft;
      allDraft: ManagerCalendarDraft;
      parentDraft: ManagerCalendarDraft;
      childDraft: ManagerCalendarDraft;
      staffName: string;
      occurrenceLabel: string;
      kindLabel: 'staff' | 'official';
    };

type ManagerDraftDragState = {
  draftId: string;
  draft: ManagerCalendarDraft;
  fieldIds: string[];
  durationMs: number;
  startPoint: { clientX: number; clientY: number };
  lastPoint: { clientX: number; clientY: number };
  hasMoved: boolean;
};

type SelectionCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: {
    type: 'selection';
    slotKey?: string;
    mode?: ManagerCalendarSelectionMode;
    userId?: string | null;
  };
  metaType: 'selection';
  selectionMode?: ManagerCalendarSelectionMode;
  fieldName: string;
};

type FacilityFeedCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: FacilityCalendarFeedItem;
  metaType: 'facility-feed';
  feedType: FacilityCalendarFeedItemType;
  fieldName: string;
};

type CalendarEventData = FieldCalendarEntry | FacilityFeedCalendarEntry | SelectionCalendarEntry;

const getCalendarEventVariant = (event: CalendarEventData | null | undefined): SharedCalendarEventVariant => {
  if (!event) {
    return 'default';
  }
  if (event.metaType === 'selection') {
    const selectionUserId = event.resource?.userId ?? null;
    if (event.selectionMode === 'rental' || event.resource?.mode === 'rental') {
      return 'availability';
    }
    if (event.selectionMode === 'official_assignment' || event.resource?.mode === 'official_assignment') {
      return selectionUserId ? 'official-assigned' : 'official-open';
    }
    if (event.selectionMode === 'staff_assignment' || event.resource?.mode === 'staff_assignment') {
      return selectionUserId ? 'staff-assigned' : 'staff-open';
    }
    return event.selectionMode || event.resource?.mode ? 'default' : 'selection';
  }
  if (event.metaType === 'facility-feed') {
    if (event.feedType === 'conflict') {
      return 'conflict';
    }
    if (event.feedType === 'maintenance_block') {
      return 'unavailable';
    }
    if (event.feedType === 'official_assignment') {
      return event.resource.userId || event.resource.staffMemberId ? 'official-assigned' : 'official-open';
    }
    if (event.feedType === 'staff_assignment') {
      return event.resource.userId || event.resource.staffMemberId ? 'staff-assigned' : 'staff-open';
    }
    return 'default';
  }
  if (event.metaType === 'rental') {
    return isPastRentalRangeStart(event.start) ? 'unavailable' : 'availability';
  }

  const sourceType = typeof (event.resource as { sourceType?: unknown } | undefined)?.sourceType === 'string'
    ? String((event.resource as { sourceType?: unknown }).sourceType).toUpperCase()
    : '';
  if (sourceType === 'RENTAL_UNAVAILABLE') {
    return 'unavailable';
  }
  return sourceType === 'RENTAL_BOOKING' ? 'reservation' : 'booked';
};

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
  renterOrganizationId: string | null;
  facilityId: string | null;
  facilityName: string | null;
  facilityLocation: string | null;
  facilityAddress: string | null;
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

type StaffScheduleAssignmentKind = 'STAFF_SHIFT' | 'OFFICIAL_SHIFT';

type StaffScheduleStaffMember = {
  staffMemberId: string;
  userId: string;
  fullName: string;
  userName?: string | null;
  types?: string[];
  roleName?: string | null;
};

type StaffScheduleTimeSlot = {
  startDate: string;
  endDate?: string | null;
  repeating: boolean;
  dayOfWeek?: number | null;
  daysOfWeek?: number[] | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  timeZone?: string | null;
};

type StaffScheduleAssignment = {
  id: string;
  parentAssignmentId?: string | null;
  staffMemberId?: string | null;
  userId?: string | null;
  userName: string;
  isOpen?: boolean;
  isChildAssignment?: boolean;
  assignmentKind: StaffScheduleAssignmentKind;
  facilityId?: string | null;
  facilityName?: string | null;
  fieldId?: string | null;
  fieldName?: string | null;
  timeSlot?: StaffScheduleTimeSlot | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  rateOverrideType?: string | null;
  rateOverrideCents?: number | null;
  status?: string | null;
  notes?: string | null;
};

type StaffScheduleResponse = {
  assignments?: StaffScheduleAssignment[];
  staffMembers?: StaffScheduleStaffMember[];
};

type StaffScheduleCreateResponse = {
  assignment?: StaffScheduleAssignment;
};

type StaffScheduleUpdateResponse = {
  assignment?: StaffScheduleAssignment;
};

const MIN_FIELD_CALENDAR_HEIGHT = 800;
const MIN_SELECTION_MS = 60 * 60 * 1000;
const SLOT_STEP_MINUTES = 30;
const MANAGER_CARD_DRAG_THRESHOLD_PX = 6;
const OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT = 3;
const OPEN_STAFF_DELETE_CHILD_ROW_HEIGHT = 54;

const hasMovedPastDragThreshold = (
  startPoint: { clientX: number; clientY: number },
  nextPoint: { clientX: number; clientY: number },
): boolean => (
  Math.hypot(nextPoint.clientX - startPoint.clientX, nextPoint.clientY - startPoint.clientY)
  >= MANAGER_CARD_DRAG_THRESHOLD_PX
);
const FIELD_CALENDAR_FORMATS = {
  dayFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayHeaderFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayDate(start, { year: '2-digit' })} - ${formatDisplayDate(end, { year: '2-digit' })}`,
  timeGutterFormat: (value: Date) => formatDisplayTime(value),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`,
};

const isPastRentalRangeStart = (start: Date, reference: Date = new Date()): boolean => (
  start.getTime() < reference.getTime()
);

const centsFromDollars = (value: string | number): number => {
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/^\$/, ''));
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
};

const dollarsFromCents = (amountCents: number | null | undefined): string => {
  if (!Number.isFinite(amountCents)) {
    return '';
  }
  return (Number(amountCents) / 100).toFixed(2);
};

const serializeManagerCalendarDraft = (draft: ManagerCalendarDraft) => JSON.stringify({
  ...draft,
  fieldIds: normalizeFieldIds(draft.fieldIds),
  start: new Date(draft.start).toISOString(),
  end: new Date(draft.end).toISOString(),
});

const managerCalendarDraftsAreEqual = (
  first: ManagerCalendarDraft,
  second: ManagerCalendarDraft,
) => serializeManagerCalendarDraft(first) === serializeManagerCalendarDraft(second);

const buildStaffAssignmentWithCalendarRange = (
  assignment: StaffScheduleAssignment,
  start: Date,
  end: Date,
  options: BuildStaffAssignmentCalendarRangeOptions = {},
): StaffScheduleAssignment | null => {
  const nextStart = new Date(start);
  const nextEnd = new Date(end);
  if (
    Number.isNaN(nextStart.getTime())
    || Number.isNaN(nextEnd.getTime())
    || nextEnd.getTime() <= nextStart.getTime()
    || nextStart.toDateString() !== nextEnd.toDateString()
  ) {
    return null;
  }

  const dayOfWeek = mondayDayOf(nextStart);
  const startTimeMinutes = nextStart.getHours() * 60 + nextStart.getMinutes();
  const endTimeMinutes = nextEnd.getHours() * 60 + nextEnd.getMinutes();
  const existingTimeSlot = assignment.timeSlot ?? null;
  const repeating = Boolean(existingTimeSlot?.repeating);
  const existingDaysOfWeek = Array.isArray(existingTimeSlot?.daysOfWeek) && existingTimeSlot.daysOfWeek.length
    ? existingTimeSlot.daysOfWeek
    : [dayOfWeek];
  const nextDaysOfWeek = repeating && options.preserveRepeatingPattern
    ? existingDaysOfWeek
    : [dayOfWeek];
  const plannedOccurrenceDate = repeating && options.preserveRepeatingPattern
    ? alignDateToWeekday(toValidDate(existingTimeSlot?.startDate) ?? nextStart, nextDaysOfWeek[0] ?? dayOfWeek)
    : nextStart;
  const plannedStart = repeating && options.preserveRepeatingPattern
    ? dateWithMinutes(plannedOccurrenceDate, startTimeMinutes)
    : nextStart;
  const plannedEnd = repeating && options.preserveRepeatingPattern
    ? dateWithMinutes(plannedOccurrenceDate, endTimeMinutes)
    : nextEnd;
  const nextTimeSlot: StaffScheduleTimeSlot = {
    startDate: repeating
      ? (existingTimeSlot?.startDate ?? nextStart.toISOString())
      : nextStart.toISOString(),
    endDate: repeating
      ? (existingTimeSlot?.endDate ?? nextEnd.toISOString())
      : nextEnd.toISOString(),
    repeating,
    dayOfWeek: nextDaysOfWeek[0] ?? dayOfWeek,
    daysOfWeek: nextDaysOfWeek,
    startTimeMinutes,
    endTimeMinutes,
    timeZone: existingTimeSlot?.timeZone ?? null,
  };

  return {
    ...assignment,
    timeSlot: nextTimeSlot,
    plannedStart: plannedStart.toISOString(),
    plannedEnd: plannedEnd.toISOString(),
    plannedMinutes: Math.max(0, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / 60000)),
  };
};

const buildStaffScheduleTimeSlotPayload = (timeSlot?: StaffScheduleTimeSlot | null) => {
  if (!timeSlot) {
    return undefined;
  }
  return {
    startDate: timeSlot.startDate,
    endDate: timeSlot.endDate ?? null,
    repeating: Boolean(timeSlot.repeating),
    daysOfWeek: Array.isArray(timeSlot.daysOfWeek) ? timeSlot.daysOfWeek : null,
    startTimeMinutes: typeof timeSlot.startTimeMinutes === 'number' ? timeSlot.startTimeMinutes : null,
    endTimeMinutes: typeof timeSlot.endTimeMinutes === 'number' ? timeSlot.endTimeMinutes : null,
    timeZone: timeSlot.timeZone ?? null,
  };
};

const getNextSelectableRentalStart = (reference: Date = new Date()): Date => {
  const next = new Date(reference.getTime());
  const hasSubMinuteOffset = next.getSeconds() > 0 || next.getMilliseconds() > 0;
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const remainder = minutes % SLOT_STEP_MINUTES;
  if (remainder > 0 || hasSubMinuteOffset) {
    next.setMinutes(minutes + (remainder > 0 ? SLOT_STEP_MINUTES - remainder : SLOT_STEP_MINUTES), 0, 0);
  }
  return next;
};

const CALENDAR_VIEW_LABELS: Record<string, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
  work_week: 'Work week',
};
const FACILITY_METRIC_CARD_STYLE = {
  border: '1px solid var(--mantine-color-gray-3)',
  borderRadius: 8,
  padding: '12px',
  minHeight: 92,
} as const;

type CalendarLayerType =
  | FacilityCalendarFeedItemType
  | 'reservation';

const CALENDAR_LAYER_ORDER: CalendarLayerType[] = [
  'conflict',
  'rental',
  'reservation',
  'event',
  'game',
  'maintenance_block',
  'official_assignment',
  'staff_assignment',
];

const CALENDAR_LAYER_LABELS: Record<CalendarLayerType, string> = {
  conflict: 'Conflicts',
  rental: 'Open rentals',
  reservation: 'Reservations',
  maintenance_block: 'Maintenance',
  event: 'Events',
  game: 'Games',
  official_assignment: 'Officials',
  staff_assignment: 'Staff',
};

const CALENDAR_LAYER_COLORS: Record<CalendarLayerType, string> = {
  conflict: 'red',
  rental: 'teal',
  reservation: 'orange',
  maintenance_block: 'yellow',
  event: 'blue',
  game: 'indigo',
  official_assignment: 'grape',
  staff_assignment: 'cyan',
};

const MANAGER_SELECTION_TITLES: Record<ManagerCalendarSelectionMode, string> = {
  rental: 'Open rental slot',
  staff_assignment: 'Open staff shift',
  official_assignment: 'Open official shift',
};

const MANAGER_CREATE_TEMPLATES: Array<{
  mode: ManagerCalendarSelectionMode;
  title: string;
  subtitle: string;
  meta: string;
  variant: SharedCalendarEventVariant;
  colorSeed: string;
}> = [
  {
    mode: 'rental',
    title: 'Rental slot',
    subtitle: 'Open inventory',
    meta: '1 hour',
    variant: 'availability',
    colorSeed: 'rental-slot-template',
  },
  {
    mode: 'staff_assignment',
    title: 'Staff shift',
    subtitle: 'Coverage',
    meta: '1 hour',
    variant: 'staff-open',
    colorSeed: 'staff-shift-template',
  },
  {
    mode: 'official_assignment',
    title: 'Official shift',
    subtitle: 'Coverage',
    meta: '1 hour',
    variant: 'official-open',
    colorSeed: 'official-shift-template',
  },
];

const FACILITY_FEED_CALENDAR_TYPES = new Set<FacilityCalendarFeedItemType>([
  'conflict',
  'maintenance_block',
  'official_assignment',
  'staff_assignment',
]);

const formatMetricMoney = (cents: number): string => `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`;

const formatCourtHours = (hours: number): string => {
  const normalized = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const rounded = Math.round(normalized * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}h` : `${rounded.toFixed(1)}h`;
};

const formatCourtHourLabel = (hours: number): string => {
  const normalized = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const rounded = Math.round(normalized * 10) / 10;
  const label = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${label} court-hour${rounded === 1 ? '' : 's'}`;
};

function FacilityMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div style={FACILITY_METRIC_CARD_STYLE}>
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {label}
        </Text>
        <Text size="xl" fw={800}>
          {value}
        </Text>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </Stack>
    </div>
  );
}

const formatFacilityFeedStatus = (item: FacilityCalendarFeedItem): string | null => {
  if (item.unresolved) {
    return 'Unresolved';
  }
  if (!item.status) {
    return null;
  }
  return item.status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
};

const getBookedEventSourceType = (event: FieldCalendarEntry | null | undefined): string => (
  typeof (event?.resource as { sourceType?: unknown } | undefined)?.sourceType === 'string'
    ? String((event?.resource as { sourceType?: unknown }).sourceType).toUpperCase()
    : ''
);

const getCalendarEventLayer = (event: CalendarEventData): CalendarLayerType | null => {
  if (event.metaType === 'selection') {
    return null;
  }
  if (event.metaType === 'facility-feed') {
    return event.feedType;
  }
  if (event.metaType === 'rental') {
    return 'rental';
  }

  const sourceType = getBookedEventSourceType(event);
  if (sourceType === 'RENTAL_BOOKING') {
    return 'reservation';
  }
  return event.id.includes('field-booked-match-') ? 'game' : 'event';
};

const getFacilitySortOrder = (facility: Facility): number => (
  typeof facility.sortOrder === 'number' && Number.isFinite(facility.sortOrder)
    ? facility.sortOrder
    : Number.MAX_SAFE_INTEGER
);

const compareFacilitiesForManagement = (left: Facility, right: Facility): number => {
  if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
    return left.isDefault ? -1 : 1;
  }

  const sortDifference = getFacilitySortOrder(left) - getFacilitySortOrder(right);
  if (sortDifference !== 0) {
    return sortDifference;
  }

  const nameComparison = (left.name || '').localeCompare(right.name || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.$id.localeCompare(right.$id);
};

const getFieldFacilityId = (field?: Field | null): string | null => {
  if (typeof field?.facilityId === 'string' && field.facilityId.trim().length > 0) {
    return field.facilityId.trim();
  }
  const facility = field?.facility;
  if (typeof facility === 'string' && facility.trim().length > 0) {
    return facility.trim();
  }
  if (facility && typeof facility === 'object' && typeof facility.$id === 'string') {
    return facility.$id;
  }
  return null;
};

const getFieldFacility = (field?: Field | null): Facility | null => {
  const facility = field?.facility;
  if (facility && typeof facility === 'object' && typeof facility.$id === 'string') {
    return facility;
  }
  return null;
};

const getFieldFacilityFilterValue = (field?: Field | null): string => (
  getFieldFacilityId(field) ?? UNASSIGNED_FACILITY_FILTER_VALUE
);

const getFacilityLabelForFilterValue = (facilities: Facility[], filterValue: string): string => {
  if (filterValue === ALL_FACILITIES_FILTER_VALUE) {
    return 'All facilities';
  }
  if (filterValue === UNASSIGNED_FACILITY_FILTER_VALUE) {
    return 'Unassigned resources';
  }
  return facilities.find((facility) => facility.$id === filterValue)?.name || 'Facility';
};

const getFieldFacilityFromList = (
  field: Field | null | undefined,
  facilities: Facility[],
): Facility | null => {
  const expanded = getFieldFacility(field);
  if (expanded) {
    return expanded;
  }
  const facilityId = getFieldFacilityId(field);
  return facilityId ? facilities.find((facility) => facility.$id === facilityId) ?? null : null;
};

const facilityCoordinatesToTuple = (value: Facility['coordinates'] | Organization['coordinates'] | unknown): [number, number] | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)) {
      return [lng, lat];
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lat = Number(record.lat ?? record.latitude);
    const lng = Number(record.lng ?? record.long ?? record.longitude);
    if (Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)) {
      return [lng, lat];
    }
  }
  return null;
};

const getFieldCoordinatesWithFallback = (
  field: Field | null | undefined,
  facility?: Facility | null,
  organization?: Organization | null,
): [number, number] | undefined => {
  const fieldLat = Number(field?.lat);
  const fieldLng = Number(field?.long);
  if (Number.isFinite(fieldLat) && Number.isFinite(fieldLng) && !(fieldLat === 0 && fieldLng === 0)) {
    return [fieldLng, fieldLat];
  }
  return facilityCoordinatesToTuple(facility?.coordinates)
    ?? facilityCoordinatesToTuple(organization?.coordinates)
    ?? undefined;
};

const buildFacilityManagementList = (
  organization: Organization | null,
  fields: Field[],
): Facility[] => {
  const byId = new Map<string, Facility>();

  (organization?.facilities ?? []).forEach((facility) => {
    if (facility?.$id) {
      byId.set(facility.$id, facility);
    }
  });

  fields.forEach((field) => {
    const facility = getFieldFacility(field);
    if (facility?.$id && !byId.has(facility.$id)) {
      byId.set(facility.$id, facility);
      return;
    }

    const facilityId = getFieldFacilityId(field);
    if (facilityId && !byId.has(facilityId)) {
      byId.set(facilityId, {
        $id: facilityId,
        organizationId: organization?.$id ?? '',
        name: facilityId,
        location: '',
        status: 'ACTIVE',
      });
    }
  });

  return Array.from(byId.values()).sort(compareFacilitiesForManagement);
};

const upsertFacility = (facilities: Facility[] | undefined, facility: Facility): Facility[] => {
  const existing = facilities ?? [];
  const next = existing.some((entry) => entry.$id === facility.$id)
    ? existing.map((entry) => (entry.$id === facility.$id ? facility : entry))
    : [...existing, facility];
  return next.sort(compareFacilitiesForManagement);
};

const minutesToDate = (base: Date, minutes: number): Date => {
  const copy = new Date(base.getTime());
  copy.setHours(0, 0, 0, 0);
  copy.setMinutes(minutes);
  return copy;
};

const compareRanges = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  Math.max(startA.getTime(), startB.getTime()) < Math.min(endA.getTime(), endB.getTime());

type PublicRentalInterval = {
  start: Date;
  end: Date;
};

const mergePublicRentalIntervals = (intervals: PublicRentalInterval[]): PublicRentalInterval[] => {
  const sorted = [...intervals]
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: PublicRentalInterval[] = [];

  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval.start.getTime() > last.end.getTime()) {
      merged.push({
        start: new Date(interval.start.getTime()),
        end: new Date(interval.end.getTime()),
      });
      return;
    }
    if (interval.end.getTime() > last.end.getTime()) {
      last.end = new Date(interval.end.getTime());
    }
  });

  return merged;
};

const subtractIntervals = (
  base: PublicRentalInterval,
  blockers: PublicRentalInterval[],
): PublicRentalInterval[] => {
  const overlaps = mergePublicRentalIntervals(
    blockers.flatMap((blocker) => {
      if (!compareRanges(base.start, base.end, blocker.start, blocker.end)) {
        return [];
      }
      const start = new Date(Math.max(base.start.getTime(), blocker.start.getTime()));
      const end = new Date(Math.min(base.end.getTime(), blocker.end.getTime()));
      return end.getTime() > start.getTime() ? [{ start, end }] : [];
    }),
  );

  if (!overlaps.length) {
    return [{ start: new Date(base.start.getTime()), end: new Date(base.end.getTime()) }];
  }

  const gaps: PublicRentalInterval[] = [];
  let cursor = new Date(base.start.getTime());
  overlaps.forEach((overlap) => {
    if (overlap.start.getTime() > cursor.getTime()) {
      gaps.push({
        start: new Date(cursor.getTime()),
        end: new Date(overlap.start.getTime()),
      });
    }
    if (overlap.end.getTime() > cursor.getTime()) {
      cursor = new Date(overlap.end.getTime());
    }
  });

  if (cursor.getTime() < base.end.getTime()) {
    gaps.push({
      start: new Date(cursor.getTime()),
      end: new Date(base.end.getTime()),
    });
  }

  return gaps;
};

const buildPublicRentalCalendarEvents = (events: FieldCalendarEntry[]): FieldCalendarEntry[] => {
  const rentalEntries = events.filter((event) => event.metaType === 'rental');
  const bookedEntries = events.filter((event) => event.metaType === 'booked');
  const publicEntries: FieldCalendarEntry[] = [];

  rentalEntries.forEach((rentalEntry) => {
    const overlaps = mergePublicRentalIntervals(
      bookedEntries.flatMap((bookedEntry) => {
        if (
          bookedEntry.resourceId !== rentalEntry.resourceId
          || !compareRanges(rentalEntry.start, rentalEntry.end, bookedEntry.start, bookedEntry.end)
        ) {
          return [];
        }
        const start = new Date(Math.max(rentalEntry.start.getTime(), bookedEntry.start.getTime()));
        const end = new Date(Math.min(rentalEntry.end.getTime(), bookedEntry.end.getTime()));
        return end.getTime() > start.getTime() ? [{ start, end }] : [];
      }),
    );

    let cursor = new Date(rentalEntry.start.getTime());
    overlaps.forEach((overlap, index) => {
      if (overlap.start.getTime() > cursor.getTime()) {
        publicEntries.push({
          ...rentalEntry,
          id: `${rentalEntry.id}-available-${cursor.getTime()}`,
          start: new Date(cursor.getTime()),
          end: new Date(overlap.start.getTime()),
        });
      }

      publicEntries.push({
        ...rentalEntry,
        id: `${rentalEntry.id}-unavailable-${index}-${overlap.start.getTime()}`,
        title: 'Unavailable',
        start: new Date(overlap.start.getTime()),
        end: new Date(overlap.end.getTime()),
        resource: {
          sourceType: 'RENTAL_UNAVAILABLE',
          sourceId: rentalEntry.id,
        } as unknown as TimeSlot,
        metaType: 'booked',
      });

      if (overlap.end.getTime() > cursor.getTime()) {
        cursor = new Date(overlap.end.getTime());
      }
    });

    if (cursor.getTime() < rentalEntry.end.getTime()) {
      publicEntries.push({
        ...rentalEntry,
        id: overlaps.length ? `${rentalEntry.id}-available-${cursor.getTime()}` : rentalEntry.id,
        start: new Date(cursor.getTime()),
        end: new Date(rentalEntry.end.getTime()),
      });
    }
  });

  return publicEntries.sort((left, right) => (
    left.start.getTime() - right.start.getTime()
    || left.end.getTime() - right.end.getTime()
    || left.resourceId.localeCompare(right.resourceId)
    || left.id.localeCompare(right.id)
  ));
};

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

const fieldMatchesFacilityFilter = (field: Field, filterValue: string): boolean => {
  if (filterValue === ALL_FACILITIES_FILTER_VALUE) {
    return true;
  }
  const facilityId = getFieldFacilityId(field);
  if (filterValue === UNASSIGNED_FACILITY_FILTER_VALUE) {
    return !facilityId;
  }
  return facilityId === filterValue;
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

const FACILITY_DAY_OPTIONS = [
  { value: '0', label: 'Mon', longLabel: 'Monday', dayOfWeek: 0 },
  { value: '1', label: 'Tue', longLabel: 'Tuesday', dayOfWeek: 1 },
  { value: '2', label: 'Wed', longLabel: 'Wednesday', dayOfWeek: 2 },
  { value: '3', label: 'Thu', longLabel: 'Thursday', dayOfWeek: 3 },
  { value: '4', label: 'Fri', longLabel: 'Friday', dayOfWeek: 4 },
  { value: '5', label: 'Sat', longLabel: 'Saturday', dayOfWeek: 5 },
  { value: '6', label: 'Sun', longLabel: 'Sunday', dayOfWeek: 6 },
];
const FACILITY_DAY_LABELS = FACILITY_DAY_OPTIONS.map((option) => option.label);
const STAFF_TIMESLOT_REPEAT_DAY_OPTIONS = FACILITY_DAY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.longLabel,
}));
const DEFAULT_FACILITY_OPEN_TIME = '08:00';
const DEFAULT_FACILITY_CLOSE_TIME = '22:00';
const ALL_FACILITIES_FILTER_VALUE = '__all_facilities__';
const UNASSIGNED_FACILITY_FILTER_VALUE = '__unassigned_resources__';
const FACILITY_LOCATION_REQUIRED_ERROR = 'Facility location is required.';
const FACILITY_LOCATION_SELECTION_ERROR = 'Select a facility address from suggestions or the map.';
const EMPTY_FACILITY_COORDINATES = { lat: 0, lng: 0 };

type FacilityWeeklyHoursFormRow = {
  dayOfWeek: number;
  closed: boolean;
  openTime: string;
  closeTime: string;
};

const normalizeTimeInput = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : '';
};

const coerceDatePickerValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const facilityCoordinatesToInput = (value: Facility['coordinates'] | unknown): { lat: number; lng: number } => {
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

const facilityCoordinatesFromInput = (value: { lat: number; lng: number }): [number, number] | null => {
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return [lng, lat];
};

const hasFacilityCoordinates = (value: { lat: number; lng: number }): boolean =>
  facilityCoordinatesFromInput(value) !== null;

const timeToMinutes = (value: string): number | null => {
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

const minutesToTimeInput = (minutes: unknown): string => {
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

const buildDefaultFacilityWeeklyHours = (): FacilityWeeklyHoursFormRow[] => (
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

const normalizeFacilityOperatingHours = (value: Facility['operatingHours'] | unknown) => {
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

const facilityOperatingHoursToFormRows = (value: Facility['operatingHours'] | unknown): FacilityWeeklyHoursFormRow[] => {
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

const buildOperatingHoursFromFormRows = (
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

const formatFacilityOperatingHours = (value: Facility['operatingHours'] | unknown): string | null => {
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

const dateWithMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date.getTime());
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

const getStaffAssignmentOccurrenceRangeForDate = (
  assignment: StaffScheduleAssignment,
  occurrenceDate: Date,
): PublicRentalInterval | null => {
  const timeSlot = assignment.timeSlot ?? null;
  if (!timeSlot?.repeating) {
    const start = toValidDate(assignment.plannedStart) ?? toValidDate(timeSlot?.startDate);
    const end = toValidDate(assignment.plannedEnd) ?? toValidDate(timeSlot?.endDate);
    if (!start || !end || end.getTime() <= start.getTime()) {
      return null;
    }
    return startOfDay(start).getTime() === startOfDay(occurrenceDate).getTime()
      ? { start, end }
      : null;
  }

  const scheduleStart = toValidDate(timeSlot.startDate);
  if (!scheduleStart) {
    return null;
  }
  const targetDay = startOfDay(occurrenceDate);
  const scheduleEnd = toValidDate(timeSlot.endDate);
  const days = Array.isArray(timeSlot.daysOfWeek) && timeSlot.daysOfWeek.length
    ? timeSlot.daysOfWeek
    : [mondayDayOf(scheduleStart)];
  if (
    !days.includes(mondayDayOf(targetDay))
    || targetDay.getTime() < startOfDay(scheduleStart).getTime()
    || (scheduleEnd && targetDay.getTime() > endOfDay(scheduleEnd).getTime())
  ) {
    return null;
  }
  const startMinutes = typeof timeSlot.startTimeMinutes === 'number'
    ? timeSlot.startTimeMinutes
    : scheduleStart.getHours() * 60 + scheduleStart.getMinutes();
  const endMinutes = typeof timeSlot.endTimeMinutes === 'number'
    ? timeSlot.endTimeMinutes
    : startMinutes + Math.max(30, assignment.plannedMinutes ?? 60);
  const start = dateWithMinutes(targetDay, startMinutes);
  const end = dateWithMinutes(targetDay, endMinutes);
  return end.getTime() > start.getTime() ? { start, end } : null;
};

const getStaffAssignmentPrimaryRange = (assignment: StaffScheduleAssignment): PublicRentalInterval | null => {
  const timeSlot = assignment.timeSlot ?? null;
  const start = toValidDate(assignment.plannedStart) ?? toValidDate(timeSlot?.startDate);
  const end = toValidDate(assignment.plannedEnd) ?? toValidDate(timeSlot?.endDate);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
};

const staffAssignmentCanDeleteFollowing = (assignment: StaffScheduleAssignment): boolean => {
  const timeSlot = assignment.timeSlot ?? null;
  if (timeSlot?.repeating) {
    return true;
  }
  const range = getStaffAssignmentPrimaryRange(assignment);
  return Boolean(range && startOfDay(range.start).getTime() !== startOfDay(range.end).getTime());
};

const isOpenParentStaffScheduleAssignment = (assignment: StaffScheduleAssignment): boolean => (
  !assignment.parentAssignmentId
  && !assignment.userId
  && !assignment.staffMemberId
);

const isOpenParentStaffScheduleSeries = (assignment: StaffScheduleAssignment): boolean => (
  isOpenParentStaffScheduleAssignment(assignment)
  && staffAssignmentCanDeleteFollowing(assignment)
);

const minutesFromCalendarDate = (date: Date): number => date.getHours() * 60 + date.getMinutes();

const childStaffAssignmentTouchesDeleteScope = (
  assignment: StaffScheduleAssignment,
  occurrenceStart: Date,
): boolean => {
  const timeSlot = assignment.timeSlot ?? null;
  if (timeSlot?.repeating) {
    const scheduleEnd = toValidDate(timeSlot.endDate);
    return !scheduleEnd || endOfDay(scheduleEnd).getTime() >= occurrenceStart.getTime();
  }
  const range = getStaffAssignmentPrimaryRange(assignment);
  if (!range) {
    return false;
  }
  return range.end.getTime() > occurrenceStart.getTime();
};

const buildChildStaffAssignmentClippedToParentResize = ({
  assignment,
  parentStartMinutes,
  parentEndMinutes,
  shrinkStart,
  shrinkEnd,
}: {
  assignment: StaffScheduleAssignment;
  parentStartMinutes: number;
  parentEndMinutes: number;
  shrinkStart: boolean;
  shrinkEnd: boolean;
}): ManagerStaffAssignmentPendingOverride | null => {
  const range = getStaffAssignmentPrimaryRange(assignment);
  if (!range) {
    return null;
  }

  const targetDay = startOfDay(range.start);
  let nextStart = range.start;
  let nextEnd = range.end;
  if (shrinkStart) {
    const parentStart = dateWithMinutes(targetDay, parentStartMinutes);
    if (nextStart.getTime() < parentStart.getTime()) {
      nextStart = parentStart;
    }
  }
  if (shrinkEnd) {
    const parentEnd = dateWithMinutes(targetDay, parentEndMinutes);
    if (nextEnd.getTime() > parentEnd.getTime()) {
      nextEnd = parentEnd;
    }
  }

  if (nextEnd.getTime() <= nextStart.getTime()) {
    return {
      action: 'unassign',
      assignmentId: assignment.id,
    };
  }
  if (nextStart.getTime() === range.start.getTime() && nextEnd.getTime() === range.end.getTime()) {
    return null;
  }

  const nextAssignment = buildStaffAssignmentWithCalendarRange(assignment, nextStart, nextEnd, {
    preserveRepeatingPattern: Boolean(assignment.timeSlot?.repeating),
  });
  return nextAssignment ? {
    action: 'update',
    assignment: nextAssignment,
  } : null;
};

const buildOpenParentStaffSeriesResizeOverrides = ({
  assignment,
  children,
  originalStart,
  originalEnd,
  nextStart,
  nextEnd,
}: {
  assignment: StaffScheduleAssignment;
  children: StaffScheduleAssignment[];
  originalStart: Date;
  originalEnd: Date;
  nextStart: Date;
  nextEnd: Date;
}): Array<{ assignmentId: string; override: ManagerStaffAssignmentPendingOverride }> | null => {
  const parentAssignment = buildStaffAssignmentWithCalendarRange(assignment, nextStart, nextEnd, {
    preserveRepeatingPattern: true,
  });
  if (!parentAssignment) {
    return null;
  }

  const originalStartMinutes = minutesFromCalendarDate(originalStart);
  const originalEndMinutes = minutesFromCalendarDate(originalEnd);
  const nextStartMinutes = minutesFromCalendarDate(nextStart);
  const nextEndMinutes = minutesFromCalendarDate(nextEnd);
  const shrinkStart = nextStartMinutes > originalStartMinutes;
  const shrinkEnd = nextEndMinutes < originalEndMinutes;
  const childOverrides = shrinkStart || shrinkEnd
    ? children.flatMap((child) => {
        const override = buildChildStaffAssignmentClippedToParentResize({
          assignment: child,
          parentStartMinutes: nextStartMinutes,
          parentEndMinutes: nextEndMinutes,
          shrinkStart,
          shrinkEnd,
        });
        return override ? [{ assignmentId: child.id, override }] : [];
      })
    : [];

  return [
    ...childOverrides,
    {
      assignmentId: assignment.id,
      override: {
        action: 'update',
        assignment: parentAssignment,
      },
    },
  ];
};

const getPreviousStaffAssignmentOccurrenceRange = (
  assignment: StaffScheduleAssignment,
  beforeStart: Date,
): PublicRentalInterval | null => {
  const timeSlot = assignment.timeSlot ?? null;
  if (!timeSlot?.repeating) {
    return null;
  }
  const scheduleStart = toValidDate(timeSlot.startDate);
  if (!scheduleStart) {
    return null;
  }
  const scheduleEnd = toValidDate(timeSlot.endDate);
  const days = Array.isArray(timeSlot.daysOfWeek) && timeSlot.daysOfWeek.length
    ? timeSlot.daysOfWeek
    : [mondayDayOf(scheduleStart)];
  const startMinutes = typeof timeSlot.startTimeMinutes === 'number'
    ? timeSlot.startTimeMinutes
    : scheduleStart.getHours() * 60 + scheduleStart.getMinutes();
  const endMinutes = typeof timeSlot.endTimeMinutes === 'number'
    ? timeSlot.endTimeMinutes
    : startMinutes + Math.max(30, assignment.plannedMinutes ?? 60);
  if (endMinutes <= startMinutes) {
    return null;
  }

  let cursor = startOfDay(beforeStart);
  const scheduleStartDay = startOfDay(scheduleStart);
  for (let attempts = 0; cursor.getTime() >= scheduleStartDay.getTime() && attempts < 3660; attempts += 1) {
    if (
      days.includes(mondayDayOf(cursor))
      && (!scheduleEnd || cursor.getTime() <= endOfDay(scheduleEnd).getTime())
    ) {
      const start = dateWithMinutes(cursor, startMinutes);
      const end = dateWithMinutes(cursor, endMinutes);
      if (start.getTime() < beforeStart.getTime() && end.getTime() > start.getTime()) {
        return { start, end };
      }
    }
    const previous = new Date(cursor.getTime());
    previous.setDate(previous.getDate() - 1);
    cursor = previous;
  }
  return null;
};

const buildStaffAssignmentEndingAfterOccurrence = (
  assignment: StaffScheduleAssignment,
  occurrence: PublicRentalInterval,
): StaffScheduleAssignment | null => {
  const timeSlot = assignment.timeSlot ?? null;
  if (!timeSlot?.repeating) {
    return null;
  }
  return {
    ...assignment,
    timeSlot: {
      ...timeSlot,
      endDate: endOfDay(occurrence.start).toISOString(),
    },
    plannedEnd: occurrence.end.toISOString(),
  };
};

const formatStaffAssignmentDeleteChildLabel = (assignment: StaffScheduleAssignment): string => {
  const range = getStaffAssignmentPrimaryRange(assignment);
  const name = assignment.userName || 'Assigned coverage';
  const resource = assignment.fieldName ? ` • ${assignment.fieldName}` : '';
  const time = range ? ` • ${formatDisplayDateTime(range.start)} - ${formatDisplayTime(range.end)}` : '';
  return `${name}${resource}${time}`;
};

const buildStaffScheduleCalendarItems = ({
  assignments,
  fields,
  facilities,
  range,
}: {
  assignments: StaffScheduleAssignment[];
  fields: Field[];
  facilities: Facility[];
  range: { start: Date; end: Date };
}): FacilityCalendarFeedItem[] => {
  const fieldsById = new Map(fields.map((field) => [field.$id, field]));
  const facilitiesById = new Map(facilities.map((facility) => [facility.$id, facility]));

  const expandAssignment = (assignment: StaffScheduleAssignment): FacilityCalendarFeedItem[] => {
    const field = assignment.fieldId ? fieldsById.get(assignment.fieldId) ?? null : null;
    if (!field) {
      return [];
    }
    const timeSlot = assignment.timeSlot ?? null;
    const assignmentType: FacilityCalendarFeedItemType = assignment.assignmentKind === 'OFFICIAL_SHIFT'
      ? 'official_assignment'
      : 'staff_assignment';
    const facilityId = assignment.facilityId ?? getFieldFacilityId(field);
    const facility = facilityId ? facilitiesById.get(facilityId) ?? null : null;
    const facilityName = assignment.facilityName
      ?? facility?.name
      ?? getFieldFacility(field)?.name
      ?? 'Unassigned facility';
    const fieldName = assignment.fieldName ?? getFacilityScopedFieldDisplayName(field);
    const title = assignment.userName
      || (assignmentType === 'official_assignment' ? 'Open official shift' : 'Open staff shift');
    const assignmentItems: FacilityCalendarFeedItem[] = [];

    const pushItem = (start: Date, end: Date) => {
      if (end.getTime() <= start.getTime() || !compareRanges(start, end, range.start, range.end)) {
        return;
      }
      assignmentItems.push({
        id: `facility-calendar-staff-schedule-${assignment.id}-${field.$id}-${start.getTime()}`,
        type: assignmentType,
        title,
        start,
        end,
        facilityId: facilityId ?? null,
        facilityName,
        fieldId: field.$id,
        fieldName,
        sourceId: assignment.id,
        parentId: assignment.parentAssignmentId ?? null,
        userId: assignment.userId ?? null,
        staffMemberId: assignment.staffMemberId ?? null,
        status: assignment.status ?? null,
        source: assignment,
      });
    };

    if (!timeSlot?.repeating) {
      const start = toValidDate(assignment.plannedStart) ?? toValidDate(timeSlot?.startDate);
      const end = toValidDate(assignment.plannedEnd) ?? toValidDate(timeSlot?.endDate);
      if (start && end) {
        pushItem(start, end);
      }
      return assignmentItems;
    }

    const scheduleStart = toValidDate(timeSlot.startDate);
    if (!scheduleStart) {
      return assignmentItems;
    }
    const scheduleEnd = toValidDate(timeSlot.endDate);
    const days = Array.isArray(timeSlot.daysOfWeek) && timeSlot.daysOfWeek.length
      ? timeSlot.daysOfWeek
      : [mondayDayOf(scheduleStart)];
    const startMinutes = typeof timeSlot.startTimeMinutes === 'number'
      ? timeSlot.startTimeMinutes
      : scheduleStart.getHours() * 60 + scheduleStart.getMinutes();
    const endMinutes = typeof timeSlot.endTimeMinutes === 'number'
      ? timeSlot.endTimeMinutes
      : startMinutes + Math.max(30, assignment.plannedMinutes ?? 60);

    let cursor = startOfDay(range.start);
    while (cursor.getTime() <= range.end.getTime()) {
      const cursorDay = mondayDayOf(cursor);
      if (
        days.includes(cursorDay)
        && cursor.getTime() >= startOfDay(scheduleStart).getTime()
        && (!scheduleEnd || cursor.getTime() <= endOfDay(scheduleEnd).getTime())
      ) {
        pushItem(dateWithMinutes(cursor, startMinutes), dateWithMinutes(cursor, endMinutes));
      }
      const next = new Date(cursor.getTime());
      next.setDate(next.getDate() + 1);
      cursor = next;
    }

    return assignmentItems;
  };

  const childItems = assignments
    .filter((assignment) => Boolean(assignment.parentAssignmentId))
    .flatMap((assignment) => expandAssignment(assignment));
  const coverageByParentId = childItems.reduce((acc, item) => {
    if (!item.parentId) {
      return acc;
    }
    const existing = acc.get(item.parentId) ?? [];
    existing.push({
      fieldId: item.fieldId,
      start: item.start,
      end: item.end,
    });
    acc.set(item.parentId, existing);
    return acc;
  }, new Map<string, Array<{ fieldId: string | null; start: Date; end: Date }>>());

  const parentItems = assignments
    .filter((assignment) => !assignment.parentAssignmentId)
    .flatMap((assignment) => {
      const coveredRanges = coverageByParentId.get(assignment.id) ?? [];
      return expandAssignment(assignment).flatMap((item) => {
        const relevantCoveredRanges = coveredRanges
          .filter((covered) => (
            covered.fieldId === item.fieldId
            && compareRanges(covered.start, covered.end, item.start, item.end)
          ))
          .map((covered) => ({ start: covered.start, end: covered.end }));
        if (!relevantCoveredRanges.length) {
          return [item];
        }
        return subtractIntervals(item, relevantCoveredRanges).map((gap) => ({
          ...item,
          id: `${item.id}-open-gap-${gap.start.getTime()}-${gap.end.getTime()}`,
          start: gap.start,
          end: gap.end,
        }));
      });
    });

  return [...parentItems, ...childItems];
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

const buildManagerCalendarDraftOccurrences = (
  draft: ManagerCalendarDraft,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ start: Date; end: Date }> => {
  const start = new Date(draft.start);
  const end = new Date(draft.end);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || end.getTime() <= start.getTime()
  ) {
    return [];
  }

  const rentalOptions = draft.mode === 'rental' ? draft.rental : null;
  const staffOptions = draft.mode !== 'rental' ? draft.staff : null;
  const repeating = draft.mode === 'rental'
    ? Boolean(rentalOptions?.repeating)
    : Boolean(staffOptions?.repeating);

  if (!repeating) {
    return compareRanges(start, end, rangeStart, rangeEnd) ? [{ start, end }] : [];
  }

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const fallbackEndMinutes = end.getHours() * 60 + end.getMinutes();
  const endMinutes = draft.mode === 'rental' && typeof rentalOptions?.endTimeMinutes === 'number'
    ? rentalOptions.endTimeMinutes
    : fallbackEndMinutes;
  const effectiveStartMinutes = draft.mode === 'rental' && typeof rentalOptions?.startTimeMinutes === 'number'
    ? rentalOptions.startTimeMinutes
    : startMinutes;
  if (endMinutes <= effectiveStartMinutes) {
    return [];
  }

  const fallbackDay = mondayDayOf(start);
  const repeatDays = draft.mode === 'rental'
    ? normalizeDaysOfWeek(rentalOptions?.daysOfWeek, rentalOptions?.dayOfWeek ?? fallbackDay)
    : normalizeDaysOfWeek(staffOptions?.daysOfWeek, fallbackDay);
  if (!repeatDays.length) {
    return [];
  }

  const repeatEndDate = draft.mode === 'rental'
    ? toValidDate(rentalOptions?.endDate)
    : toValidDate(staffOptions?.repeatEndDate);
  const scheduleStartDay = startOfDay(start);
  const scheduleEndDay = repeatEndDate ? endOfDay(repeatEndDate) : endOfDay(rangeEnd);
  const cursorStartMs = Math.max(startOfDay(rangeStart).getTime(), scheduleStartDay.getTime());
  const cursorEndMs = Math.min(endOfDay(rangeEnd).getTime(), scheduleEndDay.getTime());
  if (cursorEndMs < cursorStartMs) {
    return [];
  }

  const occurrences: Array<{ start: Date; end: Date }> = [];
  let cursor = startOfDay(new Date(cursorStartMs));
  const cursorEnd = new Date(cursorEndMs);
  while (cursor.getTime() <= cursorEnd.getTime()) {
    if (repeatDays.includes(mondayDayOf(cursor))) {
      const occurrenceStart = dateWithMinutes(cursor, effectiveStartMinutes);
      const occurrenceEnd = dateWithMinutes(cursor, endMinutes);
      if (
        occurrenceEnd.getTime() > occurrenceStart.getTime()
        && compareRanges(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)
      ) {
        occurrences.push({ start: occurrenceStart, end: occurrenceEnd });
      }
    }
    const next = new Date(cursor.getTime());
    next.setDate(next.getDate() + 1);
    cursor = next;
  }

  return occurrences;
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

const getRentalSlotPendingUpdateKey = (fieldId: string, slotId: string) => `${fieldId}:${slotId}`;

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

const mergeFieldPreservingCalendarHydration = (
  currentField: Field | undefined,
  nextField: Field,
): Field => {
  if (!currentField) {
    return nextField;
  }

  return {
    ...currentField,
    ...nextField,
    events: Array.isArray(nextField.events) ? nextField.events : currentField.events,
    matches: Array.isArray(nextField.matches) ? nextField.matches : currentField.matches,
  };
};

const mergeOrganizationPreservingFieldCalendarHydration = (
  currentOrganization: Organization | null,
  nextOrganization: Organization,
): Organization => {
  if (!currentOrganization?.fields?.length || !Array.isArray(nextOrganization.fields)) {
    return nextOrganization;
  }

  const currentFieldsById = new Map(currentOrganization.fields.map((field) => [field.$id, field]));
  return {
    ...nextOrganization,
    fields: nextOrganization.fields.map((field) => (
      mergeFieldPreservingCalendarHydration(currentFieldsById.get(field.$id), field)
    )),
  };
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
  showBackButton?: boolean;
  primaryActionLabel?: string;
  canManageFields?: boolean;
  onRentalSelectionReady?: (payload: RentalSelectionCheckoutPayload) => void;
};

export default function FieldsTabContent({
  organization,
  organizationId,
  currentUser,
  backHref = '/discover',
  backLabel = 'Back to Discover',
  showBackButton = true,
  primaryActionLabel = 'Reserve resources',
  canManageFields = false,
  onRentalSelectionReady,
}: FieldsTabContentProps) {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(organization ?? null);
  const [orgLoading, setOrgLoading] = useState(!organization);
  const [orgError, setOrgError] = useState<string | null>(null);
  const organizationHasStripeAccount = canOrganizationUsePaidBilling(org);
  const canManage = Boolean(canManageFields || (currentUser && org && currentUser.$id === org.ownerId));

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
  const [facilitySummaryOpen, setFacilitySummaryOpen] = useState(false);
  const managerCreateDragModeRef = useRef<ManagerCalendarSelectionMode | null>(null);
  const managerCreateDragSourceRef = useRef<'pointer' | null>(null);
  const managerCreateLastPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const [managerCreateDragMode, setManagerCreateDragMode] = useState<ManagerCalendarSelectionMode | null>(null);
  const [managerCreateDragSource, setManagerCreateDragSource] = useState<'pointer' | null>(null);
  const [managerCreateDragPreviewPoint, setManagerCreateDragPreviewPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const managerCreateDropResolverRef = useRef<((clientX: number, clientY: number) => SelectionState | null) | null>(null);
  const managerCreateDraftAdderRef = useRef<((mode: ManagerCalendarSelectionMode, nextSelection: SelectionState) => void) | null>(null);
  const [managerCalendarEditMode, setManagerCalendarEditMode] = useState(false);
  const [managerCalendarDrafts, setManagerCalendarDrafts] = useState<ManagerCalendarDraft[]>([]);
  const [managerCalendarPendingChanges, setManagerCalendarPendingChanges] = useState<ManagerCalendarPendingChange[]>([]);
  const [managerRentalSlotUpdates, setManagerRentalSlotUpdates] = useState<Record<string, ManagerRentalSlotPendingUpdate>>({});
  const [managerStaffAssignmentOverrides, setManagerStaffAssignmentOverrides] = useState<Record<string, ManagerStaffAssignmentPendingOverride>>({});
  const [managerCalendarDraftsSaving, setManagerCalendarDraftsSaving] = useState(false);
  const managerDraftDragRef = useRef<ManagerDraftDragState | null>(null);
  const managerDraftSuppressNextClickRef = useRef(false);
  const openManagerCalendarDraftEditorRef = useRef<((draftId: string) => void) | null>(null);
  const [managerDraftDragId, setManagerDraftDragId] = useState<string | null>(null);
  const [selectedManagerDraftId, setSelectedManagerDraftId] = useState<string | null>(null);
  const [editingManagerDraftId, setEditingManagerDraftId] = useState<string | null>(null);
  const [calendarLayerFilters, setCalendarLayerFilters] = useState<CalendarLayerType[]>(CALENDAR_LAYER_ORDER);
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [facilityFormName, setFacilityFormName] = useState('');
  const [facilityFormLocation, setFacilityFormLocation] = useState('');
  const [facilityFormAddress, setFacilityFormAddress] = useState('');
  const [facilityFormCoordinates, setFacilityFormCoordinates] = useState<{ lat: number; lng: number }>(EMPTY_FACILITY_COORDINATES);
  const [facilityLocationSelected, setFacilityLocationSelected] = useState(false);
  const [facilityWeeklyHours, setFacilityWeeklyHours] = useState<FacilityWeeklyHoursFormRow[]>(() => buildDefaultFacilityWeeklyHours());
  const [facilityResourceIds, setFacilityResourceIds] = useState<string[]>([]);
  const [facilityResourcesOpen, setFacilityResourcesOpen] = useState(false);
  const [facilityFormError, setFacilityFormError] = useState<string | null>(null);
  const [facilitySubmitting, setFacilitySubmitting] = useState(false);
  const [selectedFacilityFilterValue, setSelectedFacilityFilterValue] = useState<string>(ALL_FACILITIES_FILTER_VALUE);
  const [newResourceFacilityId, setNewResourceFacilityId] = useState<string | null>(null);
  const [selectionConflictStateByKey, setSelectionConflictStateByKey] = useState<Record<string, RentalSelectionConflictState>>({});
  const selectionConflictStateRef = useRef<Record<string, RentalSelectionConflictState>>({});
  const [staffScheduleAssignments, setStaffScheduleAssignments] = useState<StaffScheduleAssignment[]>([]);
  const [staffScheduleMembers, setStaffScheduleMembers] = useState<StaffScheduleStaffMember[]>([]);
  const [staffScheduleLoaded, setStaffScheduleLoaded] = useState(false);
  const [staffScheduleLoading, setStaffScheduleLoading] = useState(false);
  const [staffTimeslotModalOpen, setStaffTimeslotModalOpen] = useState(false);
  const [staffTimeslotParentAssignment, setStaffTimeslotParentAssignment] = useState<StaffScheduleAssignment | null>(null);
  const [editingStaffAssignment, setEditingStaffAssignment] = useState<StaffScheduleAssignment | null>(null);
  const [staffTimeslotMode, setStaffTimeslotMode] = useState<Exclude<ManagerCalendarSelectionMode, 'rental'>>('staff_assignment');
  const [staffTimeslotUserId, setStaffTimeslotUserId] = useState<string | null>(null);
  const [staffTimeslotOverrideAmount, setStaffTimeslotOverrideAmount] = useState<string | number>('');
  const [staffTimeslotNotes, setStaffTimeslotNotes] = useState('');
  const [staffTimeslotRepeating, setStaffTimeslotRepeating] = useState(false);
  const [staffTimeslotRepeatDays, setStaffTimeslotRepeatDays] = useState<number[]>([]);
  const [staffTimeslotRepeatEndDate, setStaffTimeslotRepeatEndDate] = useState<Date | null>(null);
  const [staffTimeslotError, setStaffTimeslotError] = useState<string | null>(null);
  const [staffTimeslotSubmitting, setStaffTimeslotSubmitting] = useState(false);
  const [staffTimeslotDeleting, setStaffTimeslotDeleting] = useState(false);
  const [openStaffDeleteConfirmation, setOpenStaffDeleteConfirmation] = useState<OpenStaffDeleteConfirmationState | null>(null);
  const [staffAssignmentScopePrompt, setStaffAssignmentScopePrompt] = useState<StaffAssignmentScopePromptState | null>(null);
  const openStaffAssignmentEditModalRef = useRef<((item: FacilityCalendarFeedItem, start: Date, end: Date) => void) | null>(null);
  const suppressStaffAssignmentActivationUntilRef = useRef(0);

  const suppressStaffAssignmentActivation = useCallback((durationMs = 600) => {
    suppressStaffAssignmentActivationUntilRef.current = Date.now() + durationMs;
  }, []);

  const isStaffAssignmentActivationSuppressed = useCallback(() => (
    Date.now() < suppressStaffAssignmentActivationUntilRef.current
  ), []);

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
  const facilities = useMemo(() => buildFacilityManagementList(org, fields), [fields, org]);
  const defaultFacilityId = useMemo(
    () => facilities.find((facility) => facility.isDefault)?.$id ?? facilities[0]?.$id ?? null,
    [facilities],
  );
  const unassignedFields = useMemo(
    () => fields.filter((field) => !getFieldFacilityId(field)),
    [fields],
  );
  const facilityOptions = useMemo(
    () => facilities.map((facility) => ({
      value: facility.$id,
      label: facility.name || 'Facility',
    })),
    [facilities],
  );
  const facilityFilterOptions = useMemo(() => [
    { value: ALL_FACILITIES_FILTER_VALUE, label: 'All facilities' },
    ...facilityOptions,
    ...(unassignedFields.length > 0
      ? [{ value: UNASSIGNED_FACILITY_FILTER_VALUE, label: 'Unassigned resources' }]
      : []),
  ], [facilityOptions, unassignedFields.length]);
  const publicFacilityFilterOptions = useMemo(() => {
    const options = [
      ...facilityOptions,
      ...(unassignedFields.length > 0
        ? [{ value: UNASSIGNED_FACILITY_FILTER_VALUE, label: 'Unassigned resources' }]
        : []),
    ];
    return options.length ? options : facilityFilterOptions;
  }, [facilityFilterOptions, facilityOptions, unassignedFields.length]);
  const facilityFilteredFields = useMemo(
    () => fields.filter((field) => fieldMatchesFacilityFilter(field, selectedFacilityFilterValue)),
    [fields, selectedFacilityFilterValue],
  );
  const facilityFilteredFieldIds = useMemo(
    () => facilityFilteredFields.map((field) => field.$id),
    [facilityFilteredFields],
  );
  const resourceCountByFacilityId = useMemo(() => {
    const counts = new Map<string, number>();
    fields.forEach((field) => {
      const facilityId = getFieldFacilityId(field);
      if (!facilityId) {
        return;
      }
      counts.set(facilityId, (counts.get(facilityId) ?? 0) + 1);
    });
    return counts;
  }, [fields]);
  const allFieldOptions = useMemo(() => fields.map((field) => ({
    value: field.$id,
    label: getFacilityScopedFieldDisplayName(field),
  })), [fields]);
  const fieldFilterItems = useMemo<FieldCalendarFilterItem[]>(() => facilityFilteredFields.map((field) => {
    const label = getFacilityScopedFieldDisplayName(field);
    const count = (field.events?.length ?? 0) + (field.matches?.length ?? 0) + (field.rentalSlots?.length ?? 0);
    return {
      id: field.$id,
      label,
      detail: getFieldResolvedLocation(field) || null,
      count,
      colorSeed: label || field.$id,
      colorMatchKey: field.$id,
    };
  }), [facilityFilteredFields]);
  const resourceAssignmentItems = useMemo<FieldCalendarFilterItem[]>(() => fields.map((field) => {
    const label = getFacilityScopedFieldDisplayName(field);
    const facilityId = getFieldFacilityId(field);
    const currentFacility = facilityId ? facilities.find((facility) => facility.$id === facilityId) : null;
    const resolvedLocation = getFieldResolvedLocation(field);
    return {
      id: field.$id,
      label,
      detail: currentFacility?.name
        ? `${currentFacility.name}${resolvedLocation ? ` - ${resolvedLocation}` : ''}`
        : resolvedLocation || (facilityId ? 'Assigned to another facility' : 'Unassigned'),
      colorSeed: label || field.$id,
      colorMatchKey: field.$id,
    };
  }), [facilities, fields]);
  const fieldColorReferenceList = useMemo(
    () => buildUniqueColorReferenceList(fields.map((field) => field.$id)),
    [fields],
  );
  const facilityFieldsByFilterValue = useMemo(() => {
    const byFilterValue = new Map<string, Field[]>();
    fields.forEach((field) => {
      const filterValue = getFieldFacilityFilterValue(field);
      const bucket = byFilterValue.get(filterValue) ?? [];
      bucket.push(field);
      byFilterValue.set(filterValue, bucket);
    });
    return byFilterValue;
  }, [fields]);

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

    const fallbackStart = getNextSelectableRentalStart();
    const fallbackEnd = new Date(fallbackStart.getTime() + MIN_SELECTION_MS);

    const firstListing = rentalListings[0];
    const firstRentalField = firstListing?.field ?? firstField;
    if (firstListing?.nextOccurrence && firstRentalField?.$id) {
      const start = new Date(firstListing.nextOccurrence.getTime());
      const endMinutes = typeof firstListing.slot.endTimeMinutes === 'number'
        ? firstListing.slot.endTimeMinutes
        : (firstListing.slot.startTimeMinutes ?? (start.getHours() * 60 + start.getMinutes() + 60));
      const end = minutesToDate(start, endMinutes);
      setRentalSelections([
        buildSelectionFromCalendarRange(start, end > start ? end : new Date(start.getTime() + MIN_SELECTION_MS), firstRentalField.$id),
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
    const hasSelectedOption = facilityFilterOptions.some((option) => option.value === selectedFacilityFilterValue);
    if (!hasSelectedOption) {
      setSelectedFacilityFilterValue(ALL_FACILITIES_FILTER_VALUE);
    }
  }, [facilityFilterOptions, selectedFacilityFilterValue]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    if (selectedFacilityFilterValue !== ALL_FACILITIES_FILTER_VALUE) {
      return;
    }
    const firstFacilityValue = publicFacilityFilterOptions.find((option) => option.value !== ALL_FACILITIES_FILTER_VALUE)?.value;
    if (firstFacilityValue) {
      setSelectedFacilityFilterValue(firstFacilityValue);
    }
  }, [canManage, publicFacilityFilterOptions, selectedFacilityFilterValue]);

  useEffect(() => {
    if (!canManage) {
      return;
    }
    setSelection((prev) => {
      if (!facilityFilteredFieldIds.length) {
        return null;
      }
      const validIds = normalizeFieldIds(prev?.fieldIds ?? []).filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
      if (prev && validIds.length) {
        return validIds.length === prev.fieldIds.length ? prev : { ...prev, fieldIds: validIds };
      }

      const start = prev?.start ? new Date(prev.start) : new Date();
      start.setMinutes(0, 0, 0);
      const end = prev?.end && prev.end.getTime() > start.getTime()
        ? new Date(prev.end)
        : new Date(start.getTime() + MIN_SELECTION_MS);
      return { fieldIds: [facilityFilteredFieldIds[0]], start, end };
    });
  }, [canManage, facilityFilteredFieldIds]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    setReadonlyVisibleFieldIds((prev) => {
      const validIds = prev.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
      if (validIds.length) {
        return validIds;
      }
      const preferredRentalFieldId = rentalListings.find((listing) => (
        facilityFilteredFieldIds.includes(listing.field.$id)
      ))?.field.$id;
      return preferredRentalFieldId ? [preferredRentalFieldId] : facilityFilteredFieldIds.slice(0, 1);
    });
  }, [canManage, facilityFilteredFieldIds, rentalListings]);

  const selectedFieldIds = useMemo(
    () => normalizeFieldIds(selection?.fieldIds ?? []),
    [selection?.fieldIds],
  );
  const selectedFields = useMemo(
    () => fields.filter((field) => selectedFieldIds.includes(field.$id)),
    [fields, selectedFieldIds],
  );
  const selectedField = selectedFields[0] ?? null;
  const loadStaffSchedule = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!organizationId || !canManage) {
      setStaffScheduleAssignments([]);
      setStaffScheduleMembers([]);
      setStaffScheduleLoaded(false);
      return null;
    }
    setStaffScheduleLoading(true);
    if (!options.silent) {
      setStaffTimeslotError(null);
    }
    try {
      const response = await apiRequest<StaffScheduleResponse>(`/api/organizations/${organizationId}/staff/schedule`);
      setStaffScheduleAssignments(Array.isArray(response.assignments) ? response.assignments : []);
      setStaffScheduleMembers(Array.isArray(response.staffMembers) ? response.staffMembers : []);
      setStaffScheduleLoaded(true);
      return response;
    } catch (error) {
      if (!options.silent) {
        setStaffTimeslotError(error instanceof Error ? error.message : 'Failed to load staff options.');
      }
      setStaffScheduleLoaded(true);
      return null;
    } finally {
      setStaffScheduleLoading(false);
    }
  }, [canManage, organizationId]);

  useEffect(() => {
    setStaffScheduleAssignments([]);
    setStaffScheduleMembers([]);
    setStaffScheduleLoaded(false);
  }, [organizationId]);

  useEffect(() => {
    if (
      canManage
      && !staffScheduleLoaded
      && (
        calendarLayerFilters.includes('staff_assignment')
        || calendarLayerFilters.includes('official_assignment')
      )
    ) {
      void loadStaffSchedule({ silent: true });
    }
  }, [calendarLayerFilters, canManage, loadStaffSchedule, staffScheduleLoaded]);

  const staffTimeslotAssignmentKind: StaffScheduleAssignmentKind = staffTimeslotMode === 'official_assignment'
    ? 'OFFICIAL_SHIFT'
    : 'STAFF_SHIFT';
  const isEditingManagerDraft = Boolean(editingManagerDraftId);
  const isEditingStaffAssignment = Boolean(editingStaffAssignment);
  const isEditingChildStaffAssignment = Boolean(editingStaffAssignment?.parentAssignmentId);
  const isAssigningStaffOccurrence = Boolean(staffTimeslotParentAssignment) && !isEditingStaffAssignment;
  const staffTimeslotUserOptions = useMemo(() => staffScheduleMembers
    .filter((staffMember) => (
      staffTimeslotAssignmentKind === 'OFFICIAL_SHIFT'
        ? Array.isArray(staffMember.types) && staffMember.types.includes('OFFICIAL')
        : true
    ))
    .map((staffMember) => ({
      value: staffMember.userId,
      label: `${staffMember.fullName}${staffMember.roleName ? ` - ${staffMember.roleName}` : ''}`,
    })), [staffScheduleMembers, staffTimeslotAssignmentKind]);

  useEffect(() => {
    setStaffTimeslotUserId((current) => (
      current && staffTimeslotUserOptions.some((option) => option.value === current)
        ? current
        : null
    ));
  }, [staffTimeslotUserOptions]);

  const getSelectionFacilityFilterValue = useCallback(
    (fieldIds: string[]): string => {
      const normalizedIds = normalizeFieldIds(fieldIds);
      const matchingFields = normalizedIds
        .map((fieldId) => fields.find((field) => field.$id === fieldId))
        .filter((field): field is Field => Boolean(field));
      if (!matchingFields.length) {
        return selectedFacilityFilterValue === ALL_FACILITIES_FILTER_VALUE
          ? publicFacilityFilterOptions.find((option) => option.value !== ALL_FACILITIES_FILTER_VALUE)?.value ?? ALL_FACILITIES_FILTER_VALUE
          : selectedFacilityFilterValue;
      }
      const facilityValues = Array.from(new Set(matchingFields.map((field) => getFieldFacilityFilterValue(field))));
      return facilityValues.length === 1 ? facilityValues[0] : ALL_FACILITIES_FILTER_VALUE;
    },
    [fields, publicFacilityFilterOptions, selectedFacilityFilterValue],
  );
  const readonlyCalendarFieldIds = useMemo(() => {
    if (canManage) {
      return [];
    }
    const validIds = readonlyVisibleFieldIds.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));
    return validIds.length ? validIds : facilityFilteredFieldIds;
  }, [canManage, facilityFilteredFieldIds, readonlyVisibleFieldIds]);
  const readonlyCalendarFields = useMemo(
    () => fields.filter((field) => readonlyCalendarFieldIds.includes(field.$id)),
    [fields, readonlyCalendarFieldIds],
  );
  const facilityCalendarFields = useMemo(
    () => (canManage ? selectedFields : readonlyCalendarFields),
    [canManage, readonlyCalendarFields, selectedFields],
  );
  const facilityCalendarFieldsWithPendingRentalUpdates = useMemo(() => {
    const pendingUpdates = Object.values(managerRentalSlotUpdates);
    if (!pendingUpdates.length) {
      return facilityCalendarFields;
    }
    return pendingUpdates.reduce<Field[]>((currentFields, update) => {
      if (update.action === 'delete') {
        return currentFields.map((field) => (
          field.$id === update.fieldId
            ? {
                ...field,
                rentalSlotIds: Array.isArray(field.rentalSlotIds)
                  ? field.rentalSlotIds.filter((slotId) => slotId !== update.slotId)
                  : field.rentalSlotIds,
                rentalSlots: Array.isArray(field.rentalSlots)
                  ? field.rentalSlots.filter((slot) => slot?.$id !== update.slotId)
                  : field.rentalSlots,
              }
            : field
        ));
      }
      const sourceSlot = currentFields
        .flatMap((field) => (Array.isArray(field.rentalSlots) ? field.rentalSlots : []))
        .find((slot) => slot?.$id === update.slotId) ?? ({ $id: update.slotId } as TimeSlot);
      return applyRentalSlotDragUpdateToFields(currentFields, sourceSlot, update.fieldId, update.slot);
    }, facilityCalendarFields);
  }, [facilityCalendarFields, managerRentalSlotUpdates]);
  const visibleStaffScheduleAssignments = useMemo(() => {
    const overrideEntries = Object.entries(managerStaffAssignmentOverrides);
    if (!overrideEntries.length) {
      return staffScheduleAssignments;
    }
    const parentDeleteIds = new Set(
      overrideEntries
        .filter(([, override]) => override.action === 'delete')
        .map(([assignmentId]) => assignmentId),
    );
    const createdAssignments = overrideEntries
      .flatMap(([, override]) => override.action === 'create' ? [override.assignment] : [])
      .filter((assignment) => (
        !assignment.parentAssignmentId || !parentDeleteIds.has(assignment.parentAssignmentId)
      ));
    const existingAssignments = staffScheduleAssignments
      .map((assignment) => {
        const override = managerStaffAssignmentOverrides[assignment.id];
        return override?.action === 'update' ? override.assignment : assignment;
      })
      .filter((assignment) => {
        const override = managerStaffAssignmentOverrides[assignment.id];
        if (override?.action === 'delete' || override?.action === 'unassign') {
          return false;
        }
        if (assignment.parentAssignmentId && parentDeleteIds.has(assignment.parentAssignmentId)) {
          return false;
        }
        return true;
      });
    return [...createdAssignments, ...existingAssignments];
  }, [managerStaffAssignmentOverrides, staffScheduleAssignments]);
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
  const getFieldIdsForFacilityFilter = useCallback(
    (filterValue: string) => fields
      .filter((field) => fieldMatchesFacilityFilter(field, filterValue))
      .map((field) => field.$id),
    [fields],
  );
  const getPreferredFieldIdsForFacilityFilter = useCallback(
    (filterValue: string): string[] => {
      const fieldIds = getFieldIdsForFacilityFilter(filterValue);
      const preferredRentalFieldId = rentalListings.find((listing) => (
        fieldIds.includes(listing.field.$id)
      ))?.field.$id;
      return preferredRentalFieldId ? [preferredRentalFieldId] : fieldIds.slice(0, 1);
    },
    [getFieldIdsForFacilityFilter, rentalListings],
  );
  const staffTimeslotResourceFacilityValue = useMemo(
    () => getSelectionFacilityFilterValue(selectedFieldIds),
    [getSelectionFacilityFilterValue, selectedFieldIds],
  );
  const staffTimeslotResourceFields = useMemo(
    () => fields.filter((field) => fieldMatchesFacilityFilter(field, staffTimeslotResourceFacilityValue)),
    [fields, staffTimeslotResourceFacilityValue],
  );
  const staffTimeslotResourceOptions = useMemo(() => staffTimeslotResourceFields.map((field) => ({
    value: field.$id,
    label: getFacilityScopedFieldDisplayName(field),
  })), [staffTimeslotResourceFields]);
  const handleStaffTimeslotFacilityChange = useCallback((value: string | null) => {
    const nextValue = value || ALL_FACILITIES_FILTER_VALUE;
    const nextFieldIds = getPreferredFieldIdsForFacilityFilter(nextValue);
    handleSelectedFieldIdsChange(isEditingStaffAssignment ? nextFieldIds.slice(0, 1) : nextFieldIds);
  }, [getPreferredFieldIdsForFacilityFilter, handleSelectedFieldIdsChange, isEditingStaffAssignment]);
  const handleStaffTimeslotResourceChange = useCallback((values: string[]) => {
    const nextFieldIds = normalizeFieldIds(values);
    if (isEditingStaffAssignment) {
      const addedFieldId = nextFieldIds.find((fieldId) => !selectedFieldIds.includes(fieldId));
      handleSelectedFieldIdsChange(addedFieldId ? [addedFieldId] : nextFieldIds.slice(0, 1));
      return;
    }
    handleSelectedFieldIdsChange(nextFieldIds);
  }, [handleSelectedFieldIdsChange, isEditingStaffAssignment, selectedFieldIds]);
  const handleFacilityFilterChange = useCallback((value: string | null) => {
    const nextValue = value || ALL_FACILITIES_FILTER_VALUE;
    const nextFieldIds = getFieldIdsForFacilityFilter(nextValue);
    setSelectedFacilityFilterValue(nextValue);

    if (canManage) {
      setSelection((prev) => {
        if (!nextFieldIds.length) {
          return null;
        }
        const start = prev?.start ? new Date(prev.start) : new Date();
        start.setMinutes(0, 0, 0);
        const end = prev?.end && prev.end.getTime() > start.getTime()
          ? new Date(prev.end)
          : new Date(start.getTime() + MIN_SELECTION_MS);
        return { fieldIds: nextFieldIds, start, end };
      });
      return;
    }

    const preferredNextFieldIds = getPreferredFieldIdsForFacilityFilter(nextValue);
    setReadonlyVisibleFieldIds(preferredNextFieldIds);
    setRentalSelections((current) => current.map((selectionItem) => {
      const validSelectionFieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds)
        .filter((fieldId) => nextFieldIds.includes(fieldId));
      return {
        ...selectionItem,
        scheduledFieldIds: validSelectionFieldIds.length ? validSelectionFieldIds : preferredNextFieldIds,
      };
    }));
  }, [
    canManage,
    getFieldIdsForFacilityFilter,
    getPreferredFieldIdsForFacilityFilter,
  ]);
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
      if (updated) {
        lastLoadedFieldEventsKeyRef.current = null;
        setOrg((prev) => mergeOrganizationPreservingFieldCalendarHydration(prev, updated));
      }
    } catch (error) {
      console.warn('Failed to refresh organization:', error);
    }
  }, [organizationId]);

  const openCreateFacility = useCallback(() => {
    setEditingFacility(null);
    setFacilityFormName('');
    setFacilityFormLocation('');
    setFacilityFormAddress('');
    setFacilityFormCoordinates(EMPTY_FACILITY_COORDINATES);
    setFacilityLocationSelected(false);
    setFacilityWeeklyHours(buildDefaultFacilityWeeklyHours());
    setFacilityResourceIds([]);
    setFacilityResourcesOpen(false);
    setFacilityFormError(null);
    setFacilityModalOpen(true);
  }, []);

  const openEditFacility = useCallback((facility: Facility) => {
    setEditingFacility(facility);
    setFacilityFormName(facility.name || '');
    setFacilityFormLocation(facility.location || facility.address || '');
    setFacilityFormAddress(facility.address || '');
    const nextCoordinates = facilityCoordinatesToInput(facility.coordinates);
    setFacilityFormCoordinates(nextCoordinates);
    setFacilityLocationSelected(Boolean((facility.location || facility.address || '').trim()) && hasFacilityCoordinates(nextCoordinates));
    setFacilityWeeklyHours(facilityOperatingHoursToFormRows(facility.operatingHours));
    setFacilityResourceIds(fields.filter((field) => getFieldFacilityId(field) === facility.$id).map((field) => field.$id));
    setFacilityResourcesOpen(false);
    setFacilityFormError(null);
    setFacilityModalOpen(true);
  }, [fields]);

  const handleSaveFacility = useCallback(async () => {
    if (!canManage || !organizationId) {
      return;
    }
    const name = facilityFormName.trim();
    if (!name) {
      setFacilityFormError('Facility name is required.');
      return;
    }
    const location = facilityFormLocation.trim();
    if (!location) {
      setFacilityFormError(FACILITY_LOCATION_REQUIRED_ERROR);
      return;
    }
    const coordinates = facilityCoordinatesFromInput(facilityFormCoordinates);
    if (!facilityLocationSelected || !coordinates) {
      setFacilityFormError(FACILITY_LOCATION_SELECTION_ERROR);
      return;
    }
    const { operatingHours, error: operatingHoursError } = buildOperatingHoursFromFormRows(facilityWeeklyHours);
    if (operatingHoursError) {
      setFacilityFormError(operatingHoursError);
      return;
    }

    try {
      setFacilitySubmitting(true);
      setFacilityFormError(null);
      const savedFacility = editingFacility
          ? await facilityService.updateFacility(editingFacility.$id, {
            name,
            location,
            address: facilityFormAddress.trim() || null,
            coordinates,
            operatingHours,
          })
        : await facilityService.createFacility({
            organizationId,
            name,
            location,
            address: facilityFormAddress.trim() || null,
            coordinates,
            operatingHours,
            isDefault: facilities.length === 0,
            sortOrder: facilities.length,
          });
      const selectedResourceIds = new Set(normalizeFieldIds(facilityResourceIds));
      const assignmentUpdates = fields.filter((field) => {
        const isCurrentlyAssigned = getFieldFacilityId(field) === savedFacility.$id;
        const shouldBeAssigned = selectedResourceIds.has(field.$id);
        return isCurrentlyAssigned !== shouldBeAssigned;
      });
      const updatedFields = await Promise.all(assignmentUpdates.map(async (field) => {
        const shouldBeAssigned = selectedResourceIds.has(field.$id);
        const updatedField = await fieldService.updateField({
          $id: field.$id,
          facilityId: shouldBeAssigned ? savedFacility.$id : null,
        });
        return shouldBeAssigned
          ? { ...updatedField, facilityId: savedFacility.$id, facility: savedFacility }
          : { ...updatedField, facilityId: null, facility: null };
      }));
      const updatedFieldById = new Map(updatedFields.map((field) => [field.$id, field]));
      setOrg((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          facilities: upsertFacility(prev.facilities, savedFacility),
          fields: (prev.fields ?? []).map((field) => (
            updatedFieldById.get(field.$id)
              ? mergeFieldPreservingCalendarHydration(field, updatedFieldById.get(field.$id) as Field)
              : (
                getFieldFacilityId(field) === savedFacility.$id
                  ? { ...field, facilityId: savedFacility.$id, facility: savedFacility }
                  : field
              )
          )),
        };
      });
      setSelectedFacilityFilterValue(savedFacility.$id);
      setFacilityModalOpen(false);
      setEditingFacility(null);
      setFacilityFormName('');
      setFacilityFormLocation('');
      setFacilityFormAddress('');
      setFacilityFormCoordinates(EMPTY_FACILITY_COORDINATES);
      setFacilityLocationSelected(false);
      setFacilityWeeklyHours(buildDefaultFacilityWeeklyHours());
      setFacilityResourceIds([]);
      setFacilityResourcesOpen(false);
      notifications.show({ color: 'green', message: editingFacility ? 'Facility updated.' : 'Facility created.' });
    } catch (error) {
      console.error('Failed to save facility:', error);
      setFacilityFormError('Facility could not be saved. Try again.');
    } finally {
      setFacilitySubmitting(false);
    }
  }, [
    canManage,
    editingFacility,
    facilities,
    facilityFormAddress,
    facilityFormCoordinates,
    facilityLocationSelected,
    facilityFormLocation,
    facilityFormName,
    facilityResourceIds,
    facilityWeeklyHours,
    fields,
    organizationId,
  ]);

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
    if (!fields.length) {
      return [];
    }

    const byId = new Map(fields.map((field) => [field.$id, field]));
    const rangeStart = new Date(calendarRange.start.getTime());
    rangeStart.setHours(0, 0, 0, 0);
	    const rangeEnd = new Date(calendarRange.end.getTime());
	    rangeEnd.setHours(23, 59, 59, 999);
	    const staffMemberByUserId = new Map(staffScheduleMembers.map((member) => [member.userId, member]));
	    const draftChildCoverageByParentId = managerCalendarDrafts.reduce(
	      (acc, draft) => {
	        const parentDraftId = draft.staff?.parentDraftId ?? null;
	        if (!parentDraftId) {
	          return acc;
	        }
	        const occurrences = buildManagerCalendarDraftOccurrences(draft, rangeStart, rangeEnd);
	        if (!occurrences.length) {
	          return acc;
	        }
	        normalizeFieldIds(draft.fieldIds).forEach((fieldId) => {
	          const existing = acc.get(parentDraftId) ?? [];
	          occurrences.forEach((occurrence) => {
	            existing.push({
	              fieldId,
	              start: occurrence.start,
	              end: occurrence.end,
	            });
	          });
	          acc.set(parentDraftId, existing);
	        });
	        return acc;
	      },
	      new Map<string, Array<{ fieldId: string; start: Date; end: Date }>>(),
	    );

	    const draftEvents: SelectionCalendarEntry[] = [];
	    if (canManage) {
	      const visibleFieldIdSet = new Set(selectedFieldIds);
	      managerCalendarDrafts.forEach((draft) => {
        const occurrences = buildManagerCalendarDraftOccurrences(draft, rangeStart, rangeEnd);
        if (!occurrences.length) {
          return;
        }
        normalizeFieldIds(draft.fieldIds).forEach((fieldId) => {
          if (!visibleFieldIdSet.has(fieldId)) {
            return;
          }
          const field = byId.get(fieldId);
          if (!field) {
            return;
          }
	          const assignedStaffName = draft.mode !== 'rental' && draft.staff?.userId
	            ? staffMemberByUserId.get(draft.staff.userId)?.fullName ?? draft.staff.userName ?? null
	            : null;
	          occurrences.forEach((occurrence) => {
	            const coveredRanges = draft.staff?.parentDraftId
	              ? []
	              : (draftChildCoverageByParentId.get(draft.id) ?? [])
	                .filter((covered) => (
	                  covered.fieldId === fieldId
	                  && compareRanges(covered.start, covered.end, occurrence.start, occurrence.end)
	                ))
	                .map((covered) => ({ start: covered.start, end: covered.end }));
	            const visibleRanges = coveredRanges.length
	              ? subtractIntervals(occurrence, coveredRanges)
	              : [occurrence];
	            visibleRanges.forEach((visibleRange) => {
	              draftEvents.push({
	                id: `manager-draft-${draft.id}-${fieldId}-${visibleRange.start.getTime()}`,
	                title: assignedStaffName ?? MANAGER_SELECTION_TITLES[draft.mode],
	                start: visibleRange.start,
	                end: visibleRange.end,
	                resourceId: fieldId,
	                resource: {
	                  type: 'selection',
	                  slotKey: draft.id,
	                  mode: draft.mode,
	                  userId: draft.mode !== 'rental' ? draft.staff?.userId ?? null : null,
	                },
	                metaType: 'selection',
	                selectionMode: draft.mode,
	                fieldName: getFacilityScopedFieldDisplayName(field),
	              });
	            });
	          });
	        });
	      });
      return draftEvents;
    }

    if (!rentalSelections.length) {
      return [];
    }

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
          fieldName: getFacilityScopedFieldDisplayName(field),
        });
      });
    });
    return draftEvents;
  }, [
    calendarRange.end,
    calendarRange.start,
    canManage,
    fields,
    managerCalendarDrafts,
    readonlyCalendarFieldIds,
    rentalSelections,
    selectedFieldIds,
    staffScheduleMembers,
  ]);

  const baseCalendarEvents = useMemo<FieldCalendarEntry[]>(() => {
    const sourceFields = facilityCalendarFieldsWithPendingRentalUpdates;
    if (!sourceFields.length) {
      return [];
    }
    const events = buildFieldCalendarEvents(sourceFields, calendarRange) as FieldCalendarEntry[];
    if (!canManage) {
      return buildPublicRentalCalendarEvents(events);
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
  }, [calendarRange, canManage, facilityCalendarFieldsWithPendingRentalUpdates]);

  const facilityCalendarFeed = useMemo(
    () => buildFacilityCalendarFeed(facilityCalendarFieldsWithPendingRentalUpdates, calendarRange),
    [calendarRange, facilityCalendarFieldsWithPendingRentalUpdates],
  );
  const facilityCalendarSummary = facilityCalendarFeed.summary;
  const staffScheduleCalendarItems = useMemo(
    () => buildStaffScheduleCalendarItems({
      assignments: visibleStaffScheduleAssignments,
      fields: facilityCalendarFieldsWithPendingRentalUpdates,
      facilities,
      range: calendarRange,
    }),
    [calendarRange, facilities, facilityCalendarFieldsWithPendingRentalUpdates, visibleStaffScheduleAssignments],
  );
  const facilityFeedCalendarEvents = useMemo<FacilityFeedCalendarEntry[]>(() => (
    [...facilityCalendarFeed.items, ...staffScheduleCalendarItems]
      .filter((item) => FACILITY_FEED_CALENDAR_TYPES.has(item.type))
      .map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end,
        resourceId: item.fieldId,
        resource: item,
        metaType: 'facility-feed' as const,
        feedType: item.type,
        fieldName: item.fieldName,
      }))
  ), [facilityCalendarFeed.items, staffScheduleCalendarItems]);
  const unfilteredCalendarEvents = useMemo<CalendarEventData[]>(
    () => [...baseCalendarEvents, ...facilityFeedCalendarEvents, ...selectionCalendarEvents],
    [baseCalendarEvents, facilityFeedCalendarEvents, selectionCalendarEvents],
  );
  const calendarLayerCounts = useMemo(() => {
    const counts = new Map<CalendarLayerType, number>();
    unfilteredCalendarEvents.forEach((event) => {
      const layer = getCalendarEventLayer(event);
      if (!layer) {
        return;
      }
      counts.set(layer, (counts.get(layer) ?? 0) + 1);
    });
    return counts;
  }, [unfilteredCalendarEvents]);
  const activeCalendarLayerSet = useMemo(
    () => new Set(calendarLayerFilters),
    [calendarLayerFilters],
  );
  const calendarEvents = useMemo<CalendarEventData[]>(() => {
    if (!canManage) {
      return unfilteredCalendarEvents;
    }
    return unfilteredCalendarEvents.filter((event) => {
      const layer = getCalendarEventLayer(event);
      return !layer || activeCalendarLayerSet.has(layer);
    });
  }, [activeCalendarLayerSet, canManage, unfilteredCalendarEvents]);
  const staffAssignmentCalendarEventById = useMemo(() => new Map(calendarEvents
    .filter((event) => (
      event.metaType === 'facility-feed'
      && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
    ))
    .map((event) => [event.id, event as FacilityFeedCalendarEntry])), [calendarEvents]);
  const allCalendarLayersSelected = CALENDAR_LAYER_ORDER.every((layer) => activeCalendarLayerSet.has(layer));
  const toggleCalendarLayer = useCallback((type: CalendarLayerType) => {
    setCalendarLayerFilters((current) => (
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    ));
  }, []);
  const facilityCalendarRangeLabel = useMemo(
    () => `${formatDisplayDate(calendarRange.start, { year: '2-digit' })} - ${formatDisplayDate(calendarRange.end, { year: '2-digit' })}`,
    [calendarRange.end, calendarRange.start],
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

  const handleCalendarShellStaffEventActivation = useCallback((event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    if (!canManage) {
      return;
    }
    if (isStaffAssignmentActivationSuppressed()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target as Element | null;
    if (
      managerCalendarEditMode
      && typeof target?.closest === 'function'
      && (
        target.closest('.shared-calendar-event__drag-handle')
        || target.closest('.rbc-addons-dnd-resize-ns-anchor')
        || target.closest('.rbc-addons-dnd-resize-ew-anchor')
      )
    ) {
      return;
    }
    const card = typeof target?.closest === 'function'
      ? target.closest('[data-staff-assignment-calendar-event-id]')
      : null;
    const draftCard = typeof target?.closest === 'function'
      ? target.closest('[data-manager-draft-id]')
      : null;
    const draftId = draftCard?.getAttribute('data-manager-draft-id') ?? '';
    if (draftId) {
      event.stopPropagation();
      openManagerCalendarDraftEditorRef.current?.(draftId);
      return;
    }
    const eventId = card?.getAttribute('data-staff-assignment-calendar-event-id') ?? '';
    if (!eventId) {
      return;
    }
    const calendarEvent = staffAssignmentCalendarEventById.get(eventId);
    const item = calendarEvent?.resource as FacilityCalendarFeedItem | undefined;
    if (!calendarEvent || !item) {
      return;
    }
    event.stopPropagation();
    openStaffAssignmentEditModalRef.current?.(item, calendarEvent.start, calendarEvent.end);
  }, [canManage, isStaffAssignmentActivationSuppressed, managerCalendarEditMode, staffAssignmentCalendarEventById]);

  const handleCalendarShellStaffPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canManage || !managerCalendarEditMode) {
      return;
    }
    const target = event.target as Element | null;
    if (
      typeof target?.closest === 'function'
      && (
        target.closest('.shared-calendar-event__drag-handle')
        || target.closest('.rbc-addons-dnd-resize-ns-anchor')
        || target.closest('.rbc-addons-dnd-resize-ew-anchor')
      )
    ) {
      suppressStaffAssignmentActivation(1200);
    }
  }, [canManage, managerCalendarEditMode, suppressStaffAssignmentActivation]);

  const eventPropGetter = useCallback(
    (event: CalendarEventData) => {
      const variant = getCalendarEventVariant(event);
      const isEditableManagerEvent = canManage
        && managerCalendarEditMode
        && (
          event.metaType === 'selection'
          || event.metaType === 'rental'
          || (
            event.metaType === 'facility-feed'
            && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
          )
        );
      const managerDraftId = event.metaType === 'selection' && typeof event.resource?.slotKey === 'string'
        ? event.resource.slotKey
        : null;
      const isStaffAssignmentEvent = canManage
        && event.metaType === 'facility-feed'
        && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
      const staffAssignment = isStaffAssignmentEvent
        ? ((event.resource as FacilityCalendarFeedItem | undefined)?.source as StaffScheduleAssignment | undefined)
        : undefined;
      const isOpenStaffSeriesEvent = Boolean(
        staffAssignment
        && isOpenParentStaffScheduleSeries(staffAssignment),
      );
      return {
        className: [
          'field-calendar-rbc-event',
          `field-calendar-rbc-event--${variant}`,
          isOpenStaffSeriesEvent ? 'field-calendar-rbc-event--open-staff-series' : '',
        ].filter(Boolean).join(' '),
        style: {
          backgroundColor: 'transparent',
          border: 0,
          color: 'inherit',
          padding: 0,
          cursor: isEditableManagerEvent
            ? 'grab'
            : isStaffAssignmentEvent
              ? 'pointer'
              : 'default',
        },
        onPointerUp: isStaffAssignmentEvent && !managerCalendarEditMode
          ? (pointerEvent: ReactPointerEvent<HTMLElement>) => {
              if (isStaffAssignmentActivationSuppressed()) {
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                return;
              }
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              const item = event.resource as FacilityCalendarFeedItem | undefined;
              if (item && event.start && event.end) {
                openStaffAssignmentEditModalRef.current?.(item, event.start, event.end);
              }
          }
        : undefined,
        ...(managerDraftId ? { 'data-manager-draft-id': managerDraftId } : {}),
      };
    },
    [canManage, isStaffAssignmentActivationSuppressed, managerCalendarEditMode],
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
      const isPastSlot = isPastRentalRangeStart(slotStart);
      if (!isPastSlot && !isBlockedRange(slotStart, slotEnd, normalizedResourceId)) {
        return {};
      }
      return {
        style: {
          backgroundColor: isPastSlot ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)',
          backgroundImage: isPastSlot
            ? 'repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.16) 0 6px, transparent 6px 12px)'
            : undefined,
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
    if (isPastRentalRangeStart(slotStart)) {
      return false;
    }
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
    return baseCalendarEvents.filter((event) => {
      if (event.metaType === 'rental') return false;
      return selectedFieldIds.includes(event.resourceId)
        && compareRanges(selectionStart, selectionEnd, event.start, event.end);
    });
  }, [baseCalendarEvents, selection, selectedFieldIds]);

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
        errors.push('Select at least one resource.');
      }
      if (!dateRange) {
        errors.push('Select a valid start and end date/time.');
      }
      if (dateRange && isPastRentalRangeStart(dateRange.start)) {
        errors.push('Rental selections must start in the future.');
      }

      if (!errors.length && dateRange) {
        const durationMinutes = Math.max(
          1,
          Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (60 * 1000)),
        );
        normalizedFieldIds.forEach((fieldId) => {
          const field = fieldsById.get(fieldId);
          if (!field) {
            errors.push(`Resource ${fieldId} is unavailable.`);
            return;
          }
          const matchedRentalSlot = (field.rentalSlots || []).find((slot) => rentalSlotCoversDraftDay(slot, {
            selectionStart: dateRange.start,
            selectionEnd: dateRange.end,
          }));
          if (!matchedRentalSlot) {
            errors.push(
              `${getFacilityScopedFieldDisplayName(field)} is unavailable for ${formatDisplayDateTime(dateRange.start)} - ${formatDisplayDateTime(dateRange.end)}.`,
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
        errors.push('Selection overlaps an existing event or match on at least one resource.');
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

  const canReserveRentalResources = useMemo(() => {
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
    return canReserveRentalResources ? 'teal' : 'red';
  }, [canManage, canReserveRentalResources, currentUser, existingConflicts.length, hasPendingConflictChecks, selectedFieldIds.length, selection]);

  const summaryText = useMemo(() => {
    if (canManage) {
      if (!selectedFieldIds.length || !selection) {
        return 'Select at least one resource to continue.';
      }
      const startLabel = formatDisplayDateTime(selection.start);
      const endLabel = formatDisplayTime(selection.end);
      const conflictSuffix = existingConflicts.length ? ' (overlaps an event or match on this date)' : '';
      const fieldsSuffix = selectedFieldIds.length > 1 ? ` across ${selectedFieldIds.length} resources` : '';
      return `Draft range: ${startLabel} – ${endLabel}${fieldsSuffix}${conflictSuffix}.`;
    }
    if (!currentUser) {
      return 'Sign in to reserve resources.';
    }
    if (!rentalSelections.length) {
      return 'Add at least one rental selection.';
    }
    if (hasPendingConflictChecks) {
      return 'Checking resource conflicts for your selections...';
    }
    if (!canReserveRentalResources) {
      return 'Resolve selection errors before reserving resources.';
    }
    return `${rentalSelections.length} selection${rentalSelections.length === 1 ? '' : 's'} ready • Total ${formatPrice(totalRentalCents)}`;
  }, [canManage, canReserveRentalResources, currentUser, existingConflicts.length, hasPendingConflictChecks, rentalSelections.length, selectedFieldIds.length, selection, totalRentalCents]);

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
      : facilityFilteredFields[0]?.$id ?? fields[0]?.$id;
    if (!fallbackFieldId) {
      notifications.show({ color: 'red', message: 'No resources available for rental selection.' });
      return;
    }

    const seedRange = seedSelection ? resolveSelectionDateRange(seedSelection) : null;
    const defaultStart = getNextSelectableRentalStart();
    const durationMs = seedRange
      ? Math.max(MIN_SELECTION_MS, seedRange.end.getTime() - seedRange.start.getTime())
      : MIN_SELECTION_MS;
    const nextStart = seedRange && seedRange.end.getTime() > defaultStart.getTime()
      ? new Date(seedRange.end.getTime())
      : defaultStart;
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    setRentalSelections((prev) => [buildSelectionFromCalendarRange(nextStart, nextEnd, fallbackFieldId), ...prev]);
  }, [facilityFilteredFields, fields, rentalSelections]);

  const handleRemoveRentalSelection = useCallback((selectionKey: string) => {
    setRentalSelections((prev) => prev.filter((selectionItem) => selectionItem.key !== selectionKey));
  }, []);

  const managerCalendarPendingChangeCount = managerCalendarPendingChanges.length;

	  const stageManagerCalendarDraftUpdate = useCallback((
	    draftId: string,
	    updater: (draft: ManagerCalendarDraft) => ManagerCalendarDraft,
	    label = 'Updated draft card',
	  ): ManagerCalendarDraft | null => {
    const previous = managerCalendarDrafts.find((draft) => draft.id === draftId) ?? null;
    if (!previous) {
      return null;
    }
    const next = updater({
      ...previous,
      fieldIds: normalizeFieldIds(previous.fieldIds),
      start: new Date(previous.start),
      end: new Date(previous.end),
    });
    const normalizedNext: ManagerCalendarDraft = {
      ...next,
      fieldIds: normalizeFieldIds(next.fieldIds),
      start: new Date(next.start),
      end: new Date(next.end),
    };
    if (managerCalendarDraftsAreEqual(previous, normalizedNext)) {
      return normalizedNext;
    }

    setManagerCalendarEditMode(true);
    setManagerCalendarDrafts((current) => current.map((draft) => (
      draft.id === draftId ? normalizedNext : draft
    )));
    setSelectedManagerDraftId(draftId);
    setSelection({
      fieldIds: normalizeFieldIds(normalizedNext.fieldIds),
      start: new Date(normalizedNext.start),
      end: new Date(normalizedNext.end),
    });
    setCalendarDate(new Date(normalizedNext.start));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'draft_update',
        label,
        draftId,
        previous,
        next: normalizedNext,
	      },
	    ]));
	    return normalizedNext;
	  }, [managerCalendarDrafts]);

	  const stageManagerCalendarDraftScope = useCallback((
	    draftId: string,
	    parentNext: ManagerCalendarDraft,
	    childDraft: ManagerCalendarDraft,
	    label = 'Assigned draft coverage occurrence',
	    previousDraftFallback: ManagerCalendarDraft | null = null,
	  ) => {
	    const previous = managerCalendarDrafts.find((draft) => draft.id === draftId) ?? previousDraftFallback;
	    if (!previous) {
	      return false;
	    }
	    const normalizedParentNext: ManagerCalendarDraft = {
	      ...parentNext,
	      fieldIds: normalizeFieldIds(parentNext.fieldIds),
	      start: new Date(parentNext.start),
	      end: new Date(parentNext.end),
	    };
	    const normalizedChildDraft: ManagerCalendarDraft = {
	      ...childDraft,
	      fieldIds: normalizeFieldIds(childDraft.fieldIds),
	      start: new Date(childDraft.start),
	      end: new Date(childDraft.end),
	    };
	    setManagerCalendarEditMode(true);
	    setManagerCalendarDrafts((current) => {
	      const hasParentDraft = current.some((draft) => draft.id === draftId);
	      const parentDrafts = hasParentDraft
	        ? current.map((draft) => (draft.id === draftId ? normalizedParentNext : draft))
	        : [...current, normalizedParentNext];
	      return [...parentDrafts, normalizedChildDraft];
	    });
	    setSelectedManagerDraftId(normalizedChildDraft.id);
	    setSelection({
	      fieldIds: normalizeFieldIds(normalizedChildDraft.fieldIds),
	      start: new Date(normalizedChildDraft.start),
	      end: new Date(normalizedChildDraft.end),
	    });
	    setCalendarDate(new Date(normalizedChildDraft.start));
	    setManagerCalendarPendingChanges((current) => ([
	      ...current,
	      {
	        id: createId(),
	        type: 'draft_scope',
	        label,
	        draftId,
	        previous,
	        parentNext: normalizedParentNext,
	        childDraft: normalizedChildDraft,
	      },
	    ]));
	    return true;
	  }, [managerCalendarDrafts]);

  const stageRentalSlotUpdate = useCallback((
    update: ManagerRentalSlotPendingUpdate,
    label = 'Moved rental slot',
  ) => {
    const previous = managerRentalSlotUpdates[update.key] ?? null;
    setManagerCalendarEditMode(true);
    setManagerRentalSlotUpdates((current) => ({
      ...current,
      [update.key]: update,
    }));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'rental_update',
        label,
        key: update.key,
        previous,
        next: update,
      },
    ]));
  }, [managerRentalSlotUpdates]);

  const stageStaffAssignmentOverride = useCallback((
    assignmentId: string,
    override: ManagerStaffAssignmentPendingOverride,
    label = 'Updated staff assignment',
  ) => {
    const previous = managerStaffAssignmentOverrides[assignmentId] ?? null;
    setManagerCalendarEditMode(true);
    setManagerStaffAssignmentOverrides((current) => ({
      ...current,
      [assignmentId]: override,
    }));
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'staff_override',
        label,
        assignmentId,
        previous,
        next: override,
      },
    ]));
  }, [managerStaffAssignmentOverrides]);

  const stageStaffAssignmentOverrideBatch = useCallback((
    updates: Array<{ assignmentId: string; override: ManagerStaffAssignmentPendingOverride }>,
    label = 'Updated staff assignments',
  ) => {
    const normalizedUpdates = new Map<string, ManagerStaffAssignmentPendingOverride>();
    updates.forEach((update) => {
      if (update.assignmentId) {
        normalizedUpdates.set(update.assignmentId, update.override);
      }
    });
    if (!normalizedUpdates.size) {
      return;
    }
    const changes = Array.from(normalizedUpdates.entries()).reduce<ManagerStaffAssignmentPendingOverrideBatch>(
      (acc, [assignmentId, override]) => {
        acc[assignmentId] = {
          previous: managerStaffAssignmentOverrides[assignmentId] ?? null,
          next: override,
        };
        return acc;
      },
      {},
    );
    setManagerCalendarEditMode(true);
    setManagerStaffAssignmentOverrides((current) => {
      const next = { ...current };
      Object.entries(changes).forEach(([assignmentId, change]) => {
        next[assignmentId] = change.next;
      });
      return next;
    });
    setManagerCalendarPendingChanges((current) => ([
      ...current,
      {
        id: createId(),
        type: 'staff_override_batch',
        label,
        changes,
      },
    ]));
  }, [managerStaffAssignmentOverrides]);

  const restorePendingStaffUnassignment = useCallback((assignmentId: string) => {
    const currentOverride = managerStaffAssignmentOverrides[assignmentId];
    if (currentOverride?.action !== 'unassign') {
      return false;
    }

    let replacementOverride: ManagerStaffAssignmentPendingOverride | null = null;
    let changeIdToRemove: string | null = null;
    for (let index = managerCalendarPendingChanges.length - 1; index >= 0; index -= 1) {
      const change = managerCalendarPendingChanges[index];
      if (change.type === 'staff_override' && change.assignmentId === assignmentId && change.next.action === 'unassign') {
        replacementOverride = change.previous;
        changeIdToRemove = change.id;
        break;
      }
      if (change.type === 'staff_override_batch') {
        const batchedChange = change.changes[assignmentId];
        if (batchedChange?.next.action === 'unassign') {
          replacementOverride = batchedChange.previous;
          changeIdToRemove = change.id;
          break;
        }
      }
    }

    setManagerStaffAssignmentOverrides((current) => {
      const next = { ...current };
      if (replacementOverride) {
        next[assignmentId] = replacementOverride;
      } else {
        delete next[assignmentId];
      }
      return next;
    });

    if (changeIdToRemove) {
      setManagerCalendarPendingChanges((current) => current.flatMap((change) => {
        if (change.id !== changeIdToRemove) {
          return [change];
        }
        if (change.type === 'staff_override') {
          return [];
        }
        if (change.type === 'staff_override_batch') {
          const nextChanges = { ...change.changes };
          delete nextChanges[assignmentId];
          return Object.keys(nextChanges).length ? [{ ...change, changes: nextChanges }] : [];
        }
        return [change];
      }));
    }

    return true;
  }, [managerCalendarPendingChanges, managerStaffAssignmentOverrides]);

  const undoLastManagerCalendarChange = useCallback(() => {
    const lastChange = managerCalendarPendingChanges[managerCalendarPendingChanges.length - 1];
    if (!lastChange) {
      return;
    }

    if (lastChange.type === 'create_draft') {
      setManagerCalendarDrafts((current) => current.filter((draft) => draft.id !== lastChange.draft.id));
      if (selectedManagerDraftId === lastChange.draft.id) {
        setSelectedManagerDraftId(null);
      }
      if (editingManagerDraftId === lastChange.draft.id) {
        setEditingManagerDraftId(null);
      }
	    } else if (lastChange.type === 'draft_update') {
	      setSelectedManagerDraftId(lastChange.draftId);
	      setManagerCalendarDrafts((current) => current.map((draft) => (
	        draft.id === lastChange.draftId ? lastChange.previous : draft
	      )));
      setSelection((current) => {
        if (current?.fieldIds?.some((fieldId) => lastChange.previous.fieldIds.includes(fieldId))) {
          return {
            fieldIds: normalizeFieldIds(lastChange.previous.fieldIds),
            start: new Date(lastChange.previous.start),
            end: new Date(lastChange.previous.end),
          };
        }
	        return current;
	      });
	    } else if (lastChange.type === 'draft_scope') {
	      setManagerCalendarDrafts((current) => current
	        .filter((draft) => draft.id !== lastChange.childDraft.id)
	        .map((draft) => (
	          draft.id === lastChange.draftId ? lastChange.previous : draft
	        )));
	      setSelectedManagerDraftId(lastChange.draftId);
	      if (editingManagerDraftId === lastChange.childDraft.id) {
	        setEditingManagerDraftId(null);
	      }
	      setSelection((current) => {
	        if (current?.fieldIds?.some((fieldId) => lastChange.previous.fieldIds.includes(fieldId))) {
	          return {
	            fieldIds: normalizeFieldIds(lastChange.previous.fieldIds),
	            start: new Date(lastChange.previous.start),
	            end: new Date(lastChange.previous.end),
	          };
	        }
	        return current;
	      });
	    } else if (lastChange.type === 'rental_update') {
	      setManagerRentalSlotUpdates((current) => {
	        const next = { ...current };
        if (lastChange.previous) {
          next[lastChange.key] = lastChange.previous;
        } else {
          delete next[lastChange.key];
        }
        return next;
      });
    } else if (lastChange.type === 'staff_override') {
      setManagerStaffAssignmentOverrides((current) => {
        const next = { ...current };
        if (lastChange.previous) {
          next[lastChange.assignmentId] = lastChange.previous;
        } else {
          delete next[lastChange.assignmentId];
        }
        return next;
      });
    } else if (lastChange.type === 'staff_override_batch') {
      setManagerStaffAssignmentOverrides((current) => {
        const next = { ...current };
        Object.entries(lastChange.changes).forEach(([assignmentId, change]) => {
          if (change.previous) {
            next[assignmentId] = change.previous;
          } else {
            delete next[assignmentId];
          }
        });
        return next;
      });
    }

    setManagerCalendarPendingChanges((current) => current.slice(0, -1));
  }, [editingManagerDraftId, managerCalendarPendingChanges, selectedManagerDraftId]);

  const clearManagerCalendarPendingState = useCallback(() => {
    setManagerCalendarDrafts([]);
    setManagerCalendarPendingChanges([]);
    setManagerRentalSlotUpdates({});
    setManagerStaffAssignmentOverrides({});
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
  }, []);

  const applySelectionWindow = useCallback(
    (start: Date, end: Date, params?: { slotKey?: string }) => {
      if (canManage) {
        const nextStart = new Date(start);
        const nextEnd = new Date(end);
        if (nextEnd.getTime() - nextStart.getTime() < MIN_SELECTION_MS) {
          nextEnd.setTime(nextStart.getTime() + MIN_SELECTION_MS);
        }
        if (params?.slotKey) {
          const matchingDraft = managerCalendarDrafts.find((draft) => draft.id === params.slotKey);
          stageManagerCalendarDraftUpdate(
            params.slotKey,
            (draft) => ({ ...draft, start: nextStart, end: nextEnd }),
            'Moved draft card',
          );
          setSelection((prev) => {
            return {
              fieldIds: matchingDraft?.fieldIds?.length ? normalizeFieldIds(matchingDraft.fieldIds) : normalizeFieldIds(prev?.fieldIds ?? []),
              start: nextStart,
              end: nextEnd,
            };
          });
        } else {
          setSelection((prev) => {
            if (!(prev?.fieldIds?.length)) return prev;
            return { ...prev, start: nextStart, end: nextEnd };
          });
        }
      } else if (params?.slotKey) {
        if (isPastRentalRangeStart(start)) {
          notifications.show({
            color: 'red',
            message: 'Rental selections must start in the future.',
          });
          return;
        }
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
            message: 'That time range is already booked on at least one selected resource.',
          });
          return;
        }
      }
      setCalendarDate(new Date(start));
    },
    [canManage, isBlockedRange, managerCalendarDrafts, stageManagerCalendarDraftUpdate],
  );

  const handleRentalSlotCalendarDrop = useCallback(
    ({ event, start, end, resourceId }: any) => {
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
        notifications.show({ color: 'red', message: 'Unable to resolve the rental slot resource.' });
        return;
      }

      const updatePayload = buildRentalSlotUpdateFromCalendarRange(slot, nextStart, nextEnd, ownerField.$id);
      if (!updatePayload) {
        notifications.show({ color: 'red', message: 'Unable to move this rental slot.' });
        return;
      }

      const pendingKey = getRentalSlotPendingUpdateKey(ownerField.$id, slot.$id);
      stageRentalSlotUpdate({
        key: pendingKey,
        action: 'update',
        fieldId: ownerField.$id,
        slotId: slot.$id,
        slot: updatePayload,
      });
      setCalendarDate(nextStart);
      notifications.show({ color: 'blue', message: 'Rental slot change staged.' });
    },
    [canManage, fields, selectedField, stageRentalSlotUpdate],
  );

  const handleStaffAssignmentCalendarDrop = useCallback(
    ({ event, start, end, resourceId }: any, label: string, interaction: 'move' | 'resize' = 'move') => {
      if (
        !canManage
        || !event
        || event.metaType !== 'facility-feed'
        || (event.feedType !== 'staff_assignment' && event.feedType !== 'official_assignment')
        || !start
        || !end
      ) {
        return;
      }

      suppressStaffAssignmentActivation(900);

      const item = event.resource as FacilityCalendarFeedItem | undefined;
      const assignment = item?.source as StaffScheduleAssignment | undefined;
      const nextStart = start instanceof Date ? start : new Date(start);
      const nextEnd = end instanceof Date ? end : new Date(end);
      if (!assignment?.id || Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
        return;
      }

      if (assignment.parentAssignmentId) {
        const parentAssignment = visibleStaffScheduleAssignments.find((candidate) => (
          candidate.id === assignment.parentAssignmentId
        ));
        const parentRange = parentAssignment
          ? getStaffAssignmentOccurrenceRangeForDate(parentAssignment, nextStart)
          : null;
        if (
          !parentRange
          || nextStart.getTime() < parentRange.start.getTime()
          || nextEnd.getTime() > parentRange.end.getTime()
        ) {
          notifications.show({
            color: 'yellow',
            message: 'Assigned coverage must stay inside the parent shift.',
          });
          return;
        }
      }

      const originalStart = item?.start instanceof Date
        ? item.start
        : toValidDate(event.start);
      const originalEnd = item?.end instanceof Date
        ? item.end
        : toValidDate(event.end);
      if (
        interaction === 'resize'
        && originalStart
        && originalEnd
        && isOpenParentStaffScheduleSeries(assignment)
      ) {
        const childAssignments = visibleStaffScheduleAssignments.filter((candidate) => (
          candidate.parentAssignmentId === assignment.id
          && Boolean(candidate.userId || candidate.staffMemberId)
        ));
        const overrides = buildOpenParentStaffSeriesResizeOverrides({
          assignment,
          children: childAssignments,
          originalStart,
          originalEnd,
          nextStart,
          nextEnd,
        });
        if (!overrides?.length) {
          notifications.show({ color: 'red', message: 'Unable to resize this staff assignment.' });
          return;
        }
        if (overrides.length === 1) {
          stageStaffAssignmentOverride(overrides[0].assignmentId, overrides[0].override, label);
        } else {
          stageStaffAssignmentOverrideBatch(overrides, label);
        }
        setCalendarDate(nextStart);
        notifications.show({
          color: 'blue',
          message: overrides.length > 1
            ? 'Staff assignment series changes staged.'
            : 'Staff assignment change staged.',
        });
        return;
      }

      const preserveRepeatingPattern = interaction === 'resize' && Boolean(assignment.timeSlot?.repeating);
      let nextAssignment = buildStaffAssignmentWithCalendarRange(assignment, nextStart, nextEnd, {
        preserveRepeatingPattern,
      });
      if (!nextAssignment) {
        notifications.show({ color: 'red', message: 'Unable to move this staff assignment.' });
        return;
      }

      const targetFieldId = typeof resourceId === 'string' && resourceId.trim().length > 0
        ? resourceId.trim()
        : typeof event.resourceId === 'string'
          ? event.resourceId.trim()
          : item?.fieldId ?? assignment.fieldId ?? null;
      if (!assignment.parentAssignmentId && targetFieldId && targetFieldId !== assignment.fieldId) {
        const targetField = fields.find((field) => field.$id === targetFieldId);
        if (targetField) {
          nextAssignment = {
            ...nextAssignment,
            fieldId: targetField.$id,
            fieldName: getFacilityScopedFieldDisplayName(targetField),
            facilityId: getFieldFacilityId(targetField),
            facilityName: getFieldFacility(targetField)?.name ?? nextAssignment.facilityName ?? null,
          };
        }
      }

      stageStaffAssignmentOverride(assignment.id, {
        action: 'update',
        assignment: nextAssignment,
      }, label);
      setCalendarDate(nextStart);
      notifications.show({ color: 'blue', message: 'Staff assignment change staged.' });
    },
    [canManage, fields, stageStaffAssignmentOverride, stageStaffAssignmentOverrideBatch, suppressStaffAssignmentActivation, visibleStaffScheduleAssignments],
  );

  const handleSlotSelect = useCallback(
    (slotInfo: any) => {
      if (!slotInfo?.start) return;
      const slotStart = new Date(slotInfo.start);
      const slotEndRaw = slotInfo?.end ? new Date(slotInfo.end) : new Date(slotStart.getTime() + MIN_SELECTION_MS);
      if (canManage) {
        return;
      }

      const slotEnd = slotEndRaw;
      if (isPastRentalRangeStart(slotStart)) {
        notifications.show({
          color: 'red',
          message: 'Rental selections must start in the future.',
        });
        return;
      }
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
          message: 'That time range is already booked for one of the selected resources.',
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
      if (!managerCalendarEditMode) {
        return;
      }
      if (event?.metaType === 'rental') {
        void handleRentalSlotCalendarDrop({ event, start, end, resourceId });
        return;
      }
      if (
        event?.metaType === 'facility-feed'
        && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
      ) {
        handleStaffAssignmentCalendarDrop({ event, start, end, resourceId }, 'Moved staff assignment');
        return;
      }
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      const slotKey = event.resource?.slotKey;
      applySelectionWindow(new Date(start), new Date(end), {
        slotKey: typeof slotKey === 'string' ? slotKey : undefined,
      });
    },
    [applySelectionWindow, handleRentalSlotCalendarDrop, handleStaffAssignmentCalendarDrop, managerCalendarEditMode],
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: any) => {
      if (!managerCalendarEditMode) {
        return;
      }
      if (event?.metaType === 'rental') {
        handleRentalSlotCalendarDrop({ event, start, end, resourceId: event.resourceId });
        return;
      }
      if (
        event?.metaType === 'facility-feed'
        && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
      ) {
        handleStaffAssignmentCalendarDrop({ event, start, end, resourceId: event.resourceId }, 'Resized staff assignment', 'resize');
        return;
      }
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      const slotKey = event.resource?.slotKey;
      applySelectionWindow(new Date(start), new Date(end), {
        slotKey: typeof slotKey === 'string' ? slotKey : undefined,
      });
    },
    [applySelectionWindow, handleRentalSlotCalendarDrop, handleStaffAssignmentCalendarDrop, managerCalendarEditMode],
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
    const base = [{ value: 'self', label: 'My personal account' }];
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

  const handleReserveResourcesClick = useCallback(() => {
    if (!currentUser) {
      notifications.show({ color: 'yellow', message: 'Sign in to reserve resources.' });
      return;
    }
    if (canManage) {
      return;
    }
    if (!canReserveRentalResources || !rentalSelectionValidations.length) {
      notifications.show({ color: 'red', message: 'Resolve rental selection issues before reserving resources.' });
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
    const primaryFacility = getFieldFacilityFromList(primaryField, facilities);
    const primaryFacilityLocation = primaryFacility?.location || primaryFacility?.address || null;
    const primaryFieldLocation = getFieldResolvedLocation(primaryField, primaryFacilityLocation ?? org?.location ?? '');
    const primaryCoordinates = getFieldCoordinatesWithFallback(primaryField, primaryFacility, org);
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
        getFacilityScopedFieldDisplayName(primaryField),
      );
      if (primaryFieldLocation) {
        params.set('rentalLocation', primaryFieldLocation);
      }
      if (primaryCoordinates) {
        params.set('rentalLng', String(primaryCoordinates[0]));
        params.set('rentalLat', String(primaryCoordinates[1]));
      }
      if (primaryFacility?.$id) {
        params.set('rentalFacilityId', primaryFacility.$id);
      }
      if (primaryFacility?.name) {
        params.set('rentalFacilityName', primaryFacility.name);
      }
      if (primaryFacilityLocation) {
        params.set('rentalFacilityLocation', primaryFacilityLocation);
      }
      if (primaryFacility?.address) {
        params.set('rentalFacilityAddress', primaryFacility.address);
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
        renterOrganizationId: hostSelection && hostSelection !== 'self' ? hostSelection : null,
        facilityId: primaryFacility?.$id ?? getFieldFacilityId(primaryField) ?? null,
        facilityName: primaryFacility?.name ?? null,
        facilityLocation: primaryFacilityLocation,
        facilityAddress: primaryFacility?.address ?? null,
        totalRentalCents: Math.round(totalRentalCents),
        rentalStart: earliestSelectionStart ? formatLocalDateTime(earliestSelectionStart) : '',
        rentalEnd: latestSelectionEnd ? formatLocalDateTime(latestSelectionEnd) : '',
        rentalSelections: serializedSelections,
        fieldIds: allFieldIds,
        primaryFieldId: primaryField?.$id ?? null,
        primaryFieldName: primaryField
          ? getFacilityScopedFieldDisplayName(primaryField)
          : null,
        location: primaryFieldLocation,
        coordinates: primaryCoordinates,
        requiredTemplateIds: rentalRequiredTemplateIds,
        hostRequiredTemplateIds: rentalHostRequiredTemplateIds,
      });
      return;
    }
    notifications.show({
      color: 'red',
      message: 'Rental checkout is not available on this page.',
    });
  }, [
    canReserveRentalResources,
    canManage,
    currentUser,
    fields,
    facilities,
    hostSelection,
    org?.$id,
    org?.coordinates,
    org?.location,
    org?.name,
    rentalHostRequiredTemplateIds,
    rentalRequiredTemplateIds,
    rentalSelectionValidations,
    totalRentalCents,
    onRentalSelectionReady,
  ]);

  const openRentalSlotModalForSelection = useCallback((
    draftSelection?: SelectionState | null,
    options: { draftId?: string | null } = {},
  ) => {
    if (!canManage) return;
    const activeSelection = draftSelection ?? selection;
    const activeFieldIds = normalizeFieldIds(activeSelection?.fieldIds ?? []);
    if (!activeFieldIds.length || !activeSelection) {
      notifications.show({ color: 'red', message: 'Select at least one resource and a time range first.' });
      return;
    }
    if (activeSelection.start.toDateString() !== activeSelection.end.toDateString()) {
      notifications.show({ color: 'red', message: 'Rental slots must stay within a single day. Adjust the selection.' });
      return;
    }

    setSelectedManagerDraftId(options.draftId ?? null);
    setEditingManagerDraftId(options.draftId ?? null);
    setEditingRentalSlot(null);
    setEditingRentalField(null);
    setRentalDraftRange({ start: activeSelection.start, end: activeSelection.end });
    setCreateRentalOpen(true);
  }, [canManage, selection]);

  const resetStaffTimeslotModalState = useCallback(() => {
    setStaffTimeslotModalOpen(false);
    setStaffTimeslotParentAssignment(null);
    setEditingStaffAssignment(null);
    setEditingManagerDraftId(null);
    setStaffTimeslotUserId(null);
    setStaffTimeslotOverrideAmount('');
    setStaffTimeslotNotes('');
    setStaffTimeslotRepeating(false);
    setStaffTimeslotRepeatDays([]);
    setStaffTimeslotRepeatEndDate(null);
    setStaffTimeslotError(null);
    setOpenStaffDeleteConfirmation(null);
    setStaffAssignmentScopePrompt(null);
  }, []);

  const openStaffTimeslotModal = useCallback((
    mode: Exclude<ManagerCalendarSelectionMode, 'rental'>,
    draftSelection?: SelectionState | null,
    options: { draftId?: string | null; draft?: ManagerCalendarDraft | null } = {},
  ) => {
    if (!canManage) {
      return;
    }
    const activeSelection = draftSelection ?? selection;
    const activeFieldIds = normalizeFieldIds(activeSelection?.fieldIds ?? []);
    if (!activeFieldIds.length || !activeSelection) {
      notifications.show({ color: 'red', message: 'Select at least one resource and a time range first.' });
      return;
    }
    if (activeSelection.start.toDateString() !== activeSelection.end.toDateString()) {
      notifications.show({ color: 'red', message: 'Staff timeslots must stay within a single day. Adjust the selection.' });
      return;
    }
    const selectionDay = mondayDayOf(activeSelection.start);
    const draftStaff = options.draft?.staff ?? {};
    setSelectedManagerDraftId(options.draftId ?? null);
    setEditingManagerDraftId(options.draftId ?? null);
    setEditingStaffAssignment(null);
    setStaffTimeslotParentAssignment(null);
    setStaffTimeslotMode(mode);
    setStaffTimeslotUserId(draftStaff.userId ?? null);
    setStaffTimeslotOverrideAmount(dollarsFromCents(draftStaff.rateOverrideCents));
    setStaffTimeslotNotes(draftStaff.notes ?? '');
    setStaffTimeslotRepeating(Boolean(draftStaff.repeating));
    setStaffTimeslotRepeatDays(Array.isArray(draftStaff.daysOfWeek) && draftStaff.daysOfWeek.length
      ? draftStaff.daysOfWeek
      : [selectionDay]);
    setStaffTimeslotRepeatEndDate(draftStaff.repeatEndDate ? toValidDate(draftStaff.repeatEndDate) : null);
    setStaffTimeslotError(null);
    setStaffTimeslotModalOpen(true);
    if (!staffScheduleLoaded) {
      void loadStaffSchedule();
    }
  }, [canManage, loadStaffSchedule, selection, staffScheduleLoaded]);

  const openManagerCalendarDraftEditor = useCallback((draftId: string, fallbackDraft: ManagerCalendarDraft | null = null) => {
    const draft = managerCalendarDrafts.find((candidate) => candidate.id === draftId) ?? fallbackDraft;
    if (!draft) {
      return;
    }
    const draftSelection = {
      fieldIds: normalizeFieldIds(draft.fieldIds),
      start: new Date(draft.start),
      end: new Date(draft.end),
    };
    setSelection(draftSelection);
    setCalendarDate(new Date(draft.start));
    setSelectedManagerDraftId(draft.id);
    if (draft.mode === 'rental') {
      openRentalSlotModalForSelection(draftSelection, { draftId: draft.id });
      return;
    }
    openStaffTimeslotModal(draft.mode, draftSelection, { draftId: draft.id, draft });
  }, [managerCalendarDrafts, openRentalSlotModalForSelection, openStaffTimeslotModal]);

  openManagerCalendarDraftEditorRef.current = (draftId: string) => {
    openManagerCalendarDraftEditor(draftId);
  };

  const resolveRentalModalPayloadRange = useCallback((payload: CreateRentalSlotModalSubmitPayload['payload']) => {
    const startDate = parseLocalDateTime(payload.startDate ?? null) ?? new Date();
    const startDay = startOfDay(startDate);
    const startMinutes = typeof payload.startTimeMinutes === 'number'
      ? payload.startTimeMinutes
      : startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = typeof payload.endTimeMinutes === 'number'
      ? payload.endTimeMinutes
      : startMinutes + Math.round(MIN_SELECTION_MS / 60000);
    const start = payload.repeating
      ? dateWithMinutes(startDay, startMinutes)
      : startDate;
    const parsedEndDate = payload.endDate ? parseLocalDateTime(payload.endDate) : null;
    const end = payload.repeating
      ? dateWithMinutes(startDay, endMinutes)
      : parsedEndDate ?? new Date(start.getTime() + MIN_SELECTION_MS);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + MIN_SELECTION_MS);
    }
    return { start, end };
  }, []);

  const handleRentalSlotModalSubmit = useCallback(async (submitPayload: CreateRentalSlotModalSubmitPayload) => {
    if (editingManagerDraftId && !submitPayload.slot) {
      const targetFieldIds = normalizeFieldIds(submitPayload.targetFields.map((targetField) => targetField.$id));
      if (!targetFieldIds.length) {
        throw new Error('Select at least one resource for this draft.');
      }
      const range = resolveRentalModalPayloadRange(submitPayload.payload);
      const updatedDraft = stageManagerCalendarDraftUpdate(
        editingManagerDraftId,
        (draft) => ({
          ...draft,
          mode: 'rental',
          fieldIds: targetFieldIds,
          start: range.start,
          end: range.end,
          rental: {
            repeating: Boolean(submitPayload.payload.repeating),
            dayOfWeek: submitPayload.payload.dayOfWeek,
            daysOfWeek: Array.isArray(submitPayload.payload.daysOfWeek)
              ? submitPayload.payload.daysOfWeek
              : [submitPayload.payload.dayOfWeek],
            startDate: submitPayload.payload.startDate,
            endDate: submitPayload.payload.endDate ?? null,
            startTimeMinutes: submitPayload.payload.startTimeMinutes ?? null,
            endTimeMinutes: submitPayload.payload.endTimeMinutes ?? null,
            price: submitPayload.payload.price ?? 0,
            requiredTemplateIds: submitPayload.payload.requiredTemplateIds ?? [],
            hostRequiredTemplateIds: submitPayload.payload.hostRequiredTemplateIds ?? [],
          },
        }),
        'Edited draft rental slot',
      );
      setEditingManagerDraftId(null);
      if (updatedDraft) {
        notifications.show({ color: 'blue', message: 'Draft rental slot change staged.' });
      }
      return;
    }

    if (managerCalendarEditMode && submitPayload.slot?.$id && submitPayload.field?.$id && submitPayload.updatePayload) {
      const pendingKey = getRentalSlotPendingUpdateKey(submitPayload.field.$id, submitPayload.slot.$id);
      stageRentalSlotUpdate({
        key: pendingKey,
        action: 'update',
        fieldId: submitPayload.field.$id,
        slotId: submitPayload.slot.$id,
        slot: submitPayload.updatePayload,
      }, 'Edited rental slot');
      notifications.show({ color: 'blue', message: 'Rental slot change staged.' });
      return;
    }
  }, [
    editingManagerDraftId,
    managerCalendarEditMode,
    resolveRentalModalPayloadRange,
    stageManagerCalendarDraftUpdate,
    stageRentalSlotUpdate,
  ]);

  const handleRentalSlotModalDelete = useCallback(async ({ field, slot }: { field: Field | null; slot: TimeSlot }) => {
    if (!managerCalendarEditMode || !field?.$id || !slot?.$id) {
      return;
    }
    const pendingKey = getRentalSlotPendingUpdateKey(field.$id, slot.$id);
    stageRentalSlotUpdate({
      key: pendingKey,
      action: 'delete',
      fieldId: field.$id,
      slotId: slot.$id,
    }, 'Deleted rental slot');
    notifications.show({ color: 'blue', message: 'Rental slot delete staged.' });
  }, [managerCalendarEditMode, stageRentalSlotUpdate]);

  const submitStaffTimeslot = useCallback(async () => {
    if (!canManage || !organizationId) {
      setStaffTimeslotError('Missing organization context.');
      return;
    }
    if (editingManagerDraftId) {
      if (!selection || !selectedFields.length) {
        setStaffTimeslotError('Select at least one resource and a time range first.');
        return;
      }
      if (selection.end.getTime() <= selection.start.getTime()) {
        setStaffTimeslotError('End time must be after the start time.');
        return;
      }
      if (selection.start.toDateString() !== selection.end.toDateString()) {
        setStaffTimeslotError('Staff timeslots must stay within a single day.');
        return;
      }
      const overrideAmountCents = staffTimeslotOverrideAmount === ''
        ? null
        : centsFromDollars(staffTimeslotOverrideAmount);
      if (overrideAmountCents !== null && overrideAmountCents <= 0) {
        setStaffTimeslotError('Override amount must be greater than 0.');
        return;
      }
      const dayOfWeek = mondayDayOf(selection.start);
      const isRepeatingAssignment = staffTimeslotRepeating;
      const repeatDays = isRepeatingAssignment
        ? Array.from(new Set(staffTimeslotRepeatDays
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)))
          .sort((a, b) => a - b)
        : [dayOfWeek];
      if (isRepeatingAssignment && repeatDays.length === 0) {
        setStaffTimeslotError('Select at least one repeat day.');
        return;
      }
	      if (
	        isRepeatingAssignment
	        && staffTimeslotRepeatEndDate
	        && startOfDay(staffTimeslotRepeatEndDate).getTime() < startOfDay(selection.start).getTime()
	      ) {
	        setStaffTimeslotError('Repeat end date must be on or after the start date.');
	        return;
	      }
	      const targetFieldIds = normalizeFieldIds(selectedFieldIds);
	      const repeatEndDate = isRepeatingAssignment && staffTimeslotRepeatEndDate
	        ? endOfDay(staffTimeslotRepeatEndDate).toISOString()
	        : null;
	      const selectedStaffMember = staffTimeslotUserId
	        ? staffScheduleMembers.find((member) => member.userId === staffTimeslotUserId) ?? null
	        : null;
	      if (staffTimeslotUserId && !selectedStaffMember) {
	        setStaffTimeslotError('Choose a valid staff member for this assignment.');
	        return;
	      }
	      const shouldAskAssignmentScope = Boolean(selectedStaffMember)
	        && (isRepeatingAssignment || targetFieldIds.length > 1);
	      const buildDraftWithStaff = (
	        draft: ManagerCalendarDraft,
	        staffUserId: string | null,
	        extraStaffOptions: Partial<ManagerCalendarDraftStaffOptions> = {},
	      ): ManagerCalendarDraft => ({
	        ...draft,
	        mode: staffTimeslotMode,
	        fieldIds: targetFieldIds,
	        start: new Date(selection.start),
	        end: new Date(selection.end),
	        staff: {
	          userId: staffUserId,
	          userName: staffUserId ? selectedStaffMember?.fullName ?? null : null,
	          rateOverrideCents: overrideAmountCents,
	          notes: staffTimeslotNotes,
	          repeating: isRepeatingAssignment,
	          daysOfWeek: repeatDays,
	          repeatEndDate,
	          ...extraStaffOptions,
	        },
	      });

	      if (shouldAskAssignmentScope && selectedStaffMember) {
	        const sourceDraft = managerCalendarDrafts.find((draft) => draft.id === editingManagerDraftId) ?? null;
	        if (!sourceDraft) {
	          setStaffTimeslotError('Unable to resolve this draft assignment.');
	          return;
	        }
	        const allDraft = buildDraftWithStaff(sourceDraft, selectedStaffMember.userId);
	        const parentDraft = buildDraftWithStaff(sourceDraft, null);
	        const childDraft: ManagerCalendarDraft = {
	          id: createId(),
	          mode: staffTimeslotMode,
	          fieldIds: targetFieldIds,
	          start: new Date(selection.start),
	          end: new Date(selection.end),
	          staff: {
	            parentDraftId: sourceDraft.id,
	            userId: selectedStaffMember.userId,
	            userName: selectedStaffMember.fullName,
	            rateOverrideCents: overrideAmountCents,
	            notes: staffTimeslotNotes,
	            repeating: false,
	            daysOfWeek: [dayOfWeek],
	            repeatEndDate: null,
	          },
	        };
	        setStaffAssignmentScopePrompt({
	          source: 'draft',
	          draftId: sourceDraft.id,
	          previousDraft: sourceDraft,
	          allDraft,
	          parentDraft,
	          childDraft,
	          staffName: selectedStaffMember.fullName,
	          occurrenceLabel: `${formatDisplayDateTime(selection.start)} - ${formatDisplayTime(selection.end)}`,
	          kindLabel: staffTimeslotMode === 'official_assignment' ? 'official' : 'staff',
	        });
	        setStaffTimeslotError(null);
	        return;
	      }

	      const updatedDraft = stageManagerCalendarDraftUpdate(
	        editingManagerDraftId,
	        (draft) => buildDraftWithStaff(draft, staffTimeslotUserId || null),
	        'Edited draft assignment',
	      );
      resetStaffTimeslotModalState();
      if (updatedDraft) {
        notifications.show({ color: 'blue', message: 'Draft assignment change staged.' });
      }
      return;
    }
    if (editingStaffAssignment) {
      const overrideAmountCents = staffTimeslotOverrideAmount === ''
        ? null
        : centsFromDollars(staffTimeslotOverrideAmount);
      if (overrideAmountCents !== null && overrideAmountCents <= 0) {
        setStaffTimeslotError('Override amount must be greater than 0.');
        return;
      }
      setStaffTimeslotError(null);
      const nextUserId = isEditingChildStaffAssignment
        ? editingStaffAssignment.userId ?? null
        : staffTimeslotUserId || null;
      const selectedStaffMember = nextUserId
        ? staffScheduleMembers.find((member) => member.userId === nextUserId) ?? null
        : null;
      const nextField = isEditingChildStaffAssignment ? null : selectedFields[0] ?? null;
      if (!isEditingChildStaffAssignment && !nextField) {
        setStaffTimeslotError('Select a resource for this assignment.');
        return;
      }
      const nextFacilityId = isEditingChildStaffAssignment
        ? editingStaffAssignment.facilityId ?? null
        : nextField
          ? getFieldFacilityId(nextField)
          : null;
      const nextFacility = nextFacilityId
        ? facilities.find((facility) => facility.$id === nextFacilityId) ?? null
        : null;
      const nextAssignment: StaffScheduleAssignment = {
        ...editingStaffAssignment,
        userId: nextUserId,
        userName: nextUserId
          ? selectedStaffMember?.fullName ?? editingStaffAssignment.userName
          : '',
        isOpen: !nextUserId,
        rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
        rateOverrideCents: overrideAmountCents,
        facilityId: isEditingChildStaffAssignment ? editingStaffAssignment.facilityId ?? null : nextFacilityId,
        facilityName: isEditingChildStaffAssignment ? editingStaffAssignment.facilityName ?? null : nextFacility?.name ?? null,
        fieldId: isEditingChildStaffAssignment ? editingStaffAssignment.fieldId ?? null : nextField?.$id ?? null,
        fieldName: isEditingChildStaffAssignment ? editingStaffAssignment.fieldName ?? null : nextField ? getFacilityScopedFieldDisplayName(nextField) : null,
        notes: isEditingChildStaffAssignment ? editingStaffAssignment.notes : staffTimeslotNotes,
      };
      stageStaffAssignmentOverride(editingStaffAssignment.id, {
        action: 'update',
        assignment: nextAssignment,
      });
      resetStaffTimeslotModalState();
      notifications.show({
        color: 'blue',
        message: 'Staff assignment change staged.',
      });
      return;
    }
    if (!selection || !selectedFields.length) {
      setStaffTimeslotError('Select at least one resource and a time range first.');
      return;
    }
    if (selection.end.getTime() <= selection.start.getTime()) {
      setStaffTimeslotError('End time must be after the start time.');
      return;
    }
    if (selection.start.toDateString() !== selection.end.toDateString()) {
      setStaffTimeslotError('Staff timeslots must stay within a single day.');
      return;
    }
    const overrideAmountCents = staffTimeslotOverrideAmount === ''
      ? null
      : centsFromDollars(staffTimeslotOverrideAmount);
    if (overrideAmountCents !== null && overrideAmountCents <= 0) {
      setStaffTimeslotError('Override amount must be greater than 0.');
      return;
    }
    if (staffTimeslotParentAssignment && !staffTimeslotUserId) {
      setStaffTimeslotError('Choose a staff member for this occurrence.');
      return;
    }

    const assignmentKind: StaffScheduleAssignmentKind = staffTimeslotMode === 'official_assignment'
      ? 'OFFICIAL_SHIFT'
      : 'STAFF_SHIFT';
    const dayOfWeek = mondayDayOf(selection.start);
    const isRepeatingAssignment = staffTimeslotParentAssignment ? false : staffTimeslotRepeating;
    const repeatDays = isRepeatingAssignment
      ? Array.from(new Set(staffTimeslotRepeatDays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)))
        .sort((a, b) => a - b)
      : [dayOfWeek];
    if (isRepeatingAssignment && repeatDays.length === 0) {
      setStaffTimeslotError('Select at least one repeat day.');
      return;
    }
    if (
      isRepeatingAssignment
      && staffTimeslotRepeatEndDate
      && startOfDay(staffTimeslotRepeatEndDate).getTime() < startOfDay(selection.start).getTime()
    ) {
      setStaffTimeslotError('Repeat end date must be on or after the start date.');
      return;
    }
    const repeatEndDate = isRepeatingAssignment
      ? (staffTimeslotRepeatEndDate ? endOfDay(staffTimeslotRepeatEndDate).toISOString() : null)
      : selection.end.toISOString();
    const restorablePendingUnassignments = staffTimeslotParentAssignment && staffTimeslotUserId
      ? staffScheduleAssignments.filter((assignment) => {
          const override = managerStaffAssignmentOverrides[assignment.id];
          if (
            override?.action !== 'unassign'
            || assignment.parentAssignmentId !== staffTimeslotParentAssignment.id
            || assignment.assignmentKind !== assignmentKind
            || assignment.userId !== staffTimeslotUserId
            || (assignment.fieldId && !selectedFieldIds.includes(assignment.fieldId))
          ) {
            return false;
          }
          const range = getStaffAssignmentOccurrenceRangeForDate(assignment, selection.start)
            ?? getStaffAssignmentPrimaryRange(assignment);
          return Boolean(
            range
            && range.start.getTime() === selection.start.getTime()
            && range.end.getTime() === selection.end.getTime(),
          );
        })
      : [];
	    if (restorablePendingUnassignments.length > 0) {
	      let restoredCount = 0;
	      restorablePendingUnassignments.forEach((assignment) => {
	        if (restorePendingStaffUnassignment(assignment.id)) {
	          restoredCount += 1;
        }
      });
      if (restoredCount > 0) {
        resetStaffTimeslotModalState();
        notifications.show({
          color: 'blue',
          message: `${restoredCount} pending staff unassignment${restoredCount === 1 ? '' : 's'} restored.`,
        });
	        return;
	      }
	    }
	    if (staffTimeslotParentAssignment) {
	      const targetField = selectedFields[0] ?? null;
	      if (!targetField) {
	        setStaffTimeslotError('Select a resource for this assignment.');
	        return;
	      }
	      const selectedStaffMember = staffScheduleMembers.find((member) => member.userId === staffTimeslotUserId) ?? null;
	      if (!selectedStaffMember) {
	        setStaffTimeslotError('Choose a valid staff member for this occurrence.');
	        return;
	      }
	      const startTimeMinutes = selection.start.getHours() * 60 + selection.start.getMinutes();
	      const endTimeMinutes = selection.end.getHours() * 60 + selection.end.getMinutes();
	      const occurrenceDay = mondayDayOf(selection.start);
	      const facilityId = getFieldFacilityId(targetField);
	      const facility = facilityId ? facilities.find((candidate) => candidate.$id === facilityId) ?? null : null;
	      const fieldName = getFacilityScopedFieldDisplayName(targetField);
	      const childAssignment: StaffScheduleAssignment = {
	        id: createId(),
	        parentAssignmentId: staffTimeslotParentAssignment.id,
	        staffMemberId: selectedStaffMember.staffMemberId,
	        userId: selectedStaffMember.userId,
	        userName: selectedStaffMember.fullName,
	        isOpen: false,
	        isChildAssignment: true,
	        assignmentKind,
	        facilityId,
	        facilityName: facility?.name ?? staffTimeslotParentAssignment.facilityName ?? null,
	        fieldId: targetField.$id,
	        fieldName,
	        rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
	        rateOverrideCents: overrideAmountCents,
	        notes: staffTimeslotNotes,
	        status: staffTimeslotParentAssignment.status ?? 'PLANNED',
	        timeSlot: {
	          startDate: selection.start.toISOString(),
	          endDate: selection.end.toISOString(),
	          repeating: false,
	          dayOfWeek: occurrenceDay,
	          daysOfWeek: [occurrenceDay],
	          startTimeMinutes,
	          endTimeMinutes,
	          timeZone: staffTimeslotParentAssignment.timeSlot?.timeZone ?? null,
	        },
	        plannedStart: selection.start.toISOString(),
	        plannedEnd: selection.end.toISOString(),
	        plannedMinutes: Math.max(0, Math.round((selection.end.getTime() - selection.start.getTime()) / 60000)),
	      };
	      const parentAssignment: StaffScheduleAssignment = {
	        ...staffTimeslotParentAssignment,
	        staffMemberId: selectedStaffMember.staffMemberId,
	        userId: selectedStaffMember.userId,
	        userName: selectedStaffMember.fullName,
	        isOpen: false,
	        rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
	        rateOverrideCents: overrideAmountCents,
	        notes: staffTimeslotNotes,
	      };
	      const childOverride: ManagerStaffAssignmentPendingOverride = {
	        action: 'create',
	        assignment: childAssignment,
	      };
	      const parentOverride: ManagerStaffAssignmentPendingOverride = {
	        action: 'update',
	        assignment: parentAssignment,
	      };
	      const kindLabel = assignmentKind === 'OFFICIAL_SHIFT' ? 'official' : 'staff';
	      if (staffAssignmentCanDeleteFollowing(staffTimeslotParentAssignment)) {
	        setStaffAssignmentScopePrompt({
	          source: 'assignment',
	          parentAssignment: staffTimeslotParentAssignment,
	          parentOverride,
	          childOverride,
	          staffName: selectedStaffMember.fullName,
	          occurrenceLabel: `${formatDisplayDateTime(selection.start)} - ${formatDisplayTime(selection.end)}`,
	          kindLabel,
	        });
	        setStaffTimeslotError(null);
	        return;
	      }
	      stageStaffAssignmentOverride(childAssignment.id, childOverride, `Assigned ${kindLabel} coverage occurrence`);
	      resetStaffTimeslotModalState();
	      notifications.show({
	        color: 'blue',
	        message: `${selectedStaffMember.fullName} assignment staged for this occurrence.`,
	      });
	      return;
	    }
	    setStaffTimeslotSubmitting(true);
	    setStaffTimeslotError(null);
	    try {
      const created = await Promise.all(selectedFields.map(async (field) => {
        const facilityId = getFieldFacilityId(field);
        const response = await apiRequest<StaffScheduleCreateResponse>(`/api/organizations/${organizationId}/staff/schedule`, {
          method: 'POST',
          body: {
	            parentAssignmentId: null,
            userId: staffTimeslotUserId || null,
            assignmentKind,
            facilityId,
            fieldId: field.$id,
            rateOverrideType: overrideAmountCents ? 'HOURLY' : null,
            rateOverrideCents: overrideAmountCents,
            notes: staffTimeslotNotes,
            timeSlot: {
              startDate: selection.start.toISOString(),
              endDate: repeatEndDate,
              repeating: isRepeatingAssignment,
              daysOfWeek: repeatDays,
              startTimeMinutes: selection.start.getHours() * 60 + selection.start.getMinutes(),
              endTimeMinutes: selection.end.getHours() * 60 + selection.end.getMinutes(),
            },
          },
        });
        return response.assignment ?? null;
      }));
      const createdAssignments = created.filter((assignment): assignment is StaffScheduleAssignment => Boolean(assignment));
      if (createdAssignments.length) {
        setStaffScheduleAssignments((current) => [...createdAssignments, ...current]);
      }
      resetStaffTimeslotModalState();
      notifications.show({
        color: 'green',
        message: `${createdAssignments.length || selectedFields.length} ${assignmentKind === 'OFFICIAL_SHIFT' ? 'official' : 'staff'} timeslot${(createdAssignments.length || selectedFields.length) === 1 ? '' : 's'} added.`,
      });
      void loadStaffSchedule({ silent: true });
    } catch (error) {
      setStaffTimeslotError(error instanceof Error ? error.message : 'Failed to apply staff timeslot.');
    } finally {
      setStaffTimeslotSubmitting(false);
    }
  }, [
    canManage,
    editingManagerDraftId,
    editingStaffAssignment,
    facilities,
    isEditingChildStaffAssignment,
	    loadStaffSchedule,
	    managerCalendarDrafts,
	    managerStaffAssignmentOverrides,
	    organizationId,
    resetStaffTimeslotModalState,
    restorePendingStaffUnassignment,
    selectedFields,
    selection,
    selectedFieldIds,
    stageStaffAssignmentOverride,
    stageManagerCalendarDraftUpdate,
    staffScheduleAssignments,
    staffScheduleMembers,
    staffTimeslotParentAssignment,
    staffTimeslotRepeatDays,
    staffTimeslotRepeatEndDate,
    staffTimeslotRepeating,
    staffTimeslotMode,
    staffTimeslotNotes,
    staffTimeslotOverrideAmount,
    staffTimeslotUserId,
	  ]);

		  const applyStaffAssignmentScopePrompt = useCallback((scope: 'all' | 'occurrence') => {
		    if (!staffAssignmentScopePrompt) {
		      return;
		    }
	    if (staffAssignmentScopePrompt.source === 'draft') {
	      if (scope === 'all') {
	        const updatedDraft = stageManagerCalendarDraftUpdate(
	          staffAssignmentScopePrompt.draftId,
	          () => staffAssignmentScopePrompt.allDraft,
	          `Assigned all ${staffAssignmentScopePrompt.kindLabel} draft coverage`,
	        );
	        resetStaffTimeslotModalState();
	        if (updatedDraft) {
	          notifications.show({
	            color: 'blue',
	            message: `${staffAssignmentScopePrompt.staffName} assignment staged for all instances.`,
	          });
	        }
	        return;
	      }
	      const staged = stageManagerCalendarDraftScope(
	        staffAssignmentScopePrompt.draftId,
	        staffAssignmentScopePrompt.parentDraft,
	        staffAssignmentScopePrompt.childDraft,
	        `Assigned ${staffAssignmentScopePrompt.kindLabel} draft coverage occurrence`,
	        staffAssignmentScopePrompt.previousDraft,
	      );
	      resetStaffTimeslotModalState();
	      if (staged) {
	        notifications.show({
	          color: 'blue',
	          message: `${staffAssignmentScopePrompt.staffName} assignment staged for this occurrence.`,
	        });
	      }
	      return;
	    }
		    if (scope === 'all') {
		      stageStaffAssignmentOverride(
		        staffAssignmentScopePrompt.parentAssignment.id,
	        staffAssignmentScopePrompt.parentOverride,
	        `Assigned all ${staffAssignmentScopePrompt.kindLabel} coverage`,
	      );
	      resetStaffTimeslotModalState();
	      notifications.show({
	        color: 'blue',
	        message: `${staffAssignmentScopePrompt.staffName} assignment staged for all instances.`,
	      });
	      return;
	    }
	    const childAssignment = staffAssignmentScopePrompt.childOverride.action === 'create'
	      ? staffAssignmentScopePrompt.childOverride.assignment
	      : null;
	    if (!childAssignment) {
	      return;
	    }
	    stageStaffAssignmentOverride(
	      childAssignment.id,
	      staffAssignmentScopePrompt.childOverride,
	      `Assigned ${staffAssignmentScopePrompt.kindLabel} coverage occurrence`,
	    );
	    resetStaffTimeslotModalState();
	    notifications.show({
	      color: 'blue',
	      message: `${staffAssignmentScopePrompt.staffName} assignment staged for this occurrence.`,
	    });
	  }, [
	    resetStaffTimeslotModalState,
	    staffAssignmentScopePrompt,
	    stageManagerCalendarDraftScope,
	    stageManagerCalendarDraftUpdate,
	    stageStaffAssignmentOverride,
	  ]);

	  const unassignChildStaffAssignment = useCallback(() => {
	    if (!canManage || !organizationId || !editingStaffAssignment?.id || !editingStaffAssignment.parentAssignmentId) {
	      return;
	    }
    setStaffTimeslotError(null);
    stageStaffAssignmentOverride(editingStaffAssignment.id, {
      action: 'unassign',
      assignmentId: editingStaffAssignment.id,
    }, 'Unassigned staff member');
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: 'Staff unassignment staged.',
    });
  }, [canManage, editingStaffAssignment, organizationId, resetStaffTimeslotModalState, stageStaffAssignmentOverride]);

  const deleteStaffAssignment = useCallback(() => {
    if (!canManage || !organizationId || !editingStaffAssignment?.id || editingStaffAssignment.parentAssignmentId) {
      return;
    }
    setStaffTimeslotError(null);
    stageStaffAssignmentOverride(editingStaffAssignment.id, {
      action: 'delete',
      assignmentId: editingStaffAssignment.id,
    }, 'Deleted staff assignment');
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: 'Staff assignment deletion staged.',
    });
  }, [canManage, editingStaffAssignment, organizationId, resetStaffTimeslotModalState, stageStaffAssignmentOverride]);

  const openStaffDeletePlan = useMemo(() => {
    if (!openStaffDeleteConfirmation) {
      return null;
    }
    const parentAssignment = visibleStaffScheduleAssignments
      .find((assignment) => assignment.id === openStaffDeleteConfirmation.assignmentId)
      ?? staffScheduleAssignments.find((assignment) => assignment.id === openStaffDeleteConfirmation.assignmentId)
      ?? null;
    const occurrenceStart = toValidDate(openStaffDeleteConfirmation.occurrenceStart);
    const occurrenceEnd = toValidDate(openStaffDeleteConfirmation.occurrenceEnd);
    if (!parentAssignment || !occurrenceStart || !occurrenceEnd) {
      return null;
    }
    const childAssignments = visibleStaffScheduleAssignments
      .filter((assignment) => (
        assignment.parentAssignmentId === parentAssignment.id
        && Boolean(assignment.userId || assignment.staffMemberId)
        && (
          openStaffDeleteConfirmation.scope === 'all'
          || childStaffAssignmentTouchesDeleteScope(assignment, occurrenceStart)
        )
      ))
      .sort((left, right) => {
        const leftStart = getStaffAssignmentPrimaryRange(left)?.start.getTime() ?? 0;
        const rightStart = getStaffAssignmentPrimaryRange(right)?.start.getTime() ?? 0;
        return leftStart - rightStart;
      });
    const childOverrides = childAssignments.map((assignment) => ({
      assignmentId: assignment.id,
      override: {
        action: 'unassign' as const,
        assignmentId: assignment.id,
      },
    }));

    if (openStaffDeleteConfirmation.scope === 'all') {
      return {
        parentAssignment,
        occurrenceStart,
        occurrenceEnd,
        scope: openStaffDeleteConfirmation.scope,
        childAssignments,
        shortenedAssignment: null,
        deletesParent: true,
        overrides: [{
          assignmentId: parentAssignment.id,
          override: {
            action: 'delete' as const,
            assignmentId: parentAssignment.id,
          },
        }],
      };
    }

    const previousOccurrence = getPreviousStaffAssignmentOccurrenceRange(parentAssignment, occurrenceStart);
    const shortenedAssignment = previousOccurrence
      ? buildStaffAssignmentEndingAfterOccurrence(parentAssignment, previousOccurrence)
      : null;

    return {
      parentAssignment,
      occurrenceStart,
      occurrenceEnd,
      scope: openStaffDeleteConfirmation.scope,
      childAssignments,
      shortenedAssignment,
      deletesParent: !shortenedAssignment,
      overrides: shortenedAssignment
        ? [
            ...childOverrides,
            {
              assignmentId: parentAssignment.id,
              override: {
                action: 'update' as const,
                assignment: shortenedAssignment,
              },
            },
          ]
        : [{
            assignmentId: parentAssignment.id,
            override: {
              action: 'delete' as const,
              assignmentId: parentAssignment.id,
            },
          }],
    };
  }, [openStaffDeleteConfirmation, staffScheduleAssignments, visibleStaffScheduleAssignments]);

  const requestDeleteOpenStaffAssignment = useCallback(() => {
    if (!canManage || !organizationId || !staffTimeslotParentAssignment?.id || !selection) {
      return;
    }
    const defaultScope: OpenStaffDeleteScope = staffAssignmentCanDeleteFollowing(staffTimeslotParentAssignment)
      ? 'following'
      : 'all';
    setStaffTimeslotError(null);
    setOpenStaffDeleteConfirmation({
      assignmentId: staffTimeslotParentAssignment.id,
      occurrenceStart: selection.start.toISOString(),
      occurrenceEnd: selection.end.toISOString(),
      scope: defaultScope,
    });
  }, [canManage, organizationId, selection, staffTimeslotParentAssignment]);

  const confirmOpenStaffAssignmentDelete = useCallback(() => {
    if (!openStaffDeletePlan?.overrides.length) {
      return;
    }
    const parentIsOfficial = openStaffDeletePlan.parentAssignment.assignmentKind === 'OFFICIAL_SHIFT';
    const label = openStaffDeletePlan.scope === 'all'
      ? `Deleted open ${parentIsOfficial ? 'official' : 'staff'} assignment`
      : `Deleted following open ${parentIsOfficial ? 'official' : 'staff'} assignments`;
    stageStaffAssignmentOverrideBatch(openStaffDeletePlan.overrides, label);
    resetStaffTimeslotModalState();
    notifications.show({
      color: 'blue',
      message: openStaffDeletePlan.scope === 'all'
        ? `Open ${parentIsOfficial ? 'official' : 'staff'} assignment deletion staged.`
        : `Following open ${parentIsOfficial ? 'official' : 'staff'} assignment changes staged.`,
    });
  }, [openStaffDeletePlan, resetStaffTimeslotModalState, stageStaffAssignmentOverrideBatch]);

  const handleSaveManagerCalendarDrafts = useCallback(async () => {
    if (!canManage || !organizationId || managerCalendarDraftsSaving || !managerCalendarPendingChangeCount) {
      return;
    }
    const fieldById = new Map(fields.map((field) => [field.$id, field]));
    const pendingRentalUpdates = Object.values(managerRentalSlotUpdates);
	    const pendingStaffOverrides = Object.entries(managerStaffAssignmentOverrides)
	      .sort(([leftAssignmentId, left], [rightAssignmentId, right]) => {
	        const rank = (assignmentId: string, override: ManagerStaffAssignmentPendingOverride) => {
	          if (override.action === 'create') return override.assignment.parentAssignmentId ? 2 : 3;
	          if (override.action === 'unassign') return 0;
	          if (override.action === 'delete') return 1;
	          const pendingAssignment = override.assignment;
	          if (pendingAssignment.parentAssignmentId) return 2;
          const sourceAssignment = staffScheduleAssignments.find((assignment) => assignment.id === assignmentId);
          if (sourceAssignment?.parentAssignmentId) return 2;
          return 3;
        };
        return rank(leftAssignmentId, left) - rank(rightAssignmentId, right);
      });
    setManagerCalendarDraftsSaving(true);
    try {
      const updatedRentalFields: Field[] = [];
	      const createdAssignments: StaffScheduleAssignment[] = [];
	      const updatedAssignments: StaffScheduleAssignment[] = [];
	      const removedAssignmentIds = new Set<string>();
	      const deletedParentAssignmentIds = new Set<string>();
	      const createdDraftAssignmentIds = new Map<string, string>();
	      const draftsToSave = [...managerCalendarDrafts].sort((left, right) => {
	        const leftIsChild = Boolean(left.staff?.parentDraftId);
	        const rightIsChild = Boolean(right.staff?.parentDraftId);
	        if (leftIsChild === rightIsChild) return 0;
	        return leftIsChild ? 1 : -1;
	      });

	      for (const draft of draftsToSave) {
	        const draftFields = normalizeFieldIds(draft.fieldIds)
	          .map((fieldId) => fieldById.get(fieldId))
	          .filter((field): field is Field => Boolean(field));
        if (!draftFields.length) {
          throw new Error('One draft no longer has a valid resource.');
        }
        const start = new Date(draft.start);
        const end = new Date(draft.end);
        if (end.getTime() <= start.getTime()) {
          throw new Error('A draft has an invalid end time.');
        }
        if (start.toDateString() !== end.toDateString()) {
          throw new Error('Drafts must stay within a single day.');
        }
        const dayOfWeek = mondayDayOf(start) as NonNullable<TimeSlot['dayOfWeek']>;
        const startTimeMinutes = start.getHours() * 60 + start.getMinutes();
        const endTimeMinutes = end.getHours() * 60 + end.getMinutes();

        if (draft.mode === 'rental') {
          const draftRental = draft.rental ?? {};
          const normalizedDraftRentalDays = Array.isArray(draftRental.daysOfWeek)
            ? draftRental.daysOfWeek.filter((day): day is NonNullable<TimeSlot['dayOfWeek']> => (
                Number.isInteger(day) && day >= 0 && day <= 6
              ))
            : [];
          const draftRentalDaysOfWeek = normalizedDraftRentalDays.length
            ? normalizedDraftRentalDays
            : [dayOfWeek];
          const rentalRepeating = Boolean(draftRental.repeating);
          const results = await Promise.all(draftFields.map((field) => (
            fieldService.createRentalSlot(field, {
              dayOfWeek: draftRental.dayOfWeek ?? dayOfWeek,
              daysOfWeek: draftRentalDaysOfWeek,
              repeating: rentalRepeating,
              scheduledFieldId: field.$id,
              scheduledFieldIds: [field.$id],
              startDate: draftRental.startDate ?? formatLocalDateTime(start),
              endDate: draftRental.endDate ?? (rentalRepeating ? null : formatLocalDateTime(end)),
              startTimeMinutes: draftRental.startTimeMinutes ?? startTimeMinutes,
              endTimeMinutes: draftRental.endTimeMinutes ?? endTimeMinutes,
              price: draftRental.price ?? 0,
              requiredTemplateIds: draftRental.requiredTemplateIds ?? [],
              hostRequiredTemplateIds: draftRental.hostRequiredTemplateIds ?? [],
            })
          )));
          updatedRentalFields.push(...results.map((result) => result.field));
          continue;
        }

        const assignmentKind: StaffScheduleAssignmentKind = draft.mode === 'official_assignment'
          ? 'OFFICIAL_SHIFT'
          : 'STAFF_SHIFT';
	        const draftStaff = draft.staff ?? {};
	        const parentDraftId = draftStaff.parentDraftId ?? null;
	        const staffRepeating = Boolean(draftStaff.repeating);
	        const staffDaysOfWeek = Array.isArray(draftStaff.daysOfWeek) && draftStaff.daysOfWeek.length
	          ? draftStaff.daysOfWeek
	          : [dayOfWeek];
	        const results = await Promise.all(draftFields.map(async (field) => {
	          const parentAssignmentId = parentDraftId
	            ? createdDraftAssignmentIds.get(`${parentDraftId}:${field.$id}`) ?? null
	            : null;
	          if (parentDraftId && !parentAssignmentId) {
	            throw new Error('One draft child assignment no longer has a saved parent assignment.');
	          }
	          const response = await apiRequest<StaffScheduleCreateResponse>(`/api/organizations/${organizationId}/staff/schedule`, {
	            method: 'POST',
	            body: {
	              parentAssignmentId,
	              userId: draftStaff.userId || null,
	              assignmentKind,
	              facilityId: getFieldFacilityId(field),
              fieldId: field.$id,
              rateOverrideType: draftStaff.rateOverrideCents ? 'HOURLY' : null,
              rateOverrideCents: draftStaff.rateOverrideCents ?? null,
              notes: draftStaff.notes ?? '',
              timeSlot: {
                startDate: start.toISOString(),
                endDate: staffRepeating ? draftStaff.repeatEndDate ?? null : end.toISOString(),
                repeating: staffRepeating,
                daysOfWeek: staffDaysOfWeek,
                startTimeMinutes,
                endTimeMinutes,
              },
	            },
	          });
	          if (response.assignment && !parentDraftId) {
	            createdDraftAssignmentIds.set(`${draft.id}:${field.$id}`, response.assignment.id);
	          }
	          return response.assignment ?? null;
	        }));
        createdAssignments.push(...results.filter((assignment): assignment is StaffScheduleAssignment => Boolean(assignment)));
      }

      for (const update of pendingRentalUpdates) {
        const ownerField = fieldById.get(update.fieldId);
        if (!ownerField) {
          throw new Error('One rental slot no longer has a valid resource.');
        }
        const result = update.action === 'delete'
          ? { field: await fieldService.deleteRentalSlot(ownerField, update.slotId) }
          : await fieldService.updateRentalSlot(ownerField, update.slot);
        updatedRentalFields.push(result.field);
      }

	      for (const [assignmentId, override] of pendingStaffOverrides) {
	        if (override.action === 'create') {
	          const assignment = override.assignment;
	          const timeSlotPayload = buildStaffScheduleTimeSlotPayload(assignment.timeSlot);
	          const response = await apiRequest<StaffScheduleCreateResponse>(
	            `/api/organizations/${organizationId}/staff/schedule`,
	            {
	              method: 'POST',
	              body: {
	                parentAssignmentId: assignment.parentAssignmentId ?? null,
	                userId: assignment.userId || null,
	                assignmentKind: assignment.assignmentKind,
	                facilityId: assignment.facilityId || null,
	                fieldId: assignment.fieldId || null,
	                rateOverrideType: assignment.rateOverrideCents ? 'HOURLY' : null,
	                rateOverrideCents: assignment.rateOverrideCents ?? null,
	                notes: assignment.notes ?? '',
	                ...(timeSlotPayload ? { timeSlot: timeSlotPayload } : {}),
	              },
	            },
	          );
	          if (response.assignment) {
	            createdAssignments.push(response.assignment);
	          }
	          continue;
	        }

	        if (override.action === 'update') {
	          const assignment = override.assignment;
	          const timeSlotPayload = buildStaffScheduleTimeSlotPayload(assignment.timeSlot);
          const response = await apiRequest<StaffScheduleUpdateResponse>(
            `/api/organizations/${organizationId}/staff/schedule/${assignmentId}`,
            {
              method: 'PATCH',
              body: assignment.parentAssignmentId
                ? {
                    rateOverrideType: assignment.rateOverrideCents ? 'HOURLY' : null,
                    rateOverrideCents: assignment.rateOverrideCents ?? null,
                    ...(timeSlotPayload ? { timeSlot: timeSlotPayload } : {}),
                  }
                : {
                    userId: assignment.userId || null,
                    facilityId: assignment.facilityId || null,
                    fieldId: assignment.fieldId || null,
                    rateOverrideType: assignment.rateOverrideCents ? 'HOURLY' : null,
                    rateOverrideCents: assignment.rateOverrideCents ?? null,
                    notes: assignment.notes ?? '',
                    ...(timeSlotPayload ? { timeSlot: timeSlotPayload } : {}),
                  },
            },
          );
          if (response.assignment) {
            updatedAssignments.push(response.assignment);
          }
          continue;
        }

        if (override.action === 'unassign') {
          await apiRequest<StaffScheduleUpdateResponse>(
            `/api/organizations/${organizationId}/staff/schedule/${assignmentId}`,
            {
              method: 'PATCH',
              body: { action: 'UNASSIGN' },
            },
          );
          removedAssignmentIds.add(assignmentId);
          continue;
        }

        await apiRequest<{ id: string; deleted: boolean }>(
          `/api/organizations/${organizationId}/staff/schedule/${assignmentId}`,
          { method: 'DELETE' },
        );
        removedAssignmentIds.add(assignmentId);
        deletedParentAssignmentIds.add(assignmentId);
      }

      if (updatedRentalFields.length) {
        const updatedById = new Map(updatedRentalFields.map((field) => [field.$id, field]));
        setOrg((prev) => {
          if (!prev) return prev;
          const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
          return {
            ...prev,
            fields: prevFields.map((field) => {
              const updatedField = updatedById.get(field.$id);
              return updatedField ? mergeFieldPreservingCalendarHydration(field, updatedField) : field;
            }),
          };
        });
      }
      if (createdAssignments.length) {
        setStaffScheduleAssignments((current) => [...createdAssignments, ...current]);
      }
      if (updatedAssignments.length || removedAssignmentIds.size || deletedParentAssignmentIds.size) {
        const updatedById = new Map(updatedAssignments.map((assignment) => [assignment.id, assignment]));
        setStaffScheduleAssignments((current) => current
          .filter((assignment) => (
            !removedAssignmentIds.has(assignment.id)
            && !(assignment.parentAssignmentId && deletedParentAssignmentIds.has(assignment.parentAssignmentId))
          ))
          .map((assignment) => updatedById.get(assignment.id) ?? assignment));
      }
      const savedChangeCount = managerCalendarPendingChangeCount;
      clearManagerCalendarPendingState();
      setManagerCalendarEditMode(false);
      notifications.show({
        color: 'green',
        message: `${savedChangeCount} calendar change${savedChangeCount === 1 ? '' : 's'} saved.`,
      });
      await refreshOrganization();
      if (createdAssignments.length || pendingStaffOverrides.length) {
        void loadStaffSchedule({ silent: true });
      }
    } catch (error) {
      console.error('Failed to save calendar drafts:', error);
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Calendar changes could not be saved.',
      });
    } finally {
      setManagerCalendarDraftsSaving(false);
    }
  }, [
    canManage,
    clearManagerCalendarPendingState,
    fields,
    loadStaffSchedule,
    managerCalendarDrafts,
    managerCalendarDraftsSaving,
    managerCalendarPendingChangeCount,
    managerRentalSlotUpdates,
    managerStaffAssignmentOverrides,
    organizationId,
    refreshOrganization,
    staffScheduleAssignments,
  ]);

  const handleCancelManagerCalendarEditMode = useCallback(() => {
    if (managerCalendarPendingChangeCount && typeof window !== 'undefined' && !window.confirm('Discard all unsaved calendar changes?')) {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    managerDraftDragRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    setManagerDraftDragId(null);
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    clearManagerCalendarPendingState();
    setManagerCalendarEditMode(false);
  }, [clearManagerCalendarPendingState, managerCalendarPendingChangeCount]);

  const resolveCalendarPointSelection = useCallback((
    clientX: number,
    clientY: number,
    fieldIds: string[],
    durationMs = MIN_SELECTION_MS,
  ): SelectionState | null => {
    const normalizedFieldIds = normalizeFieldIds(fieldIds);
    if (!canManage || !normalizedFieldIds.length || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }
    const effectiveDurationMs = Math.max(MIN_SELECTION_MS, durationMs);

    const shell = document.querySelector<HTMLElement>('.shared-calendar-shell--fields');
    const timeContent = shell?.querySelector<HTMLElement>('.rbc-time-content');
    const daySlots = timeContent
      ? Array.from(timeContent.querySelectorAll<HTMLElement>('.rbc-day-slot'))
      : [];
    if (!timeContent || !daySlots.length) {
      return null;
    }

    const contentRect = timeContent.getBoundingClientRect();
    if (
      clientX < contentRect.left
      || clientX > contentRect.right
      || clientY < contentRect.top
      || clientY > contentRect.bottom
    ) {
      return null;
    }

    const targetSlot = daySlots.find((slot) => {
      const rect = slot.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right;
    }) ?? daySlots.reduce((closest, slot) => {
      const closestRect = closest.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      const closestDistance = Math.abs(clientX - (closestRect.left + closestRect.width / 2));
      const slotDistance = Math.abs(clientX - (slotRect.left + slotRect.width / 2));
      return slotDistance < closestDistance ? slot : closest;
    }, daySlots[0]);

    const dayIndex = Math.max(0, daySlots.indexOf(targetSlot));
    const targetDay = startOfDay(calendarRange.start);
    targetDay.setDate(targetDay.getDate() + dayIndex);

    const minMinutes = minTime.getHours() * 60 + minTime.getMinutes();
    const maxMinutes = maxTime.getHours() * 60 + maxTime.getMinutes();
    const visibleMinutes = Math.max(SLOT_STEP_MINUTES, maxMinutes - minMinutes);
    const rawRatio = (clientY - contentRect.top) / Math.max(1, contentRect.height);
    const ratio = Math.min(1, Math.max(0, rawRatio));
    const rawMinutes = minMinutes + ratio * visibleMinutes;
    const snappedMinutes = Math.floor(rawMinutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
    const maxStartMinutes = Math.max(minMinutes, maxMinutes - Math.ceil(effectiveDurationMs / 60000));
    const startMinutes = Math.min(maxStartMinutes, Math.max(minMinutes, snappedMinutes));
    const start = dateWithMinutes(targetDay, startMinutes);
    const end = new Date(start.getTime() + effectiveDurationMs);

    return { fieldIds: normalizedFieldIds, start, end };
  }, [
    calendarRange.start,
    canManage,
    maxTime,
    minTime,
  ]);

  const resolveManagerCreateDropSelection = useCallback((clientX: number, clientY: number): SelectionState | null => {
    const fieldIds = selectedFieldIds.length ? selectedFieldIds : facilityFilteredFieldIds.slice(0, 1);
    return resolveCalendarPointSelection(clientX, clientY, fieldIds);
  }, [
    facilityFilteredFieldIds,
    resolveCalendarPointSelection,
    selectedFieldIds,
  ]);

  const addManagerCalendarDraft = useCallback((
    mode: ManagerCalendarSelectionMode,
    nextSelection: SelectionState,
  ) => {
    if (!canManage) {
      return;
    }
    const fieldIds = normalizeFieldIds(nextSelection.fieldIds);
    if (!fieldIds.length) {
      notifications.show({ color: 'red', message: 'Select at least one resource first.' });
      return;
    }
    const start = new Date(nextSelection.start);
    const end = new Date(nextSelection.end);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + MIN_SELECTION_MS);
    }
    if (start.toDateString() !== end.toDateString()) {
      notifications.show({ color: 'red', message: 'Drafts must stay within a single day.' });
      return;
    }
    const draft: ManagerCalendarDraft = {
      id: createId(),
      mode,
      fieldIds,
      start,
      end,
    };
    setSelection({ fieldIds, start, end });
    setCalendarDate(start);
    setSelectedManagerDraftId(draft.id);
    setManagerCalendarDrafts((prev) => [...prev, draft]);
    setManagerCalendarPendingChanges((prev) => ([
      ...prev,
      {
        id: createId(),
        type: 'create_draft',
        label: `Added ${MANAGER_SELECTION_TITLES[mode].toLowerCase()}`,
        draft,
      },
    ]));
  }, [canManage]);

  useEffect(() => {
    managerCreateDropResolverRef.current = resolveManagerCreateDropSelection;
    managerCreateDraftAdderRef.current = addManagerCalendarDraft;
  }, [addManagerCalendarDraft, resolveManagerCreateDropSelection]);

  useEffect(() => {
    if (!managerCreateDragMode || managerCreateDragSource !== 'pointer') {
      return undefined;
    }

    const updateLastPoint = (event: PointerEvent | MouseEvent) => {
      const nextPoint = { clientX: event.clientX, clientY: event.clientY };
      managerCreateLastPointRef.current = nextPoint;
      if (managerCreateDragSourceRef.current === 'pointer') {
        setManagerCreateDragPreviewPoint(nextPoint);
      }
    };

    const finishDrag = (event: PointerEvent | MouseEvent) => {
      const mode = managerCreateDragModeRef.current;
      const dropPoint = managerCreateLastPointRef.current ?? { clientX: event.clientX, clientY: event.clientY };
      managerCreateDragModeRef.current = null;
      managerCreateDragSourceRef.current = null;
      managerCreateLastPointRef.current = null;
      setManagerCreateDragSource(null);
      setManagerCreateDragPreviewPoint(null);
      setManagerCreateDragMode(null);
      if (!mode) {
        return;
      }
      const nextSelection = managerCreateDropResolverRef.current?.(dropPoint.clientX, dropPoint.clientY);
      if (!nextSelection) {
        return;
      }
      managerCreateDraftAdderRef.current?.(mode, nextSelection);
    };

    const cancelDrag = () => {
      managerCreateDragModeRef.current = null;
      managerCreateDragSourceRef.current = null;
      managerCreateLastPointRef.current = null;
      setManagerCreateDragSource(null);
      setManagerCreateDragPreviewPoint(null);
      setManagerCreateDragMode(null);
    };

    window.addEventListener('pointermove', updateLastPoint, true);
    window.addEventListener('mousemove', updateLastPoint, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('mouseup', finishDrag, true);
    window.addEventListener('pointercancel', cancelDrag, true);
    window.addEventListener('blur', cancelDrag);

    return () => {
      window.removeEventListener('pointermove', updateLastPoint, true);
      window.removeEventListener('mousemove', updateLastPoint, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('mouseup', finishDrag, true);
      window.removeEventListener('pointercancel', cancelDrag, true);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [managerCreateDragMode, managerCreateDragSource]);

  const handleManagerCreatePointerDown = useCallback((
    mode: ManagerCalendarSelectionMode,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!managerCalendarEditMode) {
      return;
    }
    if (!canManage || !selectedFieldIds.length) {
      notifications.show({ color: 'red', message: 'Select at least one resource first.' });
      return;
    }
    event.preventDefault();
    managerCreateDragModeRef.current = mode;
    managerCreateDragSourceRef.current = 'pointer';
    managerCreateLastPointRef.current = { clientX: event.clientX, clientY: event.clientY };
    setManagerCreateDragSource('pointer');
    setManagerCreateDragPreviewPoint({ clientX: event.clientX, clientY: event.clientY });
    setManagerCreateDragMode(mode);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail when another interaction has already captured it.
    }
  }, [canManage, managerCalendarEditMode, selectedFieldIds.length]);

  const handleManagerCreatePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerCreateDragModeRef.current || managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    const nextPoint = { clientX: event.clientX, clientY: event.clientY };
    managerCreateLastPointRef.current = nextPoint;
    setManagerCreateDragPreviewPoint(nextPoint);
  }, []);

  const handleManagerCreatePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    const mode = managerCreateDragModeRef.current;
    const dropPoint = managerCreateLastPointRef.current ?? { clientX: event.clientX, clientY: event.clientY };
    if (!mode) {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released.
    }

    const nextSelection = resolveManagerCreateDropSelection(dropPoint.clientX, dropPoint.clientY);
    if (!nextSelection) {
      return;
    }
    event.preventDefault();
    addManagerCalendarDraft(mode, nextSelection);
  }, [addManagerCalendarDraft, resolveManagerCreateDropSelection]);

  const handleManagerCreatePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (managerCreateDragSourceRef.current !== 'pointer') {
      return;
    }
    managerCreateDragModeRef.current = null;
    managerCreateDragSourceRef.current = null;
    managerCreateLastPointRef.current = null;
    setManagerCreateDragSource(null);
    setManagerCreateDragPreviewPoint(null);
    setManagerCreateDragMode(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
  }, []);

  const handleManagerDraftPointerDown = useCallback((
    draftEvent: SelectionCalendarEntry,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!canManage || !managerCalendarEditMode || draftEvent.metaType !== 'selection') {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const draftId = typeof draftEvent.resource?.slotKey === 'string' ? draftEvent.resource.slotKey : '';
    const draft = managerCalendarDrafts.find((candidate) => candidate.id === draftId);
    if (!draft) {
      return;
    }
    const target = event.target as Element | null;
    const isResizeHandle = typeof target?.closest === 'function' && (
      target.closest('.rbc-addons-dnd-resize-ns-anchor')
      || target.closest('.rbc-addons-dnd-resize-ew-anchor')
    );
    const isDragHandle = typeof target?.closest === 'function'
      && Boolean(target.closest('.shared-calendar-event__drag-handle'));
    if (!isDragHandle) {
      if (!isResizeHandle) {
        event.stopPropagation();
        openManagerCalendarDraftEditor(draftId, draft);
      }
      return;
    }
    event.stopPropagation();
    const startPoint = { clientX: event.clientX, clientY: event.clientY };
    managerDraftDragRef.current = {
      draftId,
      draft,
      fieldIds: normalizeFieldIds(draft.fieldIds),
      durationMs: Math.max(MIN_SELECTION_MS, draft.end.getTime() - draft.start.getTime()),
      startPoint,
      lastPoint: startPoint,
      hasMoved: false,
    };
    setManagerDraftDragId(draftId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser already released this interaction.
    }
  }, [canManage, managerCalendarDrafts, managerCalendarEditMode]);

  const handleManagerDraftPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerDraftDragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextPoint = { clientX: event.clientX, clientY: event.clientY };
    managerDraftDragRef.current = {
      ...managerDraftDragRef.current,
      lastPoint: nextPoint,
      hasMoved: managerDraftDragRef.current.hasMoved
        || hasMovedPastDragThreshold(managerDraftDragRef.current.startPoint, nextPoint),
    };
  }, []);

  const handleManagerDraftPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = managerDraftDragRef.current;
    if (!dragState) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    managerDraftDragRef.current = null;
    setManagerDraftDragId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
    if (!dragState.hasMoved) {
      openManagerCalendarDraftEditor(dragState.draftId, dragState.draft);
      return;
    }
    managerDraftSuppressNextClickRef.current = true;
    const nextSelection = resolveCalendarPointSelection(
      dragState.lastPoint.clientX,
      dragState.lastPoint.clientY,
      dragState.fieldIds,
      dragState.durationMs,
    );
    if (!nextSelection) {
      return;
    }
    applySelectionWindow(nextSelection.start, nextSelection.end, { slotKey: dragState.draftId });
  }, [applySelectionWindow, openManagerCalendarDraftEditor, resolveCalendarPointSelection]);

  const handleManagerDraftPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!managerDraftDragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    managerDraftDragRef.current = null;
    setManagerDraftDragId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // No-op when capture was not active.
    }
  }, []);

  useEffect(() => {
    if (!managerDraftDragId) {
      return undefined;
    }

    const updateLastPoint = (event: PointerEvent | MouseEvent) => {
      if (!managerDraftDragRef.current) {
        return;
      }
      const nextPoint = { clientX: event.clientX, clientY: event.clientY };
      managerDraftDragRef.current = {
        ...managerDraftDragRef.current,
        lastPoint: nextPoint,
        hasMoved: managerDraftDragRef.current.hasMoved
          || hasMovedPastDragThreshold(managerDraftDragRef.current.startPoint, nextPoint),
      };
    };

    const finishDrag = (event: PointerEvent | MouseEvent) => {
      const dragState = managerDraftDragRef.current;
      if (!dragState) {
        return;
      }
      updateLastPoint(event);
      const finalState = managerDraftDragRef.current ?? dragState;
      managerDraftDragRef.current = null;
      setManagerDraftDragId(null);
      if (!finalState.hasMoved) {
        openManagerCalendarDraftEditor(finalState.draftId, finalState.draft);
        return;
      }
      managerDraftSuppressNextClickRef.current = true;
      const nextSelection = resolveCalendarPointSelection(
        finalState.lastPoint.clientX,
        finalState.lastPoint.clientY,
        finalState.fieldIds,
        finalState.durationMs,
      );
      if (!nextSelection) {
        return;
      }
      applySelectionWindow(nextSelection.start, nextSelection.end, { slotKey: finalState.draftId });
    };

    const cancelDrag = () => {
      managerDraftDragRef.current = null;
      setManagerDraftDragId(null);
    };

    window.addEventListener('pointermove', updateLastPoint, true);
    window.addEventListener('mousemove', updateLastPoint, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('mouseup', finishDrag, true);
    window.addEventListener('pointercancel', cancelDrag, true);
    window.addEventListener('blur', cancelDrag);

    return () => {
      window.removeEventListener('pointermove', updateLastPoint, true);
      window.removeEventListener('mousemove', updateLastPoint, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('mouseup', finishDrag, true);
      window.removeEventListener('pointercancel', cancelDrag, true);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [applySelectionWindow, managerDraftDragId, openManagerCalendarDraftEditor, resolveCalendarPointSelection]);

  const openStaffAssignmentEditModal = useCallback((item: FacilityCalendarFeedItem, start: Date, end: Date) => {
    if (!canManage) {
      return;
    }
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    const assignment = item.source as StaffScheduleAssignment | undefined;
    if (!assignment?.id) {
      notifications.show({ color: 'red', message: 'Unable to resolve this staff assignment.' });
      return;
    }
    if (!assignment.parentAssignmentId && !assignment.userId && !assignment.staffMemberId) {
      if (!item.fieldId) {
        notifications.show({ color: 'red', message: 'Assigning coverage from the calendar requires a resource.' });
        return;
      }
      setSelection({ fieldIds: [item.fieldId], start, end });
      setCalendarDate(new Date(start));
      setEditingStaffAssignment(null);
      setStaffTimeslotParentAssignment(assignment);
      setStaffTimeslotMode(item.type === 'official_assignment' ? 'official_assignment' : 'staff_assignment');
      setStaffTimeslotUserId(null);
      setStaffTimeslotOverrideAmount('');
      setStaffTimeslotNotes(assignment.notes ?? '');
      setStaffTimeslotRepeating(false);
      setStaffTimeslotRepeatDays([mondayDayOf(start)]);
      setStaffTimeslotRepeatEndDate(null);
      setStaffTimeslotError(null);
      setStaffTimeslotModalOpen(true);
      if (!staffScheduleLoaded) {
        void loadStaffSchedule();
      }
      return;
    }

    const fieldId = item.fieldId ?? assignment.fieldId ?? null;
    if (!fieldId) {
      notifications.show({ color: 'red', message: 'Assigning coverage from the calendar requires a resource.' });
      return;
    }
    const timeSlot = assignment.timeSlot ?? null;
    const repeatEndDate = timeSlot?.endDate ? toValidDate(timeSlot.endDate) : null;
    setSelection({ fieldIds: [fieldId], start, end });
    setCalendarDate(new Date(start));
    setEditingStaffAssignment(assignment);
    setStaffTimeslotParentAssignment(null);
    setStaffTimeslotMode(item.type === 'official_assignment' ? 'official_assignment' : 'staff_assignment');
    setStaffTimeslotUserId(assignment.userId ?? null);
    setStaffTimeslotOverrideAmount(dollarsFromCents(assignment.rateOverrideCents));
    setStaffTimeslotNotes(assignment.notes ?? '');
    setStaffTimeslotRepeating(Boolean(timeSlot?.repeating));
    setStaffTimeslotRepeatDays(Array.isArray(timeSlot?.daysOfWeek) && timeSlot.daysOfWeek.length
      ? timeSlot.daysOfWeek
      : [mondayDayOf(start)]);
    setStaffTimeslotRepeatEndDate(repeatEndDate);
    setStaffTimeslotError(null);
    setStaffTimeslotModalOpen(true);
    if (!staffScheduleLoaded) {
      void loadStaffSchedule();
    }
  }, [canManage, loadStaffSchedule, staffScheduleLoaded]);

  useEffect(() => {
    openStaffAssignmentEditModalRef.current = openStaffAssignmentEditModal;
  }, [openStaffAssignmentEditModal]);

  const handleSelectCalendarEvent = useCallback((event: any) => {
    if (!canManage) return;
    if (!event) return;
    if (event.metaType === 'selection') {
      const draftId = typeof event.resource?.slotKey === 'string' ? event.resource.slotKey : '';
      if (draftId) {
        openManagerCalendarDraftEditor(draftId);
      }
      return;
    }
    if (
      event.metaType === 'facility-feed'
      && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
      && event.resource
      && event.start
      && event.end
    ) {
      if (isStaffAssignmentActivationSuppressed()) {
        return;
      }
      openStaffAssignmentEditModal(event.resource as FacilityCalendarFeedItem, event.start, event.end);
      return;
    }
    if (event.metaType !== 'rental') return;

    const slot = event.resource as TimeSlot | undefined;
    if (!slot?.$id) return;
    const eventFieldId = typeof event.resourceId === 'string' ? event.resourceId : '';
    const ownerField = fields.find((field) => field.$id === eventFieldId) ?? selectedField;
    if (!ownerField) return;
    setSelectedManagerDraftId(null);
    setEditingManagerDraftId(null);
    setEditingRentalField(ownerField);
    setEditingRentalSlot(slot);
    setRentalDraftRange(null);
    setCreateRentalOpen(true);
  }, [canManage, fields, isStaffAssignmentActivationSuppressed, openManagerCalendarDraftEditor, openStaffAssignmentEditModal, selectedField]);

  const CalendarEvent: any = ({ event }: any) => {
    const normalizedFieldName = typeof event?.fieldName === 'string' ? event.fieldName.trim() : '';
    const resource = event?.resource as any;
    const resourceName = typeof resource?.name === 'string' ? resource.name.trim() : '';
    const matchLabel = typeof resource?.matchId === 'number' ? `Match #${resource.matchId}` : '';
    const timeLabel = event?.start && event?.end
      ? `${formatDisplayTime(event.start)} - ${formatDisplayTime(event.end)}`
      : null;

    const variant = getCalendarEventVariant(event as CalendarEventData);
    let title = event.title;
    let meta = timeLabel;
    if (event?.metaType === 'facility-feed') {
      const feedItem = event.resource as FacilityCalendarFeedItem;
      const status = formatFacilityFeedStatus(feedItem);
      title = feedItem.title || event.title;
      meta = status ?? timeLabel;
    } else if (event?.metaType === 'booked') {
      const isRentalBooking = variant === 'reservation';
      const isUnavailable = variant === 'unavailable';
      title = isUnavailable ? 'Unavailable' : isRentalBooking ? 'Rental reservation' : resourceName || matchLabel || 'Booked slot';
      meta = isUnavailable ? timeLabel : isRentalBooking ? 'Reserved' : 'Booked';
    } else if (event?.metaType === 'rental') {
      const isUnavailable = variant === 'unavailable';
      title = isUnavailable ? 'Past rental slot' : 'Open rental slot';
      meta = isUnavailable ? 'Unavailable' : timeLabel;
    } else if (event?.metaType === 'selection' && canManage) {
      const mode = event.selectionMode ?? resource?.mode;
      const isAssignedStaffDraft = (
        (mode === 'staff_assignment' || mode === 'official_assignment')
        && Boolean(resource?.userId)
      );
      title = isAssignedStaffDraft
        ? event.title
        : MANAGER_SELECTION_TITLES[mode as ManagerCalendarSelectionMode] ?? event.title;
      meta = 'Unsaved';
    }
    const isManagerDraft = Boolean(
      canManage
      && managerCalendarEditMode
      && event?.metaType === 'selection'
      && typeof resource?.slotKey === 'string'
      && resource.slotKey.length > 0
      && (event.selectionMode || resource?.mode),
    );
    const isStaffAssignmentFeedEvent = Boolean(
      canManage
      && event?.metaType === 'facility-feed'
      && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
      && event.start
      && event.end
      && event.resource,
    );
    const isEditableStaffAssignmentFeedEvent = Boolean(isStaffAssignmentFeedEvent && managerCalendarEditMode);

    return (
      <SharedCalendarEvent
        title={title}
        subtitle={normalizedFieldName || undefined}
        meta={meta}
        colorReferenceList={fieldColorReferenceList}
        colorMatchKey={event?.resourceId}
        resourceColorMatchKeys={event?.resourceId ? [event.resourceId] : undefined}
        dataAttributes={{
          ...(isStaffAssignmentFeedEvent ? {
            'data-staff-assignment-calendar-event-id': String(event.id),
          } : {}),
          ...(isManagerDraft && typeof resource?.slotKey === 'string' ? {
            'data-manager-draft-id': resource.slotKey,
          } : {}),
        }}
        compact
        draggable={
          isManagerDraft
          || isEditableStaffAssignmentFeedEvent
          || (canManage && managerCalendarEditMode && event?.metaType === 'rental')
        }
        selected={isManagerDraft && managerDraftDragId === resource?.slotKey}
        conflict={variant === 'conflict'}
        variant={variant}
        onClick={isManagerDraft
          ? () => {
              if (managerDraftSuppressNextClickRef.current) {
                managerDraftSuppressNextClickRef.current = false;
                return;
              }
              const draftId = typeof resource?.slotKey === 'string' ? resource.slotKey : '';
              if (draftId) {
                const mode = event.selectionMode ?? resource?.mode;
                const fallbackDraft = mode
                  ? {
                      id: draftId,
                      mode,
                      fieldIds: event.resourceId ? [event.resourceId] : [],
                      start: new Date(event.start),
                      end: new Date(event.end),
                      ...(mode === 'rental'
                        ? { rental: {} }
                        : {
                            staff: {
                              userId: resource?.userId ?? null,
                              userName: typeof event.title === 'string' ? event.title : null,
                            },
                          }),
                    } satisfies ManagerCalendarDraft
                  : null;
                openManagerCalendarDraftEditor(draftId, fallbackDraft);
              }
            }
          : isStaffAssignmentFeedEvent
            ? () => {
              if (isStaffAssignmentActivationSuppressed()) {
                return;
              }
              openStaffAssignmentEditModal(event.resource as FacilityCalendarFeedItem, event.start, event.end);
            }
          : undefined}
        onMouseDown={isManagerDraft
          ? (mouseEvent) => {
              const target = mouseEvent.target as Element | null;
              if (
                typeof target?.closest === 'function'
                && (
                  target.closest('.shared-calendar-event__drag-handle')
                  || target.closest('.rbc-addons-dnd-resize-ns-anchor')
                  || target.closest('.rbc-addons-dnd-resize-ew-anchor')
                )
              ) {
                return;
              }
              const draftId = typeof resource?.slotKey === 'string' ? resource.slotKey : '';
              if (!draftId) {
                return;
              }
              mouseEvent.stopPropagation();
              const mode = event.selectionMode ?? resource?.mode;
              const fallbackDraft = mode
                ? {
                    id: draftId,
                    mode,
                    fieldIds: event.resourceId ? [event.resourceId] : [],
                    start: new Date(event.start),
                    end: new Date(event.end),
                    ...(mode === 'rental'
                      ? { rental: {} }
                      : {
                          staff: {
                            userId: resource?.userId ?? null,
                            userName: typeof event.title === 'string' ? event.title : null,
                          },
                        }),
                  } satisfies ManagerCalendarDraft
                : null;
              openManagerCalendarDraftEditor(draftId, fallbackDraft);
            }
          : undefined}
        onPointerDown={isManagerDraft ? (pointerEvent) => handleManagerDraftPointerDown(event as SelectionCalendarEntry, pointerEvent) : undefined}
        onPointerMove={isManagerDraft ? handleManagerDraftPointerMove : undefined}
        onPointerUp={isManagerDraft
          ? handleManagerDraftPointerUp
          : isStaffAssignmentFeedEvent && !managerCalendarEditMode
            ? (pointerEvent) => {
                if (isStaffAssignmentActivationSuppressed()) {
                  pointerEvent.preventDefault();
                  pointerEvent.stopPropagation();
                  return;
                }
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                openStaffAssignmentEditModal(event.resource as FacilityCalendarFeedItem, event.start, event.end);
              }
            : undefined}
        onPointerCancel={isManagerDraft ? handleManagerDraftPointerCancel : undefined}
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
              <span>Loading resource…</span>
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
    ? Boolean(selectedFieldIds.length > 0)
    : readonlyCalendarFields.length > 0;
  const managerCreateDragTemplate = managerCalendarEditMode && managerCreateDragMode
    ? MANAGER_CREATE_TEMPLATES.find((template) => template.mode === managerCreateDragMode) ?? null
    : null;
  const fieldCalendarNode = canRenderCalendar ? (
    <div
      className="shared-calendar-shell shared-calendar-shell--fields"
      style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT, overflow: 'hidden' }}
      onPointerDownCapture={handleCalendarShellStaffPointerDown}
      onPointerUpCapture={handleCalendarShellStaffEventActivation}
      onClickCapture={handleCalendarShellStaffEventActivation}
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
        draggableAccessor={(event: CalendarEventData) => {
          const isEditableStaffEvent = event.metaType === 'facility-feed'
            && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
          return (
            canManage
            && managerCalendarEditMode
            && (event.metaType === 'selection' || event.metaType === 'rental' || isEditableStaffEvent)
          );
        }}
        resizableAccessor={(event: CalendarEventData) => {
          const isEditableStaffEvent = event.metaType === 'facility-feed'
            && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
          return (
            canManage
            && managerCalendarEditMode
            && (event.metaType === 'selection' || event.metaType === 'rental' || isEditableStaffEvent)
          );
        }}
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
      <Text c="dimmed">{canManage ? 'Select at least one resource to view availability.' : 'No resources are available for rentals.'}</Text>
    </Paper>
  );

  if (orgLoading) {
    return <Loading fullScreen={false} text="Loading resources..." />;
  }

  return (
    <Stack gap="md">
      {managerCreateDragTemplate && managerCreateDragPreviewPoint ? (
        <div
          className="facility-calendar-create-drag-preview"
          style={{
            left: managerCreateDragPreviewPoint.clientX,
            top: managerCreateDragPreviewPoint.clientY,
          }}
          aria-hidden="true"
        >
          <SharedCalendarEvent
            title={managerCreateDragTemplate.title}
            subtitle={managerCreateDragTemplate.subtitle}
            meta={managerCreateDragTemplate.meta}
            colorSeed={managerCreateDragTemplate.colorSeed}
            colorReferenceList={fieldColorReferenceList}
            colorMatchKey={selectedFieldIds[0] ?? undefined}
            resourceColorMatchKeys={selectedFieldIds}
            variant={managerCreateDragTemplate.variant}
            draggable
            selected
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Title order={3} mb={4}>
            Facilities
          </Title>
          <Text c="dimmed">
            {canManage
              ? 'Group resources by physical place, then use the calendar to manage rental slots and pricing.'
              : 'Choose a resource and drag the calendar to set your rental time.'}
          </Text>
        </div>

        {canManage && (
          <Group gap="xs" className="md:justify-end">
            <Button size="xs" variant="light" onClick={openCreateFacility}>
              + Facility
            </Button>
            <Button
              size="xs"
              onClick={() => {
                setEditField(null);
                setNewResourceFacilityId(defaultFacilityId);
                setCreateFieldOpen(true);
              }}
            >
              + Resource
            </Button>
            {managerCalendarEditMode ? (
              <>
                <Button
                  size="xs"
                  variant="default"
                  onClick={undoLastManagerCalendarChange}
                  disabled={managerCalendarDraftsSaving || !managerCalendarPendingChangeCount}
                >
                  Undo
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleCancelManagerCalendarEditMode}
                  disabled={managerCalendarDraftsSaving}
                >
                  Discard changes
                </Button>
                <Button
                  size="xs"
                  onClick={() => void handleSaveManagerCalendarDrafts()}
                  loading={managerCalendarDraftsSaving}
                  disabled={!managerCalendarPendingChangeCount}
                  data-testid="facility-calendar-save-drafts"
                >
                  {managerCalendarPendingChangeCount
                    ? `Save changes (${managerCalendarPendingChangeCount})`
                    : 'Save changes'}
                </Button>
              </>
            ) : (
              <Button
                size="xs"
                variant="light"
                onClick={() => setManagerCalendarEditMode(true)}
              >
                Edit schedule
              </Button>
            )}
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
            <Text c="dimmed">No resources available.</Text>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditField(null);
                  setNewResourceFacilityId(defaultFacilityId);
                  setCreateFieldOpen(true);
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Create your first resource
              </Button>
            ) : (
              <Text size="sm" c="dimmed">
                Sign in as the organization owner to add resources and rental slots.
              </Text>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          {canManage ? (
            <Stack gap="md">
              <Stack gap="sm">
                {facilities.length > 0 || unassignedFields.length > 0 ? (
                  <ResponsiveCardGrid maxCardWidth={360} className="facility-management-grid">
                    {facilities.map((facility) => {
                      const operatingHoursLabel = formatFacilityOperatingHours(facility.operatingHours);
                      return (
                        <div
                          key={facility.$id}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2"
                        >
                          <Group justify="space-between" gap="sm" align="flex-start">
                            <div className="min-w-0">
                              <Group gap="xs">
                                <Text fw={700} size="sm">{facility.name || 'Facility'}</Text>
                                {facility.isDefault ? <Badge size="xs" variant="light">Default</Badge> : null}
                              </Group>
                              {facility.location || facility.address ? (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {facility.location || facility.address}
                                </Text>
                              ) : null}
                              {operatingHoursLabel ? (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {operatingHoursLabel}
                                </Text>
                              ) : null}
                              <Text size="xs" c="dimmed">
                                {resourceCountByFacilityId.get(facility.$id) ?? 0} resource{resourceCountByFacilityId.get(facility.$id) === 1 ? '' : 's'}
                              </Text>
                            </div>
                            <Button size="compact-xs" variant="subtle" onClick={() => openEditFacility(facility)}>
                              Edit
                            </Button>
                          </Group>
                        </div>
                      );
                    })}
                    {unassignedFields.length > 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2">
                        <Group justify="space-between" gap="sm" align="flex-start">
                          <div className="min-w-0">
                            <Group gap="xs">
                              <Text fw={700} size="sm">Unassigned resources</Text>
                              <Badge size="xs" variant="light" color="yellow">Needs facility</Badge>
                            </Group>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              Resources without a facility grouping.
                            </Text>
                            <Text size="xs" c="dimmed">
                              {unassignedFields.length} resource{unassignedFields.length === 1 ? '' : 's'}
                            </Text>
                          </div>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => handleFacilityFilterChange(UNASSIGNED_FACILITY_FILTER_VALUE)}
                          >
                            View
                          </Button>
                        </Group>
                      </div>
                    ) : null}
                  </ResponsiveCardGrid>
                ) : (
                  <Text size="sm" c="dimmed">
                    Create a facility before assigning resources.
                  </Text>
                )}
              </Stack>

              <div className="rounded-md border border-slate-200 bg-white p-3">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={700}>Facility operations summary</Text>
                      <Text size="sm" c="dimmed">
                        Hidden by default while the calendar and resource controls stay primary.
                      </Text>
                    </div>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => setFacilitySummaryOpen((open) => !open)}
                    >
                      {facilitySummaryOpen ? 'Hide summary' : 'Show summary'}
                    </Button>
                  </Group>

                  <Collapse in={facilitySummaryOpen}>
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <Text size="sm" c="dimmed">
                          {facilityCalendarRangeLabel} - {facilityCalendarSummary.fieldCount} selected resource{facilityCalendarSummary.fieldCount === 1 ? '' : 's'}
                        </Text>
                        <Badge
                          color={facilityCalendarSummary.conflictCount > 0 ? 'red' : 'teal'}
                          variant={facilityCalendarSummary.conflictCount > 0 ? 'filled' : 'light'}
                        >
                          {facilityCalendarSummary.conflictCount > 0
                            ? `${facilityCalendarSummary.conflictCount} unresolved`
                            : 'No conflicts'}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                        <FacilityMetric
                          label="Utilization"
                          value={`${facilityCalendarSummary.utilizationPercent}%`}
                          detail={`${formatCourtHourLabel(facilityCalendarSummary.bookedInventoryHours)} booked of ${formatCourtHourLabel(facilityCalendarSummary.rentalInventoryHours)}`}
                        />
                        <FacilityMetric
                          label="Revenue / court-hour"
                          value={`${formatMetricMoney(facilityCalendarSummary.revenuePerCourtHourCents)}/hr`}
                          detail={`${formatMetricMoney(facilityCalendarSummary.potentialRevenueCents)} listed rental inventory`}
                        />
                        <FacilityMetric
                          label="Open inventory"
                          value={formatCourtHours(facilityCalendarSummary.openInventoryHours)}
                          detail={`${facilityCalendarSummary.rentalSlotCount} rental slot${facilityCalendarSummary.rentalSlotCount === 1 ? '' : 's'} in view`}
                        />
                        <FacilityMetric
                          label="Unresolved conflicts"
                          value={String(facilityCalendarSummary.conflictCount)}
                          detail={`${formatCourtHourLabel(facilityCalendarSummary.conflictHours)} overlapping bookings`}
                        />
                      </SimpleGrid>

                      {facilityCalendarSummary.facilities.length > 1 ? (
                        <div className="space-y-2">
                          {facilityCalendarSummary.facilities.map((facility) => (
                            <div
                              key={facility.facilityId ?? facility.facilityName}
                              className="rounded-md border border-slate-200 px-3 py-2"
                            >
                              <Group justify="space-between" gap="xs" align="center">
                                <Group gap="xs" align="center">
                                  <Text fw={700} size="sm">{facility.facilityName}</Text>
                                  <Badge size="sm" variant="light">
                                    {facility.fieldCount} resource{facility.fieldCount === 1 ? '' : 's'}
                                  </Badge>
                                </Group>
                                <Group gap="md">
                                  <Text size="xs" c="dimmed">{facility.utilizationPercent}% used</Text>
                                  <Text size="xs" c="dimmed">{formatCourtHours(facility.openInventoryHours)} open</Text>
                                  <Text size="xs" c={facility.conflictCount > 0 ? 'red' : 'dimmed'}>
                                    {facility.conflictCount} conflict{facility.conflictCount === 1 ? '' : 's'}
                                  </Text>
                                </Group>
                              </Group>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Stack>
                  </Collapse>
                </Stack>
              </div>

              <div className="shared-calendar-layout">
                <Stack gap="sm">
                  <Select
                    label="Facility"
                    data={facilityFilterOptions}
                    value={selectedFacilityFilterValue}
                    onChange={handleFacilityFilterChange}
                    allowDeselect={false}
                    size="sm"
                  />
                  <Stack gap={6}>
                    <Group justify="space-between" align="center">
                      <Text fw={700} size="sm">Calendar layers</Text>
                      <Button
                        size="compact-xs"
                        variant={allCalendarLayersSelected ? 'light' : 'subtle'}
                        color="gray"
                        onClick={() => setCalendarLayerFilters(CALENDAR_LAYER_ORDER)}
                      >
                        All
                      </Button>
                    </Group>
                    <Group gap={6}>
                      {CALENDAR_LAYER_ORDER.map((type) => {
                        const count = calendarLayerCounts.get(type) ?? 0;
                        const selected = activeCalendarLayerSet.has(type);
                        return (
                          <Button
                            key={type}
                            size="compact-xs"
                            variant={selected ? 'filled' : 'light'}
                            color={CALENDAR_LAYER_COLORS[type]}
                            onClick={() => toggleCalendarLayer(type)}
                          >
                            {CALENDAR_LAYER_LABELS[type]} {count}
                          </Button>
                        );
                      })}
                    </Group>
                  </Stack>
                  {managerCalendarEditMode ? (
                    <Stack gap={6}>
                      <Text fw={700} size="sm">Create</Text>
                      <div className="facility-calendar-create-grid">
                        {MANAGER_CREATE_TEMPLATES.map((template) => {
                          const canDragTemplate = selectedFieldIds.length > 0;
                          const isDragging = managerCreateDragMode === template.mode;
                          return (
                            <div
                              key={template.mode}
                              className={[
                                'facility-calendar-create-card',
                                isDragging ? 'facility-calendar-create-card--active' : '',
                                !canDragTemplate ? 'facility-calendar-create-card--disabled' : '',
                              ].filter(Boolean).join(' ')}
                              draggable={false}
                              aria-grabbed={isDragging}
                              aria-disabled={!canDragTemplate}
                              onPointerDown={(event) => handleManagerCreatePointerDown(template.mode, event)}
                              onPointerMove={handleManagerCreatePointerMove}
                              onPointerUp={handleManagerCreatePointerUp}
                              onPointerCancel={handleManagerCreatePointerCancel}
                            >
                              <SharedCalendarEvent
                                title={template.title}
                                subtitle={template.subtitle}
                                meta={template.meta}
                                colorSeed={template.colorSeed}
                                colorReferenceList={fieldColorReferenceList}
                                colorMatchKey={selectedFieldIds[0] ?? undefined}
                                resourceColorMatchKeys={selectedFieldIds}
                                variant={template.variant}
                                draggable={canDragTemplate}
                                selected={isDragging}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </Stack>
                  ) : null}
                  <FieldCalendarFilter
                    items={fieldFilterItems}
                    selectedIds={selectedFieldIds.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId))}
                    onSelectedIdsChange={handleSelectedFieldIdsChange}
                    colorReferenceList={fieldColorReferenceList}
                    title="Resources"
                    ariaLabel="Facility resources"
                    searchPlaceholder="Search resources"
                    searchAriaLabel="Search resources"
                    emptyText="No resources match this facility."
                  />
                </Stack>
                <Stack gap="sm" className="min-w-0">
                  {fieldCalendarNode}
                </Stack>
              </div>
            </Stack>
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
                    const selectionFieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds);
                    const selectionFacilityValue = getSelectionFacilityFilterValue(selectionFieldIds);
                    const selectionFacilityFields = selectionFacilityValue === ALL_FACILITIES_FILTER_VALUE
                      ? fields
                      : facilityFieldsByFilterValue.get(selectionFacilityValue) ?? [];
                    const selectionFieldOptions = selectionFacilityFields.map((field) => ({
                      value: field.$id,
                      label: getFacilityScopedFieldDisplayName(field),
                    }));
                    const hasConflict = (validation?.conflictCount ?? 0) > 0;
                    return (
                      <Paper
                        key={selectionItem.key}
                        withBorder
                        radius="md"
                        p="sm"
                        shadow="xs"
                        style={{
                          alignSelf: 'start',
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
                          <Select
                            label="Facility"
                            data={publicFacilityFilterOptions}
                            value={selectionFacilityValue}
                            onChange={(nextValue) => {
                              const normalizedValue = nextValue ?? publicFacilityFilterOptions[0]?.value ?? ALL_FACILITIES_FILTER_VALUE;
                              const nextFieldIds = getPreferredFieldIdsForFacilityFilter(normalizedValue);
                              setSelectedFacilityFilterValue(normalizedValue);
                              setReadonlyVisibleFieldIds(nextFieldIds);
                              updateRentalSelection(selectionItem.key, (current) => ({
                                ...current,
                                scheduledFieldIds: nextFieldIds,
                              }));
                            }}
                            allowDeselect={false}
                            size="sm"
                          />
                          <MultiSelect
                            label="Resources"
                            data={selectionFieldOptions}
                            value={selectionFieldIds.filter((fieldId) => selectionFacilityFields.some((field) => field.$id === fieldId))}
                            onChange={(nextValues) => {
                              updateRentalSelection(selectionItem.key, (current) => ({
                                ...current,
                                scheduledFieldIds: normalizeFieldIds(nextValues),
                              }));
                            }}
                            searchable
                            placeholder="Select one or more resources"
                            size="sm"
                          />
                          <Group grow>
                            <DateTimePicker
                              label="Start"
                              value={formatLocalDateTime(selectionRange?.start ?? null) ?? null}
                              minDate={new Date()}
                              size="sm"
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
                              minDate={new Date()}
                              size="sm"
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

          {!canManage && (
            <div className="shared-calendar-layout">
              <Stack gap="sm">
                {currentUser ? (
                  <Select
                    label="Book rental as"
                    data={hostSelectOptions}
                    value={hostSelection}
                    onChange={(value) => setHostSelection(value ?? 'self')}
                    rightSection={hostOptionsLoading ? <Loader size="xs" /> : undefined}
                    rightSectionWidth={hostOptionsLoading ? 36 : undefined}
                    disabled={hostOptionsLoading && hostSelectOptions.length === 1}
                    allowDeselect={false}
                    size="sm"
                  />
                ) : null}
                <Select
                  label="Facility"
                  data={publicFacilityFilterOptions}
                  value={selectedFacilityFilterValue}
                  onChange={handleFacilityFilterChange}
                  allowDeselect={false}
                  size="sm"
                />
                <FieldCalendarFilter
                  items={fieldFilterItems}
                  selectedIds={readonlyCalendarFieldIds}
                  onSelectedIdsChange={handleReadonlyVisibleFieldIdsChange}
                  colorReferenceList={fieldColorReferenceList}
                  title="Resources"
                  ariaLabel="Facility resources"
                  searchPlaceholder="Search resources"
                  searchAriaLabel="Search resources"
                  emptyText="No resources match this facility."
                />
              </Stack>
              <Stack gap="sm" className="min-w-0">
                <Text size="sm" c="dimmed">
                  Click empty time ranges in the calendar to add selections. Drag or resize a highlighted selection to update its date/time across selected resources.
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
                  <Badge color={canReserveRentalResources ? 'teal' : 'red'} size="lg">
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
            {showBackButton && (
              <Button variant="default" onClick={() => router.push(backHref)}>
                {backLabel}
              </Button>
            )}
            {!canManage ? (
              <Button disabled={!canReserveRentalResources || !currentUser} onClick={handleReserveResourcesClick}>
                {primaryActionLabel}
              </Button>
            ) : null}
          </Group>
        </Stack>
      )}

      <Modal
        opened={staffTimeslotModalOpen}
        onClose={() => {
          if (staffTimeslotSubmitting || staffTimeslotDeleting) return;
          resetStaffTimeslotModalState();
        }}
        title={isEditingStaffAssignment
          ? (staffTimeslotMode === 'official_assignment' ? 'Edit Official Assignment' : 'Edit Staff Assignment')
          : isEditingManagerDraft
            ? (staffTimeslotMode === 'official_assignment' ? 'Edit Official Draft' : 'Edit Staff Draft')
            : isAssigningStaffOccurrence
            ? (staffTimeslotMode === 'official_assignment' ? 'Assign Official Coverage' : 'Assign Staff Coverage')
            : (staffTimeslotMode === 'official_assignment' ? 'Apply Official Timeslot' : 'Apply Staff Timeslot')}
        centered
      >
        <Stack gap="sm">
          {staffTimeslotError ? (
            <Alert color="red" radius="md">
              {staffTimeslotError}
            </Alert>
          ) : null}

          <Stack gap={2}>
            <Text size="sm" fw={700}>
              {selectedFields.length > 1
                ? `${selectedFields.length} selected resources`
                : selectedField
                  ? getFacilityScopedFieldDisplayName(selectedField)
                  : 'Selected resource'}
            </Text>
            <Text size="sm" c="dimmed">
              {selection ? `${formatDisplayDateTime(selection.start)} - ${formatDisplayTime(selection.end)}` : 'Select a time range first.'}
            </Text>
          </Stack>

          {isEditingChildStaffAssignment ? (
            <Alert color="blue" radius="md">
              This staff member is assigned to a parent coverage block. You can override pay or unassign them from this occurrence.
            </Alert>
          ) : null}

          <Select
            label="Facility"
            data={facilityFilterOptions}
            value={staffTimeslotResourceFacilityValue}
            onChange={handleStaffTimeslotFacilityChange}
            allowDeselect={false}
            disabled={isEditingChildStaffAssignment}
            size="sm"
          />

          <MultiSelect
            label="Resources"
            description={isEditingStaffAssignment
              ? 'Choose the resource this assignment belongs to.'
              : 'Choose one or more resources to create matching coverage.'}
            data={staffTimeslotResourceOptions}
            value={selectedFieldIds.filter((fieldId) => staffTimeslotResourceFields.some((field) => field.$id === fieldId))}
            onChange={handleStaffTimeslotResourceChange}
            searchable
            placeholder="Select resources"
            disabled={isEditingChildStaffAssignment}
            required={!isEditingChildStaffAssignment}
            size="sm"
          />

          <Select
            label={staffTimeslotMode === 'official_assignment' ? 'Official' : 'Staff member'}
            description={isEditingChildStaffAssignment
              ? 'Managed by the parent coverage assignment.'
              : isAssigningStaffOccurrence
                ? 'Required for assigned coverage.'
                : staffTimeslotMode === 'official_assignment'
                  ? 'Leave blank to create open official coverage.'
                  : 'Leave blank to create open staff coverage.'}
            data={staffTimeslotUserOptions}
            value={staffTimeslotUserId}
            onChange={setStaffTimeslotUserId}
            placeholder={isEditingChildStaffAssignment
              ? (editingStaffAssignment?.userName ?? 'Assigned staff member')
              : isAssigningStaffOccurrence
                ? (staffTimeslotMode === 'official_assignment' ? 'Select official' : 'Select staff member')
                : (staffTimeslotMode === 'official_assignment' ? 'Open official timeslot' : 'Open staff timeslot')}
            searchable={staffTimeslotUserOptions.length > 8}
            disabled={staffScheduleLoading || isEditingChildStaffAssignment}
            rightSection={staffScheduleLoading ? <Loader size="xs" /> : undefined}
            clearable={!isEditingChildStaffAssignment}
            required={isAssigningStaffOccurrence}
          />

          <NumberInput
            label="Override rate"
            description="Optional hourly override for this timeslot."
            prefix="$"
            decimalScale={2}
            min={0}
            value={staffTimeslotOverrideAmount}
            onChange={setStaffTimeslotOverrideAmount}
          />

          {!isAssigningStaffOccurrence && !isEditingStaffAssignment ? (
            <>
              <Checkbox
                label="Repeat weekly"
                description="Use the selected time window on one or more days each week."
                checked={staffTimeslotRepeating}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setStaffTimeslotRepeating(checked);
                  if (checked && staffTimeslotRepeatDays.length === 0 && selection) {
                    setStaffTimeslotRepeatDays([mondayDayOf(selection.start)]);
                  }
                }}
              />

              <Collapse in={staffTimeslotRepeating}>
                <Stack gap="sm">
                  <MultiSelect
                    label="Repeat days"
                    data={STAFF_TIMESLOT_REPEAT_DAY_OPTIONS}
                    value={staffTimeslotRepeatDays.map((day) => String(day))}
                    onChange={(values) => {
                      setStaffTimeslotRepeatDays(Array.from(new Set(values
                        .map((value) => Number(value))
                        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)))
                        .sort((a, b) => a - b));
                    }}
                    placeholder="Select days"
                    required
                  />
                  <DatePickerInput
                    label="Repeat until"
                    description="Optional. Leave blank for an ongoing weekly schedule."
                    placeholder="No end date"
                    valueFormat="MM/DD/YYYY"
                    value={staffTimeslotRepeatEndDate}
                    onChange={(value) => setStaffTimeslotRepeatEndDate(coerceDatePickerValue(value))}
                    minDate={selection ? startOfDay(selection.start) : undefined}
                    clearable
                    clearButtonProps={{ 'aria-label': 'Clear repeat end date' }}
                    popoverProps={{ withinPortal: true }}
                  />
                </Stack>
              </Collapse>
            </>
          ) : null}

          {!isEditingChildStaffAssignment ? (
            <Textarea
              label="Notes"
              minRows={2}
              autosize
              value={staffTimeslotNotes}
              onChange={(event) => setStaffTimeslotNotes(event.currentTarget.value)}
            />
          ) : null}

          <Group justify="space-between">
            <Group gap="xs">
              {isAssigningStaffOccurrence ? (
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void requestDeleteOpenStaffAssignment()}
                  loading={staffTimeslotDeleting}
                  disabled={staffTimeslotSubmitting}
                >
                  {staffTimeslotMode === 'official_assignment' ? 'Delete open official shift' : 'Delete open staff shift'}
                </Button>
              ) : isEditingChildStaffAssignment ? (
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void unassignChildStaffAssignment()}
                  loading={staffTimeslotDeleting}
                  disabled={staffTimeslotSubmitting}
                >
                  Unassign staff member
                </Button>
              ) : isEditingStaffAssignment ? (
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void deleteStaffAssignment()}
                  loading={staffTimeslotDeleting}
                  disabled={staffTimeslotSubmitting}
                >
                  Delete assignment
                </Button>
              ) : null}
            </Group>
            <Group gap="xs">
              <Button
                variant="subtle"
                onClick={resetStaffTimeslotModalState}
                disabled={staffTimeslotSubmitting || staffTimeslotDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitStaffTimeslot()}
                loading={staffTimeslotSubmitting}
                disabled={staffTimeslotSubmitting || staffTimeslotDeleting || !selection || !selectedFields.length}
              >
                {isEditingStaffAssignment
                  ? 'Save assignment'
                  : isEditingManagerDraft
                    ? 'Save draft'
                  : isAssigningStaffOccurrence
                    ? 'Assign coverage'
                    : 'Apply timeslot'}
              </Button>
            </Group>
          </Group>
        </Stack>
	      </Modal>

	      <Modal
	        opened={Boolean(staffAssignmentScopePrompt)}
	        onClose={() => setStaffAssignmentScopePrompt(null)}
	        title={staffAssignmentScopePrompt?.kindLabel === 'official'
	          ? 'Assign official coverage'
	          : 'Assign staff coverage'}
	        centered
	      >
	        <Stack gap="md">
	          <Stack gap={4}>
	            <Text fw={700}>
	              {staffAssignmentScopePrompt?.staffName ?? 'Selected staff member'}
	            </Text>
	            <Text size="sm" c="dimmed">
	              {staffAssignmentScopePrompt?.occurrenceLabel ?? 'Selected occurrence'}
	            </Text>
	          </Stack>
	          <Alert color="blue" radius="md">
	            Assign this person to every instance of the parent coverage block, or only the clicked occurrence?
	          </Alert>
	          <Group justify="flex-end" gap="xs">
	            <Button variant="subtle" onClick={() => setStaffAssignmentScopePrompt(null)}>
	              Cancel
	            </Button>
	            <Button variant="default" onClick={() => applyStaffAssignmentScopePrompt('occurrence')}>
	              This occurrence
	            </Button>
	            <Button onClick={() => applyStaffAssignmentScopePrompt('all')}>
	              All instances
	            </Button>
	          </Group>
	        </Stack>
	      </Modal>

	      <Modal
	        opened={Boolean(openStaffDeleteConfirmation)}
	        onClose={() => setOpenStaffDeleteConfirmation(null)}
        title={openStaffDeletePlan?.parentAssignment.assignmentKind === 'OFFICIAL_SHIFT'
          ? 'Delete open official shift'
          : 'Delete open staff shift'}
        centered
      >
        <Stack gap="md">
          {openStaffDeletePlan ? (
            <>
              {staffAssignmentCanDeleteFollowing(openStaffDeletePlan.parentAssignment) ? (
                <Stack gap="xs">
                  <Text size="sm" fw={700}>Delete scope</Text>
                  <Group gap="xs" grow>
                    <Button
                      variant={openStaffDeleteConfirmation?.scope === 'following' ? 'filled' : 'default'}
                      onClick={() => setOpenStaffDeleteConfirmation((current) => (
                        current ? { ...current, scope: 'following' } : current
                      ))}
                    >
                      This and following
                    </Button>
                    <Button
                      variant={openStaffDeleteConfirmation?.scope === 'all' ? 'filled' : 'default'}
                      onClick={() => setOpenStaffDeleteConfirmation((current) => (
                        current ? { ...current, scope: 'all' } : current
                      ))}
                    >
                      All instances
                    </Button>
                  </Group>
                </Stack>
              ) : null}

              <Stack gap={4}>
                <Text size="sm" fw={700}>
                  {openStaffDeleteConfirmation?.scope === 'all'
                    ? 'All open instances will be removed.'
                    : 'This occurrence and future open instances will be removed.'}
                </Text>
                <Text size="sm" c="dimmed">
                  {`${formatDisplayDateTime(openStaffDeletePlan.occurrenceStart)} - ${formatDisplayTime(openStaffDeletePlan.occurrenceEnd)}`}
                </Text>
              </Stack>

              {openStaffDeletePlan.scope === 'following' && openStaffDeletePlan.shortenedAssignment ? (
                <Alert color="blue" radius="md">
                  The parent open range will be shortened to end after the previous occurrence. Earlier assignments remain unchanged.
                </Alert>
              ) : null}

              {openStaffDeletePlan.scope === 'following' && openStaffDeletePlan.deletesParent ? (
                <Alert color="yellow" radius="md">
                  This is the first occurrence in the open range, so staging this change will delete the parent open shift.
                </Alert>
              ) : null}

              {openStaffDeletePlan.childAssignments.length ? (
                <Alert color="yellow" radius="md">
                  <Stack gap={6}>
                    <Text size="sm" fw={700}>
                      Assigned coverage that will be removed
                    </Text>
                    <Stack
                      gap={6}
                      aria-label="Assigned coverage removal list"
                      style={openStaffDeletePlan.childAssignments.length > OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT
                        ? {
                            maxHeight: OPEN_STAFF_DELETE_VISIBLE_CHILD_LIMIT * OPEN_STAFF_DELETE_CHILD_ROW_HEIGHT,
                            overflowY: 'auto',
                            paddingRight: 4,
                          }
                        : undefined}
                    >
                      {openStaffDeletePlan.childAssignments.map((assignment) => (
                        <Text key={assignment.id} size="sm">
                          {formatStaffAssignmentDeleteChildLabel(assignment)}
                        </Text>
                      ))}
                    </Stack>
                  </Stack>
                </Alert>
              ) : (
                <Text size="sm" c="dimmed">
                  No assigned staff coverage will be removed for this scope.
                </Text>
              )}

              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setOpenStaffDeleteConfirmation(null)}>
                  Cancel
                </Button>
                <Button color="red" onClick={() => void confirmOpenStaffAssignmentDelete()}>
                  Stage delete
                </Button>
              </Group>
            </>
          ) : (
            <Alert color="red" radius="md">
              Unable to resolve this open staff assignment.
            </Alert>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={facilityModalOpen}
        onClose={() => {
          if (facilitySubmitting) return;
          setFacilityModalOpen(false);
          setEditingFacility(null);
          setFacilityFormName('');
          setFacilityFormLocation('');
          setFacilityFormAddress('');
          setFacilityFormCoordinates(EMPTY_FACILITY_COORDINATES);
          setFacilityLocationSelected(false);
          setFacilityWeeklyHours(buildDefaultFacilityWeeklyHours());
          setFacilityResourceIds([]);
          setFacilityResourcesOpen(false);
          setFacilityFormError(null);
        }}
        title={editingFacility ? 'Edit Facility' : 'Create Facility'}
        size="lg"
        centered
      >
        <Stack gap="md">
          {facilityFormError ? (
            <Alert color="red">{facilityFormError}</Alert>
          ) : null}
          <TextInput
            label="Name"
            value={facilityFormName}
            onChange={(event) => setFacilityFormName(event.currentTarget.value)}
            placeholder="Downtown Sports Center"
            required
          />
          <LocationSelector
            label="Location"
            value={facilityFormLocation}
            coordinates={facilityFormCoordinates}
            onChange={(location, lat, lng, address, meta?: LocationSelectionMeta) => {
              const nextSelected = Boolean(meta?.selected);
              setFacilityFormLocation(location);
              setFacilityLocationSelected(nextSelected);
              setFacilityFormCoordinates(nextSelected ? { lat, lng } : EMPTY_FACILITY_COORDINATES);
              setFacilityFormAddress(nextSelected ? address ?? location : '');
              if (
                (facilityFormError === FACILITY_LOCATION_REQUIRED_ERROR || facilityFormError === FACILITY_LOCATION_SELECTION_ERROR)
                && nextSelected
              ) {
                setFacilityFormError(null);
              }
            }}
            isValid={facilityFormError !== FACILITY_LOCATION_REQUIRED_ERROR && facilityFormError !== FACILITY_LOCATION_SELECTION_ERROR}
            errorMessage={
              facilityFormError === FACILITY_LOCATION_REQUIRED_ERROR || facilityFormError === FACILITY_LOCATION_SELECTION_ERROR
                ? facilityFormError
                : undefined
            }
            required
            requireSelection
            selected={facilityLocationSelected}
            selectionErrorMessage={FACILITY_LOCATION_SELECTION_ERROR}
          />
          <Stack gap={6}>
            <Group justify="space-between" align="center" gap="sm">
              <div>
                <Text fw={700} size="sm">Resources in this facility</Text>
                <Text c="dimmed" size="xs">
                  {facilityResourceIds.length} of {resourceAssignmentItems.length} assigned
                </Text>
              </div>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => setFacilityResourcesOpen((open) => !open)}
                aria-expanded={facilityResourcesOpen}
              >
                {facilityResourcesOpen ? 'Hide resources' : 'Show resources'}
              </Button>
            </Group>
            <Collapse in={facilityResourcesOpen}>
              <Stack gap={6} mt="sm">
                <FieldCalendarFilter
                  items={resourceAssignmentItems}
                  selectedIds={facilityResourceIds}
                  onSelectedIdsChange={(values) => setFacilityResourceIds(normalizeFieldIds(values))}
                  ariaLabel="Facility resource assignment"
                  searchPlaceholder="Search resources"
                  searchAriaLabel="Search facility assignment resources"
                  emptyText="No resources match your search."
                  allowEmptySelection
                  colorReferenceList={fieldColorReferenceList}
                  disabled={allFieldOptions.length === 0}
                  showHeader={false}
                  inlineControls
                  unframed
                  maxVisibleItems={5}
                />
              </Stack>
            </Collapse>
          </Stack>
          <Stack gap="xs">
            <Text fw={600} size="sm">Operating hours</Text>
            <Stack gap={6}>
              {facilityWeeklyHours.map((row) => {
                const day = FACILITY_DAY_OPTIONS.find((option) => option.dayOfWeek === row.dayOfWeek);
                const label = day?.longLabel ?? `Day ${row.dayOfWeek + 1}`;
                return (
                  <div
                    key={row.dayOfWeek}
                    className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 px-2 py-1.5 sm:grid-cols-[minmax(9.5rem,1fr)_minmax(7rem,8rem)_minmax(7rem,8rem)]"
                  >
                    <Checkbox
                      className="col-span-2 self-center sm:col-span-1"
                      label={label}
                      checked={!row.closed}
                      onChange={(event) => {
                        const isOpen = event.currentTarget.checked;
                        setFacilityWeeklyHours((current) => current.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek
                            ? {
                                ...entry,
                                closed: !isOpen,
                                openTime: isOpen ? entry.openTime || DEFAULT_FACILITY_OPEN_TIME : entry.openTime,
                                closeTime: isOpen ? entry.closeTime || DEFAULT_FACILITY_CLOSE_TIME : entry.closeTime,
                              }
                            : entry
                        )));
                      }}
                    />
                    <TextInput
                      aria-label={`${label} opens`}
                      type="time"
                      value={row.openTime}
                      disabled={row.closed}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFacilityWeeklyHours((current) => current.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek ? { ...entry, openTime: value } : entry
                        )));
                      }}
                      size="xs"
                      style={{ minWidth: 0 }}
                    />
                    <TextInput
                      aria-label={`${label} closes`}
                      type="time"
                      value={row.closeTime}
                      disabled={row.closed}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFacilityWeeklyHours((current) => current.map((entry) => (
                          entry.dayOfWeek === row.dayOfWeek ? { ...entry, closeTime: value } : entry
                        )));
                      }}
                      size="xs"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                );
              })}
            </Stack>
          </Stack>
          <Group
            justify="flex-end"
            style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 1,
              marginLeft: 'calc(var(--mantine-spacing-md) * -1)',
              marginRight: 'calc(var(--mantine-spacing-md) * -1)',
              marginBottom: 'calc(var(--mantine-spacing-md) * -1)',
              padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md) var(--mantine-spacing-md)',
              background: 'var(--mantine-color-body)',
              borderTop: '1px solid var(--mantine-color-gray-3)',
            }}
          >
            <Button
              variant="default"
              onClick={() => {
                setFacilityModalOpen(false);
                setEditingFacility(null);
                setFacilityFormName('');
                setFacilityFormLocation('');
                setFacilityFormAddress('');
                setFacilityFormCoordinates(EMPTY_FACILITY_COORDINATES);
                setFacilityLocationSelected(false);
                setFacilityWeeklyHours(buildDefaultFacilityWeeklyHours());
                setFacilityResourceIds([]);
                setFacilityResourcesOpen(false);
                setFacilityFormError(null);
              }}
              disabled={facilitySubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveFacility} loading={facilitySubmitting}>
              {editingFacility ? 'Save Facility' : 'Create Facility'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <CreateFieldModal
        isOpen={createFieldOpen}
        onClose={() => {
          setCreateFieldOpen(false);
          setNewResourceFacilityId(null);
        }}
        organization={org ?? undefined}
        field={editField}
        facilities={facilities}
        defaultFacilityId={editField ? getFieldFacilityId(editField) : newResourceFacilityId ?? defaultFacilityId}
        onFieldSaved={async (savedField) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const nextFields = sortFieldsByCreatedAt(prevFields.some((field) => field.$id === savedField.$id)
              ? prevFields.map((field) => (
                field.$id === savedField.$id
                  ? mergeFieldPreservingCalendarHydration(field, savedField)
                  : field
              ))
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
          setNewResourceFacilityId(null);
          await refreshOrganization();
        }}
      />

      <CreateRentalSlotModal
        opened={createRentalOpen}
        onClose={() => {
          setCreateRentalOpen(false);
          setEditingRentalSlot(null);
          setEditingRentalField(null);
          setEditingManagerDraftId(null);
          setRentalDraftRange(null);
        }}
        field={editingRentalField ?? selectedField}
        selectedFields={!editingRentalSlot ? selectedFields : undefined}
        slot={editingRentalSlot}
        initialRange={editingRentalSlot ? null : rentalDraftRange}
        onSubmitOverride={managerCalendarEditMode ? handleRentalSlotModalSubmit : undefined}
        onDeleteOverride={managerCalendarEditMode ? handleRentalSlotModalDelete : undefined}
        onSaved={async (updatedFields) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const updatedById = new Map(updatedFields.map((field) => [field.$id, field]));
            const nextFields = prevFields.map((field) => {
              const updatedField = updatedById.get(field.$id);
              return updatedField
                ? mergeFieldPreservingCalendarHydration(field, updatedField)
                : field;
            });
            return { ...prev, fields: nextFields };
          });
          await refreshOrganization();
        }}
        organizationHasStripeAccount={organizationHasStripeAccount}
        organizationId={organizationId}
        fieldColorReferenceList={fieldColorReferenceList}
      />
    </Stack>
  );
}
