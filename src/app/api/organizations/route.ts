import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().optional(),
  description: z.string().optional(),
  logoId: z.string().optional(),
  ownerId: z.string(),
  hostIds: z.array(z.string()).optional(),
  website: z.string().optional(),
  sports: z.array(z.string()).optional(),
  refIds: z.array(z.string()).optional(),
  hasStripeAccount: z.boolean().optional(),
  coordinates: z.any().optional(),
  fieldIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const ownerId = params.get('ownerId');
  const limit = Number(params.get('limit') || '100');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (ownerId) where.ownerId = ownerId;

  const organizations = await prisma.organizations.findMany({
    where,
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ organizations: withLegacyList(organizations) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!session.isAdmin && parsed.data.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = parsed.data;
  const organization = await prisma.organizations.create({
    data: {
      id: data.id,
      name: data.name,
      location: data.location ?? null,
      description: data.description ?? null,
      logoId: data.logoId ?? null,
      ownerId: data.ownerId,
      hostIds: Array.isArray(data.hostIds) ? data.hostIds : [],
      website: data.website ?? null,
      sports: Array.isArray(data.sports) ? data.sports : [],
      refIds: Array.isArray(data.refIds) ? data.refIds : [],
      hasStripeAccount: data.hasStripeAccount ?? false,
      coordinates: data.coordinates ?? null,
      fieldIds: Array.isArray(data.fieldIds) ? data.fieldIds : [],
      productIds: Array.isArray(data.productIds) ? data.productIds : [],
      teamIds: Array.isArray(data.teamIds) ? data.teamIds : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(organization), { status: 201 });
}
