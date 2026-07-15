import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { hasOrgPermission } from '@/server/accessControl';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { ensureDefaultFacilityForOrganization, getFacilityForOrganization } from '@/server/facilities';
import { attachFacilitiesToFieldRows, withLegacyFieldPayload } from '@/server/fieldFacilityPayload';

export const dynamic = 'force-dynamic';

const isUniqueConstraintError = (error: unknown): boolean => {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: string }).code === 'P2002',
  );
};

const isUnknownPrismaCreatedByArgError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Unknown argument `createdBy`/i.test(message);
};

const createSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  location: z.string().nullable().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
  heading: z.number().optional(),
  inUse: z.boolean().optional(),
  organizationId: z.string().optional(),
  facilityId: z.string().nullable().optional(),
  sportIds: z.array(z.string()).optional(),
  rentalSlotIds: z.array(z.string()).optional(),
}).passthrough();

const SELECTED_FIELD_LOCATION_ERROR = 'Resource location must be selected from suggestions or the map';
const DEFAULT_FIELDS_PAGE_SIZE = 100;
const MAX_FIELDS_PAGE_SIZE = 200;

const hasFieldLocation = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const fieldCoordinatesAreSet = (lat: unknown, lng: unknown): boolean => {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  return Number.isFinite(normalizedLat) && Number.isFinite(normalizedLng) && !(normalizedLat === 0 && normalizedLng === 0);
};

const normalizeStringList = (values: unknown): string[] => (
  Array.isArray(values)
    ? Array.from(
        new Set(
          values
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0),
        ),
      )
    : []
);

const normalizePageSize = (value: string | null): number => {
  const parsed = Number(value ?? DEFAULT_FIELDS_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_FIELDS_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_FIELDS_PAGE_SIZE);
};

const normalizeOffset = (value: string | null): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
};

const isPublicOrganization = (organization: { status?: string | null } | null): boolean => (
  organization?.status === 'LISTED'
);

const toPublicFieldPayload = (field: Record<string, any>) => ({
  id: field.id,
  createdAt: field.createdAt ?? null,
  updatedAt: field.updatedAt ?? null,
  name: field.name ?? null,
  location: field.location ?? null,
  lat: field.lat ?? null,
  long: field.long ?? null,
  facilityId: field.facilityId ?? null,
  sportIds: Array.isArray(field.sportIds) ? field.sportIds : [],
  rentalSlotIds: Array.isArray(field.rentalSlotIds) ? field.rentalSlotIds : [],
  facility: field.facility
    ? {
        id: field.facility.id,
        name: field.facility.name ?? null,
        location: field.facility.location ?? null,
        address: field.facility.address ?? null,
        coordinates: field.facility.coordinates ?? null,
        status: field.facility.status ?? null,
      }
    : null,
});

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const eventId = params.get('eventId');
  const organizationId = params.get('organizationId');
  const sportIds = normalizeStringList(params.getAll('sportId').concat(params.get('sportIds')?.split(',') ?? []));
  const limit = normalizePageSize(params.get('limit'));
  const offset = normalizeOffset(params.get('offset'));
  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    session = await requireSession(req);
  } catch (error) {
    if (!(error instanceof Response)) throw error;
  }

  if (!session) {
    // Anonymous discovery may only resolve the public inventory of one listed organization.
    // Event- and ID-based field hydration remain authenticated application operations.
    if (!organizationId || idsParam || eventId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organization = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (!isPublicOrganization(organization)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  let ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  if (!ids && eventId) {
    const event = await prisma.events.findUnique({ where: { id: eventId } });
    ids = Array.isArray(event?.fieldIds) ? event?.fieldIds : [];
  }

  const where: any = { archivedAt: null };
  if (ids && ids.length) {
    where.id = { in: ids };
  }
  if (organizationId) {
    where.organizationId = organizationId;
  }
  if (sportIds.length) {
    where.sportIds = { hasSome: sportIds };
  }

  const fields = await prisma.fields.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    skip: offset,
  });
  const pageRows = fields.slice(0, limit);
  const fieldsWithFacilities = await attachFacilitiesToFieldRows(pageRows);
  const responseRows = session
    ? fieldsWithFacilities.map(withLegacyFieldPayload)
    : fieldsWithFacilities.map((field) => withLegacyFieldPayload(toPublicFieldPayload(field)));

  return NextResponse.json({
    fields: responseRows,
    pagination: {
      limit,
      offset,
      nextOffset: offset + pageRows.length,
      hasMore: fields.length > limit,
    },
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (hasFieldLocation(data.location) && !fieldCoordinatesAreSet(data.lat, data.long)) {
    return NextResponse.json({ error: SELECTED_FIELD_LOCATION_ERROR }, { status: 400 });
  }

  const orgId = typeof data.organizationId === 'string' && data.organizationId.trim().length > 0
    ? data.organizationId.trim()
    : null;
  const requestedFacilityId = typeof data.facilityId === 'string' && data.facilityId.trim().length > 0
    ? data.facilityId.trim()
    : null;

  const organization = orgId
    ? await prisma.organizations.findUnique({
        where: { id: orgId },
        select: { id: true, ownerId: true, name: true, location: true, address: true, coordinates: true },
      })
    : null;

  if (orgId && !organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  if (organization && !(await hasOrgPermission(session, organization, ORG_PERMISSIONS.FIELDS_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!orgId && requestedFacilityId) {
    return NextResponse.json({ error: 'A facility can only be assigned to an organization field' }, { status: 400 });
  }

  let facilityId: string | null = null;
  if (organization) {
    if (requestedFacilityId) {
      const facility = await getFacilityForOrganization(requestedFacilityId, organization.id);
      if (!facility) {
        return NextResponse.json({ error: 'Facility not found for organization' }, { status: 400 });
      }
      facilityId = facility.id;
    } else {
      const defaultFacility = await ensureDefaultFacilityForOrganization(organization);
      facilityId = defaultFacility?.id ?? null;
    }
  }

  try {
    const baseCreateData = {
      id: data.id,
      name: data.name ?? null,
      location: data.location ?? null,
      lat: data.lat ?? null,
      long: data.long ?? null,
      heading: data.heading ?? null,
      inUse: data.inUse ?? null,
      organizationId: orgId,
      facilityId,
      sportIds: normalizeStringList(data.sportIds),
      rentalSlotIds: Array.isArray(data.rentalSlotIds) ? data.rentalSlotIds : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let record: any;
    try {
      record = await (prisma.fields as any).create({
        data: {
          ...baseCreateData,
          createdBy: session.userId,
        },
      });
    } catch (error) {
      if (!isUnknownPrismaCreatedByArgError(error)) {
        throw error;
      }
      record = await (prisma.fields as any).create({ data: baseCreateData });
    }

    const [fieldWithFacility] = await attachFacilitiesToFieldRows([record]);
    return NextResponse.json(withLegacyFieldPayload(fieldWithFacility ?? record), { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          error: 'Field already exists. A previous create attempt likely succeeded; check whether the event/documents were already created.',
          code: 'FIELD_ALREADY_EXISTS',
          fieldId: data.id,
        },
        { status: 409 },
      );
    }
    console.error('Create field failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
