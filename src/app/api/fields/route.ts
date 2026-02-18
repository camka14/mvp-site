import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  location: z.string().optional(),
  lat: z.number().optional(),
  long: z.number().optional(),
  fieldNumber: z.number().optional(),
  heading: z.number().optional(),
  inUse: z.boolean().optional(),
  organizationId: z.string().optional(),
  divisions: z.array(z.string()).optional(),
  rentalSlotIds: z.array(z.string()).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const eventId = params.get('eventId');

  let ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  if (!ids && eventId) {
    const event = await prisma.events.findUnique({ where: { id: eventId } });
    ids = Array.isArray(event?.fieldIds) ? event?.fieldIds : [];
  }

  const where: any = {};
  if (ids && ids.length) {
    where.id = { in: ids };
  }

  const fields = await prisma.fields.findMany({
    where,
    orderBy: { fieldNumber: 'asc' },
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
        select: { id: true, ownerId: true, hostIds: true, fieldIds: true },
      })
    : null;

  if (orgId && !organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  if (organization && !canManageOrganization(session, organization)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.fields.create({
      data: {
        id: data.id,
        name: data.name ?? null,
        location: data.location ?? null,
        lat: data.lat ?? null,
        long: data.long ?? null,
        fieldNumber: data.fieldNumber ?? 0,
        heading: data.heading ?? null,
        inUse: data.inUse ?? null,
        organizationId: orgId,
        divisions: Array.isArray(data.divisions) ? data.divisions : [],
        rentalSlotIds: Array.isArray(data.rentalSlotIds) ? data.rentalSlotIds : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (organization && orgId) {
      const currentIds = Array.isArray(organization.fieldIds) ? organization.fieldIds : [];
      const nextIds = Array.from(new Set([...currentIds, created.id]));
      await tx.organizations.update({
        where: { id: orgId },
        data: { fieldIds: nextIds, updatedAt: new Date() },
      });
    }

    return created;
  });

  return NextResponse.json(withLegacyFields(record), { status: 201 });
}
