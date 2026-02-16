import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, withLegacyFields } from '@/server/legacyFormat';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  slot: z.record(z.string(), z.any()).optional(),
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

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const isMissingTimeSlotDivisionsColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('timeslots')
    && normalized.includes('divisions')
    && normalized.includes('does not exist');
};

const persistTimeSlotDivisions = async (
  slotId: string,
  divisions: string[],
  updatedAt: Date,
): Promise<void> => {
  if (typeof (prisma as any).$executeRaw !== 'function') {
    return;
  }
  try {
    await prisma.$executeRaw`
      UPDATE "TimeSlots"
      SET "divisions" = ${divisions}::TEXT[],
          "updatedAt" = ${updatedAt}
      WHERE "id" = ${slotId}
    `;
  } catch (error) {
    if (isMissingTimeSlotDivisionsColumnError(error)) {
      return;
    }
    throw error;
  }
};

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
  if (payload.scheduledFieldIds !== undefined) {
    const normalized = normalizeFieldIds(payload.scheduledFieldIds);
    payload.scheduledFieldId = normalized[0] ?? null;
    delete payload.scheduledFieldIds;
  }
  let payloadDivisions: string[] | null = null;
  if (payload.divisions !== undefined) {
    payloadDivisions = normalizeDivisionKeys(payload.divisions);
    delete payload.divisions;
  }
  if (payload.dayOfWeek !== undefined || payload.daysOfWeek !== undefined) {
    const normalizedDays = normalizeDaysOfWeek({
      dayOfWeek: typeof payload.dayOfWeek === 'number' ? payload.dayOfWeek : undefined,
      daysOfWeek: Array.isArray(payload.daysOfWeek) ? payload.daysOfWeek : undefined,
    });
    payload.dayOfWeek = normalizedDays[0] ?? null;
  }
  delete payload.daysOfWeek;
  const updatedAt = new Date();

  const updated = await prisma.timeSlots.update({
    where: { id },
    data: { ...payload, updatedAt } as any,
  });
  if (payloadDivisions !== null) {
    await persistTimeSlotDivisions(id, payloadDivisions, updatedAt);
  }
  const normalizedDays = normalizeDaysOfWeek({
    dayOfWeek: updated.dayOfWeek ?? undefined,
    daysOfWeek: (updated as any).daysOfWeek ?? undefined,
  });
  const normalizedDivisions = payloadDivisions ?? normalizeDivisionKeys((updated as any).divisions);
  return NextResponse.json(withLegacyFields({
    ...updated,
    dayOfWeek: normalizedDays[0] ?? updated.dayOfWeek ?? null,
    daysOfWeek: normalizedDays,
    scheduledFieldIds: updated.scheduledFieldId ? [updated.scheduledFieldId] : [],
    divisions: normalizedDivisions,
  } as any), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const { id } = await params;
  await prisma.timeSlots.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
