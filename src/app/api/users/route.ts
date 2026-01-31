import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

const createSchema = z.object({
  id: z.string(),
  data: z.record(z.any()),
});

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, data } = parsed.data;
  const now = new Date();
  const existing = await prisma.userData.findUnique({ where: { id } });
  const record = existing
    ? await prisma.userData.update({ where: { id }, data: { ...data, updatedAt: now } })
    : await prisma.userData.create({ data: { id, createdAt: now, updatedAt: now, ...data } });

  return NextResponse.json({ user: record }, { status: 201 });
}
