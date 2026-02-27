import 'dotenv/config';

export type TimeSlotRow = {
  id: string;
  dayOfWeek: number | null;
  daysOfWeek: number[];
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  scheduledFieldId: string | null;
  scheduledFieldIds: string[];
  price: number | null;
  divisions: string[];
  requiredTemplateIds: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type EventSlotRefRow = {
  id: string;
  timeSlotIds: string[];
};

export type FieldSlotRefRow = {
  id: string;
  rentalSlotIds: string[];
};

export type CanonicalSlot = {
  id: string;
  sourceIds: string[];
  dayOfWeek: number | null;
  daysOfWeek: number[];
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  scheduledFieldId: string | null;
  scheduledFieldIds: string[];
  price: number | null;
  divisions: string[];
  requiredTemplateIds: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type RewritePlan = {
  canonicalSlots: CanonicalSlot[];
  oldToCanonical: Map<string, string>;
  eventUpdates: Array<{ id: string; timeSlotIds: string[] }>;
  fieldUpdates: Array<{ id: string; rentalSlotIds: string[] }>;
  staleSlotIds: string[];
  collapsedGroupCount: number;
  conflictBaseIds: string[];
};

type ParsedArgs = {
  apply: boolean;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run');
  if (hasApply && hasDryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }
  return { apply: hasApply };
};

export const normalizeFieldIds = (value: unknown, legacy?: unknown): string[] => {
  const fromList = Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter((entry) => entry.length > 0)
    : [];
  const merged = fromList.length
    ? fromList
    : (typeof legacy === 'string' && legacy.trim().length > 0 ? [legacy.trim()] : []);
  return Array.from(new Set(merged));
};

export const normalizeDaysOfWeek = (value: unknown, legacy?: unknown): number[] => {
  const fromList = Array.isArray(value) ? value : [];
  const source = fromList.length > 0 ? fromList : (legacy !== undefined && legacy !== null ? [legacy] : []);
  return Array.from(
    new Set(
      source
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((a, b) => a - b);
};

export const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const normalizeBaseSlotId = (value: string): string => {
  return value
    .replace(/__d[0-6]__f.+$/, '')
    .replace(/__f.+$/, '')
    .replace(/__d[0-6](?:_\d+)?$/, '');
};

const chooseCanonicalId = (
  baseSlotId: string,
  sourceIds: string[],
  usedIds: Set<string>,
): string => {
  const candidates = [baseSlotId, ...sourceIds];
  for (const candidate of candidates) {
    if (candidate.length > 0 && !usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
  }
  let suffix = 1;
  while (usedIds.has(`${baseSlotId}__canon${suffix}`)) {
    suffix += 1;
  }
  const fallback = `${baseSlotId}__canon${suffix}`;
  usedIds.add(fallback);
  return fallback;
};

export const remapIds = (rawIds: unknown, idMap: Map<string, string>): string[] => {
  const source = Array.isArray(rawIds)
    ? rawIds.map((entry) => String(entry ?? '').trim()).filter((entry) => entry.length > 0)
    : [];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of source) {
    const mapped = idMap.get(id) ?? id;
    if (seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    deduped.push(mapped);
  }
  return deduped;
};

export const buildCanonicalRewritePlan = (
  rows: TimeSlotRow[],
  events: EventSlotRefRow[],
  fields: FieldSlotRefRow[],
): RewritePlan => {
  const groups = new Map<string, TimeSlotRow[]>();
  const baseGroupKeys = new Map<string, Set<string>>();

  for (const row of rows) {
    const baseSlotId = normalizeBaseSlotId(row.id);
    const key = JSON.stringify({
      baseSlotId,
      repeating: Boolean(row.repeating),
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate ? row.endDate.toISOString() : null,
      startTimeMinutes: row.startTimeMinutes ?? null,
      endTimeMinutes: row.endTimeMinutes ?? null,
      price: row.price ?? null,
      requiredTemplateIds: normalizeStringList(row.requiredTemplateIds).sort(),
      divisions: normalizeStringList(row.divisions).sort(),
    });

    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);

    const groupKeySet = baseGroupKeys.get(baseSlotId) ?? new Set<string>();
    groupKeySet.add(key);
    baseGroupKeys.set(baseSlotId, groupKeySet);
  }

  const canonicalSlots: CanonicalSlot[] = [];
  const oldToCanonical = new Map<string, string>();
  const usedCanonicalIds = new Set<string>();

  const sortedEntries = Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  for (const [, groupRows] of sortedEntries) {
    const sourceIds = groupRows.map((row) => row.id).sort();
    const first = groupRows[0];
    if (!first) {
      continue;
    }

    const baseSlotId = normalizeBaseSlotId(first.id);
    const canonicalId = chooseCanonicalId(baseSlotId, sourceIds, usedCanonicalIds);
    const daySet = new Set<number>();
    const fieldSet = new Set<string>();

    groupRows.forEach((row) => {
      normalizeDaysOfWeek(row.daysOfWeek, row.dayOfWeek).forEach((day) => daySet.add(day));
      normalizeFieldIds(row.scheduledFieldIds, row.scheduledFieldId).forEach((fieldId) => fieldSet.add(fieldId));
      oldToCanonical.set(row.id, canonicalId);
    });

    const daysOfWeek = Array.from(daySet).sort((a, b) => a - b);
    const scheduledFieldIds = Array.from(fieldSet);
    const createdAt = groupRows
      .map((row) => normalizeDate(row.createdAt))
      .filter((entry): entry is Date => entry instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const updatedAt = groupRows
      .map((row) => normalizeDate(row.updatedAt))
      .filter((entry): entry is Date => entry instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    canonicalSlots.push({
      id: canonicalId,
      sourceIds,
      dayOfWeek: daysOfWeek[0] ?? null,
      daysOfWeek,
      startDate: first.startDate,
      endDate: first.endDate,
      repeating: Boolean(first.repeating),
      startTimeMinutes: first.startTimeMinutes ?? null,
      endTimeMinutes: first.endTimeMinutes ?? null,
      scheduledFieldId: scheduledFieldIds[0] ?? null,
      scheduledFieldIds,
      price: first.price ?? null,
      divisions: normalizeStringList(first.divisions),
      requiredTemplateIds: normalizeStringList(first.requiredTemplateIds),
      createdAt,
      updatedAt,
    });
  }

  const eventUpdates = events
    .map((event) => {
      const nextIds = remapIds(event.timeSlotIds, oldToCanonical);
      const currentIds = remapIds(event.timeSlotIds, new Map());
      return {
        id: event.id,
        changed: JSON.stringify(nextIds) !== JSON.stringify(currentIds),
        timeSlotIds: nextIds,
      };
    })
    .filter((event) => event.changed)
    .map(({ id, timeSlotIds }) => ({ id, timeSlotIds }));

  const fieldUpdates = fields
    .map((field) => {
      const nextIds = remapIds(field.rentalSlotIds, oldToCanonical);
      const currentIds = remapIds(field.rentalSlotIds, new Map());
      return {
        id: field.id,
        changed: JSON.stringify(nextIds) !== JSON.stringify(currentIds),
        rentalSlotIds: nextIds,
      };
    })
    .filter((field) => field.changed)
    .map(({ id, rentalSlotIds }) => ({ id, rentalSlotIds }));

  const canonicalIdSet = new Set(canonicalSlots.map((slot) => slot.id));
  const staleSlotIds = rows
    .map((row) => row.id)
    .filter((id) => !canonicalIdSet.has(id));
  const collapsedGroupCount = canonicalSlots.filter((slot) => slot.sourceIds.length > 1).length;
  const conflictBaseIds = Array.from(baseGroupKeys.entries())
    .filter(([, keys]) => keys.size > 1)
    .map(([baseSlotId]) => baseSlotId)
    .sort();

  return {
    canonicalSlots,
    oldToCanonical,
    eventUpdates,
    fieldUpdates,
    staleSlotIds,
    collapsedGroupCount,
    conflictBaseIds,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
    import('@prisma/adapter-pg'),
    import('../src/generated/prisma/client'),
  ]);
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const [rows, events, fields] = await Promise.all([
      prisma.timeSlots.findMany({ orderBy: { id: 'asc' } }),
      prisma.events.findMany({ select: { id: true, timeSlotIds: true } }),
      prisma.fields.findMany({ select: { id: true, rentalSlotIds: true } }),
    ]);

    const plan = buildCanonicalRewritePlan(rows as TimeSlotRow[], events as EventSlotRefRow[], fields as FieldSlotRefRow[]);

    console.log(`Mode: ${args.apply ? 'apply' : 'dry-run'}`);
    console.log(`Total rows: ${rows.length}`);
    console.log(`Canonical rows: ${plan.canonicalSlots.length}`);
    console.log(`Collapsed groups: ${plan.collapsedGroupCount}`);
    console.log(`Rows to delete: ${plan.staleSlotIds.length}`);
    console.log(`Events to remap: ${plan.eventUpdates.length}`);
    console.log(`Fields to remap: ${plan.fieldUpdates.length}`);
    console.log(`Conflict base ids: ${plan.conflictBaseIds.length}`);
    if (plan.conflictBaseIds.length > 0) {
      console.log(`Conflict samples: ${plan.conflictBaseIds.slice(0, 20).join(', ')}`);
    }

    if (!args.apply) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const slot of plan.canonicalSlots) {
        const now = new Date();
        await tx.timeSlots.upsert({
          where: { id: slot.id },
          create: {
            id: slot.id,
            dayOfWeek: slot.dayOfWeek,
            daysOfWeek: slot.daysOfWeek,
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: slot.startDate,
            endDate: slot.endDate,
            repeating: slot.repeating,
            scheduledFieldId: slot.scheduledFieldId,
            scheduledFieldIds: slot.scheduledFieldIds,
            price: slot.price,
            requiredTemplateIds: slot.requiredTemplateIds,
            createdAt: slot.createdAt ?? now,
            updatedAt: slot.updatedAt ?? now,
          } as any,
          update: {
            dayOfWeek: slot.dayOfWeek,
            daysOfWeek: slot.daysOfWeek,
            startTimeMinutes: slot.startTimeMinutes,
            endTimeMinutes: slot.endTimeMinutes,
            startDate: slot.startDate,
            endDate: slot.endDate,
            repeating: slot.repeating,
            scheduledFieldId: slot.scheduledFieldId,
            scheduledFieldIds: slot.scheduledFieldIds,
            price: slot.price,
            requiredTemplateIds: slot.requiredTemplateIds,
            updatedAt: slot.updatedAt ?? now,
          } as any,
        });
      }

      for (const event of plan.eventUpdates) {
        await tx.events.update({
          where: { id: event.id },
          data: { timeSlotIds: event.timeSlotIds },
        });
      }

      for (const field of plan.fieldUpdates) {
        await tx.fields.update({
          where: { id: field.id },
          data: { rentalSlotIds: field.rentalSlotIds },
        });
      }

      if (plan.staleSlotIds.length > 0) {
        await tx.timeSlots.deleteMany({
          where: { id: { in: plan.staleSlotIds } },
        });
      }
    });

    console.log('Rewrite applied successfully.');
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to rewrite canonical timeslots:', error);
    process.exit(1);
  });
}
