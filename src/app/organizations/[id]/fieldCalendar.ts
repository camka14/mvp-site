import { addMinutes } from 'date-fns';
import type { Field, Match, Event as EventRecord, TimeSlot } from '@/types';
import { getFacilityScopedFieldDisplayName } from '@/lib/fieldUtils';

const ONE_HOUR_IN_MINUTES = 60;

const parseToDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const ensureEndDate = (start: Date, rawEnd?: string | Date | null, fallbackMinutes: number = ONE_HOUR_IN_MINUTES): Date => {
  const parsed = parseToDate(rawEnd);
  if (parsed && parsed.getTime() > start.getTime()) {
    return parsed;
  }
  return addMinutes(start, fallbackMinutes);
};

export type FieldCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: EventRecord | Match | TimeSlot;
  metaType: 'booked' | 'rental';
  fieldName: string;
};

export type FacilityCalendarFeedItemType =
  | 'event'
  | 'game'
  | 'rental'
  | 'maintenance_block'
  | 'staff_assignment'
  | 'official_assignment'
  | 'conflict';

export type FacilityCalendarFeedItem = {
  id: string;
  type: FacilityCalendarFeedItemType;
  title: string;
  start: Date;
  end: Date;
  facilityId: string | null;
  facilityName: string;
  fieldId: string;
  fieldName: string;
  sourceId?: string | null;
  parentId?: string | null;
  userId?: string | null;
  staffMemberId?: string | null;
  positionIds?: string[];
  status?: string | null;
  unresolved?: boolean;
  source: unknown;
};

export type FacilityCalendarConflict = {
  id: string;
  fieldId: string;
  fieldName: string;
  rentalEntryId: string;
  bookingEntryId: string;
  bookingTitle: string;
  start: Date;
  end: Date;
  hours: number;
};

export type FacilityCalendarMetricTotals = {
  fieldCount: number;
  rentalSlotCount: number;
  rentalInventoryHours: number;
  bookedInventoryHours: number;
  bookedCalendarHours: number;
  openInventoryHours: number;
  conflictCount: number;
  conflictHours: number;
  potentialRevenueCents: number;
  revenuePerCourtHourCents: number;
  utilizationPercent: number;
  conflicts: FacilityCalendarConflict[];
};

export type FacilityCalendarFacilitySummary = FacilityCalendarMetricTotals & {
  facilityId: string | null;
  facilityName: string;
};

export type FacilityCalendarSummary = FacilityCalendarMetricTotals & {
  facilities: FacilityCalendarFacilitySummary[];
};

export type FacilityCalendarFeed = {
  items: FacilityCalendarFeedItem[];
  summary: FacilityCalendarSummary;
  range: CalendarRange;
};

const normalizeToMondayIndex = (date: Date): number => {
  return (date.getDay() + 6) % 7;
};

const alignDateToSlot = (seed: Date, slotDay: number): Date => {
  const aligned = new Date(seed.getTime());
  aligned.setHours(0, 0, 0, 0);
  const seedIndex = normalizeToMondayIndex(aligned);
  let diff = slotDay - seedIndex;
  if (diff < 0) {
    diff += 7;
  }
  aligned.setDate(aligned.getDate() + diff);
  return aligned;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

type CalendarRange = { start: Date; end: Date } | null;

type CalendarInterval = { start: Date; end: Date };

const hoursBetween = (start: Date, end: Date): number => (
  Math.max(0, end.getTime() - start.getTime()) / (60 * 60 * 1000)
);

const clampIntervalToRange = (
  start: Date,
  end: Date,
  range: CalendarRange,
): CalendarInterval | null => {
  const rangeStart = range?.start ?? null;
  const rangeEnd = range?.end ?? null;
  const clampedStart = rangeStart && rangeStart.getTime() > start.getTime()
    ? new Date(rangeStart.getTime())
    : new Date(start.getTime());
  const clampedEnd = rangeEnd && rangeEnd.getTime() < end.getTime()
    ? new Date(rangeEnd.getTime())
    : new Date(end.getTime());

  return clampedEnd.getTime() > clampedStart.getTime()
    ? { start: clampedStart, end: clampedEnd }
    : null;
};

const getEntryInterval = (entry: FieldCalendarEntry, range: CalendarRange): CalendarInterval | null => (
  clampIntervalToRange(entry.start, entry.end, range)
);

const getOverlapInterval = (
  left: CalendarInterval,
  right: CalendarInterval,
): CalendarInterval | null => {
  const startMs = Math.max(left.start.getTime(), right.start.getTime());
  const endMs = Math.min(left.end.getTime(), right.end.getTime());
  return endMs > startMs
    ? { start: new Date(startMs), end: new Date(endMs) }
    : null;
};

const mergeIntervals = (intervals: CalendarInterval[]): CalendarInterval[] => {
  if (!intervals.length) {
    return [];
  }

  const sorted = [...intervals].sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: CalendarInterval[] = [];

  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (!last || interval.start.getTime() > last.end.getTime()) {
      merged.push({ start: new Date(interval.start.getTime()), end: new Date(interval.end.getTime()) });
      return;
    }

    if (interval.end.getTime() > last.end.getTime()) {
      last.end = new Date(interval.end.getTime());
    }
  });

  return merged;
};

const getEntryResourceId = (entry: FieldCalendarEntry): string => {
  const resource = entry.resource as { $id?: unknown; id?: unknown } | null | undefined;
  const resourceId = typeof resource?.$id === 'string' && resource.$id.trim()
    ? resource.$id.trim()
    : typeof resource?.id === 'string'
      ? resource.id.trim()
      : '';
  return resourceId || entry.id;
};

const getBookingTitle = (entry: FieldCalendarEntry): string => {
  const resource = entry.resource as {
    name?: unknown;
    matchId?: unknown;
  } | null | undefined;
  if (typeof resource?.name === 'string' && resource.name.trim()) {
    return resource.name.trim();
  }
  if (typeof resource?.matchId === 'number') {
    return `Match #${resource.matchId}`;
  }
  return entry.title || 'Booked';
};

const getRentalEntryPriceCents = (entry: FieldCalendarEntry): number => {
  const resource = entry.resource as { price?: unknown } | null | undefined;
  return typeof resource?.price === 'number' && Number.isFinite(resource.price)
    ? Math.max(0, resource.price)
    : 0;
};

const emptyFacilityCalendarTotals = (fieldCount: number): FacilityCalendarMetricTotals => ({
  fieldCount,
  rentalSlotCount: 0,
  rentalInventoryHours: 0,
  bookedInventoryHours: 0,
  bookedCalendarHours: 0,
  openInventoryHours: 0,
  conflictCount: 0,
  conflictHours: 0,
  potentialRevenueCents: 0,
  revenuePerCourtHourCents: 0,
  utilizationPercent: 0,
  conflicts: [],
});

const normalizeMetricTotals = (totals: FacilityCalendarMetricTotals): FacilityCalendarMetricTotals => {
  const rentalInventoryHours = Math.max(0, totals.rentalInventoryHours);
  const openInventoryHours = Math.max(0, totals.openInventoryHours);
  const bookedInventoryHours = Math.max(0, totals.bookedInventoryHours);

  return {
    ...totals,
    rentalInventoryHours,
    openInventoryHours,
    bookedInventoryHours,
    bookedCalendarHours: Math.max(0, totals.bookedCalendarHours),
    conflictHours: Math.max(0, totals.conflictHours),
    potentialRevenueCents: Math.round(Math.max(0, totals.potentialRevenueCents)),
    revenuePerCourtHourCents: rentalInventoryHours > 0
      ? Math.round(totals.potentialRevenueCents / rentalInventoryHours)
      : 0,
    utilizationPercent: rentalInventoryHours > 0
      ? Math.round((bookedInventoryHours / rentalInventoryHours) * 100)
      : 0,
  };
};

const buildMetricTotalsForFields = (
  fields: Field[],
  range: CalendarRange,
): FacilityCalendarMetricTotals => {
  const totals = emptyFacilityCalendarTotals(fields.length);
  const entries = buildFieldCalendarEvents(fields, range);
  const bookedEntries = entries
    .filter((entry) => entry.metaType === 'booked')
    .map((entry) => ({ entry, interval: getEntryInterval(entry, range) }))
    .filter((entry): entry is { entry: FieldCalendarEntry; interval: CalendarInterval } => Boolean(entry.interval));
  const rentalEntries = entries
    .filter((entry) => entry.metaType === 'rental')
    .map((entry) => ({ entry, interval: getEntryInterval(entry, range) }))
    .filter((entry): entry is { entry: FieldCalendarEntry; interval: CalendarInterval } => Boolean(entry.interval));

  bookedEntries.forEach(({ interval }) => {
    totals.bookedCalendarHours += hoursBetween(interval.start, interval.end);
  });

  rentalEntries.forEach(({ entry: rentalEntry, interval: rentalInterval }) => {
    const rentalHours = hoursBetween(rentalInterval.start, rentalInterval.end);
    totals.rentalSlotCount += 1;
    totals.rentalInventoryHours += rentalHours;
    totals.potentialRevenueCents += getRentalEntryPriceCents(rentalEntry) * rentalHours;

    const overlappingIntervals: CalendarInterval[] = [];
    bookedEntries.forEach(({ entry: bookedEntry, interval: bookedInterval }) => {
      if (bookedEntry.resourceId !== rentalEntry.resourceId) {
        return;
      }

      const overlap = getOverlapInterval(rentalInterval, bookedInterval);
      if (!overlap) {
        return;
      }

      const conflictHours = hoursBetween(overlap.start, overlap.end);
      overlappingIntervals.push(overlap);
      totals.conflicts.push({
        id: `${rentalEntry.id}:${bookedEntry.id}:${overlap.start.getTime()}`,
        fieldId: rentalEntry.resourceId,
        fieldName: rentalEntry.fieldName,
        rentalEntryId: rentalEntry.id,
        bookingEntryId: bookedEntry.id,
        bookingTitle: getBookingTitle(bookedEntry),
        start: overlap.start,
        end: overlap.end,
        hours: conflictHours,
      });
    });

    const bookedHours = mergeIntervals(overlappingIntervals)
      .reduce((sum, interval) => sum + hoursBetween(interval.start, interval.end), 0);
    totals.bookedInventoryHours += Math.min(rentalHours, bookedHours);
    totals.openInventoryHours += Math.max(0, rentalHours - bookedHours);
  });

  totals.conflictCount = totals.conflicts.length;
  totals.conflictHours = totals.conflicts.reduce((sum, conflict) => sum + conflict.hours, 0);

  return normalizeMetricTotals(totals);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const getFieldFacilityId = (field: Field): string | null => {
  if (typeof field.facilityId === 'string' && field.facilityId.trim()) {
    return field.facilityId.trim();
  }

  const facility = field.facility as unknown;
  if (typeof facility === 'string' && facility.trim()) {
    return facility.trim();
  }
  if (!isRecord(facility)) {
    return null;
  }
  if (typeof facility.$id === 'string' && facility.$id.trim()) {
    return facility.$id.trim();
  }
  if (typeof facility.id === 'string' && facility.id.trim()) {
    return facility.id.trim();
  }
  return null;
};

const getFieldFacilityName = (field: Field): string => {
  const facility = field.facility as unknown;
  if (typeof facility === 'string' && facility.trim()) {
    return facility.trim();
  }
  if (isRecord(facility) && typeof facility.name === 'string' && facility.name.trim()) {
    return facility.name.trim();
  }
  return 'Unassigned facility';
};

const getFieldFacilityContext = (field?: Field | null): Pick<FacilityCalendarFeedItem, 'facilityId' | 'facilityName' | 'fieldId' | 'fieldName'> => {
  const fallbackFieldId = field?.$id ?? '';
  return {
    facilityId: field ? getFieldFacilityId(field) : null,
    facilityName: field ? getFieldFacilityName(field) : 'Unassigned facility',
    fieldId: fallbackFieldId,
    fieldName: field ? getFacilityScopedFieldDisplayName(field) : 'Resource',
  };
};

const getSourceId = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.sourceType === 'string'
    && value.sourceType.toUpperCase() === 'RENTAL_BOOKING'
    && typeof value.sourceId === 'string'
    && value.sourceId.trim()
  ) {
    return value.sourceId.trim();
  }
  if (typeof value.$id === 'string' && value.$id.trim()) {
    return value.$id.trim();
  }
  if (typeof value.id === 'string' && value.id.trim()) {
    return value.id.trim();
  }
  return null;
};

const normalizeString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const toRecordArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : []
);

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
);

const isMatchCalendarResource = (value: unknown): value is Match => (
  isRecord(value)
  && (
    typeof value.matchId === 'number'
    || Array.isArray(value.team1Points)
    || Array.isArray(value.setResults)
  )
);

const isEventCalendarResource = (value: unknown): value is EventRecord => (
  isRecord(value)
  && typeof value.eventType === 'string'
);

const getEntryFeedItemType = (entry: FieldCalendarEntry): FacilityCalendarFeedItemType => {
  if (entry.metaType === 'rental') {
    return 'rental';
  }
  const resource = entry.resource as { sourceType?: unknown } | null | undefined;
  if (
    entry.metaType === 'booked'
    && typeof resource?.sourceType === 'string'
    && resource.sourceType.toUpperCase() === 'RENTAL_BOOKING'
  ) {
    return 'rental';
  }
  if (isMatchCalendarResource(entry.resource)) {
    return 'game';
  }
  return 'event';
};

const getEntryFeedTitle = (entry: FieldCalendarEntry, type: FacilityCalendarFeedItemType): string => {
  if (type === 'rental') {
    const resource = entry.resource as { sourceType?: unknown } | null | undefined;
    return (
      typeof resource?.sourceType === 'string'
      && resource.sourceType.toUpperCase() === 'RENTAL_BOOKING'
    )
      ? 'Rental reservation'
      : 'Rental slot';
  }
  const resource = entry.resource as { name?: unknown; matchId?: unknown; event?: { name?: unknown } } | null | undefined;
  if (type === 'game') {
    const eventName = normalizeString(resource?.event?.name);
    const matchLabel = typeof resource?.matchId === 'number' ? `Match #${resource.matchId}` : 'Game';
    return eventName ? `${eventName} - ${matchLabel}` : matchLabel;
  }
  return normalizeString(resource?.name) ?? entry.title;
};

const buildBaseFeedItem = (
  entry: FieldCalendarEntry,
  fieldsById: Map<string, Field>,
): FacilityCalendarFeedItem => {
  const field = fieldsById.get(entry.resourceId) ?? null;
  const type = getEntryFeedItemType(entry);
  return {
    id: entry.id,
    type,
    title: getEntryFeedTitle(entry, type),
    start: entry.start,
    end: entry.end,
    ...getFieldFacilityContext(field),
    fieldId: entry.resourceId,
    fieldName: entry.fieldName,
    sourceId: getSourceId(entry.resource),
    parentId: isMatchCalendarResource(entry.resource)
      ? normalizeString((entry.resource as Match).eventId)
      : isEventCalendarResource(entry.resource)
        ? normalizeString((entry.resource as EventRecord).parentEvent)
        : null,
    status: isRecord(entry.resource) ? normalizeString(entry.resource.status) : null,
    source: entry.resource,
  };
};

const getFallbackInterval = (
  source: { start?: unknown; end?: unknown },
  range: CalendarRange,
): CalendarInterval | null => {
  const start = parseToDate(source.start as string | Date | null | undefined);
  if (!start) {
    return null;
  }
  const end = ensureEndDate(start, source.end as string | Date | null | undefined, ONE_HOUR_IN_MINUTES);
  return clampIntervalToRange(start, end, range);
};

const getAssignmentInterval = (
  assignment: Record<string, unknown>,
  fallback: CalendarInterval | null,
  range: CalendarRange,
): CalendarInterval | null => {
  const rawStart = assignment.plannedStart ?? assignment.actualStart ?? assignment.start;
  const rawEnd = assignment.plannedEnd ?? assignment.actualEnd ?? assignment.end;
  const start = parseToDate(rawStart as string | Date | null | undefined);
  const end = parseToDate(rawEnd as string | Date | null | undefined);
  if (start) {
    return clampIntervalToRange(start, end && end.getTime() > start.getTime() ? end : ensureEndDate(start, null), range);
  }
  return fallback;
};

const getEventStaffAssignmentRows = (event: EventRecord): Record<string, unknown>[] => {
  const raw = event as unknown as Record<string, unknown>;
  return [
    ...toRecordArray(raw.staffAssignments),
    ...toRecordArray(raw.eventStaffAssignments),
    ...toRecordArray(raw.staffLaborEntries),
  ];
};

const buildEventStaffFeedItems = (
  field: Field,
  event: EventRecord,
  range: CalendarRange,
): FacilityCalendarFeedItem[] => {
  const fallback = getFallbackInterval(event as unknown as { start?: unknown; end?: unknown }, range);
  return getEventStaffAssignmentRows(event).flatMap((assignment, index) => {
    const interval = getAssignmentInterval(assignment, fallback, range);
    if (!interval) {
      return [];
    }
    const sourceId = getSourceId(assignment) ?? `${getSourceId(event) ?? 'event'}-staff-${index}`;
    return [{
      id: `facility-calendar-staff-${field.$id}-${sourceId}-${interval.start.getTime()}`,
      type: 'staff_assignment' as const,
      title: normalizeString(assignment.title) ?? normalizeString(assignment.role) ?? 'Staff assignment',
      start: interval.start,
      end: interval.end,
      ...getFieldFacilityContext(field),
      sourceId,
      parentId: getSourceId(event),
      userId: normalizeString(assignment.userId),
      staffMemberId: normalizeString(assignment.staffMemberId),
      status: normalizeString(assignment.status),
      source: assignment,
    }];
  });
};

const buildEventOfficialFeedItems = (
  field: Field,
  event: EventRecord,
  range: CalendarRange,
): FacilityCalendarFeedItem[] => {
  const fallback = getFallbackInterval(event as unknown as { start?: unknown; end?: unknown }, range);
  return (event.eventOfficials ?? []).flatMap((official, index) => {
    if (official.isActive === false) {
      return [];
    }
    const assignedFieldIds = toStringArray(official.fieldIds);
    if (assignedFieldIds.length && !assignedFieldIds.includes(field.$id)) {
      return [];
    }
    if (!fallback) {
      return [];
    }
    const sourceId = normalizeString(official.id) ?? `${getSourceId(event) ?? 'event'}-official-${index}`;
    return [{
      id: `facility-calendar-event-official-${field.$id}-${sourceId}-${fallback.start.getTime()}`,
      type: 'official_assignment' as const,
      title: 'Official assignment',
      start: fallback.start,
      end: fallback.end,
      ...getFieldFacilityContext(field),
      sourceId,
      parentId: getSourceId(event),
      userId: normalizeString(official.userId),
      positionIds: toStringArray(official.positionIds),
      status: 'ACTIVE',
      source: official,
    }];
  });
};

const buildMatchOfficialFeedItems = (
  field: Field,
  match: Match,
  range: CalendarRange,
): FacilityCalendarFeedItem[] => {
  const fallback = getFallbackInterval(match as unknown as { start?: unknown; end?: unknown }, range);
  if (!fallback) {
    return [];
  }
  const assignmentRows = toRecordArray(match.officialIds);
  const rowItems = assignmentRows.flatMap((assignment, index) => {
    const userId = normalizeString(assignment.userId);
    if (!userId) {
      return [];
    }
    const sourceId = getSourceId(assignment) ?? `${getSourceId(match) ?? 'match'}-official-${userId}-${index}`;
    return [{
      id: `facility-calendar-match-official-${field.$id}-${sourceId}-${fallback.start.getTime()}`,
      type: 'official_assignment' as const,
      title: 'Match official assignment',
      start: fallback.start,
      end: fallback.end,
      ...getFieldFacilityContext(field),
      sourceId,
      parentId: getSourceId(match),
      userId,
      positionIds: toStringArray(assignment.positionIds),
      status: typeof assignment.checkedIn === 'boolean' && assignment.checkedIn ? 'CHECKED_IN' : 'ASSIGNED',
      source: assignment,
    }];
  });

  const legacyOfficialId = normalizeString(match.officialId);
  if (!legacyOfficialId || rowItems.some((item) => item.userId === legacyOfficialId)) {
    return rowItems;
  }

  return [
    ...rowItems,
    {
      id: `facility-calendar-match-official-${field.$id}-${getSourceId(match) ?? 'match'}-${legacyOfficialId}-${fallback.start.getTime()}`,
      type: 'official_assignment' as const,
      title: 'Match official assignment',
      start: fallback.start,
      end: fallback.end,
      ...getFieldFacilityContext(field),
      sourceId: getSourceId(match),
      parentId: getSourceId(match),
      userId: legacyOfficialId,
      positionIds: [],
      status: match.officialCheckedIn ? 'CHECKED_IN' : 'ASSIGNED',
      source: match,
    },
  ];
};

const getMaintenanceBlockRows = (field: Field): Record<string, unknown>[] => {
  const raw = field as unknown as Record<string, unknown>;
  return [
    ...toRecordArray(raw.maintenanceBlocks),
    ...toRecordArray(raw.maintenance),
  ];
};

const buildMaintenanceFeedItems = (
  field: Field,
  range: CalendarRange,
): FacilityCalendarFeedItem[] => (
  getMaintenanceBlockRows(field).flatMap((block, index) => {
    const start = parseToDate(block.start as string | Date | null | undefined);
    if (!start) {
      return [];
    }
    const end = ensureEndDate(start, block.end as string | Date | null | undefined, ONE_HOUR_IN_MINUTES);
    const interval = clampIntervalToRange(start, end, range);
    if (!interval) {
      return [];
    }
    const sourceId = getSourceId(block) ?? `${field.$id}-maintenance-${index}`;
    return [{
      id: `facility-calendar-maintenance-${field.$id}-${sourceId}-${interval.start.getTime()}`,
      type: 'maintenance_block' as const,
      title: normalizeString(block.title) ?? normalizeString(block.reason) ?? 'Maintenance block',
      start: interval.start,
      end: interval.end,
      ...getFieldFacilityContext(field),
      sourceId,
      status: normalizeString(block.status),
      source: block,
    }];
  })
);

const buildHydratedAssignmentFeedItems = (
  fields: Field[],
  range: CalendarRange,
): FacilityCalendarFeedItem[] => (
  fields.flatMap((field) => [
    ...((field.events ?? []).flatMap((event) => [
      ...buildEventStaffFeedItems(field, event, range),
      ...buildEventOfficialFeedItems(field, event, range),
    ])),
    ...((field.matches ?? []).flatMap((match) => buildMatchOfficialFeedItems(field, match, range))),
    ...buildMaintenanceFeedItems(field, range),
  ])
);

const buildConflictFeedItems = (
  conflicts: FacilityCalendarConflict[],
  fieldsById: Map<string, Field>,
): FacilityCalendarFeedItem[] => (
  conflicts.map((conflict) => {
    const field = fieldsById.get(conflict.fieldId) ?? null;
    return {
      id: `facility-calendar-conflict-${conflict.id}`,
      type: 'conflict',
      title: `Conflict: ${conflict.bookingTitle}`,
      start: conflict.start,
      end: conflict.end,
      ...getFieldFacilityContext(field),
      fieldId: conflict.fieldId,
      fieldName: conflict.fieldName,
      sourceId: conflict.id,
      parentId: conflict.bookingEntryId,
      status: 'UNRESOLVED',
      unresolved: true,
      source: conflict,
    };
  })
);

const sortFacilityCalendarFeedItems = (items: FacilityCalendarFeedItem[]): FacilityCalendarFeedItem[] => {
  const order: Record<FacilityCalendarFeedItemType, number> = {
    conflict: 0,
    maintenance_block: 1,
    event: 2,
    game: 3,
    rental: 4,
    official_assignment: 5,
    staff_assignment: 6,
  };

  return [...items].sort((left, right) => (
    left.start.getTime() - right.start.getTime()
    || order[left.type] - order[right.type]
    || left.facilityName.localeCompare(right.facilityName, undefined, { numeric: true, sensitivity: 'base' })
    || left.fieldName.localeCompare(right.fieldName, undefined, { numeric: true, sensitivity: 'base' })
    || left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' })
  ));
};

export const buildFacilityCalendarSummary = (
  fields: Field[],
  range: CalendarRange = null,
): FacilityCalendarSummary => {
  const totals = buildMetricTotalsForFields(fields, range);
  const fieldsByFacility = new Map<string, { facilityId: string | null; facilityName: string; fields: Field[] }>();

  fields.forEach((field) => {
    const facilityId = getFieldFacilityId(field);
    const facilityName = getFieldFacilityName(field);
    const key = facilityId ?? `name:${facilityName.toLocaleLowerCase()}`;
    const existing = fieldsByFacility.get(key);
    if (existing) {
      existing.fields.push(field);
      return;
    }
    fieldsByFacility.set(key, { facilityId, facilityName, fields: [field] });
  });

  const facilities = Array.from(fieldsByFacility.values())
    .map((facility) => ({
      ...buildMetricTotalsForFields(facility.fields, range),
      facilityId: facility.facilityId,
      facilityName: facility.facilityName,
    }))
    .sort((left, right) => left.facilityName.localeCompare(right.facilityName, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    ...totals,
    facilities,
  };
};

export const buildFacilityCalendarFeed = (
  fields: Field[],
  range: CalendarRange = null,
): FacilityCalendarFeed => {
  const fieldsById = new Map(fields.map((field) => [field.$id, field]));
  const summary = buildFacilityCalendarSummary(fields, range);
  const baseItems = buildFieldCalendarEvents(fields, range).map((entry) => buildBaseFeedItem(entry, fieldsById));
  const assignmentItems = buildHydratedAssignmentFeedItems(fields, range);
  const conflictItems = buildConflictFeedItems(summary.conflicts, fieldsById);

  return {
    items: sortFacilityCalendarFeedItems([
      ...baseItems,
      ...assignmentItems,
      ...conflictItems,
    ]),
    summary,
    range,
  };
};

export const buildFieldCalendarEvents = (fields: Field[], range: CalendarRange = null): FieldCalendarEntry[] => {
  return fields.flatMap((field) => {
    const baseTitle = getFacilityScopedFieldDisplayName(field);
    const events = (field.events || []).filter((evt) => {
      const eventType = typeof evt.eventType === 'string' ? evt.eventType.toUpperCase() : '';
      const hasParentWeeklyEvent = (
        eventType === 'WEEKLY_EVENT'
        && typeof evt.parentEvent === 'string'
        && evt.parentEvent.trim().length > 0
      );
      return !hasParentWeeklyEvent;
    });
    const matches = field.matches || [];

    const eventEntries: FieldCalendarEntry[] = events.flatMap((evt) => {
      const eventType = typeof evt.eventType === 'string' ? evt.eventType.toUpperCase() : '';
      const shouldUseTimeslotBlocks = (
        (eventType === 'WEEKLY_EVENT' && !evt.parentEvent)
        || eventType === 'LEAGUE'
        || eventType === 'TOURNAMENT'
      );
      if (shouldUseTimeslotBlocks) {
        if (!Array.isArray(evt.timeSlots) || evt.timeSlots.length === 0) {
          return [];
        }
        const rangeStart = range ? new Date(range.start.getTime()) : new Date();
        const rangeEnd = range ? new Date(range.end.getTime()) : addDays(rangeStart, 28);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);

        const generated: FieldCalendarEntry[] = [];
        evt.timeSlots.forEach((slot) => {
          const baseStart = parseToDate(slot.startDate ?? null);
          if (!baseStart) {
            return;
          }

          const slotDays = Array.from(
            new Set(
              (
                Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
                  ? slot.daysOfWeek
                  : typeof slot.dayOfWeek === 'number'
                    ? [slot.dayOfWeek]
                    : []
              )
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
            ),
          );
          const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
          const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
          if (!slotDays.length || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
            return;
          }

          const normalizedBase = new Date(baseStart.getTime());
          normalizedBase.setHours(0, 0, 0, 0);

          const slotEndBoundaryRaw = parseToDate(slot.endDate ?? null);
          const slotEndBoundary = slotEndBoundaryRaw ? new Date(slotEndBoundaryRaw.getTime()) : null;
          if (slotEndBoundary) {
            slotEndBoundary.setHours(23, 59, 59, 999);
          }

          let weekCursor = new Date(rangeStart.getTime());
          weekCursor.setDate(weekCursor.getDate() - normalizeToMondayIndex(weekCursor));
          weekCursor.setHours(0, 0, 0, 0);

          while (weekCursor <= rangeEnd) {
            slotDays.forEach((slotDay) => {
              const occurrence = addDays(weekCursor, slotDay);
              if (occurrence < normalizedBase || occurrence < rangeStart || occurrence > rangeEnd) {
                return;
              }
              if (slotEndBoundary && occurrence > slotEndBoundary) {
                return;
              }
              const effectiveStart = new Date(occurrence.getTime());
              effectiveStart.setMinutes(startMinutes);
              const effectiveEnd = addMinutes(effectiveStart, Math.max(1, endMinutes - startMinutes));
              generated.push({
                id: `field-booked-weekly-${field.$id}-${evt.$id}-${slot.$id}-${effectiveStart.getTime()}`,
                title: 'Booked',
                start: effectiveStart,
                end: effectiveEnd,
                resourceId: field.$id,
                resource: evt,
                metaType: 'booked',
                fieldName: baseTitle,
              });
            });
            weekCursor = addDays(weekCursor, 7);
          }
        });

        return generated;
      }

      const start = parseToDate(evt.start) ?? new Date();
      const end = ensureEndDate(start, evt.end, ONE_HOUR_IN_MINUTES);
      return [{
        id: `field-booked-event-${field.$id}-${evt.$id}`,
        title: 'Booked',
        start,
        end,
        resourceId: field.$id,
        resource: evt,
        metaType: 'booked',
        fieldName: baseTitle,
      }];
    });

    const matchEntries: FieldCalendarEntry[] = matches.map((match) => {
      const start = parseToDate(match.start) ?? new Date();
      const end = ensureEndDate(start, match.end, ONE_HOUR_IN_MINUTES);
      return {
        id: `field-booked-match-${field.$id}-${match.$id}`,
        title: 'Booked',
        start,
        end,
        resourceId: field.$id,
        resource: match,
        metaType: 'booked',
        fieldName: baseTitle,
      };
    });

    const rentalEntries: FieldCalendarEntry[] = [];
    (field.rentalSlots || []).forEach((slot) => {
      const baseStart = parseToDate(slot.startDate ?? null);
      if (!baseStart) {
        return;
      }

      if (
        slot.repeating &&
        typeof slot.dayOfWeek === 'number' &&
        typeof slot.startTimeMinutes === 'number' &&
        typeof slot.endTimeMinutes === 'number'
      ) {
        const rangeStart = range ? new Date(range.start.getTime()) : new Date(baseStart.getTime());
        const rangeEnd = range ? new Date(range.end.getTime()) : new Date(baseStart.getTime());
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);

        const normalizedBase = new Date(baseStart.getTime());
        normalizedBase.setHours(0, 0, 0, 0);

        if (rangeEnd < normalizedBase) {
          return;
        }

        if (rangeStart < normalizedBase) {
          rangeStart.setTime(normalizedBase.getTime());
        }

        const slotEndBoundaryRaw = parseToDate(slot.endDate ?? null);
        const slotEndBoundary = slotEndBoundaryRaw ? new Date(slotEndBoundaryRaw.getTime()) : null;
        if (slotEndBoundary) {
          slotEndBoundary.setHours(23, 59, 59, 999);
          if (slotEndBoundary < rangeStart) {
            return;
          }
        }

        let occurrence = alignDateToSlot(rangeStart, slot.dayOfWeek);
        if (occurrence < normalizedBase) {
          const weeksToCatchUp = Math.ceil((normalizedBase.getTime() - occurrence.getTime()) / (7 * 24 * 60 * 60 * 1000));
          occurrence = addDays(occurrence, weeksToCatchUp * 7);
        }

        const duration = Math.max(1, slot.endTimeMinutes - slot.startTimeMinutes);

        while (occurrence <= rangeEnd && (!slotEndBoundary || occurrence <= slotEndBoundary)) {
          const effectiveStart = new Date(occurrence.getTime());
          effectiveStart.setMinutes(slot.startTimeMinutes);
          const effectiveEnd = addMinutes(effectiveStart, duration);

          rentalEntries.push({
            id: `field-rental-${field.$id}-${slot.$id}-${effectiveStart.getTime()}`,
            title: 'Rental Slot',
            start: effectiveStart,
            end: effectiveEnd,
            resourceId: field.$id,
            resource: slot,
            metaType: 'rental',
            fieldName: baseTitle,
          });

          occurrence = addDays(occurrence, 7);
        }

        return;
      }

      const durationMinutes = typeof slot.endTimeMinutes === 'number' && typeof slot.startTimeMinutes === 'number'
        ? Math.max(1, slot.endTimeMinutes - slot.startTimeMinutes)
        : ONE_HOUR_IN_MINUTES;
      const end = ensureEndDate(
        baseStart,
        slot.endDate ?? null,
        durationMinutes > 0 ? durationMinutes : ONE_HOUR_IN_MINUTES,
      );

      rentalEntries.push({
        id: `field-rental-${field.$id}-${slot.$id}`,
        title: 'Rental Slot',
        start: baseStart,
        end,
        resourceId: field.$id,
        resource: slot,
        metaType: 'rental',
        fieldName: baseTitle,
      });
    });

    return [...eventEntries, ...matchEntries, ...rentalEntries];
  });
};
