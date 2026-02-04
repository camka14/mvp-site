import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  user: z.record(z.string(), z.any()).optional(),
  startDate: z.string().optional(),
  priceCents: z.number().optional(),
  organizationId: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const product = await prisma.products.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const startDate = parseDateInput(parsed.data.startDate) ?? new Date();

  const subscription = await prisma.subscriptions.create({
    data: {
      id: crypto.randomUUID(),
      productId: id,
      userId: session.userId,
      organizationId: parsed.data.organizationId ?? product.organizationId,
      startDate,
      priceCents: parsed.data.priceCents ?? product.priceCents,
      period: product.period as any,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(subscription), { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.subscriptions.update({
    where: { id },
    data: { status: 'ACTIVE', updatedAt: new Date() },
  });

  return NextResponse.json({ restarted: true }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.subscriptions.update({
    where: { id },
    data: { status: 'CANCELLED', updatedAt: new Date() },
  });

  return NextResponse.json({ cancelled: true }, { status: 200 });
}
