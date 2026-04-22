import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';

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
  location: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
  heading: z.number().optional(),
  inUse: z.boolean().optional(),
  organizationId: z.string().optional(),
  rentalSlotIds: z.array(z.string()).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const eventId = params.get('eventId');
  const organizationId = params.get('organizationId');

  let ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  if (!ids && eventId) {
    const event = await prisma.events.findUnique({ where: { id: eventId } });
    ids = Array.isArray(event?.fieldIds) ? event?.fieldIds : [];
  }

  const where: any = {};
  if (ids && ids.length) {
    where.id = { in: ids };
  }
  if (organizationId) {
    where.organizationId = organizationId;
  }

  const fields = await prisma.fields.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });

  return NextResponse.json({ fields: withLegacyList(fields) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const orgId = typeof data.organizationId === 'string' && data.organizationId.trim().length > 0
    ? data.organizationId.trim()
    : null;

  const organization = orgId
    ? await prisma.organizations.findUnique({
        where: { id: orgId },
        select: { id: true, ownerId: true, hostIds: true, officialIds: true },
      })
    : null;

  if (orgId && !organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  if (organization && !(await canManageOrganization(session, organization))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    return NextResponse.json(withLegacyFields(record), { status: 201 });
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
