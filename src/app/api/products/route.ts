import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  organizationId: z.string(),
  product: z.object({
    name: z.string(),
    description: z.string().optional(),
    priceCents: z.number(),
    period: z.string(),
  }),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const organizationId = params.get('organizationId');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (organizationId) where.organizationId = organizationId;

  const products = await prisma.products.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ products: withLegacyList(products) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: parsed.data.organizationId } });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!session.isAdmin && org.ownerId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const product = await prisma.products.create({
    data: {
      id: crypto.randomUUID(),
      name: parsed.data.product.name,
      description: parsed.data.product.description ?? null,
      priceCents: parsed.data.product.priceCents,
      period: parsed.data.product.period.toUpperCase() as any,
      organizationId: parsed.data.organizationId,
      createdBy: session.userId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(product), { status: 201 });
}
