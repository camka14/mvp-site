import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { loadEventWithRelations } from '../src/server/repositories/events';
import { scheduleEvent } from '../src/server/scheduler/scheduleEvent';
import { Match, SchedulerContext } from '../src/server/scheduler/types';

type ParsedArgs = {
  eventId: string;
  useExistingMatches: boolean;
  sampleSize: number;
  failOnHidden: boolean;
  verbose: boolean;
};

type ParsedMatchError = {
  matchNumber: number;
  cause: string;
  raw: string;
};

type PersistedMatchProjection = {
  id: string;
  matchId: number;
  fieldId: string | null;
  division: string | null;
  start: Date | null;
  end: Date | null;
};

const DEFAULT_SAMPLE_SIZE = 12;

const toIso = (value: Date | null | undefined): string => {
  if (!value || Number.isNaN(value.getTime())) {
    return 'null';
  }
  return value.toISOString();
};

const parseIntegerFlag = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
};

const parseArgs = (argv: string[]): ParsedArgs => {
  let eventId = '';
  let useExistingMatches = false;
  let sampleSize = DEFAULT_SAMPLE_SIZE;
  let failOnHidden = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--event' || token === '-e') {
      eventId = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (token === '--use-existing-matches') {
      useExistingMatches = true;
      continue;
    }
    if (token === '--sample-size') {
      sampleSize = parseIntegerFlag(argv[i + 1], DEFAULT_SAMPLE_SIZE);
      i += 1;
      continue;
    }
    if (token === '--fail-on-hidden') {
      failOnHidden = true;
      continue;
    }
    if (token === '--verbose') {
      verbose = true;
      continue;
    }
    if (!token.startsWith('-') && !eventId) {
      eventId = token;
    }
  }

  if (!eventId) {
    throw new Error(
      'Missing event id. Usage: npm run diagnose:scheduling -- --event <event-id> [--use-existing-matches] [--sample-size <n>] [--fail-on-hidden] [--verbose]',
    );
  }

  return {
    eventId,
    useExistingMatches,
    sampleSize,
    failOnHidden,
    verbose,
  };
};

const parsePerMatchErrors = (errors: string[]): ParsedMatchError[] => {
  const parsed: ParsedMatchError[] = [];
  for (const raw of errors) {
    const match = /^ERROR scheduling event for match (\d+):\s*(.+)$/i.exec(raw.trim());
    if (!match) continue;
    parsed.push({
      matchNumber: Number(match[1]),
      cause: match[2].trim(),
      raw,
    });
  }
  return parsed;
};

const isCapacityOrFieldAvailabilityError = (cause: string): boolean => {
  const normalized = cause.toLowerCase();
  return normalized.includes('not enough time is allotted')
    || normalized.includes('no available time slots')
    || normalized.includes('no fields are available');
};

const summarizeCauses = (errors: ParsedMatchError[]): Array<{ cause: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const error of errors) {
    counts.set(error.cause, (counts.get(error.cause) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count);
};

const printMatchSample = (label: string, matches: Match[], limit: number): void => {
  if (!matches.length) return;
  console.log(`${label} (showing up to ${limit}):`);
  const sampled = [...matches]
    .sort((a, b) => (a.matchId ?? Number.MAX_SAFE_INTEGER) - (b.matchId ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
  for (const match of sampled) {
    console.log(
      `  matchId=${match.matchId ?? 'null'} id=${match.id} division=${match.division?.id ?? 'null'} field=${match.field?.id ?? 'null'} start=${toIso(match.start)} end=${toIso(match.end)}`,
    );
  }
};

const printPersistedMatchSample = (label: string, matches: PersistedMatchProjection[], limit: number): void => {
  if (!matches.length) return;
  console.log(`${label} (showing up to ${limit}):`);
  const sampled = [...matches]
    .sort((a, b) => (a.matchId ?? Number.MAX_SAFE_INTEGER) - (b.matchId ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
  for (const match of sampled) {
    console.log(
      `  matchId=${match.matchId} id=${match.id} division=${match.division ?? 'null'} field=${match.fieldId ?? 'null'} start=${toIso(match.start)} end=${toIso(match.end)}`,
    );
  }
};

const summarizeEventSlotConfig = (event: {
  start: Date;
  end: Date;
  timeSlots?: Array<Record<string, unknown>>;
  noFixedEndDateTime?: boolean;
  matchDurationMinutes?: number | null;
  restTimeMinutes?: number | null;
  usesSets?: boolean | null;
  setDurationMinutes?: number | null;
  setsPerMatch?: number | null;
  winnerSetCount?: number | null;
  loserSetCount?: number | null;
}): void => {
  const slots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  console.log(`Loaded slot summary: slotCount=${slots.length}`);
  for (const slot of slots) {
    const id = typeof slot.id === 'string' ? slot.id : 'unknown';
    const dayOfWeek = typeof slot.dayOfWeek === 'number' ? slot.dayOfWeek : null;
    const daysOfWeek = Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek : [];
    const startTimeMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
    const endTimeMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
    const startDate = slot.startDate instanceof Date ? slot.startDate : null;
    const endDate = slot.endDate instanceof Date ? slot.endDate : null;
    const repeating = slot.repeating !== false;
    const fieldIds = Array.from(
      new Set(
        [
          ...(Array.isArray(slot.scheduledFieldIds) ? slot.scheduledFieldIds : []),
          ...(Array.isArray(slot.fieldIds) ? slot.fieldIds : []),
          typeof slot.scheduledFieldId === 'string' ? slot.scheduledFieldId : null,
          typeof slot.field === 'string'
            ? slot.field
            : (slot.field && typeof slot.field === 'object' && 'id' in slot.field && typeof (slot.field as { id?: unknown }).id === 'string')
              ? (slot.field as { id: string }).id
              : null,
        ]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim()),
      ),
    );
    const divisions = Array.isArray(slot.divisions) ? slot.divisions : [];
    const divisionIds = divisions
      .map((value) => {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object' && 'id' in value && typeof (value as { id?: unknown }).id === 'string') {
          return (value as { id: string }).id;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    console.log(
      `  slot=${id} repeating=${String(repeating)} dow=${dayOfWeek ?? 'null'} dows=${daysOfWeek.join(',') || 'none'} ` +
      `time=${startTimeMinutes ?? 'null'}-${endTimeMinutes ?? 'null'} startDate=${toIso(startDate)} endDate=${toIso(endDate)} ` +
      `fields=${fieldIds.join(',') || 'none'} divisions=${divisionIds.join(',') || 'none'}`,
    );
  }

  const scheduleWindowMinutes = Math.max(0, Math.floor((event.end.getTime() - event.start.getTime()) / 60_000));
  const matchMinutes = event.usesSets && typeof event.setDurationMinutes === 'number' && typeof event.setsPerMatch === 'number'
    ? event.setDurationMinutes * event.setsPerMatch
    : (typeof event.matchDurationMinutes === 'number' ? event.matchDurationMinutes : 0);
  const restMinutes = typeof event.restTimeMinutes === 'number' ? event.restTimeMinutes : 0;
  const estimatedMinutesPerMatch = matchMinutes + Math.max(restMinutes, 0);
  console.log(
    `Loaded timing summary: fixedWindow=${String(event.noFixedEndDateTime === false)} windowMinutes=${scheduleWindowMinutes} ` +
    `estimatedMinutesPerMatch=${estimatedMinutesPerMatch}`,
  );
  console.log(
    `Loaded format summary: usesSets=${String(event.usesSets ?? null)} matchDurationMinutes=${String(event.matchDurationMinutes ?? null)} ` +
    `setDurationMinutes=${String(event.setDurationMinutes ?? null)} setsPerMatch=${String(event.setsPerMatch ?? null)} ` +
    `winnerSetCount=${String(event.winnerSetCount ?? null)} loserSetCount=${String(event.loserSetCount ?? null)} restTimeMinutes=${String(event.restTimeMinutes ?? null)}`,
  );
};

const summarizeFieldOccupancy = (event: {
  start: Date;
  end: Date;
  fields?: Record<string, Record<string, unknown>>;
}): void => {
  const fields = event.fields ?? {};
  const startMs = event.start.getTime();
  const endMs = event.end.getTime();
  const intersectsWindow = (start: Date | null, end: Date | null): boolean => {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return false;
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) return false;
    return end.getTime() > startMs && start.getTime() < endMs;
  };

  console.log(`Loaded field summary: fieldCount=${Object.keys(fields).length}`);
  for (const [fieldId, field] of Object.entries(fields)) {
    const rentalSlots = Array.isArray(field.rentalSlots) ? field.rentalSlots as Array<Record<string, unknown>> : [];
    const events = Array.isArray(field.events) ? field.events as Array<Record<string, unknown>> : [];
    const matches = Array.isArray(field.matches) ? field.matches as Array<Record<string, unknown>> : [];
    const blockingEvents = events.filter((value) => intersectsWindow(
      value.start instanceof Date ? value.start : null,
      value.end instanceof Date ? value.end : null,
    ));
    const blockingMatches = matches.filter((value) => intersectsWindow(
      value.start instanceof Date ? value.start : null,
      value.end instanceof Date ? value.end : null,
    ));
    console.log(
      `  field=${fieldId} rentalSlots=${rentalSlots.length} eventsInWindow=${blockingEvents.length} matchesInWindow=${blockingMatches.length}`,
    );
    for (const eventRow of blockingEvents.slice(0, 5)) {
      console.log(
        `    blocking-event id=${String(eventRow.id ?? 'unknown')} start=${toIso(eventRow.start as Date)} end=${toIso(eventRow.end as Date)}`,
      );
    }
    for (const matchRow of blockingMatches.slice(0, 5)) {
      console.log(
        `    blocking-match id=${String(matchRow.id ?? 'unknown')} start=${toIso(matchRow.start as Date)} end=${toIso(matchRow.end as Date)}`,
      );
    }
  }
};

const extractBlockingRentalSlotIds = (event: {
  fields?: Record<string, Record<string, unknown>>;
}): string[] => {
  const fields = event.fields ?? {};
  const ids = new Set<string>();
  for (const field of Object.values(fields)) {
    const events = Array.isArray(field.events) ? field.events as Array<Record<string, unknown>> : [];
    for (const row of events) {
      const id = typeof row.id === 'string' ? row.id : '';
      const marker = '__field_event_block__rental__';
      if (!id.includes(marker)) continue;
      const afterMarker = id.slice(id.indexOf(marker) + marker.length);
      const parts = afterMarker.split('__');
      const rentalSlotId = parts[0]?.trim();
      if (rentalSlotId) {
        ids.add(rentalSlotId);
      }
    }
  }
  return Array.from(ids);
};

const resolveLatestSlotEnd = (event: { timeSlots?: Array<Record<string, unknown>> }): Date | null => {
  const slots = Array.isArray(event.timeSlots) ? event.timeSlots : [];
  let latest: Date | null = null;

  const consider = (value: unknown): void => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return;
    }
    if (!latest || value.getTime() > latest.getTime()) {
      latest = value;
    }
  };

  for (const slot of slots) {
    consider(slot.endDate);

    const repeating = slot.repeating === true;
    if (repeating) {
      continue;
    }
    const startDate = slot.startDate instanceof Date ? slot.startDate : null;
    const endTimeMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
    if (!startDate || endTimeMinutes === null || !Number.isFinite(endTimeMinutes)) {
      continue;
    }
    const dayStart = new Date(startDate);
    dayStart.setHours(0, 0, 0, 0);
    const derivedEnd = new Date(dayStart.getTime() + endTimeMinutes * 60_000);
    consider(derivedEnd);
  }

  return latest;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const persistedEvent = await prisma.events.findUnique({
    where: { id: args.eventId },
    select: {
      id: true,
      eventType: true,
      start: true,
      end: true,
      noFixedEndDateTime: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!persistedEvent) {
    throw new Error(`Event not found: ${args.eventId}`);
  }

  const persistedMatches: PersistedMatchProjection[] = await prisma.matches.findMany({
    where: { eventId: args.eventId },
    select: {
      id: true,
      matchId: true,
      fieldId: true,
      division: true,
      start: true,
      end: true,
    },
    orderBy: [{ matchId: 'asc' }, { id: 'asc' }],
  });

  const persistedNullFieldMatches = persistedMatches.filter((match) => !match.fieldId);
  const persistedZeroDurationMatches = persistedMatches.filter(
    (match) => match.start instanceof Date
      && match.end instanceof Date
      && match.start.getTime() === match.end.getTime(),
  );

  console.log(`Event: ${persistedEvent.id}`);
  console.log(
    `Persisted event window: ${toIso(persistedEvent.start)} -> ${toIso(persistedEvent.end)} | type=${persistedEvent.eventType} | noFixedEndDateTime=${String(persistedEvent.noFixedEndDateTime)}`,
  );
  console.log(
    `Persisted matches: total=${persistedMatches.length}, fieldId=null=${persistedNullFieldMatches.length}, start=end=${persistedZeroDurationMatches.length}`,
  );

  if (args.verbose) {
    printPersistedMatchSample('Persisted null-field matches', persistedNullFieldMatches, args.sampleSize);
    printPersistedMatchSample('Persisted zero-duration matches', persistedZeroDurationMatches, args.sampleSize);
  }

  const loaded = await loadEventWithRelations(args.eventId);
  summarizeEventSlotConfig(loaded as unknown as {
    start: Date;
    end: Date;
    timeSlots?: Array<Record<string, unknown>>;
    noFixedEndDateTime?: boolean;
    matchDurationMinutes?: number | null;
    restTimeMinutes?: number | null;
    usesSets?: boolean | null;
    setDurationMinutes?: number | null;
    setsPerMatch?: number | null;
    winnerSetCount?: number | null;
    loserSetCount?: number | null;
  });
  summarizeFieldOccupancy(loaded as unknown as {
    start: Date;
    end: Date;
    fields?: Record<string, Record<string, unknown>>;
  });
  const blockingRentalSlotIds = extractBlockingRentalSlotIds(loaded as unknown as {
    fields?: Record<string, Record<string, unknown>>;
  });
  if (blockingRentalSlotIds.length) {
    const blockingSlots = await prisma.timeSlots.findMany({
      where: { id: { in: blockingRentalSlotIds } },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        repeating: true,
        dayOfWeek: true,
        daysOfWeek: true,
        startTimeMinutes: true,
        endTimeMinutes: true,
        scheduledFieldId: true,
        scheduledFieldIds: true,
      },
      orderBy: { id: 'asc' },
    });
    console.log(`Blocking rental slot records: ${blockingSlots.length}`);
    for (const slot of blockingSlots) {
      console.log(
        `  rentalSlot=${slot.id} repeating=${String(slot.repeating)} start=${toIso(slot.startDate)} end=${toIso(slot.endDate)} ` +
        `dow=${String(slot.dayOfWeek)} dows=${Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek.join(',') : 'none'} ` +
        `time=${String(slot.startTimeMinutes)}-${String(slot.endTimeMinutes)} field=${String(slot.scheduledFieldId ?? 'null')}`,
      );
    }

    const [eventsReferencingBlockingSlots, fieldsReferencingBlockingSlots] = await Promise.all([
      prisma.events.findMany({
        where: {
          OR: blockingRentalSlotIds.map((slotId) => ({ timeSlotIds: { has: slotId } })),
        },
        select: { id: true, name: true, start: true, end: true, noFixedEndDateTime: true, timeSlotIds: true },
        orderBy: { id: 'asc' },
      }),
      prisma.fields.findMany({
        where: {
          OR: blockingRentalSlotIds.map((slotId) => ({ rentalSlotIds: { has: slotId } })),
        },
        select: { id: true, fieldNumber: true, rentalSlotIds: true, organizationId: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    console.log(`Events referencing blocking slots: ${eventsReferencingBlockingSlots.length}`);
    for (const eventRow of eventsReferencingBlockingSlots) {
      console.log(
        `  event=${eventRow.id} name=${eventRow.name} start=${toIso(eventRow.start)} end=${toIso(eventRow.end)} noFixedEndDateTime=${String(eventRow.noFixedEndDateTime)}`,
      );
    }
    console.log(`Fields referencing blocking slots: ${fieldsReferencingBlockingSlots.length}`);
    for (const fieldRow of fieldsReferencingBlockingSlots) {
      console.log(
        `  field=${fieldRow.id} fieldNumber=${String(fieldRow.fieldNumber)} organizationId=${String(fieldRow.organizationId ?? 'null')} rentalSlotIds=${(fieldRow.rentalSlotIds ?? []).join(',')}`,
      );
    }
  }
  const loadedExistingMatchCount = Object.keys(loaded.matches).length;
  if (!args.useExistingMatches) {
    loaded.matches = {};
  }

  const replayAdjustments: string[] = [];
  if (
    loaded.noFixedEndDateTime === false
    && loaded.end instanceof Date
    && loaded.start instanceof Date
    && loaded.end.getTime() <= loaded.start.getTime()
  ) {
    const latestSlotEnd = resolveLatestSlotEnd(loaded as unknown as { timeSlots?: Array<Record<string, unknown>> });
    if (latestSlotEnd && latestSlotEnd.getTime() > loaded.start.getTime()) {
      loaded.end = latestSlotEnd;
      replayAdjustments.push(`Adjusted replay end from invalid fixed window to latest slot end: ${toIso(latestSlotEnd)}`);
    } else {
      loaded.noFixedEndDateTime = true;
      replayAdjustments.push('Disabled fixed end for replay because persisted fixed window is invalid and no slot end could be derived.');
    }
  }

  const logs: string[] = [];
  const errors: string[] = [];
  const context: SchedulerContext = {
    log: (message) => {
      logs.push(message);
    },
    error: (message) => {
      errors.push(message);
    },
  };

  console.log(
    `Replay mode: ${args.useExistingMatches ? 'using persisted matches' : 'creation-style (existing matches cleared)'} | loadedMatchCount=${loadedExistingMatchCount}`,
  );
  if (replayAdjustments.length) {
    for (const adjustment of replayAdjustments) {
      console.log(`Replay adjustment: ${adjustment}`);
    }
  }

  let scheduledMatches: Match[] = [];
  let scheduledEventStart = loaded.start;
  let scheduledEventEnd = loaded.end;
  let scheduleFailureMessage: string | null = null;

  try {
    const scheduled = scheduleEvent({ event: loaded }, context);
    scheduledMatches = scheduled.matches;
    scheduledEventStart = scheduled.event.start;
    scheduledEventEnd = scheduled.event.end;
  } catch (error) {
    scheduleFailureMessage = error instanceof Error ? error.message : String(error);
    console.log(`scheduleEvent threw: ${scheduleFailureMessage}`);
    if (errors.length) {
      console.log(`Captured context.error messages before throw: ${errors.length}`);
    }
  }

  const replayNullFieldMatches = scheduledMatches.filter((match) => !match.field?.id);
  const replayZeroDurationMatches = scheduledMatches.filter((match) => match.start.getTime() === match.end.getTime());
  const replayAtEventStartMatches = scheduledMatches.filter(
    (match) => match.start.getTime() === scheduledEventStart.getTime() && match.end.getTime() === scheduledEventStart.getTime(),
  );

  const perMatchErrors = parsePerMatchErrors(errors);
  const swallowedCapacityErrors = perMatchErrors.filter((entry) => isCapacityOrFieldAvailabilityError(entry.cause));
  const causeSummary = summarizeCauses(perMatchErrors);

  console.log(
    `Replay event window: ${toIso(scheduledEventStart)} -> ${toIso(scheduledEventEnd)}`,
  );
  console.log(
    `Replay matches: total=${scheduledMatches.length}, fieldId=null=${replayNullFieldMatches.length}, start=end=${replayZeroDurationMatches.length}, start=end=event.start=${replayAtEventStartMatches.length}`,
  );
  console.log(
    `Context errors: total=${errors.length}, per-match scheduling errors=${perMatchErrors.length}, capacity/field-availability errors=${swallowedCapacityErrors.length}`,
  );

  if (causeSummary.length) {
    console.log('Per-match scheduling error causes:');
    for (const row of causeSummary) {
      console.log(`  ${row.count}x ${row.cause}`);
    }
  }

  if (args.verbose) {
    printMatchSample('Replay null-field matches', replayNullFieldMatches, args.sampleSize);
    printMatchSample('Replay zero-duration matches', replayZeroDurationMatches, args.sampleSize);
    if (errors.length) {
      console.log(`All context.error messages (${errors.length}):`);
      for (const line of errors) {
        console.log(`  ${line}`);
      }
    }
    if (logs.length) {
      console.log(`All context.log messages (${logs.length})`);
    }
  }

  const hiddenConflictLikely = swallowedCapacityErrors.length > 0 && scheduledMatches.length > 0;
  if (hiddenConflictLikely) {
    console.log('Diagnosis: YES - scheduling capacity/field conflicts are occurring and being swallowed per match instead of failing the overall schedule.');
  } else if (perMatchErrors.length > 0) {
    console.log('Diagnosis: POSSIBLE - per-match scheduling errors were swallowed, but not all were recognized as slot/field-capacity conflicts.');
  } else {
    console.log('Diagnosis: NO direct swallowed per-match scheduling conflicts detected in this replay.');
  }

  if (scheduleFailureMessage) {
    process.exitCode = 1;
  }
  if (args.failOnHidden && hiddenConflictLikely) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error('[diagnose-event-scheduling] failed', error);
    if (!process.exitCode) {
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
