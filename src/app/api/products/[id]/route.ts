import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { canManageOrganization } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  product: z.record(z.string(), z.any()).optional(),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: existing.organizationId } });
  if (!canManageOrganization(session, org)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = parsed.data.product ?? parsed.data ?? {};
  if (payload.period) {
    payload.period = String(payload.period).toUpperCase();
  }

  const updated = await prisma.products.update({
    where: { id },
    data: { ...payload, updatedAt: new Date() },
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const org = await prisma.organizations.findUnique({ where: { id: existing.organizationId } });
  if (!canManageOrganization(session, org)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.products.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
