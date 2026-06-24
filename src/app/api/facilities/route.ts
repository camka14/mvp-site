import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';

export const dynamic = 'force-dynamic';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

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

const createSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  name: z.string().optional(),
  location: z.string().trim().min(1, 'Facility location is required'),
  address: z.string().nullable().optional(),
  coordinates: z.unknown().nullable().optional(),
  operatingHours: operatingHoursSchema.nullable().optional(),
  timeZone: z.string().optional(),
  status: z.string().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().nullable().optional(),
}).strict();

const SELECTED_FACILITY_LOCATION_ERROR = 'Facility location must be selected from suggestions or the map';

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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ids = params.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  const organizationId = normalizeId(params.get('organizationId'));

  const where: Record<string, unknown> = {};
  if (ids.length) {
    where.id = { in: ids };
  }
  if (organizationId) {
    where.organizationId = organizationId;
  }
  if (!ids.length && !organizationId) {
    return NextResponse.json({ facilities: [] }, { status: 200 });
  }

  const facilities = await (prisma as any).facilities.findMany({
    where,
    orderBy: [
      { isDefault: 'desc' },
      { sortOrder: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
  });

  return NextResponse.json({ facilities: withLegacyList(facilities) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (!coordinatesAreSet(data.coordinates)) {
    return NextResponse.json({ error: SELECTED_FACILITY_LOCATION_ERROR }, { status: 400 });
  }

  const organizationId = normalizeId(data.organizationId);
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization is required' }, { status: 400 });
  }

  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.FIELDS_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const facility = await (prisma as any).facilities.create({
    data: {
      id: normalizeId(data.id) ?? createId(),
      createdAt: now,
      updatedAt: now,
      organizationId,
      name: data.name?.trim() || 'Main Facility',
      location: data.location,
      address: data.address?.trim() || null,
      coordinates: data.coordinates ?? null,
      operatingHours: data.operatingHours ?? null,
      timeZone: data.timeZone?.trim() || 'UTC',
      status: data.status?.trim() || 'ACTIVE',
      isDefault: data.isDefault ?? false,
      sortOrder: data.sortOrder ?? null,
    },
  });

  return NextResponse.json(withLegacyFields(facility), { status: 201 });
}
