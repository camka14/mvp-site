import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession, assertUserAccess } from '@/lib/permissions';

const updateSchema = z.object({
  data: z.record(z.string(), z.any()),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  assertUserAccess(session, id);
  const user = await prisma.userData.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ user }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  assertUserAccess(session, id);

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.userData.update({
    where: { id },
    data: { ...parsed.data.data, updatedAt: new Date() },
  });
  return NextResponse.json({ user: updated }, { status: 200 });
}
