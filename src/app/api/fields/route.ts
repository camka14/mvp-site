import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
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
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const record = await prisma.fields.create({
    data: {
      id: data.id,
      name: data.name ?? null,
      type: data.type ?? null,
      location: data.location ?? null,
      lat: data.lat ?? null,
      long: data.long ?? null,
      fieldNumber: data.fieldNumber ?? 0,
      heading: data.heading ?? null,
      inUse: data.inUse ?? null,
      organizationId: data.organizationId ?? null,
      divisions: Array.isArray(data.divisions) ? data.divisions : [],
      rentalSlotIds: Array.isArray(data.rentalSlotIds) ? data.rentalSlotIds : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(record), { status: 201 });
}
