import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { createEventTemplateFromSourceEvent } from '../src/server/eventTemplates';
import { loadEventWithRelations } from '../src/server/repositories/events';
import type { Event } from '../src/types';

type ParsedArgs = {
  apply: boolean;
  limit?: number;
};

type LegacyTemplateRow = {
  id: string;
  name: string | null;
  hostId: string | null;
  organizationId: string | null;
};

type ExistingTemplateRow = {
  id: string;
  archivedAt?: Date | null;
};

export type BackfillEventTemplateRecordsResult = {
  scanned: number;
  created: Array<{ sourceEventId: string; templateId: string }>;
  skippedExisting: Array<{ sourceEventId: string; templateId: string }>;
};

type BackfillEventTemplateRecordsOptions = {
  apply?: boolean;
  limit?: number;
};

type BackfillEventTemplateRecordsDeps = {
  client: any;
  loadEvent: (eventId: string, client: any) => Promise<Event>;
  createTemplate: (
    source: Event,
    params: { createdByUserId: string },
    client: any,
  ) => Promise<{ template?: { id?: string } } | null>;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run');
  if (hasApply && hasDryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }

  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive number.');
  }

  return {
    apply: hasApply,
    limit: limit === undefined ? undefined : Math.trunc(limit),
  };
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const defaultCreatedByUserId = (row: LegacyTemplateRow): string =>
  normalizeId(row.hostId) ?? 'legacy-template-backfill';

export const backfillEventTemplateRecords = async (
  options: BackfillEventTemplateRecordsOptions,
  deps: BackfillEventTemplateRecordsDeps,
): Promise<BackfillEventTemplateRecordsResult> => {
  const { client } = deps;
  if (!client?.events?.findMany || !client?.eventTemplates?.findFirst) {
    throw new Error('Event template backfill requires regenerated Prisma delegates.');
  }

  const legacyTemplates: LegacyTemplateRow[] = await client.events.findMany({
    where: { state: 'TEMPLATE' },
    select: {
      id: true,
      name: true,
      hostId: true,
      organizationId: true,
    },
    orderBy: [
      { updatedAt: 'asc' },
      { id: 'asc' },
    ],
    ...(options.limit ? { take: options.limit } : {}),
  });

  const result: BackfillEventTemplateRecordsResult = {
    scanned: legacyTemplates.length,
    created: [],
    skippedExisting: [],
  };

  for (const row of legacyTemplates) {
    const existing: ExistingTemplateRow | null = await client.eventTemplates.findFirst({
      where: { sourceEventId: row.id },
      select: { id: true, archivedAt: true },
    });
    if (existing) {
      result.skippedExisting.push({ sourceEventId: row.id, templateId: existing.id });
      continue;
    }

    if (!options.apply) {
      continue;
    }

    const sourceEvent = await deps.loadEvent(row.id, client);
    const bundle = await deps.createTemplate(
      sourceEvent,
      { createdByUserId: defaultCreatedByUserId(row) },
      client,
    );
    const templateId = normalizeId(bundle?.template?.id);
    if (!templateId) {
      throw new Error(`Backfill did not return a template id for source event ${row.id}.`);
    }
    result.created.push({ sourceEventId: row.id, templateId });
  }

  return result;
};

const printResult = (result: BackfillEventTemplateRecordsResult, apply: boolean): void => {
  console.log(`Legacy template events scanned: ${result.scanned}`);
  console.log(`Existing dedicated templates skipped: ${result.skippedExisting.length}`);
  console.log(`Dedicated templates created: ${result.created.length}`);
  if (!apply) {
    console.log('Dry run. Re-run with --apply to persist missing dedicated templates.');
  }
  result.created.slice(0, 20).forEach((row) => {
    console.log(`created ${row.templateId} from ${row.sourceEventId}`);
  });
  result.skippedExisting.slice(0, 20).forEach((row) => {
    console.log(`skipped ${row.sourceEventId}; existing template ${row.templateId}`);
  });
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await backfillEventTemplateRecords(
    {
      apply: args.apply,
      limit: args.limit,
    },
    {
      client: prisma,
      loadEvent: async (eventId, client) => (
        await loadEventWithRelations(eventId, client, {
          includeTeamPlayers: false,
          includeTeamRegistrations: false,
        })
      ) as unknown as Event,
      createTemplate: createEventTemplateFromSourceEvent,
    },
  );
  printResult(result, args.apply);
}

if (process.argv[1]?.endsWith('backfill-event-template-records.ts')) {
  main()
    .catch((error) => {
      console.error('[backfill-event-template-records] failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
