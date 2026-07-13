import { NextRequest, NextResponse } from 'next/server';
import { getOptionalSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { canManageOrganization } from '@/server/accessControl';
import { listFieldSchedulingConflicts } from '@/server/repositories/events';

export const dynamic = 'force-dynamic';

export const MAX_RENTAL_AVAILABILITY_RANGE_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

type OrganizationRow = {
  id: string;
  ownerId: string | null;
  publicPageEnabled: boolean | null;
};

type FacilityRow = {
  id: string;
  organizationId: string | null;
  name: string | null;
};

type FieldRow = {
  id: string;
  name: string | null;
  organizationId: string | null;
  facilityId: string | null;
  rentalSlotIds: unknown;
};

type RentalSlotRow = {
  id: string;
  archivedAt: Date | string | null;
  dayOfWeek: number | null;
  daysOfWeek: unknown;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  timeZone: string | null;
  repeating: boolean | null;
  price: number | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map(normalizeId)
        .filter((id): id is string => Boolean(id)),
    ))
    : []
);

const normalizeWeekdays = (slot: Pick<RentalSlotRow, 'dayOfWeek' | 'daysOfWeek'>): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length > 0
    ? slot.daysOfWeek
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  return Array.from(new Set(
    source
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )).sort((left, right) => left - right);
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseIsoInstant = (value: string | null): Date | null => {
  if (!value || !value.includes('T') || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return null;
  }
  return toDate(value);
};

const toIsoOrNull = (value: unknown): string | null => toDate(value)?.toISOString() ?? null;

const invalidRange = (error: string) => NextResponse.json({
  error,
  code: 'INVALID_RENTAL_AVAILABILITY_RANGE',
}, { status: 400 });

const clipConflict = (conflict: { fieldId: string; start: Date; end: Date }, range: { start: Date; end: Date }) => {
  const start = new Date(Math.max(conflict.start.getTime(), range.start.getTime()));
  const end = new Date(Math.min(conflict.end.getTime(), range.end.getTime()));
  if (end.getTime() <= start.getTime()) {
    return null;
  }
  return {
    fieldId: conflict.fieldId,
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const rangeStart = parseIsoInstant(req.nextUrl.searchParams.get('start'));
  const rangeEnd = parseIsoInstant(req.nextUrl.searchParams.get('end'));
  if (!rangeStart || !rangeEnd || rangeEnd.getTime() <= rangeStart.getTime()) {
    return invalidRange('Query parameters start and end must be valid ISO instants with end after start.');
  }
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_RENTAL_AVAILABILITY_RANGE_DAYS * DAY_MS) {
    return invalidRange(`Rental availability ranges may not exceed ${MAX_RENTAL_AVAILABILITY_RANGE_DAYS} days.`);
  }

  try {
    const [{ organizationId: rawOrganizationId }, session] = await Promise.all([
      params,
      getOptionalSession(req),
    ]);
    const organizationId = normalizeId(rawOrganizationId);
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const organization = await (prisma as any).organizations.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        ownerId: true,
        publicPageEnabled: true,
      },
    }) as OrganizationRow | null;
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const canManage = session
      ? await canManageOrganization(session, organization, prisma as any)
      : false;
    if (!canManage && organization.publicPageEnabled !== true) {
      // Do not disclose the existence or rental inventory of a private organization.
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    const organizationFacilities = await (prisma as any).facilities.findMany({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        name: true,
      },
    }) as FacilityRow[];
    const organizationFacilityIds = organizationFacilities.map((facility) => facility.id);
    const fieldRows = await (prisma as any).fields.findMany({
      where: {
        archivedAt: null,
        OR: [
          { organizationId },
          ...(organizationFacilityIds.length ? [{ facilityId: { in: organizationFacilityIds } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        facilityId: true,
        rentalSlotIds: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }) as FieldRow[];

    const organizationFacilityById = new Map(
      organizationFacilities.map((facility) => [facility.id, facility]),
    );
    const unknownFacilityIds = Array.from(new Set(
      fieldRows
        .map((field) => normalizeId(field.facilityId))
        .filter((facilityId): facilityId is string => Boolean(facilityId && !organizationFacilityById.has(facilityId))),
    ));
    const additionalFacilities = unknownFacilityIds.length
      ? await (prisma as any).facilities.findMany({
        where: { id: { in: unknownFacilityIds } },
        select: {
          id: true,
          organizationId: true,
          name: true,
        },
      }) as FacilityRow[]
      : [];
    const facilityById = new Map<string, FacilityRow>([
      ...organizationFacilities,
      ...additionalFacilities,
    ].map((facility) => [facility.id, facility]));

    const fields = fieldRows.filter((field) => {
      const fieldOrganizationId = normalizeId(field.organizationId);
      const facilityId = normalizeId(field.facilityId);
      const facility = facilityId ? facilityById.get(facilityId) ?? null : null;
      const facilityOrganizationId = normalizeId(facility?.organizationId);
      if (facilityId && !facility) {
        return false;
      }
      if (fieldOrganizationId && facilityOrganizationId && fieldOrganizationId !== facilityOrganizationId) {
        return false;
      }
      return fieldOrganizationId === organizationId || facilityOrganizationId === organizationId;
    });

    const rentalSlotIds = Array.from(new Set(
      fields.flatMap((field) => normalizeIdList(field.rentalSlotIds)),
    ));
    const rentalSlots = rentalSlotIds.length
      ? await (prisma as any).timeSlots.findMany({
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
        },
      }) as RentalSlotRow[]
      : [];
    const rentalSlotById = new Map(
      rentalSlots
        .filter((slot) => !slot.archivedAt)
        .map((slot) => [slot.id, slot]),
    );

    const rentableFields = fields
      .map((field) => {
        const facilityId = normalizeId(field.facilityId);
        const facility = facilityId ? facilityById.get(facilityId) ?? null : null;
        const fieldRentalSlots = normalizeIdList(field.rentalSlotIds)
          .map((slotId) => rentalSlotById.get(slotId))
          .filter((slot): slot is RentalSlotRow => Boolean(slot));
        return {
          id: field.id,
          fieldNumber: null,
          name: field.name ?? '',
          facilityId,
          facilityName: facility?.name ?? null,
          rentalSlots: fieldRentalSlots.map((slot) => ({
            id: slot.id,
            daysOfWeek: normalizeWeekdays(slot),
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: toIsoOrNull(slot.startDate),
            endDate: toIsoOrNull(slot.endDate),
            timeZone: normalizeId(slot.timeZone),
            repeating: slot.repeating !== false,
            price: typeof slot.price === 'number' ? slot.price : 0,
          })),
        };
      })
      .filter((field) => field.rentalSlots.length > 0);

    const conflicts = rentableFields.length
      ? await listFieldSchedulingConflicts({
        client: prisma as any,
        organizationId,
        fieldIds: rentableFields.map((field) => field.id),
        windowStart: rangeStart,
        windowEnd: rangeEnd,
      })
      : [];
    const busyBlockMap = new Map<string, { fieldId: string; start: string; end: string }>();
    for (const conflict of conflicts) {
      const clipped = clipConflict(conflict, { start: rangeStart, end: rangeEnd });
      if (clipped) {
        busyBlockMap.set(`${clipped.fieldId}:${clipped.start}:${clipped.end}`, clipped);
      }
    }
    const busyBlocks = Array.from(busyBlockMap.values()).sort((left, right) => (
      left.fieldId.localeCompare(right.fieldId)
      || left.start.localeCompare(right.start)
      || left.end.localeCompare(right.end)
    ));

    return NextResponse.json({
      range: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
      fields: rentableFields,
      busyBlocks,
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to load rental availability', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
