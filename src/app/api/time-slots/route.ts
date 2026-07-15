import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import { normalizeRentalTaxHandling } from '@/lib/taxPolicy';
import {
  localDatePartsInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';
import { canManageScheduledFields } from '@/server/timeSlotAccess';

export const dynamic = 'force-dynamic';
const DEFAULT_TIME_SLOT_PAGE_SIZE = 100;
const MAX_TIME_SLOT_PAGE_SIZE = 200;

const isUniqueConstraintError = (error: unknown): boolean => {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: string }).code === 'P2002',
  );
};

const createSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  scheduledFieldIds: z.array(z.string()).optional(),
  divisions: z.array(z.string()).optional(),
  startTimeMinutes: z.number().nullable().optional(),
  endTimeMinutes: z.number().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  timeZone: z.string().optional(),
  repeating: z.boolean().optional(),
  scheduledFieldId: z.string().optional(),
  price: z.number().optional(),
  taxHandling: z.string().optional(),
  requiredTemplateIds: z.array(z.string()).optional(),
  hostRequiredTemplateIds: z.array(z.string()).optional(),
}).passthrough();

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

const normalizePageSize = (value: string | null): number => {
  const parsed = Number(value ?? DEFAULT_TIME_SLOT_PAGE_SIZE);
  if (!Number.isFinite(parsed)) return DEFAULT_TIME_SLOT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TIME_SLOT_PAGE_SIZE);
};

const normalizeOffset = (value: string | null): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
};

const resolvePublicRentalSlotIds = async (
  requestedSlotIds: string[],
  requestedFieldIds: string[],
): Promise<string[]> => {
  const fields = await prisma.fields.findMany({
    where: {
      archivedAt: null,
      ...(requestedFieldIds.length ? { id: { in: requestedFieldIds } } : {}),
      ...(requestedSlotIds.length ? { rentalSlotIds: { hasSome: requestedSlotIds } } : {}),
    },
    select: {
      organizationId: true,
      rentalSlotIds: true,
    },
  });
  const organizationIds = Array.from(new Set(
    fields
      .map((field) => field.organizationId)
      .filter((organizationId): organizationId is string => typeof organizationId === 'string' && organizationId.length > 0),
  ));
  if (!organizationIds.length) return [];

  const publicOrganizations = await prisma.organizations.findMany({
    where: {
      id: { in: organizationIds },
      status: 'LISTED',
    },
    select: { id: true },
  });
  const publicOrganizationIds = new Set(publicOrganizations.map((organization) => organization.id));
  const rentalSlotIds = Array.from(new Set(
    fields
      .filter((field) => field.organizationId && publicOrganizationIds.has(field.organizationId))
      .flatMap((field) => normalizeFieldIds(field.rentalSlotIds)),
  ));
  if (!requestedSlotIds.length) return rentalSlotIds;
  const requested = new Set(requestedSlotIds);
  return rentalSlotIds.filter((slotId) => requested.has(slotId));
};

const toPublicRentalSlot = (slot: Record<string, any>) => withLegacyFields({
  id: slot.id ?? slot.$id,
  createdAt: slot.createdAt ?? null,
  updatedAt: slot.updatedAt ?? null,
  dayOfWeek: slot.dayOfWeek ?? null,
  daysOfWeek: Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek : [],
  startTimeMinutes: slot.startTimeMinutes ?? null,
  endTimeMinutes: slot.endTimeMinutes ?? null,
  startDate: slot.startDate ?? null,
  endDate: slot.endDate ?? null,
  timeZone: slot.timeZone ?? 'UTC',
  repeating: slot.repeating === true,
  price: slot.price ?? null,
});

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
  explicitTimeZone?: string,
): Promise<string> => {
  if (!scheduledFieldIds.length) {
    return resolveTimeZone(explicitTimeZone);
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
    resolveTimeZoneFromFieldOrOrganization(primaryField as any, organization as any),
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

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const idsParam = params.get('ids');
  const fieldId = params.get('fieldId')?.trim();
  const fieldIdsParam = params.get('fieldIds');
  const rentalOnlyParam = params.get('rentalOnly');
  const dayOfWeek = params.get('dayOfWeek');
  const limit = normalizePageSize(params.get('limit'));
  const offset = normalizeOffset(params.get('offset'));

  const ids = idsParam ? idsParam.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
  const rentalOnly = rentalOnlyParam === '1' || rentalOnlyParam === 'true';
  const normalizedFieldIds = Array.from(
    new Set(
      [
        ...(fieldId ? [fieldId] : []),
        ...(fieldIdsParam ? fieldIdsParam.split(',').map((id) => id.trim()).filter(Boolean) : []),
      ],
    ),
  );
  const hasReadScope = Boolean(ids?.length || normalizedFieldIds.length);
  if (!hasReadScope) {
    return NextResponse.json(
      { error: 'Time-slot reads require an id or field scope.' },
      { status: 400 },
    );
  }

  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    session = await requireSession(req);
  } catch (error) {
    if (!(error instanceof Response)) throw error;
  }
  if (!session && !rentalOnly) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const whereClauses: any[] = [];
  if (ids?.length) whereClauses.push({ id: { in: ids } });
  if (normalizedFieldIds.length) {
    whereClauses.push({
      OR: [
        { scheduledFieldId: { in: normalizedFieldIds } },
        { scheduledFieldIds: { hasSome: normalizedFieldIds } },
      ],
    });
  }
  if (!session) {
    const publicRentalSlotIds = await resolvePublicRentalSlotIds(ids ?? [], normalizedFieldIds);
    if (!publicRentalSlotIds.length) {
      return NextResponse.json({
        timeSlots: [],
        pagination: { limit, offset, nextOffset: offset, hasMore: false },
      }, { status: 200 });
    }
    whereClauses.push({ id: { in: publicRentalSlotIds } });
  } else if (rentalOnly && normalizedFieldIds.length) {
    const fields = await prisma.fields.findMany({
      where: { id: { in: normalizedFieldIds } },
      select: { rentalSlotIds: true },
    });
    const rentalSlotIds = Array.from(
      new Set(
        fields.flatMap((field) =>
          Array.isArray(field.rentalSlotIds)
            ? field.rentalSlotIds.map((value: unknown) => String(value).trim()).filter(Boolean)
            : [],
        ),
      ),
    );
    if (!rentalSlotIds.length) {
      return NextResponse.json({ timeSlots: [] }, { status: 200 });
    }
    whereClauses.push({ id: { in: rentalSlotIds } });
  }
  if (dayOfWeek !== null && dayOfWeek !== undefined) {
    const day = Number(dayOfWeek);
    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      whereClauses.push({
        OR: [
          { dayOfWeek: day },
          { daysOfWeek: { has: day } },
        ],
      });
    }
  }

  const slots = await prisma.timeSlots.findMany({
    where: { AND: [{ archivedAt: null }, ...whereClauses] },
    orderBy: { startDate: 'asc' },
    take: limit + 1,
    skip: offset,
  });

  const pageRows = slots.slice(0, limit);
  const normalizedSlots = pageRows.map((slot) => {
    const normalizedFieldIds = normalizeFieldIds(
      (slot as any).scheduledFieldIds
        ?? (slot.scheduledFieldId ? [slot.scheduledFieldId] : []),
    );
    const normalizedDays = normalizeDaysOfWeek({
      dayOfWeek: slot.dayOfWeek ?? undefined,
      daysOfWeek: (slot as any).daysOfWeek ?? undefined,
    });
    const normalizedDivisions = normalizeDivisionKeys((slot as any).divisions);
    const normalizedRequiredTemplateIds = normalizeTemplateIds((slot as any).requiredTemplateIds);
    const normalizedHostRequiredTemplateIds = normalizeTemplateIds((slot as any).hostRequiredTemplateIds);
    return withLegacyFields({
      ...slot,
      dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek ?? null,
      daysOfWeek: normalizedDays,
      scheduledFieldId: normalizedFieldIds[0] ?? null,
      scheduledFieldIds: normalizedFieldIds,
      divisions: normalizedDivisions,
      requiredTemplateIds: normalizedRequiredTemplateIds,
      hostRequiredTemplateIds: normalizedHostRequiredTemplateIds,
    } as any);
  });

  return NextResponse.json({
    timeSlots: session ? normalizedSlots : normalizedSlots.map(toPublicRentalSlot),
    pagination: {
      limit,
      offset,
      nextOffset: offset + pageRows.length,
      hasMore: slots.length > limit,
    },
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const repeating = data.repeating ?? false;
  const normalizedDays = normalizeDaysOfWeek({
    dayOfWeek: data.dayOfWeek ?? undefined,
    daysOfWeek: data.daysOfWeek ?? undefined,
  });
  const requiredTemplateIds = normalizeTemplateIds(data.requiredTemplateIds);
  const hostRequiredTemplateIds = normalizeTemplateIds(data.hostRequiredTemplateIds);
  const scheduledFieldIds = normalizeFieldIds([
    ...(Array.isArray(data.scheduledFieldIds) ? data.scheduledFieldIds : []),
    ...(typeof data.scheduledFieldId === 'string' ? [data.scheduledFieldId] : []),
  ]);
  const scheduledFieldId = scheduledFieldIds[0] ?? data.scheduledFieldId ?? null;
  if (!scheduledFieldIds.length) {
    return NextResponse.json({ error: 'Time slots require at least one scheduled field.' }, { status: 400 });
  }
  if (!(await canManageScheduledFields(session, scheduledFieldIds))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const slotTimeZone = await resolveSlotTimeZone(scheduledFieldIds, data.timeZone);
  const startDate = parseDateInputInTimeZone(data.startDate, slotTimeZone) ?? new Date();
  const endDate = data.endDate === null ? null : parseDateInputInTimeZone(data.endDate, slotTimeZone);
  const normalizedEndDate = normalizeRepeatingEndDate(startDate, endDate, repeating, slotTimeZone);
  const divisions = normalizeDivisionKeys(data.divisions);
  const now = new Date();

  try {
    const slot = await prisma.timeSlots.create({
      data: {
        id: data.id,
        dayOfWeek: normalizedDays[0] ?? data.dayOfWeek ?? null,
        daysOfWeek: normalizedDays,
        startTimeMinutes: data.startTimeMinutes ?? null,
        endTimeMinutes: data.endTimeMinutes ?? null,
        startDate,
        timeZone: slotTimeZone,
        endDate: normalizedEndDate,
        repeating,
        scheduledFieldId,
        scheduledFieldIds,
        price: data.price ?? null,
        taxHandling: normalizeRentalTaxHandling(data.taxHandling),
        requiredTemplateIds,
        hostRequiredTemplateIds,
        createdAt: now,
        updatedAt: now,
      } as any,
    });
    await persistTimeSlotDivisions(data.id, divisions, now);

    return NextResponse.json(withLegacyFields({
      ...slot,
      dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek ?? null,
      daysOfWeek: normalizedDays,
      timeZone: slotTimeZone,
      scheduledFieldId: scheduledFieldIds[0] ?? slot.scheduledFieldId ?? null,
      scheduledFieldIds,
      divisions,
      requiredTemplateIds,
      hostRequiredTemplateIds,
    } as any), { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          error: 'Time slot already exists. A previous create attempt likely succeeded; check whether the event/documents were already created.',
          code: 'TIME_SLOT_ALREADY_EXISTS',
          timeSlotId: data.id,
        },
        { status: 409 },
      );
    }
    console.error('Create time slot failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
