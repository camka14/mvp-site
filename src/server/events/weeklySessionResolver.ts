import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { parseDateInput } from '@/server/legacyFormat';
import { upsertEventFromPayload } from '@/server/repositories/events';
import { getEventOfficialIdsForEvent } from '@/server/officials/eventOfficials';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export class WeeklySessionResolutionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'WeeklySessionResolutionError';
    this.status = status;
  }
}

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeStringIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeSlotFieldIds = (slot: any): string[] => {
  const fromList = normalizeStringIdList(slot?.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  const fallback = normalizeId(slot?.scheduledFieldId);
  return fallback ? [fallback] : [];
};

const normalizeSlotDays = (slot: any): number[] => {
  const days: unknown[] = Array.isArray(slot?.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : Number.isInteger(slot?.dayOfWeek)
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      days
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  );
};

const toDateOnlyValue = (value: Date): number => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const matchesSlotOccurrence = (slot: any, sessionStart: Date, sessionEnd: Date): boolean => {
  const slotDays = normalizeSlotDays(slot);
  if (!slotDays.length) {
    return false;
  }

  const slotStartMinutes = Number(slot?.startTimeMinutes);
  const slotEndMinutes = Number(slot?.endTimeMinutes);
  if (!Number.isFinite(slotStartMinutes) || !Number.isFinite(slotEndMinutes) || slotEndMinutes <= slotStartMinutes) {
    return false;
  }

  const sessionStartMinutes = (sessionStart.getHours() * 60) + sessionStart.getMinutes();
  const sessionEndMinutes = (sessionEnd.getHours() * 60) + sessionEnd.getMinutes();
  if (sessionStartMinutes !== slotStartMinutes || sessionEndMinutes !== slotEndMinutes) {
    return false;
  }

  const sessionDay = toMondayIndex(sessionStart);
  if (!slotDays.includes(sessionDay)) {
    return false;
  }

  const slotStartDate = parseDateInput(slot?.startDate);
  if (!(slotStartDate instanceof Date) || Number.isNaN(slotStartDate.getTime())) {
    return false;
  }
  if (toDateOnlyValue(sessionStart) < toDateOnlyValue(slotStartDate)) {
    return false;
  }

  const slotEndDate = parseDateInput(slot?.endDate);
  const shouldEnforceEndDate =
    slotEndDate instanceof Date
    && !Number.isNaN(slotEndDate.getTime())
    && toDateOnlyValue(slotEndDate) > toDateOnlyValue(slotStartDate);
  if (shouldEnforceEndDate && toDateOnlyValue(sessionStart) > toDateOnlyValue(slotEndDate)) {
    return false;
  }

  return true;
};

const buildChildPayload = (
  parent: any,
  selectedSlot: any | null,
  childId: string,
  sessionStart: Date,
  sessionEnd: Date,
) => {
  const parentDivisionIds = normalizeStringIdList(parent.divisions);
  const slotDivisionIds = normalizeStringIdList(selectedSlot?.divisions);
  const childDivisionIds = slotDivisionIds.length ? slotDivisionIds : parentDivisionIds;
  const slotFieldIds = normalizeSlotFieldIds(selectedSlot);
  const parentFieldIds = normalizeStringIdList(parent.fieldIds);
  const childFieldIds = slotFieldIds.length ? slotFieldIds : parentFieldIds;

  return {
    id: childId,
    name: parent.name,
    description: parent.description,
    start: sessionStart,
    end: sessionEnd,
    location: parent.location,
    coordinates: parent.coordinates,
    price: parent.price,
    minAge: parent.minAge,
    maxAge: parent.maxAge,
    rating: parent.rating,
    imageId: parent.imageId,
    hostId: parent.hostId,
    assistantHostIds: Array.isArray(parent.assistantHostIds) ? parent.assistantHostIds : [],
    noFixedEndDateTime: false,
    state: parent.state,
    maxParticipants: parent.maxParticipants,
    teamSizeLimit: parent.teamSizeLimit,
    restTimeMinutes: parent.restTimeMinutes,
    teamSignup: parent.teamSignup,
    singleDivision: childDivisionIds.length <= 1 ? true : parent.singleDivision,
    waitListIds: [],
    freeAgentIds: [],
    teamIds: [],
    userIds: [],
    registrationIds: [],
    fieldIds: childFieldIds,
    timeSlotIds: [],
    officialIds: Array.isArray(parent.officialIds) ? parent.officialIds : [],
    cancellationRefundHours: parent.cancellationRefundHours,
    registrationCutoffHours: parent.registrationCutoffHours,
    seedColor: parent.seedColor,
    eventType: 'WEEKLY_EVENT',
    sportId: parent.sportId,
    leagueScoringConfigId: parent.leagueScoringConfigId,
    organizationId: parent.organizationId,
    parentEvent: parent.id,
    requiredTemplateIds: Array.isArray(parent.requiredTemplateIds) ? parent.requiredTemplateIds : [],
    divisions: childDivisionIds,
    doTeamsOfficiate: parent.doTeamsOfficiate,
    teamOfficialsMaySwap: parent.teamOfficialsMaySwap,
    allowPaymentPlans: parent.allowPaymentPlans,
    installmentCount: parent.installmentCount,
    installmentDueDates: Array.isArray(parent.installmentDueDates) ? parent.installmentDueDates : [],
    installmentAmounts: Array.isArray(parent.installmentAmounts) ? parent.installmentAmounts : [],
    allowTeamSplitDefault: parent.allowTeamSplitDefault,
    registrationByDivisionType: parent.registrationByDivisionType,
  };
};

export const resolveOrCreateWeeklySessionChild = async (
  params: {
    parentEventId: string;
    sessionStart: Date;
    sessionEnd: Date;
    slotId?: string | null;
  },
  client: PrismaLike,
): Promise<{ event: any; created: boolean }> => {
  const parent = await client.events.findUnique({
    where: { id: params.parentEventId },
  });
  if (!parent) {
    throw new WeeklySessionResolutionError('Event not found', 404);
  }

  const parentEventType = String(parent.eventType ?? '').toUpperCase();
  const parentEventId = normalizeId((parent as any).parentEvent);
  if (parentEventType !== 'WEEKLY_EVENT' || parentEventId) {
    throw new WeeklySessionResolutionError(
      'Weekly sessions can only be created from parent weekly events.',
      400,
    );
  }

  const parentSlotIds = Array.isArray(parent.timeSlotIds) ? parent.timeSlotIds.map(String).filter(Boolean) : [];
  if (!parentSlotIds.length) {
    throw new WeeklySessionResolutionError('Parent weekly event has no timeslots.', 400);
  }

  const slots = await client.timeSlots.findMany({
    where: { id: { in: parentSlotIds } },
  });
  const matchingSlots = slots.filter((slot) => matchesSlotOccurrence(slot, params.sessionStart, params.sessionEnd));
  if (!matchingSlots.length) {
    throw new WeeklySessionResolutionError('Selected session does not match parent weekly timeslots.', 400);
  }
  const normalizedSlotId = normalizeId(params.slotId);
  const selectedSlot = normalizedSlotId
    ? (matchingSlots.find((slot) => normalizeId(slot.id) === normalizedSlotId) ?? null)
    : matchingSlots[0] ?? null;
  if (normalizedSlotId && !selectedSlot) {
    throw new WeeklySessionResolutionError('Selected timeslot is not available for this session.', 400);
  }

  const existing = await client.events.findFirst({
    where: {
      eventType: 'WEEKLY_EVENT',
      parentEvent: params.parentEventId,
      start: params.sessionStart,
      end: params.sessionEnd,
    } as any,
  });
  if (existing) {
    return { event: existing, created: false };
  }

  const parentOfficialIds = await getEventOfficialIdsForEvent(parent.id, client as any);
  const childId = crypto.randomUUID();
  const childPayload = buildChildPayload(
    { ...parent, officialIds: parentOfficialIds },
    selectedSlot,
    childId,
    params.sessionStart,
    params.sessionEnd,
  );

  await upsertEventFromPayload(childPayload, client);
  const createdRow = await client.events.findUnique({ where: { id: childId } });
  if (!createdRow) {
    throw new WeeklySessionResolutionError('Failed to create weekly child event', 500);
  }
  return { event: createdRow, created: true };
};
