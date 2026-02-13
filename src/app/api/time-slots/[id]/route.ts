import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  slot: z.record(z.string(), z.any()).optional(),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const payload = parsed.data.slot ?? parsed.data ?? {};
  if (payload.startDate) {
    const parsedDate = parseDateInput(payload.startDate);
    if (parsedDate) payload.startDate = parsedDate;
  }
  if (payload.endDate !== undefined) {
    if (payload.endDate === null) {
      payload.endDate = null;
    } else {
      const parsedDate = parseDateInput(payload.endDate);
      if (parsedDate) payload.endDate = parsedDate;
    }
  }
  if (payload.requiredTemplateIds !== undefined) {
    payload.requiredTemplateIds = Array.isArray(payload.requiredTemplateIds)
      ? Array.from(
        new Set(
          payload.requiredTemplateIds
            .map((id: unknown) => String(id))
            .filter((id: string) => id.length > 0),
        ),
      )
      : [];
  }

  const updated = await prisma.timeSlots.update({
    where: { id },
    data: { ...payload, updatedAt: new Date() },
  });

  return NextResponse.json(withLegacyFields(updated), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const { id } = await params;
  await prisma.timeSlots.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
