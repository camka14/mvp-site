import { prisma } from '@/lib/prisma';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import {
  extractRentalCheckoutWindow,
  type RentalCheckoutWindow,
} from '@/server/repositories/rentalCheckoutLocks';
import {
  localDatePartsInTimeZone,
  mondayDayInTimeZone,
  minutesInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';

type PrismaLike = any;

export const MAX_RENTAL_FIELDS_PER_CHECKOUT = 8;

type RentalSession = {
  userId: string;
  isAdmin: boolean;
};

type CanonicalRentalOrganization = {
  id: string;
  ownerId: string | null;
  publicPageEnabled: boolean | null;
  coordinates?: unknown;
  timeZone?: string | null;
};

type CanonicalRentalField = {
  id: string;
  name?: string | null;
  organizationId?: string | null;
  facilityId?: string | null;
  rentalSlotIds?: unknown;
  lat?: number | null;
  long?: number | null;
};

type CanonicalRentalAvailabilitySlot = {
  id: string;
  archivedAt?: Date | string | null;
  dayOfWeek?: number | null;
  daysOfWeek?: unknown;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  timeZone?: string | null;
  repeating?: boolean | null;
  price?: number | null;
  requiredTemplateIds?: unknown;
  hostRequiredTemplateIds?: unknown;
};

type CanonicalRentalEvent = {
  id: string;
  archivedAt?: Date | string | null;
  hostId: string | null;
  assistantHostIds?: unknown;
  organizationId?: string | null;
  eventType?: string | null;
  parentEvent?: string | null;
};

export type CanonicalRentalCheckout = {
  window: RentalCheckoutWindow;
  organization: CanonicalRentalOrganization;
  totalAmountCents: number;
  availabilitySlotIds: string[];
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
  event: CanonicalRentalEvent | null;
};

export type CanonicalRentalCheckoutResult =
  | { ok: true; checkout: CanonicalRentalCheckout }
  | { ok: false; status: number; error: string };

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ))
    : []
);

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const dateOnlyValueInTimeZone = (date: Date, timeZone: string): number => {
  const parts = localDatePartsInTimeZone(date, timeZone);
  if (!parts) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
};

const endMinutesInTimeZone = (start: Date, end: Date, timeZone: string): number => {
  const endMinutes = minutesInTimeZone(end, timeZone);
  return endMinutes === 0 && dateOnlyValueInTimeZone(end, timeZone) > dateOnlyValueInTimeZone(start, timeZone)
    ? 24 * 60
    : endMinutes;
};

/**
 * A repeating rental availability row describes a single local-day window.
 * A checkout range that crosses more than that cannot be treated as available
 * merely because its first day happens to match the recurrence.
 */
const rentalSlotCoversWindow = (
  slot: CanonicalRentalAvailabilitySlot,
  start: Date,
  end: Date,
  timeZone: string,
): boolean => {
  if (slot.archivedAt) return false;
  const slotTimeZone = resolveTimeZone(slot.timeZone, timeZone);
  const slotStart = parseDateInputInTimeZone(slot.startDate, slotTimeZone);
  const slotEnd = parseDateInputInTimeZone(slot.endDate, slotTimeZone);
  if (slot.repeating === false) {
    return Boolean(
      slotStart
      && slotEnd
      && start.getTime() >= slotStart.getTime()
      && end.getTime() <= slotEnd.getTime(),
    );
  }

  const startDay = dateOnlyValueInTimeZone(start, slotTimeZone);
  const endDay = dateOnlyValueInTimeZone(end, slotTimeZone);
  const crossesAtMidnight = endDay === startDay + 24 * 60 * 60 * 1000
    && endMinutesInTimeZone(start, end, slotTimeZone) === 24 * 60;
  if (endDay !== startDay && !crossesAtMidnight) {
    return false;
  }

  const slotDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry))
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  if (slotDays.length && !slotDays.includes(mondayDayInTimeZone(start, slotTimeZone))) {
    return false;
  }

  const startMinutes = minutesInTimeZone(start, slotTimeZone);
  const endMinutes = endMinutesInTimeZone(start, end, slotTimeZone);
  if (typeof slot.startTimeMinutes === 'number' && startMinutes < slot.startTimeMinutes) {
    return false;
  }
  if (typeof slot.endTimeMinutes === 'number' && endMinutes > slot.endTimeMinutes) {
    return false;
  }
  if (slotStart && startDay < dateOnlyValueInTimeZone(slotStart, slotTimeZone)) {
    return false;
  }
  if (slotEnd && startDay > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)) {
    return false;
  }
  if (slotEnd && endDay > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)) {
    return false;
  }
  return true;
};

const unavailable = (): CanonicalRentalCheckoutResult => ({
  ok: false,
  status: 400,
  error: 'One or more selected fields are unavailable for rental.',
});

/**
 * Treats browser event/time-slot data only as a selection request. The actual
 * rental organization, available fields, dates, pricing and required documents
 * are re-derived from persisted inventory before a lock or payment is created.
 */
export const resolveCanonicalRentalCheckout = async ({
  session,
  event,
  timeSlot,
  client = prisma,
  requireAvailability = true,
}: {
  session: RentalSession;
  event: unknown;
  timeSlot: unknown;
  client?: PrismaLike;
  requireAvailability?: boolean;
}): Promise<CanonicalRentalCheckoutResult> => {
  const requested = extractRentalCheckoutWindow({ event, timeSlot });
  if (!requested.ok) {
    return requested;
  }
  if (requested.window.fieldIds.length > MAX_RENTAL_FIELDS_PER_CHECKOUT) {
    return {
      ok: false,
      status: 400,
      error: `Rental checkout supports at most ${MAX_RENTAL_FIELDS_PER_CHECKOUT} fields at a time.`,
    };
  }

  const fields = await client.fields.findMany({
    where: {
      id: { in: requested.window.fieldIds },
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      facilityId: true,
      rentalSlotIds: true,
      lat: true,
      long: true,
    },
  }) as CanonicalRentalField[];
  if (fields.length !== requested.window.fieldIds.length) {
    return unavailable();
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const orderedFields = requested.window.fieldIds
    .map((fieldId) => fieldById.get(fieldId))
    .filter((field): field is CanonicalRentalField => Boolean(field));
  if (orderedFields.length !== requested.window.fieldIds.length) {
    return unavailable();
  }

  const facilityIds = Array.from(new Set(
    orderedFields
      .map((field) => normalizeString(field.facilityId))
      .filter((id): id is string => Boolean(id)),
  ));
  const facilities = facilityIds.length
    ? await client.facilities.findMany({
      where: { id: { in: facilityIds } },
      select: { id: true, organizationId: true },
    }) as Array<{ id: string; organizationId: string | null }>
    : [];
  const organizationByFacilityId = new Map(
    facilities.map((facility) => [facility.id, normalizeString(facility.organizationId)]),
  );
  if (facilities.length !== facilityIds.length) {
    return unavailable();
  }

  const hasConflictingFieldFacilityOwnership = orderedFields.some((field) => {
    const fieldOrganizationId = normalizeString(field.organizationId);
    const facilityOrganizationId = organizationByFacilityId.get(normalizeString(field.facilityId) ?? '') ?? null;
    return Boolean(fieldOrganizationId && facilityOrganizationId && fieldOrganizationId !== facilityOrganizationId);
  });
  if (hasConflictingFieldFacilityOwnership) {
    return unavailable();
  }

  const organizationIds = Array.from(new Set(
    orderedFields
      .map((field) => normalizeString(field.organizationId)
        ?? organizationByFacilityId.get(normalizeString(field.facilityId) ?? '')
        ?? null)
      .filter((id): id is string => Boolean(id)),
  ));
  if (organizationIds.length !== 1) {
    return unavailable();
  }
  const organization = await client.organizations.findUnique({
    where: { id: organizationIds[0] },
    select: {
      id: true,
      ownerId: true,
      publicPageEnabled: true,
      coordinates: true,
    },
  }) as CanonicalRentalOrganization | null;
  if (!organization) {
    return unavailable();
  }

  const eventRecord = toRecord(event);
  const timeSlotRecord = toRecord(timeSlot);
  const timeZone = resolveTimeZoneFromFieldOrOrganization(orderedFields[0], organization);
  const start = parseDateInputInTimeZone(timeSlotRecord?.startDate ?? eventRecord?.start, timeZone);
  const end = parseDateInputInTimeZone(timeSlotRecord?.endDate ?? eventRecord?.end, timeZone);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return {
      ok: false,
      status: 400,
      error: 'Rental checkout requires a valid start/end time window.',
    };
  }

  const canonicalEvent = await client.events.findUnique({
    where: { id: requested.window.eventId },
    select: {
      id: true,
      archivedAt: true,
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
      eventType: true,
      parentEvent: true,
    },
  }) as CanonicalRentalEvent | null;
  if (canonicalEvent) {
    if (canonicalEvent.archivedAt) {
      return { ok: false, status: 404, error: 'Event not found.' };
    }
    if (!(await canManageEvent(session, canonicalEvent, client))) {
      return { ok: false, status: 403, error: 'You do not have access to reserve rentals for this event.' };
    }
  } else {
    const requestedHostId = normalizeString(eventRecord?.hostId);
    const canManageRentalOrganization = await canManageOrganization(session, organization, client);
    if (!session.isAdmin && requestedHostId !== session.userId) {
      return { ok: false, status: 403, error: 'You do not have access to reserve this rental checkout.' };
    }
    if (!organization.publicPageEnabled && !canManageRentalOrganization) {
      return { ok: false, status: 403, error: 'This rental inventory is not available for public checkout.' };
    }
  }

  const rentalSlotIds = Array.from(new Set(orderedFields.flatMap((field) => normalizeStringArray(field.rentalSlotIds))));
  const availabilitySlots = rentalSlotIds.length
    ? await client.timeSlots.findMany({
      where: {
        id: { in: rentalSlotIds },
        archivedAt: null,
      },
      select: {
        id: true,
        archivedAt: true,
        dayOfWeek: true,
        daysOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        startDate: true,
        endDate: true,
        timeZone: true,
        repeating: true,
        price: true,
        requiredTemplateIds: true,
        hostRequiredTemplateIds: true,
      },
    }) as CanonicalRentalAvailabilitySlot[]
    : [];
  const slotById = new Map(availabilitySlots.map((slot) => [slot.id, slot]));

  const availabilitySlotIds: string[] = [];
  const requiredTemplateIds = new Set<string>();
  const hostRequiredTemplateIds = new Set<string>();
  let totalAmountCents = 0;
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
  for (const field of orderedFields) {
    const matchingSlot = normalizeStringArray(field.rentalSlotIds)
      .map((slotId) => slotById.get(slotId))
      .find((slot): slot is CanonicalRentalAvailabilitySlot => Boolean(slot && rentalSlotCoversWindow(slot, start, end, timeZone)));
    if (!matchingSlot && requireAvailability) {
      return unavailable();
    }
    if (!matchingSlot) continue;

    availabilitySlotIds.push(matchingSlot.id);
    const price = typeof matchingSlot.price === 'number' && matchingSlot.price > 0
      ? Math.round((matchingSlot.price * durationMinutes) / 60)
      : 0;
    totalAmountCents += price;
    normalizeStringArray(matchingSlot.requiredTemplateIds).forEach((templateId) => requiredTemplateIds.add(templateId));
    normalizeStringArray(matchingSlot.hostRequiredTemplateIds).forEach((templateId) => hostRequiredTemplateIds.add(templateId));
  }

  return {
    ok: true,
    checkout: {
      window: {
        eventId: canonicalEvent?.id ?? requested.window.eventId,
        fieldIds: orderedFields.map((field) => field.id),
        start,
        end,
        timeZone,
        noFixedEndDateTime: false,
        organizationId: organization.id,
        eventType: canonicalEvent?.eventType ?? 'EVENT',
        parentEvent: canonicalEvent?.parentEvent ?? null,
      },
      organization,
      totalAmountCents,
      availabilitySlotIds,
      requiredTemplateIds: Array.from(requiredTemplateIds),
      hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
      event: canonicalEvent,
    },
  };
};
