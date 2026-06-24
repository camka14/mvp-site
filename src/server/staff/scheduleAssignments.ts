import { prisma } from '@/lib/prisma';

type PrismaLike = any;

export type StaffScheduleAssignmentKind = 'STAFF_SHIFT' | 'OFFICIAL_SHIFT';
export type ScheduleWageType = 'HOURLY' | 'SALARY' | 'FLAT_PER_EVENT';

export type StaffScheduleTimeSlotInput = {
  startDate: string | Date;
  endDate?: string | Date | null;
  repeating?: boolean | null;
  daysOfWeek?: number[] | null;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  timeZone?: string | null;
};

export type StaffScheduleAssignmentInput = {
  organizationId: string;
  parentAssignmentId?: string | null;
  userId?: string | null;
  assignmentKind?: StaffScheduleAssignmentKind | string | null;
  facilityId?: string | null;
  fieldId?: string | null;
  rateOverrideType?: ScheduleWageType | string | null;
  rateOverrideCents?: number | null;
  notes?: string | null;
  timeSlot: StaffScheduleTimeSlotInput;
  actingUserId: string;
};

export type StaffScheduleAssignmentUpdateInput = {
  organizationId: string;
  assignmentId: string;
  userId?: string | null;
  facilityId?: string | null;
  fieldId?: string | null;
  rateOverrideType?: ScheduleWageType | string | null;
  rateOverrideCents?: number | null;
  notes?: string | null;
  timeSlot?: StaffScheduleTimeSlotInput | null;
  action?: 'UNASSIGN' | null;
  actingUserId: string;
};

type NormalizedTimeSlot = {
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  dayOfWeek: number;
  daysOfWeek: number[];
  startTimeMinutes: number;
  endTimeMinutes: number;
  plannedStart: Date;
  plannedEnd: Date;
  plannedMinutes: number;
  timeZone: string;
};

export class StaffScheduleAssignmentError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StaffScheduleAssignmentError';
    this.status = status;
  }
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const parseDate = (value: unknown, fieldName: string): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new StaffScheduleAssignmentError(400, `${fieldName} must be a valid date.`);
};

const parseOptionalDate = (value: unknown, fieldName: string): Date | null => {
  if (value == null || value === '') {
    return null;
  }
  return parseDate(value, fieldName);
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeNotes = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 1000) : null;
};

const normalizeAssignmentKind = (value: unknown): StaffScheduleAssignmentKind => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'OFFICIAL_SHIFT' ? 'OFFICIAL_SHIFT' : 'STAFF_SHIFT';
};

const normalizeWageType = (value: unknown): ScheduleWageType | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'HOURLY' || normalized === 'SALARY' || normalized === 'FLAT_PER_EVENT') {
    return normalized;
  }
  return null;
};

const normalizeCents = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return null;
};

const mondayDayOf = (date: Date): number => (date.getDay() + 6) % 7;

const normalizeMinutes = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StaffScheduleAssignmentError(400, `${fieldName} is required.`);
  }
  const normalized = Math.round(value);
  if (normalized < 0 || normalized > 24 * 60) {
    throw new StaffScheduleAssignmentError(400, `${fieldName} must be within the day.`);
  }
  return normalized;
};

const minutesFromDate = (value: Date): number => value.getHours() * 60 + value.getMinutes();

const dateWithMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
};

const startOfDate = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDate = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const rangesOverlap = (leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date): boolean => (
  leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime()
);

const normalizeDaysOfWeek = (value: unknown, fallback: number): number[] => {
  const rawValues = Array.isArray(value) ? value : [fallback];
  const normalized = Array.from(new Set(rawValues
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)));
  return normalized.length ? normalized.sort((a, b) => a - b) : [fallback];
};

const firstOccurrenceDate = (startDate: Date, daysOfWeek: number[]): Date => {
  const startDay = mondayDayOf(startDate);
  const nextOffset = daysOfWeek
    .map((day) => (day - startDay + 7) % 7)
    .sort((a, b) => a - b)[0] ?? 0;
  const occurrence = new Date(startDate);
  occurrence.setDate(occurrence.getDate() + nextOffset);
  return occurrence;
};

const buildTimeSlotOccurrences = (
  assignment: any,
  timeSlot: any,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ start: Date; end: Date }> => {
  const plannedStart = toDate(assignment?.plannedStart);
  const plannedEnd = toDate(assignment?.plannedEnd);
  const slotStart = toDate(timeSlot?.startDate) ?? plannedStart;
  if (!slotStart) {
    return [];
  }
  const slotEnd = toDate(timeSlot?.endDate) ?? plannedEnd;
  const repeating = Boolean(timeSlot?.repeating);
  if (!repeating) {
    const start = plannedStart ?? slotStart;
    const end = plannedEnd ?? slotEnd;
    return end && end.getTime() > start.getTime() && rangesOverlap(start, end, rangeStart, rangeEnd)
      ? [{ start, end }]
      : [];
  }

  const days = normalizeDaysOfWeek(timeSlot?.daysOfWeek, mondayDayOf(slotStart));
  const startMinutes = typeof timeSlot?.startTimeMinutes === 'number'
    ? timeSlot.startTimeMinutes
    : minutesFromDate(slotStart);
  const endMinutes = typeof timeSlot?.endTimeMinutes === 'number'
    ? timeSlot.endTimeMinutes
    : startMinutes + Math.max(30, assignment?.plannedMinutes ?? 60);
  if (endMinutes <= startMinutes) {
    return [];
  }

  const cursorStart = new Date(Math.max(startOfDate(slotStart).getTime(), startOfDate(rangeStart).getTime()));
  const cursorEnd = new Date(Math.min(
    endOfDate(rangeEnd).getTime(),
    slotEnd ? endOfDate(slotEnd).getTime() : endOfDate(rangeEnd).getTime(),
  ));
  const occurrences: Array<{ start: Date; end: Date }> = [];
  let cursor = cursorStart;
  while (cursor.getTime() <= cursorEnd.getTime()) {
    if (days.includes(mondayDayOf(cursor))) {
      const start = dateWithMinutes(cursor, startMinutes);
      const end = dateWithMinutes(cursor, endMinutes);
      if (end.getTime() > start.getTime() && rangesOverlap(start, end, rangeStart, rangeEnd)) {
        occurrences.push({ start, end });
      }
    }
    const next = new Date(cursor.getTime());
    next.setDate(next.getDate() + 1);
    cursor = next;
  }
  return occurrences;
};

const normalizedTimeSlotToOccurrenceSeed = (timeSlot: NormalizedTimeSlot) => ({
  plannedStart: timeSlot.plannedStart,
  plannedEnd: timeSlot.plannedEnd,
  plannedMinutes: timeSlot.plannedMinutes,
});

const normalizedTimeSlotToRow = (timeSlot: NormalizedTimeSlot) => ({
  startDate: timeSlot.startDate,
  endDate: timeSlot.endDate,
  repeating: timeSlot.repeating,
  daysOfWeek: timeSlot.daysOfWeek,
  startTimeMinutes: timeSlot.startTimeMinutes,
  endTimeMinutes: timeSlot.endTimeMinutes,
});

const normalizeTimeSlotInput = (input: StaffScheduleTimeSlotInput): NormalizedTimeSlot => {
  const startDate = parseDate(input.startDate, 'timeSlot.startDate');
  const repeating = Boolean(input.repeating);
  const fallbackDay = mondayDayOf(startDate);
  const daysOfWeek = normalizeDaysOfWeek(input.daysOfWeek, fallbackDay);
  const startTimeMinutes = repeating
    ? normalizeMinutes(input.startTimeMinutes, 'timeSlot.startTimeMinutes')
    : normalizeMinutes(input.startTimeMinutes ?? minutesFromDate(startDate), 'timeSlot.startTimeMinutes');
  const endTimeMinutes = repeating
    ? normalizeMinutes(input.endTimeMinutes, 'timeSlot.endTimeMinutes')
    : normalizeMinutes(input.endTimeMinutes ?? minutesFromDate(parseDate(input.endDate, 'timeSlot.endDate')), 'timeSlot.endTimeMinutes');
  if (endTimeMinutes <= startTimeMinutes) {
    throw new StaffScheduleAssignmentError(400, 'Assignment end time must be after the start time.');
  }

  const endDate = parseOptionalDate(input.endDate, 'timeSlot.endDate');
  if (!repeating && (!endDate || endDate.getTime() <= startDate.getTime())) {
    throw new StaffScheduleAssignmentError(400, 'Assignment end date must be after the start date.');
  }
  if (repeating && endDate && endDate.getTime() < startDate.getTime()) {
    throw new StaffScheduleAssignmentError(400, 'Repeating assignment end date must be on or after the start date.');
  }

  const occurrenceDate = firstOccurrenceDate(startDate, daysOfWeek);
  const plannedStart = repeating ? dateWithMinutes(occurrenceDate, startTimeMinutes) : startDate;
  const plannedEnd = repeating ? dateWithMinutes(occurrenceDate, endTimeMinutes) : (endDate as Date);
  const plannedMinutes = Math.max(0, Math.round((plannedEnd.getTime() - plannedStart.getTime()) / 60000));
  if (plannedMinutes <= 0) {
    throw new StaffScheduleAssignmentError(400, 'Assignment timeslot must be longer than 0 minutes.');
  }

  const timeZone = normalizeId(input.timeZone) ?? 'UTC';

  return {
    startDate,
    endDate,
    repeating,
    dayOfWeek: daysOfWeek[0] ?? fallbackDay,
    daysOfWeek,
    startTimeMinutes,
    endTimeMinutes,
    plannedStart,
    plannedEnd,
    plannedMinutes,
    timeZone,
  };
};

const validateChildTimeSlot = (parentTimeSlot: any, childTimeSlot: NormalizedTimeSlot): void => {
  const parentStartDate = parseDate(parentTimeSlot.startDate, 'parent.timeSlot.startDate');
  const parentEndDate = parseOptionalDate(parentTimeSlot.endDate, 'parent.timeSlot.endDate');
  const parentRepeating = Boolean(parentTimeSlot.repeating);
  const parentStartMinutes = normalizeMinutes(
    parentTimeSlot.startTimeMinutes ?? minutesFromDate(parentStartDate),
    'parent.timeSlot.startTimeMinutes',
  );
  const parentEndMinutes = normalizeMinutes(
    parentTimeSlot.endTimeMinutes ?? minutesFromDate(parentEndDate ?? parentStartDate),
    'parent.timeSlot.endTimeMinutes',
  );

  if (
    childTimeSlot.startTimeMinutes < parentStartMinutes
    || childTimeSlot.endTimeMinutes > parentEndMinutes
  ) {
    throw new StaffScheduleAssignmentError(400, 'Assigned coverage must stay within the parent assignment time.');
  }

  if (!parentRepeating) {
    const parentEnd = parentEndDate ?? dateWithMinutes(parentStartDate, parentEndMinutes);
    if (
      childTimeSlot.plannedStart.getTime() < parentStartDate.getTime()
      || childTimeSlot.plannedEnd.getTime() > parentEnd.getTime()
    ) {
      throw new StaffScheduleAssignmentError(400, 'Assigned coverage must stay within the parent assignment.');
    }
    return;
  }

  const parentDays = normalizeDaysOfWeek(parentTimeSlot.daysOfWeek, mondayDayOf(parentStartDate));
  if (childTimeSlot.daysOfWeek.some((day) => !parentDays.includes(day))) {
    throw new StaffScheduleAssignmentError(400, 'Assigned coverage must use the parent assignment days.');
  }

  if (startOfDate(childTimeSlot.plannedStart).getTime() < startOfDate(parentStartDate).getTime()) {
    throw new StaffScheduleAssignmentError(400, 'Assigned coverage must start within the parent assignment range.');
  }
  if (parentEndDate && endOfDate(childTimeSlot.plannedEnd).getTime() > endOfDate(parentEndDate).getTime()) {
    throw new StaffScheduleAssignmentError(400, 'Assigned coverage must end within the parent assignment range.');
  }
};

const assertParentOccurrenceAvailable = async ({
  client,
  organizationId,
  parentAssignmentId,
  childTimeSlot,
  excludeAssignmentId,
}: {
  client: PrismaLike;
  organizationId: string;
  parentAssignmentId: string;
  childTimeSlot: NormalizedTimeSlot;
  excludeAssignmentId?: string | null;
}): Promise<void> => {
  const rangeStart = childTimeSlot.repeating
    ? startOfDate(childTimeSlot.startDate)
    : childTimeSlot.plannedStart;
  const rangeEnd = childTimeSlot.repeating
    ? (childTimeSlot.endDate ? endOfDate(childTimeSlot.endDate) : childTimeSlot.plannedEnd)
    : childTimeSlot.plannedEnd;
  const requestedOccurrences = buildTimeSlotOccurrences(
    normalizedTimeSlotToOccurrenceSeed(childTimeSlot),
    normalizedTimeSlotToRow(childTimeSlot),
    rangeStart,
    rangeEnd,
  );
  if (!requestedOccurrences.length) {
    return;
  }

  const existingChildren = await client.staffScheduleAssignments.findMany({
    where: {
      organizationId,
      parentAssignmentId,
      status: { not: 'CANCELLED' },
    },
  });
  const normalizedExcludeAssignmentId = normalizeId(excludeAssignmentId);
  const relevantChildren = normalizedExcludeAssignmentId
    ? existingChildren.filter((child: any) => normalizeId(child.id) !== normalizedExcludeAssignmentId)
    : existingChildren;
  if (!relevantChildren.length) {
    return;
  }

  const timeSlotIds = Array.from(new Set(relevantChildren
    .map((row: any) => normalizeId(row.timeSlotId))
    .filter((id: string | null): id is string => Boolean(id))));
  const childTimeSlots = timeSlotIds.length
    ? await client.timeSlots.findMany({ where: { id: { in: timeSlotIds } } })
    : [];
  const childTimeSlotsById = new Map(childTimeSlots.map((slot: any) => [String(slot.id), slot]));

  const hasOverlap = relevantChildren.some((child: any) => {
    const existingOccurrences = buildTimeSlotOccurrences(
      child,
      childTimeSlotsById.get(String(child.timeSlotId)),
      rangeStart,
      rangeEnd,
    );
    return existingOccurrences.some((existing) => requestedOccurrences.some((requested) => (
      rangesOverlap(existing.start, existing.end, requested.start, requested.end)
    )));
  });
  if (hasOverlap) {
    throw new StaffScheduleAssignmentError(409, 'This parent occurrence already has assigned coverage.');
  }
};

const displayName = (user: any, fallback: string): string => {
  const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
  const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
  const fullName = typeof user?.fullName === 'string' ? user.fullName.trim() : '';
  const username = typeof user?.userName === 'string' ? user.userName.trim() : '';
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || fullName || username;
  return name || fallback;
};

export const mapStaffScheduleAssignment = (
  row: any,
  lookup: {
    usersById?: Map<string, any>;
    timeSlotsById?: Map<string, any>;
    facilitiesById?: Map<string, any>;
    fieldsById?: Map<string, any>;
  } = {},
) => {
  const user = row.userId ? lookup.usersById?.get(row.userId) ?? null : null;
  const facility = row.facilityId ? lookup.facilitiesById?.get(row.facilityId) ?? null : null;
  const field = row.fieldId ? lookup.fieldsById?.get(row.fieldId) ?? null : null;
  const openLabel = row.assignmentKind === 'OFFICIAL_SHIFT' ? 'Open official shift' : 'Open staff shift';
  return {
    id: row.id,
    organizationId: row.organizationId,
    parentAssignmentId: row.parentAssignmentId ?? null,
    staffMemberId: row.staffMemberId ?? null,
    organizationRoleId: row.organizationRoleId ?? null,
    userId: row.userId ?? null,
    userName: row.userId ? displayName(user, `Staff ${row.userId}`) : openLabel,
    isOpen: !row.userId,
    isChildAssignment: Boolean(row.parentAssignmentId),
    assignmentKind: row.assignmentKind,
    facilityId: row.facilityId ?? null,
    facilityName: facility?.name ?? null,
    fieldId: row.fieldId ?? null,
    fieldName: field?.name ?? null,
    timeSlotId: row.timeSlotId,
    timeSlot: lookup.timeSlotsById?.get(row.timeSlotId) ?? null,
    plannedStart: row.plannedStart ?? null,
    plannedEnd: row.plannedEnd ?? null,
    actualStart: row.actualStart ?? null,
    actualEnd: row.actualEnd ?? null,
    plannedMinutes: row.plannedMinutes ?? null,
    actualMinutes: row.actualMinutes ?? null,
    rateOverrideType: row.rateOverrideType ?? null,
    rateOverrideCents: row.rateOverrideCents ?? null,
    status: row.status,
    notes: row.notes ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
};

const hydrateAssignments = async (rows: any[], client: PrismaLike) => {
  const timeSlotIds = Array.from(new Set(rows.map((row) => normalizeId(row.timeSlotId)).filter(Boolean))) as string[];
  const userIds = Array.from(new Set(rows.map((row) => normalizeId(row.userId)).filter(Boolean))) as string[];
  const facilityIds = Array.from(new Set(rows.map((row) => normalizeId(row.facilityId)).filter(Boolean))) as string[];
  const fieldIds = Array.from(new Set(rows.map((row) => normalizeId(row.fieldId)).filter(Boolean))) as string[];
  const [timeSlots, users, facilities, fields] = await Promise.all([
    timeSlotIds.length ? client.timeSlots.findMany({ where: { id: { in: timeSlotIds } } }) : Promise.resolve([]),
    userIds.length
      ? client.userData.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, userName: true },
      })
      : Promise.resolve([]),
    facilityIds.length ? client.facilities.findMany({ where: { id: { in: facilityIds } } }) : Promise.resolve([]),
    fieldIds.length ? client.fields.findMany({ where: { id: { in: fieldIds } } }) : Promise.resolve([]),
  ]);
  return rows.map((row) => mapStaffScheduleAssignment(row, {
    timeSlotsById: new Map(timeSlots.map((timeSlot: any) => [timeSlot.id, timeSlot])),
    usersById: new Map(users.map((user: any) => [user.id, user])),
    facilitiesById: new Map(facilities.map((facility: any) => [facility.id, facility])),
    fieldsById: new Map(fields.map((field: any) => [field.id, field])),
  }));
};

export const listStaffScheduleAssignments = async (
  organizationId: string,
  client: PrismaLike = prisma,
) => {
  const rows = await client.staffScheduleAssignments.findMany({
    where: { organizationId, status: { not: 'CANCELLED' } },
    orderBy: [{ plannedStart: 'asc' }, { createdAt: 'asc' }],
  });
  return hydrateAssignments(rows, client);
};

export const createStaffScheduleAssignment = async (
  input: StaffScheduleAssignmentInput,
  client: PrismaLike = prisma,
) => {
  const organizationId = normalizeId(input.organizationId);
  const parentAssignmentId = normalizeId(input.parentAssignmentId);
  const userId = normalizeId(input.userId);
  if (!organizationId) {
    throw new StaffScheduleAssignmentError(400, 'Organization is required.');
  }
  if (parentAssignmentId && !userId) {
    throw new StaffScheduleAssignmentError(400, 'Assigning coverage requires a staff member.');
  }

  const timeSlot = normalizeTimeSlotInput(input.timeSlot);
  const requestedFieldId = normalizeId(input.fieldId);
  const requestedFacilityId = normalizeId(input.facilityId);
  const notes = normalizeNotes(input.notes);
  const rateOverrideType = normalizeWageType(input.rateOverrideType);
  const rateOverrideCents = normalizeCents(input.rateOverrideCents);
  if ((rateOverrideType && rateOverrideCents == null) || (!rateOverrideType && rateOverrideCents != null)) {
    throw new StaffScheduleAssignmentError(400, 'Override rate requires both type and amount.');
  }

  const [organization, parentAssignment, staffMember] = await Promise.all([
    client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true },
    }),
    parentAssignmentId
      ? client.staffScheduleAssignments.findFirst({
        where: {
          id: parentAssignmentId,
          organizationId,
          status: { not: 'CANCELLED' },
        },
      })
      : Promise.resolve(null),
    userId
      ? client.staffMembers.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
        select: { id: true, userId: true, roleId: true, types: true },
      })
      : Promise.resolve(null),
  ]);
  if (!organization) {
    throw new StaffScheduleAssignmentError(404, 'Organization not found.');
  }
  if (parentAssignmentId && !parentAssignment) {
    throw new StaffScheduleAssignmentError(404, 'Parent staff assignment not found.');
  }
  if (parentAssignment?.parentAssignmentId) {
    throw new StaffScheduleAssignmentError(400, 'Child staff assignments cannot have children.');
  }
  if (parentAssignment && (normalizeId(parentAssignment.staffMemberId) || normalizeId(parentAssignment.userId))) {
    throw new StaffScheduleAssignmentError(400, 'Assigning occurrences under an already assigned parent shift is not supported yet.');
  }
  if (userId && !staffMember) {
    throw new StaffScheduleAssignmentError(404, 'Staff member not found.');
  }

  const assignmentKind = parentAssignment
    ? normalizeAssignmentKind(parentAssignment.assignmentKind)
    : normalizeAssignmentKind(input.assignmentKind);
  if (assignmentKind === 'OFFICIAL_SHIFT' && staffMember && !Array.isArray(staffMember.types)) {
    throw new StaffScheduleAssignmentError(400, 'Official assignment requires an official staff member.');
  }
  if (assignmentKind === 'OFFICIAL_SHIFT' && staffMember && !staffMember.types.includes('OFFICIAL')) {
    throw new StaffScheduleAssignmentError(400, 'Official assignment requires an official staff member.');
  }

  const fieldId = parentAssignment ? normalizeId(parentAssignment.fieldId) : requestedFieldId;
  const requestedOrParentFacilityId = parentAssignment ? normalizeId(parentAssignment.facilityId) : requestedFacilityId;
  const [field, requestedFacility, parentTimeSlot] = await Promise.all([
    fieldId
      ? client.fields.findFirst({
        where: { id: fieldId, organizationId },
        select: { id: true, facilityId: true },
      })
      : Promise.resolve(null),
    requestedOrParentFacilityId
      ? client.facilities.findFirst({
        where: { id: requestedOrParentFacilityId, organizationId },
        select: { id: true, timeZone: true },
      })
      : Promise.resolve(null),
    parentAssignment?.timeSlotId
      ? client.timeSlots.findUnique({ where: { id: parentAssignment.timeSlotId } })
      : Promise.resolve(null),
  ]);
  if (fieldId && !field) {
    throw new StaffScheduleAssignmentError(404, 'Resource not found.');
  }
  if (requestedOrParentFacilityId && !requestedFacility) {
    throw new StaffScheduleAssignmentError(404, 'Facility not found.');
  }
  if (field?.facilityId && requestedOrParentFacilityId && field.facilityId !== requestedOrParentFacilityId) {
    throw new StaffScheduleAssignmentError(400, 'Selected resource is not part of the selected facility.');
  }
  if (parentAssignment && !parentTimeSlot) {
    throw new StaffScheduleAssignmentError(400, 'Parent assignment timeslot is missing.');
  }
  if (parentTimeSlot) {
    validateChildTimeSlot(parentTimeSlot, timeSlot);
    await assertParentOccurrenceAvailable({
      client,
      organizationId,
      parentAssignmentId: parentAssignmentId as string,
      childTimeSlot: timeSlot,
    });
  }

  const facilityId = requestedOrParentFacilityId ?? field?.facilityId ?? null;
  const facility = facilityId && !requestedFacility
    ? await client.facilities.findFirst({
      where: { id: facilityId, organizationId },
      select: { id: true, timeZone: true },
    })
    : requestedFacility;

  const now = new Date();
  const assignment = await client.$transaction(async (tx: PrismaLike) => {
    const savedTimeSlot = await tx.timeSlots.create({
      data: {
        id: createId('staff_timeslot'),
        createdAt: now,
        updatedAt: now,
        dayOfWeek: timeSlot.dayOfWeek,
        daysOfWeek: timeSlot.daysOfWeek,
        startTimeMinutes: timeSlot.startTimeMinutes,
        endTimeMinutes: timeSlot.endTimeMinutes,
        startDate: timeSlot.startDate,
        timeZone: timeSlot.timeZone === 'UTC' ? (facility?.timeZone ?? 'UTC') : timeSlot.timeZone,
        repeating: timeSlot.repeating,
        endDate: timeSlot.endDate,
        scheduledFieldId: fieldId,
        scheduledFieldIds: fieldId ? [fieldId] : [],
        price: null,
        divisions: [],
        sourceType: 'STAFF_SCHEDULE_ASSIGNMENT',
      },
    });
    return tx.staffScheduleAssignments.create({
      data: {
        id: createId('staff_schedule_assignment'),
        createdAt: now,
        updatedAt: now,
        organizationId,
        parentAssignmentId,
        staffMemberId: staffMember?.id ?? null,
        organizationRoleId: staffMember?.roleId ?? null,
        userId,
        assignmentKind,
        facilityId,
        fieldId,
        timeSlotId: savedTimeSlot.id,
        plannedStart: timeSlot.plannedStart,
        plannedEnd: timeSlot.plannedEnd,
        plannedMinutes: timeSlot.plannedMinutes,
        rateOverrideType,
        rateOverrideCents,
        status: 'PLANNED',
        notes,
        createdBy: input.actingUserId,
        updatedBy: input.actingUserId,
      },
    });
  });

  const [hydrated] = await hydrateAssignments([assignment], client);
  return hydrated;
};

export const updateStaffScheduleAssignment = async (
  input: StaffScheduleAssignmentUpdateInput,
  client: PrismaLike = prisma,
) => {
  const organizationId = normalizeId(input.organizationId);
  const assignmentId = normalizeId(input.assignmentId);
  if (!organizationId || !assignmentId) {
    throw new StaffScheduleAssignmentError(400, 'Assignment is required.');
  }

  const existing = await client.staffScheduleAssignments.findFirst({
    where: {
      id: assignmentId,
      organizationId,
      status: { not: 'CANCELLED' },
    },
  });
  if (!existing) {
    throw new StaffScheduleAssignmentError(404, 'Staff assignment not found.');
  }

  const isChildAssignment = Boolean(normalizeId(existing.parentAssignmentId));
  if (input.action === 'UNASSIGN') {
    if (!isChildAssignment) {
      throw new StaffScheduleAssignmentError(400, 'Only child coverage can be unassigned from this action.');
    }
    const updated = await client.staffScheduleAssignments.update({
      where: { id: assignmentId },
      data: {
        status: 'CANCELLED',
        updatedBy: input.actingUserId,
      },
    });
    const [hydrated] = await hydrateAssignments([updated], client);
    return hydrated;
  }

  const hasUserIdField = Object.prototype.hasOwnProperty.call(input, 'userId');
  const hasFacilityIdField = Object.prototype.hasOwnProperty.call(input, 'facilityId');
  const hasFieldIdField = Object.prototype.hasOwnProperty.call(input, 'fieldId');
  const hasTimeSlotUpdate = Object.prototype.hasOwnProperty.call(input, 'timeSlot');
  const hasResourceUpdate = hasFacilityIdField || hasFieldIdField;
  const nextUserId = hasUserIdField ? normalizeId(input.userId) : normalizeId(existing.userId);
  const requestedFacilityId = hasFacilityIdField ? normalizeId(input.facilityId) : normalizeId(existing.facilityId);
  const nextFieldId = hasFieldIdField ? normalizeId(input.fieldId) : normalizeId(existing.fieldId);
  if (hasTimeSlotUpdate && !input.timeSlot) {
    throw new StaffScheduleAssignmentError(400, 'Assignment timeslot is required.');
  }
  const nextTimeSlot = hasTimeSlotUpdate
    ? normalizeTimeSlotInput(input.timeSlot as StaffScheduleTimeSlotInput)
    : null;
  if (hasTimeSlotUpdate && !normalizeId(existing.timeSlotId)) {
    throw new StaffScheduleAssignmentError(400, 'Assignment timeslot is missing.');
  }
  if (isChildAssignment && hasUserIdField && nextUserId !== normalizeId(existing.userId)) {
    throw new StaffScheduleAssignmentError(400, 'Child coverage can only be unassigned or have its pay override changed.');
  }
  if (isChildAssignment && (
    (hasFacilityIdField && requestedFacilityId !== normalizeId(existing.facilityId))
    || (hasFieldIdField && nextFieldId !== normalizeId(existing.fieldId))
  )) {
    throw new StaffScheduleAssignmentError(400, 'Child coverage inherits resource assignment from its parent.');
  }

  const rateOverrideType = normalizeWageType(input.rateOverrideType);
  const rateOverrideCents = normalizeCents(input.rateOverrideCents);
  if ((rateOverrideType && rateOverrideCents == null) || (!rateOverrideType && rateOverrideCents != null)) {
    throw new StaffScheduleAssignmentError(400, 'Override rate requires both type and amount.');
  }

  let nextFacilityId = normalizeId(existing.facilityId);
  if (hasResourceUpdate) {
    const [field, requestedFacility] = await Promise.all([
      nextFieldId
        ? client.fields.findFirst({
          where: { id: nextFieldId, organizationId },
          select: { id: true, facilityId: true },
        })
        : Promise.resolve(null),
      requestedFacilityId
        ? client.facilities.findFirst({
          where: { id: requestedFacilityId, organizationId },
          select: { id: true },
        })
        : Promise.resolve(null),
    ]);
    if (nextFieldId && !field) {
      throw new StaffScheduleAssignmentError(404, 'Resource not found.');
    }
    if (requestedFacilityId && !requestedFacility) {
      throw new StaffScheduleAssignmentError(404, 'Facility not found.');
    }
    if (field?.facilityId && requestedFacilityId && field.facilityId !== requestedFacilityId) {
      throw new StaffScheduleAssignmentError(400, 'Selected resource is not part of the selected facility.');
    }
    nextFacilityId = requestedFacilityId ?? field?.facilityId ?? null;
    const resourceChanged = !isChildAssignment
      && (nextFieldId !== normalizeId(existing.fieldId) || nextFacilityId !== normalizeId(existing.facilityId));
    if (resourceChanged) {
      const childCount = await client.staffScheduleAssignments.count({
        where: {
          organizationId,
          parentAssignmentId: assignmentId,
          status: { not: 'CANCELLED' },
        },
      });
      if (childCount > 0) {
        throw new StaffScheduleAssignmentError(400, 'Assignments with assigned child coverage cannot be reassigned yet.');
      }
    }
  }
  if (!isChildAssignment && hasTimeSlotUpdate && nextTimeSlot) {
    const childAssignments = await client.staffScheduleAssignments.findMany({
      where: {
        organizationId,
        parentAssignmentId: assignmentId,
        status: { not: 'CANCELLED' },
      },
    });
    const childTimeSlotIds = childAssignments
      .map((assignment: any) => normalizeId(assignment.timeSlotId))
      .filter((id: string | null): id is string => Boolean(id));
    const childTimeSlots = childTimeSlotIds.length
      ? await client.timeSlots.findMany({
        where: { id: { in: childTimeSlotIds } },
      })
      : [];
    const childTimeSlotsById = new Map<string, any>(
      childTimeSlots.map((timeSlot: any) => [String(timeSlot.id), timeSlot]),
    );
    for (const childAssignment of childAssignments) {
      const childTimeSlotId = normalizeId(childAssignment.timeSlotId);
      const childTimeSlot = childTimeSlotId ? childTimeSlotsById.get(childTimeSlotId) : null;
      if (!childTimeSlot) {
        throw new StaffScheduleAssignmentError(400, 'Assigned coverage timeslot is missing.');
      }
      validateChildTimeSlot(normalizedTimeSlotToRow(nextTimeSlot), normalizeTimeSlotInput({
        startDate: childTimeSlot.startDate,
        endDate: childTimeSlot.endDate,
        repeating: childTimeSlot.repeating,
        daysOfWeek: childTimeSlot.daysOfWeek,
        startTimeMinutes: childTimeSlot.startTimeMinutes,
        endTimeMinutes: childTimeSlot.endTimeMinutes,
        timeZone: childTimeSlot.timeZone,
      }));
    }
  }

  if (isChildAssignment && nextTimeSlot) {
    const parentAssignmentId = normalizeId(existing.parentAssignmentId);
    const parentAssignment = parentAssignmentId
      ? await client.staffScheduleAssignments.findFirst({
        where: {
          id: parentAssignmentId,
          organizationId,
          status: { not: 'CANCELLED' },
        },
      })
      : null;
    if (!parentAssignment || normalizeId(parentAssignment.parentAssignmentId)) {
      throw new StaffScheduleAssignmentError(400, 'Parent assignment is missing.');
    }
    const parentTimeSlot = normalizeId(parentAssignment.timeSlotId)
      ? await client.timeSlots.findUnique({ where: { id: parentAssignment.timeSlotId } })
      : null;
    if (!parentTimeSlot) {
      throw new StaffScheduleAssignmentError(400, 'Parent assignment timeslot is missing.');
    }
    validateChildTimeSlot(parentTimeSlot, nextTimeSlot);
    await assertParentOccurrenceAvailable({
      client,
      organizationId,
      parentAssignmentId: parentAssignmentId as string,
      childTimeSlot: nextTimeSlot,
      excludeAssignmentId: assignmentId,
    });
  }

  let staffMember: any = null;
  if (!isChildAssignment && nextUserId) {
    staffMember = await client.staffMembers.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: nextUserId,
        },
      },
      select: { id: true, userId: true, roleId: true, types: true },
    });
    if (!staffMember) {
      throw new StaffScheduleAssignmentError(404, 'Staff member not found.');
    }
    if (
      normalizeAssignmentKind(existing.assignmentKind) === 'OFFICIAL_SHIFT'
      && (!Array.isArray(staffMember.types) || !staffMember.types.includes('OFFICIAL'))
    ) {
      throw new StaffScheduleAssignmentError(400, 'Official assignment requires an official staff member.');
    }
  }

  const data: Record<string, unknown> = {
    rateOverrideType,
    rateOverrideCents,
    updatedBy: input.actingUserId,
  };
  if (nextTimeSlot) {
    data.plannedStart = nextTimeSlot.plannedStart;
    data.plannedEnd = nextTimeSlot.plannedEnd;
    data.plannedMinutes = nextTimeSlot.plannedMinutes;
  }
  if (!isChildAssignment) {
    data.userId = nextUserId;
    data.staffMemberId = staffMember?.id ?? null;
    data.organizationRoleId = staffMember?.roleId ?? null;
    if (hasResourceUpdate) {
      data.facilityId = nextFacilityId;
      data.fieldId = nextFieldId;
    }
    data.notes = normalizeNotes(input.notes);
  }

  const updated = await client.$transaction(async (tx: PrismaLike) => {
    if ((nextTimeSlot || (!isChildAssignment && hasResourceUpdate)) && normalizeId(existing.timeSlotId)) {
      const timeSlotData: Record<string, unknown> = {};
      if (nextTimeSlot) {
        Object.assign(timeSlotData, {
          dayOfWeek: nextTimeSlot.dayOfWeek,
          daysOfWeek: nextTimeSlot.daysOfWeek,
          startTimeMinutes: nextTimeSlot.startTimeMinutes,
          endTimeMinutes: nextTimeSlot.endTimeMinutes,
          startDate: nextTimeSlot.startDate,
          timeZone: nextTimeSlot.timeZone,
          repeating: nextTimeSlot.repeating,
          endDate: nextTimeSlot.endDate,
        });
      }
      if (!isChildAssignment && hasResourceUpdate) {
        Object.assign(timeSlotData, {
          scheduledFieldId: nextFieldId,
          scheduledFieldIds: nextFieldId ? [nextFieldId] : [],
        });
      }
      await tx.timeSlots.update({
        where: { id: existing.timeSlotId },
        data: {
          ...timeSlotData,
          updatedAt: new Date(),
        },
      });
    }
    return tx.staffScheduleAssignments.update({
      where: { id: assignmentId },
      data,
    });
  });
  const [hydrated] = await hydrateAssignments([updated], client);
  return hydrated;
};

export const deleteStaffScheduleAssignment = async (
  input: {
    organizationId: string;
    assignmentId: string;
    actingUserId: string;
  },
  client: PrismaLike = prisma,
) => {
  const organizationId = normalizeId(input.organizationId);
  const assignmentId = normalizeId(input.assignmentId);
  if (!organizationId || !assignmentId) {
    throw new StaffScheduleAssignmentError(400, 'Assignment is required.');
  }

  const existing = await client.staffScheduleAssignments.findFirst({
    where: {
      id: assignmentId,
      organizationId,
      status: { not: 'CANCELLED' },
    },
  });
  if (!existing) {
    throw new StaffScheduleAssignmentError(404, 'Staff assignment not found.');
  }
  if (normalizeId(existing.parentAssignmentId)) {
    throw new StaffScheduleAssignmentError(400, 'Child coverage cannot be deleted. Unassign the staff member instead.');
  }

  await client.staffScheduleAssignments.updateMany({
    where: {
      organizationId,
      OR: [
        { id: assignmentId },
        { parentAssignmentId: assignmentId },
      ],
    },
    data: {
      status: 'CANCELLED',
      updatedBy: input.actingUserId,
    },
  });

  return { id: assignmentId, deleted: true };
};
