import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { findPresentKeys, findUnknownKeys } from '@/server/http/strictPatch';

export const dynamic = 'force-dynamic';

const updateEnvelopeSchema = z.object({
  facility: z.record(z.string(), z.unknown()),
}).strict();

const operatingIntervalSchema = z.object({
  openMinutes: z.number().int().min(0).max(1439),
  closeMinutes: z.number().int().min(1).max(1440),
}).strict().refine((interval) => interval.closeMinutes > interval.openMinutes, {
  message: 'Close time must be after open time.',
  path: ['closeMinutes'],
});

const operatingDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.boolean(),
  intervals: z.array(operatingIntervalSchema).max(4),
}).strict().refine((day) => (day.closed ? day.intervals.length === 0 : day.intervals.length > 0), {
  message: 'Open days require at least one interval; closed days cannot have intervals.',
  path: ['intervals'],
});

const operatingHoursSchema = z.object({
  version: z.literal(1),
  weekly: z.array(operatingDaySchema).max(7),
}).strict().refine((hours) => new Set(hours.weekly.map((day) => day.dayOfWeek)).size === hours.weekly.length, {
  message: 'Weekly operating hours cannot contain duplicate days.',
  path: ['weekly'],
});

const facilityPatchSchema = z.object({
  name: z.string().nullable().optional(),
  location: z.string().trim().min(1, 'Facility location is required').optional(),
  address: z.string().nullable().optional(),
  affiliateUrl: z.string().nullable().optional(),
  coordinates: z.unknown().nullable().optional(),
  operatingHours: operatingHoursSchema.nullable().optional(),
  timeZone: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().nullable().optional(),
}).strict();

const FACILITY_MUTABLE_FIELDS = new Set([
  'name',
  'location',
  'address',
  'affiliateUrl',
  'coordinates',
  'operatingHours',
  'timeZone',
  'status',
  'isDefault',
  'sortOrder',
]);

const FACILITY_HARD_IMMUTABLE_FIELDS = new Set([
  'id',
  '$id',
  'organizationId',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);

const SELECTED_FACILITY_LOCATION_ERROR = 'Facility location must be selected from suggestions or the map';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const coordinatesAreSet = (value: unknown): boolean => {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lat = Number(record.lat ?? record.latitude);
    const lng = Number(record.lng ?? record.long ?? record.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  }
  return false;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facility = await (prisma as any).facilities.findUnique({ where: { id } });
  if (!facility) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(facility, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsedEnvelope = updateEnvelopeSchema.safeParse(body ?? {});
  if (!parsedEnvelope.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedEnvelope.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await (prisma as any).facilities.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      location: true,
      coordinates: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const organization = await prisma.organizations.findUnique({
    where: { id: existing.organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.FIELDS_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payloadRecord = parsedEnvelope.data.facility;
  const unknownPayloadKeys = findUnknownKeys(payloadRecord, [
    ...FACILITY_MUTABLE_FIELDS,
    ...FACILITY_HARD_IMMUTABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown facility patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }
  const hardImmutableKeys = findPresentKeys(payloadRecord, FACILITY_HARD_IMMUTABLE_FIELDS);
  if (hardImmutableKeys.length) {
    return NextResponse.json(
      { error: 'Immutable facility fields cannot be updated.', fields: hardImmutableKeys },
      { status: 403 },
    );
  }

  const parsedPayload = facilityPatchSchema.safeParse(payloadRecord);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsedPayload.error.flatten() }, { status: 400 });
  }

  const safePayload = parsedPayload.data;
  const touchesLocation = Object.prototype.hasOwnProperty.call(safePayload, 'location')
    || Object.prototype.hasOwnProperty.call(safePayload, 'coordinates');
  if (touchesLocation) {
    const nextLocation = Object.prototype.hasOwnProperty.call(safePayload, 'location')
      ? normalizeText(safePayload.location)
      : normalizeText(existing.location);
    const nextCoordinates = Object.prototype.hasOwnProperty.call(safePayload, 'coordinates')
      ? safePayload.coordinates
      : existing.coordinates;
    if (nextLocation && !coordinatesAreSet(nextCoordinates)) {
      return NextResponse.json({ error: SELECTED_FACILITY_LOCATION_ERROR }, { status: 400 });
    }
  }

  const updateData: Record<string, unknown> = {};
  for (const key of FACILITY_MUTABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(safePayload, key)) {
      continue;
    }

    const value = safePayload[key as keyof typeof safePayload];
    if (key === 'name') {
      updateData.name = normalizeText(value) ?? 'Main Facility';
    } else if (key === 'location' || key === 'address' || key === 'affiliateUrl' || key === 'timeZone' || key === 'status') {
      updateData[key] = normalizeText(value);
    } else {
      updateData[key] = value;
    }
  }

  const updated = await (prisma as any).facilities.update({
    where: { id },
    data: {
      ...updateData,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(updated, { status: 200 });
}
