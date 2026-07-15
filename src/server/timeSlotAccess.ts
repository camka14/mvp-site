import { prisma } from '@/lib/prisma';
import type { SessionToken } from '@/lib/authServer';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';

type TimeSlotAccessRecord = {
  id: string;
  scheduledFieldId?: string | null;
  scheduledFieldIds?: unknown;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

export const getTimeSlotFieldIds = (slot: Pick<TimeSlotAccessRecord, 'scheduledFieldId' | 'scheduledFieldIds'>): string[] => {
  const values = Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
    ? slot.scheduledFieldIds
    : [slot.scheduledFieldId];
  return Array.from(new Set(
    values
      .map((value) => normalizeId(value))
      .filter((value): value is string => Boolean(value)),
  ));
};

/**
 * Field inventory belongs to the managing organization when one is assigned.
 * A standalone field remains manageable only by its recorded creator. This
 * deliberately avoids treating a caller-supplied time-slot ID as authority.
 */
export const canManageScheduledFields = async (
  session: SessionToken,
  fieldIds: string[],
  client: typeof prisma = prisma,
): Promise<boolean> => {
  if (session.isAdmin) return true;
  const normalizedFieldIds = Array.from(new Set(fieldIds.map(normalizeId).filter((id): id is string => Boolean(id))));
  if (!normalizedFieldIds.length) return false;

  const fields = await client.fields.findMany({
    where: { id: { in: normalizedFieldIds }, archivedAt: null },
    select: { id: true, organizationId: true, facilityId: true, createdBy: true },
  });
  if (fields.length !== normalizedFieldIds.length) return false;

  const facilityIds = Array.from(new Set(
    fields.map((field) => normalizeId(field.facilityId)).filter((id): id is string => Boolean(id)),
  ));
  const facilities = facilityIds.length
    ? await client.facilities.findMany({
      where: { id: { in: facilityIds } },
      select: { id: true, organizationId: true },
    })
    : [];
  const organizationIdByFacilityId = new Map(
    facilities.map((facility) => [facility.id, normalizeId(facility.organizationId)]),
  );

  for (const field of fields) {
    const organizationId = normalizeId(field.organizationId)
      ?? organizationIdByFacilityId.get(field.facilityId ?? '')
      ?? null;
    if (!organizationId) {
      if (field.createdBy !== session.userId) return false;
      continue;
    }

    const organization = await client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    });
    if (!(await canManageOrganization(session, organization, client))) return false;
  }

  return true;
};

/**
 * Legacy field-less slots are only mutable through every event that currently
 * references them. Requiring every linked event scope avoids a manager of one
 * shared schedule from changing another organization's schedule.
 */
export const canManageTimeSlot = async (
  session: SessionToken,
  slot: TimeSlotAccessRecord,
  client: typeof prisma = prisma,
): Promise<boolean> => {
  if (session.isAdmin) return true;
  const fieldIds = getTimeSlotFieldIds(slot);
  if (fieldIds.length) {
    return canManageScheduledFields(session, fieldIds, client);
  }

  const events = await client.events.findMany({
    where: { timeSlotIds: { has: slot.id }, archivedAt: null },
    select: { id: true, hostId: true, assistantHostIds: true, organizationId: true },
  });
  if (!events.length) return false;

  const access = await Promise.all(events.map((event) => canManageEvent(session, event, client)));
  return access.every(Boolean);
};
