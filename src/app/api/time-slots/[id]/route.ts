import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { parseDateInput, stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';

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

const toDateOnlyValue = (value: Date): number => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const normalizeRepeatingEndDate = (
  startDate: Date,
  endDate: Date | null,
  repeating: boolean,
): Date | null => {
  if (!repeating) {
    return endDate;
  }
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return toDateOnlyValue(endDate) > toDateOnlyValue(startDate) ? endDate : null;
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
  const existingSlot = await prisma.timeSlots.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      repeating: true,
    },
  });
  if (!existingSlot) {
    return NextResponse.json({ error: 'Time slot not found' }, { status: 404 });
  }

  const payload = stripLegacyFieldsDeep(parsed.data.slot ?? parsed.data ?? {}) as Record<string, unknown>;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
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
  if (payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined) {
    const normalized = normalizeFieldIds([
      ...(Array.isArray(payload.scheduledFieldIds) ? payload.scheduledFieldIds : []),
      ...(typeof payload.scheduledFieldId === 'string' ? [payload.scheduledFieldId] : []),
    ]);
    payload.scheduledFieldIds = normalized;
    payload.scheduledFieldId = normalized[0] ?? null;
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
    payload.daysOfWeek = normalizedDays;
    payload.dayOfWeek = normalizedDays[0] ?? null;
  }

  const effectiveRepeating = typeof payload.repeating === 'boolean'
    ? payload.repeating
    : existingSlot.repeating;
  const effectiveStartDate = payload.startDate instanceof Date && !Number.isNaN(payload.startDate.getTime())
    ? payload.startDate
    : existingSlot.startDate;
  const currentEndDate = existingSlot.endDate instanceof Date && !Number.isNaN(existingSlot.endDate.getTime())
    ? existingSlot.endDate
    : null;
  const requestedEndDate = payload.endDate instanceof Date && !Number.isNaN(payload.endDate.getTime())
    ? payload.endDate
    : null;
  const endDateCandidate = Object.prototype.hasOwnProperty.call(payload, 'endDate')
    ? requestedEndDate
    : currentEndDate;
  if (effectiveRepeating) {
    payload.endDate = normalizeRepeatingEndDate(
      effectiveStartDate,
      endDateCandidate,
      true,
    );
  }

  const updatedAt = new Date();
  const updateData: Record<string, unknown> = { updatedAt };
  const updatableKeys = [
    'dayOfWeek',
    'daysOfWeek',
    'repeating',
    'scheduledFieldId',
    'scheduledFieldIds',
    'startTimeMinutes',
    'endTimeMinutes',
    'startDate',
    'endDate',
    'price',
    'requiredTemplateIds',
  ] as const;
  for (const key of updatableKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updateData[key] = payload[key];
    }
  }

  const updated = await prisma.timeSlots.update({
    where: { id },
    data: updateData as any,
  });
  if (payloadDivisions !== null) {
    await persistTimeSlotDivisions(id, payloadDivisions, updatedAt);
  }
  const normalizedDays = normalizeDaysOfWeek({
    dayOfWeek: updated.dayOfWeek ?? undefined,
    daysOfWeek: (updated as any).daysOfWeek ?? undefined,
  });
  const normalizedFieldIds = normalizeFieldIds(
    (updated as any).scheduledFieldIds
      ?? (updated.scheduledFieldId ? [updated.scheduledFieldId] : []),
  );
  const normalizedDivisions = payloadDivisions ?? normalizeDivisionKeys((updated as any).divisions);
  return NextResponse.json(withLegacyFields({
    ...updated,
    dayOfWeek: normalizedDays[0] ?? updated.dayOfWeek ?? null,
    daysOfWeek: normalizedDays,
    scheduledFieldId: normalizedFieldIds[0] ?? null,
    scheduledFieldIds: normalizedFieldIds,
    divisions: normalizedDivisions,
  } as any), { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession(req);
  const { id } = await params;
  await prisma.timeSlots.delete({ where: { id } });
  return NextResponse.json({ deleted: true }, { status: 200 });
}
