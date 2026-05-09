import { prisma } from '@/lib/prisma';

type AnyRow = Record<string, unknown>;

export type BillingTaxPolicyContext = {
  event: AnyRow | null;
  organization: AnyRow | null;
  timeSlot: AnyRow | null;
  eventId: string | null;
  timeSlotId: string | null;
  organizationId: string | null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const asRow = (value: unknown): AnyRow | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as AnyRow
    : null
);

const extractEntityId = (value: unknown): string | null => {
  const row = asRow(value);
  return row
    ? normalizeString(row.$id ?? row.id ?? row.teamId)
    : normalizeString(value);
};

const toSerializableRow = (row: AnyRow | null): AnyRow | null => {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
};

export const loadBillingTaxPolicyContext = async ({
  event,
  timeSlot,
  organization,
  organizationId,
}: {
  event?: unknown;
  timeSlot?: unknown;
  organization?: unknown;
  organizationId?: string | null;
}): Promise<BillingTaxPolicyContext> => {
  const payloadEvent = asRow(event);
  const payloadTimeSlot = asRow(timeSlot);
  const payloadOrganization = asRow(organization);
  const eventId = extractEntityId(event);
  const timeSlotId = extractEntityId(timeSlot);
  const eventsClient = (prisma as any).events;
  const timeSlotsClient = (prisma as any).timeSlots;
  const organizationsClient = (prisma as any).organizations;

  const persistedEvent = eventId && typeof eventsClient?.findUnique === 'function'
    ? await eventsClient.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          address: true,
          location: true,
          organizationId: true,
          taxHandling: true,
          organizerManualTaxRateBps: true,
        } as any,
      })
    : null;

  const persistedTimeSlot = timeSlotId && typeof timeSlotsClient?.findUnique === 'function'
    ? await timeSlotsClient.findUnique({
        where: { id: timeSlotId },
        select: {
          id: true,
          taxHandling: true,
        } as any,
      })
    : null;

  const resolvedOrganizationId =
    normalizeString(organizationId)
    ?? normalizeString(payloadOrganization?.$id ?? payloadOrganization?.id)
    ?? normalizeString(persistedEvent?.organizationId)
    ?? normalizeString(payloadEvent?.organizationId)
    ?? null;

  const persistedOrganization = resolvedOrganizationId && typeof organizationsClient?.findUnique === 'function'
    ? await organizationsClient.findUnique({
        where: { id: resolvedOrganizationId },
        select: {
          id: true,
          taxOrganizationType: true,
          operatesAthleticFacility: true,
          defaultEventTaxHandling: true,
          defaultRentalTaxHandling: true,
          taxResponsibilityAcceptedAt: true,
          taxResponsibilityAcceptedByUserId: true,
          taxResponsibilityAgreementVersion: true,
        } as any,
      })
    : null;

  return {
    event: {
      ...(payloadEvent ?? {}),
      ...(toSerializableRow(persistedEvent) ?? {}),
    },
    organization: resolvedOrganizationId
      ? {
          ...(payloadOrganization ?? {}),
          ...(toSerializableRow(persistedOrganization) ?? {}),
        }
      : null,
    timeSlot: timeSlotId || payloadTimeSlot
      ? {
          ...(payloadTimeSlot ?? {}),
          ...(toSerializableRow(persistedTimeSlot) ?? {}),
        }
      : null,
    eventId,
    timeSlotId,
    organizationId: resolvedOrganizationId,
  };
};
