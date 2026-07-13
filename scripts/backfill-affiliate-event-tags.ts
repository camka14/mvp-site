/**
 * Backfills affiliate event tags and stores tag hints in active manual mappings.
 *
 * Default mode is dry-run against the local DB. Use --live to target DATABASE_URL_LIVE
 * and --apply to write EventTagAssignments, candidate rawPayload.tags, and mapping
 * manualCandidates[].tags.
 */

import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type SyncEventTags = typeof import('../src/server/eventTags').syncEventTags;
type InferAffiliateEventTagNames = typeof import('../src/server/affiliateImports/tags').inferAffiliateEventTagNames;

let prisma: PrismaClientInstance | undefined;
let syncEventTags: SyncEventTags;
let inferAffiliateEventTagNames: InferAffiliateEventTagNames;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ syncEventTags } = await import('../src/server/eventTags'));
  ({ inferAffiliateEventTagNames } = await import('../src/server/affiliateImports/tags'));
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const objectRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const sameTags = (left: string[], right: string[]): boolean => {
  const normalize = (values: string[]) => (
    values.map((value) => value.trim().toLowerCase()).filter(Boolean).sort()
  );
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const candidateTagInput = (candidate: any, event?: any): Record<string, unknown> => {
  const rawPayload = objectRecord(candidate?.rawPayload);
  const extractedFields = objectRecord(rawPayload?.extractedFields) ?? {};
  return {
    ...extractedFields,
    ...(candidate ?? {}),
    title: nullableString(candidate?.title) ?? nullableString(event?.name),
    name: nullableString(event?.name) ?? nullableString(candidate?.title),
    description: nullableString(candidate?.description) ?? nullableString(event?.description),
    formatLabel: nullableString(candidate?.formatLabel),
    scheduleText: nullableString(candidate?.scheduleText) ?? nullableString(event?.scheduleText),
    statusText: nullableString(candidate?.statusText) ?? nullableString(event?.statusText),
    divisionText: nullableString(candidate?.divisionText),
    skillLevel: nullableString(candidate?.skillLevel),
    sportName: nullableString(candidate?.sportName),
    rawPayload: candidate?.rawPayload ?? null,
    listingKind: nullableString(candidate?.listingKind) ?? 'EVENT',
    eventType: nullableString(event?.eventType),
  };
};

const existingTagsForEventIds = async (eventIds: string[]): Promise<Map<string, string[]>> => {
  if (eventIds.length === 0) return new Map();
  const assignments = await (prisma as any).eventTagAssignments.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, tagNameSnapshot: true },
    orderBy: { createdAt: 'asc' },
  });
  const byEventId = new Map<string, string[]>();
  assignments.forEach((assignment: any) => {
    const eventId = nullableString(assignment.eventId);
    const tagName = nullableString(assignment.tagNameSnapshot);
    if (!eventId || !tagName) return;
    byEventId.set(eventId, [...(byEventId.get(eventId) ?? []), tagName]);
  });
  return byEventId;
};

const backfillPublishedAffiliateEvents = async () => {
  const events = await (prisma as any).events.findMany({
    where: {
      sourceType: 'AFFILIATE_IMPORT',
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      eventType: true,
      description: true,
      scheduleText: true,
      statusText: true,
      sourceId: true,
      sourceUrl: true,
      affiliateUrl: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const candidateIds = events
    .map((event: any) => nullableString(event.sourceId))
    .filter((id: string | null): id is string => Boolean(id));
  const candidates = candidateIds.length
    ? await (prisma as any).affiliateImportCandidates.findMany({
        where: { id: { in: candidateIds } },
      })
    : [];
  const candidateById = new Map<string, any>(candidates.map((candidate: any) => [candidate.id, candidate]));
  const existingTagsByEventId = await existingTagsForEventIds(events.map((event: any) => event.id));
  const changed = [];

  for (const event of events) {
    const candidate = nullableString(event.sourceId)
      ? candidateById.get(event.sourceId)
      : null;
    const tagInput = candidateTagInput(candidate, event);
    const tags = inferAffiliateEventTagNames(tagInput, {
      eventType: event.eventType,
      listingKind: 'EVENT',
    });
    const existingTags = existingTagsByEventId.get(event.id) ?? [];
    if (!sameTags(tags, existingTags)) {
      changed.push({
        event,
        tags,
        existingTags,
      });
    }
    if (apply) {
      const syncEventType = event.eventType === 'LEAGUE' || event.eventType === 'TOURNAMENT'
        ? event.eventType
        : undefined;
      await syncEventTags(event.id, tags, prisma, { eventType: syncEventType });
    }
  }

  return {
    total: events.length,
    changed,
  };
};

const backfillCandidateRawPayloadTags = async () => {
  const candidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: { listingKind: 'EVENT' },
    orderBy: { updatedAt: 'desc' },
  });
  const changed = [];

  for (const candidate of candidates) {
    const tags = inferAffiliateEventTagNames(candidateTagInput(candidate), {
      listingKind: 'EVENT',
    });
    const rawPayload = objectRecord(candidate.rawPayload) ?? {};
    const existingTags = Array.isArray(rawPayload.tags)
      ? rawPayload.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    if (!sameTags(tags, existingTags)) {
      changed.push({
        candidate,
        tags,
        existingTags,
      });
    }
    if (apply) {
      const normalizedImport = objectRecord(rawPayload.normalizedImport);
      await (prisma as any).affiliateImportCandidates.update({
        where: { id: candidate.id },
        data: {
          rawPayload: {
            ...rawPayload,
            tags,
            normalizedImport: normalizedImport
              ? { ...normalizedImport, tags }
              : rawPayload.normalizedImport,
          },
        },
      });
    }
  }

  return {
    total: candidates.length,
    changed,
  };
};

const backfillManualMappingTags = async () => {
  const mappings = await (prisma as any).affiliateScrapeMappings.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sourceId: true,
      mapping: true,
    },
  });
  const changed = [];

  for (const row of mappings) {
    const mapping = objectRecord(row.mapping);
    const manualCandidates = Array.isArray(mapping?.manualCandidates)
      ? mapping.manualCandidates
      : [];
    if (!mapping || manualCandidates.length === 0) continue;

    let didChange = false;
    const nextManualCandidates = manualCandidates.map((manualCandidate) => {
      const record = objectRecord(manualCandidate);
      if (!record) return manualCandidate;
      const listingKind = (nullableString(record.listingKind) ?? nullableString(mapping.kind))?.toUpperCase();
      if (listingKind !== 'EVENT') return manualCandidate;
      const tags = inferAffiliateEventTagNames(record, { listingKind: 'EVENT' });
      const existingTags = Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      if (!sameTags(tags, existingTags)) {
        didChange = true;
        return {
          ...record,
          tags,
        };
      }
      return manualCandidate;
    });

    if (!didChange) continue;
    const nextMapping = {
      ...mapping,
      manualCandidates: nextManualCandidates,
    };
    changed.push({
      mapping: row,
      nextMapping,
    });
    if (apply) {
      await (prisma as any).affiliateScrapeMappings.update({
        where: { id: row.id },
        data: { mapping: nextMapping },
      });
    }
  }

  return {
    total: mappings.length,
    changed,
  };
};

const printChangeSample = (
  label: string,
  rows: Array<{ event?: any; candidate?: any; mapping?: any; tags?: string[]; existingTags?: string[] }>,
) => {
  console.log(`\n${label}: ${rows.length} changed`);
  rows.slice(0, 20).forEach((row) => {
    const owner = row.event ?? row.candidate ?? row.mapping;
    console.log(`- ${owner.id}: ${owner.name ?? owner.title ?? owner.sourceId}`);
    if (row.tags) {
      console.log(`  tags: ${row.tags.join(', ') || '(none)'}`);
      console.log(`  existing: ${(row.existingTags ?? []).join(', ') || '(none)'}`);
    }
  });
};

const main = async () => {
  await loadAppModules();
  const eventResult = await backfillPublishedAffiliateEvents();
  const candidateResult = await backfillCandidateRawPayloadTags();
  const mappingResult = await backfillManualMappingTags();

  console.log(`[affiliate-event-tags] mode=${apply ? 'apply' : 'dry-run'} database=${useLive ? 'live' : 'local'}`);
  console.log(`[affiliate-event-tags] events checked=${eventResult.total} changed=${eventResult.changed.length}`);
  console.log(`[affiliate-event-tags] candidates checked=${candidateResult.total} changed=${candidateResult.changed.length}`);
  console.log(`[affiliate-event-tags] active mappings checked=${mappingResult.total} changed=${mappingResult.changed.length}`);
  printChangeSample('Event tag assignments', eventResult.changed);
  printChangeSample('Candidate rawPayload tags', candidateResult.changed);
  printChangeSample('Manual mapping tag hints', mappingResult.changed);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
  }
};

main()
  .catch((error) => {
    console.error('[affiliate-event-tags] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
