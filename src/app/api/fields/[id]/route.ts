import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  field: z.record(z.string(), z.any()).optional(),
}).passthrough();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const field = await prisma.fields.findUnique({ where: { id } });
  if (!field) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(withLegacyFields(field), { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const payload = parsed.data.field ?? parsed.data ?? {};
  const updated = await prisma.fields.update({
    where: { id },
    data: { ...payload, updatedAt: new Date() },
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const { id } = await params;
  await prisma.fields.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
