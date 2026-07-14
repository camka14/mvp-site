import { prisma } from '@/lib/prisma';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import {
  extractRentalCheckoutWindow,
  MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER,
  type RentalCheckoutWindow,
} from '@/server/repositories/rentalCheckoutLocks';
import {
  normalizeRentalStringArray,
  rentalSelectionsSchema,
  type RentalAvailabilitySlot,
  type RentalSelectionField,
  type RentalSelectionInput,
  validateRentalSelections,
} from '@/server/rentals/selectionValidation';

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

type CanonicalRentalField = RentalSelectionField & {
  organizationId?: string | null;
  facilityId?: string | null;
  lat?: number | null;
  long?: number | null;
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
  /** Compatibility alias for legacy single-window callers. */
  window: RentalCheckoutWindow;
  windows: RentalCheckoutWindow[];
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

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const extractEntityId = (value: unknown): string | null => {
  const record = toRecord(value);
  return record ? normalizeString(record.$id ?? record.id) : normalizeString(value);
};

const unavailable = (): CanonicalRentalCheckoutResult => ({
  ok: false,
  status: 400,
  error: 'One or more selected fields are unavailable for rental.',
});

const uniqueInOrder = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

/**
 * Treats browser event/time-slot data only as a selection request. Persisted
 * fields and slots remain authoritative for organization, availability,
 * pricing, and required documents.
 */
export const resolveCanonicalRentalCheckout = async ({
  session,
  event,
  timeSlot,
  rentalSelections,
  client = prisma,
  requireAvailability = true,
}: {
  session: RentalSession;
  event: unknown;
  timeSlot: unknown;
  rentalSelections?: unknown;
  client?: PrismaLike;
  requireAvailability?: boolean;
}): Promise<CanonicalRentalCheckoutResult> => {
  const eventRecord = toRecord(event);
  const exactSelectionRows = Array.isArray(rentalSelections) && rentalSelections.length > 0
    ? rentalSelections
    : null;
  let selections: RentalSelectionInput[];
  let eventId: string;
  let legacyWindow: RentalCheckoutWindow | null = null;

  if (exactSelectionRows) {
    const parsedSelections = rentalSelectionsSchema.safeParse(exactSelectionRows);
    if (!parsedSelections.success) {
      return { ok: false, status: 400, error: 'Rental selections are invalid.' };
    }
    const requestedEventId = extractEntityId(eventRecord);
    if (!requestedEventId) {
      return { ok: false, status: 400, error: 'Event id is required for rental checkout.' };
    }
    eventId = requestedEventId;
    selections = parsedSelections.data;
  } else {
    const requested = extractRentalCheckoutWindow({ event, timeSlot });
    if (!requested.ok) {
      return requested;
    }
    legacyWindow = requested.window;
    eventId = requested.window.eventId;
    if (requested.window.fieldIds.length > MAX_RENTAL_FIELDS_PER_CHECKOUT) {
      return {
        ok: false,
        status: 400,
        error: `Rental checkout supports at most ${MAX_RENTAL_FIELDS_PER_CHECKOUT} fields at a time.`,
      };
    }
    selections = [{
      scheduledFieldIds: requested.window.fieldIds,
      startDate: requested.window.start.toISOString(),
      endDate: requested.window.end.toISOString(),
      timeZone: requested.window.timeZone,
      repeating: false,
    }];
  }

  const requestedFieldIds = uniqueInOrder(
    selections.flatMap((selection) => normalizeRentalStringArray(selection.scheduledFieldIds)),
  );
  if (!requestedFieldIds.length) {
    return unavailable();
  }
  if (requestedFieldIds.length > MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER) {
    return {
      ok: false,
      status: 400,
      error: `Rental checkout supports at most ${MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER} field windows at a time.`,
    };
  }

  const fields = await client.fields.findMany({
    where: {
      id: { in: requestedFieldIds },
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
  if (fields.length !== requestedFieldIds.length) {
    return unavailable();
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const orderedFields = requestedFieldIds
    .map((fieldId) => fieldById.get(fieldId))
    .filter((field): field is CanonicalRentalField => Boolean(field));
  if (orderedFields.length !== requestedFieldIds.length) {
    return unavailable();
  }

  const facilityIds = uniqueInOrder(
    orderedFields
      .map((field) => normalizeString(field.facilityId))
      .filter((id): id is string => Boolean(id)),
  );
  const facilities = facilityIds.length
    ? await client.facilities.findMany({
      where: { id: { in: facilityIds } },
      select: { id: true, organizationId: true },
    }) as Array<{ id: string; organizationId: string | null }>
    : [];
  if (facilities.length !== facilityIds.length) {
    return unavailable();
  }
  const organizationByFacilityId = new Map(
    facilities.map((facility) => [facility.id, normalizeString(facility.organizationId)]),
  );
  if (orderedFields.some((field) => {
    const fieldOrganizationId = normalizeString(field.organizationId);
    const facilityOrganizationId = organizationByFacilityId.get(normalizeString(field.facilityId) ?? '') ?? null;
    return Boolean(fieldOrganizationId && facilityOrganizationId && fieldOrganizationId !== facilityOrganizationId);
  })) {
    return unavailable();
  }

  const organizationIds = uniqueInOrder(
    orderedFields
      .map((field) => normalizeString(field.organizationId)
        ?? organizationByFacilityId.get(normalizeString(field.facilityId) ?? '')
        ?? null)
      .filter((id): id is string => Boolean(id)),
  );
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
      timeZone: true,
    },
  }) as CanonicalRentalOrganization | null;
  if (!organization) {
    return unavailable();
  }

  const canonicalEvent = await client.events.findUnique({
    where: { id: eventId },
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

  const rentalSlotIds = uniqueInOrder(
    orderedFields.flatMap((field) => normalizeRentalStringArray(field.rentalSlotIds)),
  );
  const availabilitySlots = rentalSlotIds.length
    ? await client.timeSlots.findMany({
      where: {
        id: { in: rentalSlotIds },
        archivedAt: null,
        price: { not: null },
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
    }) as RentalAvailabilitySlot[]
    : [];

  const validation = validateRentalSelections({
    selections,
    fields: orderedFields,
    slots: availabilitySlots,
    organization,
    now: requireAvailability ? new Date() : null,
    requireAvailability,
  });
  if (!validation.ok) {
    return validation.error === 'Rental selections must start in the future.'
      || validation.error === 'Rental selections must include valid start and end times.'
      ? { ok: false, status: 400, error: validation.error }
      : unavailable();
  }
  if (validation.distinctFieldWindowCount > MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER) {
    return {
      ok: false,
      status: 400,
      error: `Rental checkout supports at most ${MAX_ACTIVE_RENTAL_CHECKOUT_LOCKS_PER_USER} field windows at a time.`,
    };
  }

  const baseWindow = {
    eventId: canonicalEvent?.id ?? eventId,
    noFixedEndDateTime: false,
    organizationId: organization.id,
    eventType: canonicalEvent?.eventType ?? legacyWindow?.eventType ?? 'EVENT',
    parentEvent: canonicalEvent?.parentEvent ?? legacyWindow?.parentEvent ?? null,
  };
  const windows = validation.selections.map((selection) => ({
    ...baseWindow,
    fieldIds: selection.fieldIds,
    start: selection.start,
    end: selection.end,
    timeZone: selection.timeZone,
  }));
  const items = validation.selections.flatMap((selection) => selection.items);

  return {
    ok: true,
    checkout: {
      window: windows[0],
      windows,
      organization,
      totalAmountCents: validation.selections.reduce((sum, selection) => sum + selection.totalCents, 0),
      availabilitySlotIds: uniqueInOrder(items.map((item) => item.availabilitySlotId)),
      requiredTemplateIds: uniqueInOrder(validation.selections.flatMap((selection) => selection.requiredTemplateIds)),
      hostRequiredTemplateIds: uniqueInOrder(
        validation.selections.flatMap((selection) => selection.hostRequiredTemplateIds),
      ),
      event: canonicalEvent,
    },
  };
};
