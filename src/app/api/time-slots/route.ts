import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startTimeMinutes: z.number().nullable().optional(),
  endTimeMinutes: z.number().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  repeating: z.boolean().optional(),
  scheduledFieldId: z.string().optional(),
  price: z.number().optional(),
  requiredTemplateIds: z.array(z.string()).optional(),
}).passthrough();

const normalizeDaysOfWeek = (input: { dayOfWeek?: number | null; daysOfWeek?: number[] | null }): number[] => {
  const source = Array.isArray(input.daysOfWeek) && input.daysOfWeek.length
    ? input.daysOfWeek
    : typeof input.dayOfWeek === 'number'
      ? [input.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

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

  const normalizedSlots = slots.map((slot) => {
    const normalizedDays = normalizeDaysOfWeek({
      dayOfWeek: slot.dayOfWeek ?? undefined,
      daysOfWeek: (slot as any).daysOfWeek ?? undefined,
    });
    return withLegacyFields({
      ...slot,
      dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek ?? null,
      daysOfWeek: normalizedDays,
    } as any);
  });

  return NextResponse.json({ timeSlots: normalizedSlots }, { status: 200 });
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
  const normalizedDays = normalizeDaysOfWeek({
    dayOfWeek: data.dayOfWeek ?? undefined,
    daysOfWeek: data.daysOfWeek ?? undefined,
  });
  const requiredTemplateIds = Array.isArray(data.requiredTemplateIds)
    ? Array.from(new Set(data.requiredTemplateIds.map((id) => String(id)).filter((id) => id.length > 0)))
    : [];

  const slot = await prisma.timeSlots.create({
    data: {
      id: data.id,
      dayOfWeek: normalizedDays[0] ?? data.dayOfWeek ?? null,
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
    } as any,
  });

  return NextResponse.json(withLegacyFields({
    ...slot,
    dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek ?? null,
    daysOfWeek: normalizedDays,
  } as any), { status: 201 });
}
