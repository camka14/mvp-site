import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { stripLegacyFieldsDeep, withLegacyFields } from '@/server/legacyFormat';
import { findPresentKeys, findUnknownKeys, parseStrictEnvelope } from '@/server/http/strictPatch';
import { normalizeRentalTaxHandling } from '@/lib/taxPolicy';
import {
  localDatePartsInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';
import { deleteOrArchiveTimeSlot, toDeleteOrArchiveResponse } from '@/server/deletion/archivePolicy';

export const dynamic = 'force-dynamic';

const TIME_SLOT_MUTABLE_FIELDS = new Set<string>([
  'dayOfWeek',
  'daysOfWeek',
  'repeating',
  'scheduledFieldId',
  'scheduledFieldIds',
  'startTimeMinutes',
  'endTimeMinutes',
  'startDate',
  'endDate',
  'timeZone',
  'price',
  'taxHandling',
  'requiredTemplateIds',
  'hostRequiredTemplateIds',
  'divisions',
]);
const TIME_SLOT_IMMUTABLE_FIELDS = new Set<string>([
  'id',
  '$id',
  'createdAt',
  '$createdAt',
  'updatedAt',
  '$updatedAt',
]);

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

const toDateOnlyValue = (value: Date, timeZone: string): number => {
  const parts = localDatePartsInTimeZone(value, timeZone);
  if (!parts) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
};

const normalizeRepeatingEndDate = (
  startDate: Date,
  endDate: Date | null,
  repeating: boolean,
  timeZone: string,
): Date | null => {
  if (!repeating) {
    return endDate;
  }
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return toDateOnlyValue(endDate, timeZone) > toDateOnlyValue(startDate, timeZone) ? endDate : null;
};

const resolveSlotTimeZone = async (
  scheduledFieldIds: string[],
  explicitTimeZone?: unknown,
  fallbackTimeZone?: unknown,
): Promise<string> => {
  if (!scheduledFieldIds.length) {
    return resolveTimeZone(explicitTimeZone, resolveTimeZone(fallbackTimeZone));
  }

  const fields = await prisma.fields.findMany({
    where: { id: { in: scheduledFieldIds } },
    select: { id: true, lat: true, long: true, organizationId: true },
  });
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const primaryField = scheduledFieldIds.map((id) => fieldById.get(id)).find(Boolean) ?? fields[0] ?? null;
  const organization = primaryField?.organizationId
    ? await prisma.organizations.findUnique({
      where: { id: primaryField.organizationId },
      select: { coordinates: true },
    })
    : null;

  return resolveTimeZone(
    explicitTimeZone,
    resolveTimeZoneFromFieldOrOrganization(
      primaryField as any,
      organization as any,
      resolveTimeZone(fallbackTimeZone),
    ),
  );
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

const normalizeTemplateIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0),
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
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = parseStrictEnvelope({
    body,
    envelopeKey: 'slot',
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const { id } = await params;
  const existingSlot = await prisma.timeSlots.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      timeZone: true,
      repeating: true,
      scheduledFieldId: true,
      scheduledFieldIds: true,
    },
  });
  if (!existingSlot) {
    return NextResponse.json({ error: 'Time slot not found' }, { status: 404 });
  }

  const payload = stripLegacyFieldsDeep(parsed.payload) as Record<string, unknown>;
  const unknownPayloadKeys = findUnknownKeys(payload, [
    ...TIME_SLOT_MUTABLE_FIELDS,
    ...TIME_SLOT_IMMUTABLE_FIELDS,
  ]);
  if (unknownPayloadKeys.length) {
    return NextResponse.json(
      { error: 'Unknown time slot patch fields.', unknownKeys: unknownPayloadKeys },
      { status: 400 },
    );
  }
  const immutableKeys = findPresentKeys(payload, TIME_SLOT_IMMUTABLE_FIELDS);
  if (immutableKeys.length && !session.isAdmin) {
    return NextResponse.json(
      { error: 'Immutable time slot fields cannot be updated.', fields: immutableKeys },
      { status: 403 },
    );
  }
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  if (payload.requiredTemplateIds !== undefined) {
    payload.requiredTemplateIds = normalizeTemplateIds(payload.requiredTemplateIds);
  }
  if (payload.hostRequiredTemplateIds !== undefined) {
    payload.hostRequiredTemplateIds = normalizeTemplateIds(payload.hostRequiredTemplateIds);
  }
  if (payload.taxHandling !== undefined) {
    payload.taxHandling = normalizeRentalTaxHandling(payload.taxHandling);
  }
  if (payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined) {
    const normalized = normalizeFieldIds([
      ...(Array.isArray(payload.scheduledFieldIds) ? payload.scheduledFieldIds : []),
      ...(typeof payload.scheduledFieldId === 'string' ? [payload.scheduledFieldId] : []),
    ]);
    payload.scheduledFieldIds = normalized;
    payload.scheduledFieldId = normalized[0] ?? null;
  }
  const effectiveScheduledFieldIds = normalizeFieldIds(
    payload.scheduledFieldIds !== undefined
      ? payload.scheduledFieldIds
      : ((existingSlot as any).scheduledFieldIds ?? ((existingSlot as any).scheduledFieldId ? [(existingSlot as any).scheduledFieldId] : [])),
  );
  const effectiveTimeZone = await resolveSlotTimeZone(
    effectiveScheduledFieldIds,
    payload.timeZone,
    (existingSlot as any).timeZone,
  );
  if (payload.timeZone !== undefined || payload.scheduledFieldIds !== undefined || payload.scheduledFieldId !== undefined) {
    payload.timeZone = effectiveTimeZone;
  }
  if (payload.startDate) {
    const parsedDate = parseDateInputInTimeZone(payload.startDate, effectiveTimeZone);
    if (parsedDate) payload.startDate = parsedDate;
  }
  if (payload.endDate !== undefined) {
    if (payload.endDate === null) {
      payload.endDate = null;
    } else {
      const parsedDate = parseDateInputInTimeZone(payload.endDate, effectiveTimeZone);
      if (parsedDate) payload.endDate = parsedDate;
    }
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
      effectiveTimeZone,
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
    'timeZone',
    'price',
    'taxHandling',
    'requiredTemplateIds',
    'hostRequiredTemplateIds',
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
  const session = await requireSession(req);
  const { id } = await params;
  const existing = await prisma.timeSlots.findUnique({
    where: { id },
    select: { id: true, archivedAt: true, archivedByUserId: true, archiveReason: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await deleteOrArchiveTimeSlot({
    client: prisma,
    entity: existing,
    actorUserId: session.userId,
    reason: 'delete_requested',
  });
  return NextResponse.json(toDeleteOrArchiveResponse(result), { status: 200 });
}
