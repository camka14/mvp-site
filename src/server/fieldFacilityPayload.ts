import { prisma } from '@/lib/prisma';
import { withLegacyFields } from '@/server/legacyFormat';

type FieldRow = Record<string, any> & {
  facilityId?: string | null;
  facility?: Record<string, any> | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const attachFacilitiesToFieldRows = async <T extends FieldRow>(
  fields: T[],
): Promise<Array<T & { facility?: Record<string, any> | null }>> => {
  const facilityIds = Array.from(
    new Set(
      fields
        .map((field) => normalizeId(field.facilityId))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const facilitiesDelegate = (prisma as any).facilities;
  if (!facilityIds.length || typeof facilitiesDelegate?.findMany !== 'function') {
    return fields;
  }

  const facilities = await facilitiesDelegate.findMany({
    where: { id: { in: facilityIds } },
  });
  const facilityById = new Map<string, Record<string, any>>(
    facilities.map((facility: Record<string, any>) => [facility.id, facility]),
  );

  return fields.map((field) => ({
    ...field,
    facility: field.facilityId ? facilityById.get(field.facilityId) ?? null : null,
  }));
};

export const withLegacyFieldPayload = <T extends FieldRow>(field: T) => (
  withLegacyFields({
    ...field,
    facility: field.facility ? withLegacyFields(field.facility) : field.facility ?? null,
  })
);
