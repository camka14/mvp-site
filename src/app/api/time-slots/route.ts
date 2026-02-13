import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyList, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().optional(),
  startTimeMinutes: z.number().nullable().optional(),
  endTimeMinutes: z.number().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  repeating: z.boolean().optional(),
  scheduledFieldId: z.string().optional(),
  price: z.number().optional(),
  requiredTemplateIds: z.array(z.string()).optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const fieldId = params.get('fieldId');
  const dayOfWeek = params.get('dayOfWeek');

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;

  const where: any = {};
  if (ids?.length) where.id = { in: ids };
  if (fieldId) where.scheduledFieldId = fieldId;
  if (dayOfWeek !== null && dayOfWeek !== undefined) {
    const day = Number(dayOfWeek);
    if (!Number.isNaN(day)) {
      where.dayOfWeek = day;
    }
  }

  const slots = await prisma.timeSlots.findMany({
    where,
    orderBy: { startDate: 'asc' },
  });

  return NextResponse.json({ timeSlots: withLegacyList(slots) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const startDate = parseDateInput(data.startDate) ?? new Date();
  const endDate = data.endDate === null ? null : parseDateInput(data.endDate);
  const requiredTemplateIds = Array.isArray(data.requiredTemplateIds)
    ? Array.from(new Set(data.requiredTemplateIds.map((id) => String(id)).filter((id) => id.length > 0)))
    : [];

  const slot = await prisma.timeSlots.create({
    data: {
      id: data.id,
      dayOfWeek: data.dayOfWeek ?? null,
      startTimeMinutes: data.startTimeMinutes ?? null,
      endTimeMinutes: data.endTimeMinutes ?? null,
      startDate,
      endDate: endDate ?? null,
      repeating: data.repeating ?? false,
      scheduledFieldId: data.scheduledFieldId ?? null,
      price: data.price ?? null,
      requiredTemplateIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(withLegacyFields(slot), { status: 201 });
}
