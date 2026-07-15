/**
 * Copies live organizations tagged Club and their affiliate events into the
 * local database, then upgrades the copied rows to the reusable club-division
 * and first-class Tryout structure.
 *
 * Live is always read-only. The command is a dry run unless --apply is passed.
 *
 * Usage:
 *   npm run affiliate:clubs:sync-live-copy
 *   npm run affiliate:clubs:sync-live-copy -- --apply
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  buildClubStructurePlan,
  isReviewedTryoutEvent,
  type ClubEventSyncRow,
  type LegacyClubDivisionRow,
  type OrganizationDivisionSyncPlan,
} from '../src/server/clubStructureSync';
import { writeLocalFile } from '../src/lib/localStorageProvider';

dotenv.config({ path: '.env.local', override: false, quiet: true });
dotenv.config({ path: '.env', override: false, quiet: true });

type Row = Record<string, any>;
type FileRow = Row & {
  id: string;
  organizationId: string | null;
  originalName: string;
  mimeType: string | null;
  path: string;
};

type OrganizationDuplicate = {
  duplicateId: string;
  targetId: string;
  publicSlug: string;
};

type CandidateDuplicate = {
  duplicateCandidateId: string;
  duplicateEventId: string;
  targetCandidateId: string;
  targetEventId: string;
};

const apply = process.argv.includes('--apply');
const OUTPUT_DIR = path.join(process.cwd(), 'output', 'live-club-local-sync');
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || 'uploads');
const LIVE_BASE_URL = (process.env.LIVE_APP_BASE_URL?.trim() || 'https://bracket-iq.com').replace(/\/+$/, '');
const LOCAL_COPY_DATABASE_NAME = 'mvp_live_clubs';

const REVIEWED_DIVISION_OVERRIDES: Record<string, Array<{
  name: string;
  gender: 'M' | 'F' | 'C';
  ageDivisionTypeId: string;
}>> = {
  // The live candidate predates structured source divisions. The reviewed
  // official registration page lists girls 12U through 18U.
  '5661d1d2-e5ae-4612-bbe8-fa54110e413f': ['u12', 'u13', 'u14', 'u15', 'u16', 'u17', 'u18'].map((age) => ({
    name: age.toUpperCase(),
    gender: 'F' as const,
    ageDivisionTypeId: age,
  })),
};

const requireUrl = (name: 'DATABASE_URL' | 'DATABASE_URL_LIVE'): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
};

const withoutSslMode = (value: string): string => {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
};

const localDatabaseUrl = new URL(withoutSslMode(requireUrl('DATABASE_URL')));
const localDatabaseName = decodeURIComponent(localDatabaseUrl.pathname.replace(/^\//, ''));
if (
  !['localhost', '127.0.0.1', '::1'].includes(localDatabaseUrl.hostname)
  || localDatabaseName !== LOCAL_COPY_DATABASE_NAME
) {
  throw new Error(
    `Club live-copy sync requires the local ${LOCAL_COPY_DATABASE_NAME} database; received ${localDatabaseUrl.hostname}/${localDatabaseName}.`,
  );
}

const localClient = new Client({
  connectionString: localDatabaseUrl.toString(),
  ssl: false,
});

const liveClient = new Client({
  connectionString: withoutSslMode(requireUrl('DATABASE_URL_LIVE')),
  ssl: { rejectUnauthorized: false },
});

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const columnNames = async (client: Client, tableName: string): Promise<string[]> => {
  const result = await client.query<{ columnName: string }>(
    `SELECT column_name AS "columnName"
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  return result.rows.map((row) => row.columnName);
};

const jsonColumnNames = async (client: Client, tableName: string): Promise<Set<string>> => {
  const result = await client.query<{ columnName: string }>(
    `SELECT column_name AS "columnName"
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('json', 'jsonb')`,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.columnName));
};

const loadRowsByIds = async (client: Client, tableName: string, ids: string[]): Promise<Row[]> => {
  if (ids.length === 0) return [];
  return (await client.query(
    `SELECT * FROM ${quoteIdentifier(tableName)} WHERE id = ANY($1::text[])`,
    [ids],
  )).rows;
};

const upsertRowsById = async (
  client: Client,
  tableName: string,
  rows: Row[],
  allowedColumns?: string[],
  jsonColumns: Set<string> = new Set(),
): Promise<void> => {
  if (rows.length === 0) return;
  const localColumns = allowedColumns ?? await columnNames(client, tableName);
  const localColumnSet = new Set(localColumns);
  for (const row of rows) {
    const columns = Object.keys(row).filter((column) => localColumnSet.has(column));
    if (!columns.includes('id')) throw new Error(`${tableName} row is missing id.`);
    const updateColumns = columns.filter((column) => column !== 'id');
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const updateSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
      : 'DO NOTHING';
    await client.query(
      `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT (id) ${updateSql}`,
      columns.map((column) => (
        row[column] !== null && row[column] !== undefined && jsonColumns.has(column)
          ? JSON.stringify(row[column])
          : row[column]
      )),
    );
  }
};

const loadLiveState = async () => {
  const organizations = (await liveClient.query<Row>(
    `SELECT o.*
     FROM "Organizations" o
     WHERE o.id IN (
       SELECT DISTINCT a."organizationId"
       FROM "OrganizationTagAssignments" a
       JOIN "OrganizationTags" t ON t.id = a."tagId"
       WHERE lower(t.slug) = 'club' OR lower(t.name) = 'club'
     )
     ORDER BY o.name, o.id`,
  )).rows;
  const organizationIds = organizations.map((row) => String(row.id));
  const organizationTagAssignments = organizationIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "OrganizationTagAssignments" WHERE "organizationId" = ANY($1::text[])`,
    [organizationIds],
  )).rows;
  const organizationTags = await loadRowsByIds(
    liveClient,
    'OrganizationTags',
    [...new Set(organizationTagAssignments.map((row) => String(row.tagId)))],
  );
  const events = organizationIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "Events" WHERE "organizationId" = ANY($1::text[]) ORDER BY "organizationId", start, id`,
    [organizationIds],
  )).rows;
  const eventIds = events.map((row) => String(row.id));
  const eventTagAssignments = eventIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "EventTagAssignments" WHERE "eventId" = ANY($1::text[])`,
    [eventIds],
  )).rows;
  const eventTags = await loadRowsByIds(
    liveClient,
    'EventTags',
    [...new Set(eventTagAssignments.map((row) => String(row.tagId)))],
  );
  const divisions = eventIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "Divisions" WHERE "eventId" = ANY($1::text[]) ORDER BY "eventId", "sortOrder", id`,
    [eventIds],
  )).rows;
  const candidates = eventIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "AffiliateImportCandidates" WHERE "publishedEventId" = ANY($1::text[])`,
    [eventIds],
  )).rows;
  const candidateSourceIds = candidates.map((row) => String(row.sourceId));
  const sources = organizationIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "AffiliateScrapeSources"
     WHERE "organizationId" = ANY($1::text[]) OR id = ANY($2::text[])
     ORDER BY "sourceKey"`,
    [organizationIds, candidateSourceIds],
  )).rows;
  const sourceIds = sources.map((row) => String(row.id));
  const mappings = sourceIds.length === 0 ? [] : (await liveClient.query<Row>(
    `SELECT * FROM "AffiliateScrapeMappings" WHERE "sourceId" = ANY($1::text[])`,
    [sourceIds],
  )).rows;
  const runIds = [...new Set([
    ...candidates.map((row) => row.runId),
    ...sources.map((row) => row.lastScrapeRunId),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const runs = await loadRowsByIds(liveClient, 'AffiliateScrapeRuns', runIds);
  const fileIds = [...new Set([
    ...organizations.map((row) => row.logoId),
    ...events.map((row) => row.imageId),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const files = await loadRowsByIds(liveClient, 'File', fileIds) as FileRow[];

  return {
    organizations,
    organizationTags,
    organizationTagAssignments,
    events,
    eventTags,
    eventTagAssignments,
    divisions,
    candidates,
    sources,
    mappings,
    runs,
    files,
  };
};

const loadOrganizationReferenceCount = async (organizationId: string): Promise<number> => {
  const tables = (await localClient.query<{ tableName: string }>(
    `SELECT table_name AS "tableName"
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'organizationId'
       AND table_name NOT IN ('Organizations', 'OrganizationTagAssignments', 'File')`,
  )).rows;
  let count = 0;
  for (const { tableName } of tables) {
    const result = await localClient.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${quoteIdentifier(tableName)} WHERE "organizationId" = $1`,
      [organizationId],
    );
    count += result.rows[0]?.count ?? 0;
  }
  return count;
};

const assertNoUniqueIdentityConflicts = async (
  state: Awaited<ReturnType<typeof loadLiveState>>,
): Promise<OrganizationDuplicate[]> => {
  const organizationDuplicates: OrganizationDuplicate[] = [];
  const checks: Array<{ table: string; key: string; rows: Row[] }> = [
    { table: 'Organizations', key: 'publicSlug', rows: state.organizations },
    { table: 'OrganizationTags', key: 'slug', rows: state.organizationTags },
    { table: 'EventTags', key: 'slug', rows: state.eventTags },
    { table: 'AffiliateScrapeSources', key: 'sourceKey', rows: state.sources },
  ];
  for (const check of checks) {
    const keyedRows = check.rows.filter((row) => typeof row[check.key] === 'string' && row[check.key].length > 0);
    if (keyedRows.length === 0) continue;
    const values = keyedRows.map((row) => String(row[check.key]));
    const localRows = (await localClient.query<Row>(
      `SELECT id, ${quoteIdentifier(check.key)} FROM ${quoteIdentifier(check.table)}
       WHERE ${quoteIdentifier(check.key)} = ANY($1::text[])`,
      [values],
    )).rows;
    const expectedIdByValue = new Map(keyedRows.map((row) => [String(row[check.key]), String(row.id)]));
    const conflicts = localRows.filter((row) => expectedIdByValue.get(String(row[check.key])) !== String(row.id));
    if (conflicts.length > 0) {
      if (check.table === 'Organizations' && check.key === 'publicSlug') {
        for (const conflict of conflicts) {
          const duplicateId = String(conflict.id);
          const targetId = expectedIdByValue.get(String(conflict.publicSlug));
          const referenceCount = await loadOrganizationReferenceCount(duplicateId);
          if (!targetId || !duplicateId.startsWith('affiliate_org_') || referenceCount > 0) {
            throw new Error(`${check.table}.${check.key} has a referenced local conflict: ${JSON.stringify({ conflict, referenceCount })}`);
          }
          organizationDuplicates.push({
            duplicateId,
            targetId,
            publicSlug: String(conflict.publicSlug),
          });
        }
        continue;
      }
      throw new Error(`${check.table}.${check.key} conflicts with local ids: ${JSON.stringify(conflicts)}`);
    }
  }
  return organizationDuplicates;
};

const loadCandidateDuplicates = async (candidates: Row[]): Promise<CandidateDuplicate[]> => {
  const duplicates: CandidateDuplicate[] = [];
  for (const candidate of candidates) {
    const result = await localClient.query<Row>(
      `SELECT id, "publishedEventId", "publishedTeamId", "publishedFacilityId", "publishedOrganizationId"
       FROM "AffiliateImportCandidates"
       WHERE "sourceId" = $1 AND "dedupeKey" = $2 AND id <> $3`,
      [candidate.sourceId, candidate.dedupeKey, candidate.id],
    );
    const duplicate = result.rows[0];
    if (!duplicate) continue;
    if (
      !duplicate.publishedEventId
      || duplicate.publishedTeamId
      || duplicate.publishedFacilityId
      || duplicate.publishedOrganizationId
    ) {
      throw new Error(`Candidate identity conflict is not a simple event duplicate: ${JSON.stringify(duplicate)}`);
    }
    duplicates.push({
      duplicateCandidateId: String(duplicate.id),
      duplicateEventId: String(duplicate.publishedEventId),
      targetCandidateId: String(candidate.id),
      targetEventId: String(candidate.publishedEventId),
    });
  }

  const duplicateEventIds = duplicates.map((row) => row.duplicateEventId);
  if (duplicateEventIds.length === 0) return duplicates;
  const duplicateEvents = (await localClient.query<Row>(
    `SELECT id, "sourceType" FROM "Events" WHERE id = ANY($1::text[])`,
    [duplicateEventIds],
  )).rows;
  if (
    duplicateEvents.length !== duplicateEventIds.length
    || duplicateEvents.some((row) => row.sourceType !== 'AFFILIATE_IMPORT')
  ) {
    throw new Error('A duplicate candidate points to a missing or non-affiliate local event.');
  }

  const referenceTables = (await localClient.query<{ tableName: string }>(
    `SELECT table_name AS "tableName"
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'eventId'
       AND table_name NOT IN ('Events', 'Divisions', 'EventTagAssignments')`,
  )).rows;
  for (const { tableName } of referenceTables) {
    const result = await localClient.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${quoteIdentifier(tableName)} WHERE "eventId" = ANY($1::text[])`,
      [duplicateEventIds],
    );
    if ((result.rows[0]?.count ?? 0) > 0) {
      throw new Error(`Duplicate local affiliate events are referenced by ${tableName}; refusing consolidation.`);
    }
  }
  const childEvents = await localClient.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM "Events" WHERE "parentEvent" = ANY($1::text[])`,
    [duplicateEventIds],
  );
  if ((childEvents.rows[0]?.count ?? 0) > 0) {
    throw new Error('Duplicate local affiliate events have child events; refusing consolidation.');
  }
  return duplicates;
};

const buildReviewedOverrides = (events: Row[]): LegacyClubDivisionRow[] => {
  const eventById = new Map(events.map((row) => [String(row.id), row]));
  const rows: LegacyClubDivisionRow[] = [];
  for (const [eventId, divisions] of Object.entries(REVIEWED_DIVISION_OVERRIDES)) {
    const event = eventById.get(eventId);
    if (!event) continue;
    for (const division of divisions) {
      rows.push({
        id: `${eventId}__division__${division.gender.toLowerCase()}_${division.ageDivisionTypeId}`,
        eventId,
        name: division.name,
        key: `${division.gender.toLowerCase()}_${division.ageDivisionTypeId}`,
        sportId: event.sportId ?? 'Indoor Volleyball',
        price: typeof event.price === 'number' ? event.price : null,
        maxParticipants: null,
        divisionTypeId: division.ageDivisionTypeId,
        ratingType: 'AGE',
        gender: division.gender,
      });
    }
  }
  return rows;
};

const buildEventEvidence = (state: Awaited<ReturnType<typeof loadLiveState>>): ClubEventSyncRow[] => {
  const tagSlugById = new Map(state.eventTags.map((row) => [String(row.id), String(row.slug)]));
  const tagSlugsByEventId = new Map<string, string[]>();
  for (const assignment of state.eventTagAssignments) {
    const eventId = String(assignment.eventId);
    const slug = tagSlugById.get(String(assignment.tagId));
    if (!slug) continue;
    tagSlugsByEventId.set(eventId, [...(tagSlugsByEventId.get(eventId) ?? []), slug]);
  }
  return state.events.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    eventType: row.eventType == null ? null : String(row.eventType),
    sourceUrl: row.sourceUrl == null ? null : String(row.sourceUrl),
    affiliateUrl: row.affiliateUrl == null ? null : String(row.affiliateUrl),
    sportId: row.sportId == null ? null : String(row.sportId),
    start: row.start,
    updatedAt: row.updatedAt,
    tagSlugs: tagSlugsByEventId.get(String(row.id)) ?? [],
  }));
};

const localFileIsPresent = async (row: Row | undefined): Promise<boolean> => {
  if (!row || typeof row.path !== 'string' || row.bucket) return false;
  const absolutePath = path.resolve(LOCAL_STORAGE_ROOT, row.path);
  const relative = path.relative(LOCAL_STORAGE_ROOT, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  });
  await Promise.all(runners);
  return results;
};

const materializeFiles = async (files: FileRow[]) => {
  const localRows = await loadRowsByIds(localClient, 'File', files.map((row) => row.id));
  const localById = new Map(localRows.map((row) => [String(row.id), row]));
  const downloadedRows: FileRow[] = [];
  const failures: Array<{ id: string; error: string }> = [];
  let reused = 0;

  await mapWithConcurrency(files, 6, async (file) => {
    const local = localById.get(file.id);
    if (await localFileIsPresent(local)) {
      reused += 1;
      return;
    }
    try {
      const response = await fetch(`${LIVE_BASE_URL}/api/files/${encodeURIComponent(file.id)}`, {
        headers: { 'user-agent': 'BracketIQ live-to-local club sync' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      const stored = await writeLocalFile(data, file.originalName || `${file.id}.bin`, file.organizationId ?? undefined);
      downloadedRows.push({
        ...file,
        bucket: null,
        path: stored.relativePath,
        sizeBytes: data.length,
        mimeType: response.headers.get('content-type') || file.mimeType,
        updatedAt: new Date(),
      });
    } catch (error) {
      failures.push({ id: file.id, error: error instanceof Error ? error.message : String(error) });
    }
  });
  return { downloadedRows, failures, reused };
};

const organizationDivisionRow = (plan: OrganizationDivisionSyncPlan): Row => ({
  id: plan.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  name: plan.name,
  key: plan.key,
  kind: 'LEAGUE',
  eventId: null,
  organizationId: plan.organizationId,
  scope: 'ORGANIZATION',
  status: 'ACTIVE',
  sourceDivisionId: null,
  sportId: plan.sportId,
  price: plan.price,
  maxParticipants: plan.maxParticipants,
  divisionTypeId: plan.divisionTypeId,
  skillDivisionTypeId: plan.skillDivisionTypeId,
  ageDivisionTypeId: plan.ageDivisionTypeId,
  ratingType: plan.ratingType,
  gender: plan.gender,
  description: plan.description,
  registrationUrl: plan.registrationUrl,
  sourceUrl: plan.sourceUrl,
  lastVerifiedAt: plan.lastVerifiedAt,
});

const applyState = async (
  state: Awaited<ReturnType<typeof loadLiveState>>,
  events: ClubEventSyncRow[],
  divisions: LegacyClubDivisionRow[],
  structure: ReturnType<typeof buildClubStructurePlan>,
  downloadedFiles: FileRow[],
  organizationDuplicates: OrganizationDuplicate[],
  candidateDuplicates: CandidateDuplicate[],
) => {
  const organizationIds = state.organizations.map((row) => String(row.id));
  const eventIds = state.events.map((row) => String(row.id));
  const localColumnsByTable = new Map<string, string[]>();
  const localJsonColumnsByTable = new Map<string, Set<string>>();
  for (const table of [
    'File',
    'Organizations',
    'OrganizationTags',
    'OrganizationTagAssignments',
    'AffiliateScrapeSources',
    'AffiliateScrapeMappings',
    'AffiliateScrapeRuns',
    'AffiliateImportCandidates',
    'Events',
    'EventTags',
    'EventTagAssignments',
    'Divisions',
  ]) {
    localColumnsByTable.set(table, await columnNames(localClient, table));
    localJsonColumnsByTable.set(table, await jsonColumnNames(localClient, table));
  }

  await localClient.query('BEGIN');
  try {
    if (candidateDuplicates.length > 0) {
      const duplicateEventIds = candidateDuplicates.map((row) => row.duplicateEventId);
      const duplicateCandidateIds = candidateDuplicates.map((row) => row.duplicateCandidateId);
      await localClient.query(`DELETE FROM "EventTagAssignments" WHERE "eventId" = ANY($1::text[])`, [duplicateEventIds]);
      await localClient.query(`DELETE FROM "Divisions" WHERE "eventId" = ANY($1::text[])`, [duplicateEventIds]);
      await localClient.query(`DELETE FROM "Events" WHERE id = ANY($1::text[])`, [duplicateEventIds]);
      await localClient.query(`DELETE FROM "AffiliateImportCandidates" WHERE id = ANY($1::text[])`, [duplicateCandidateIds]);
    }
    if (organizationDuplicates.length > 0) {
      const duplicateIds = organizationDuplicates.map((row) => row.duplicateId);
      await localClient.query(
        `DELETE FROM "OrganizationTagAssignments" WHERE "organizationId" = ANY($1::text[])`,
        [duplicateIds],
      );
      await localClient.query(
        `DELETE FROM "Organizations" WHERE id = ANY($1::text[])`,
        [duplicateIds],
      );
    }
    await upsertRowsById(localClient, 'File', downloadedFiles, localColumnsByTable.get('File'), localJsonColumnsByTable.get('File'));
    await upsertRowsById(localClient, 'Organizations', state.organizations, localColumnsByTable.get('Organizations'), localJsonColumnsByTable.get('Organizations'));
    await upsertRowsById(localClient, 'OrganizationTags', state.organizationTags, localColumnsByTable.get('OrganizationTags'), localJsonColumnsByTable.get('OrganizationTags'));
    await localClient.query(
      `DELETE FROM "OrganizationTagAssignments" WHERE "organizationId" = ANY($1::text[])`,
      [organizationIds],
    );
    await upsertRowsById(localClient, 'OrganizationTagAssignments', state.organizationTagAssignments, localColumnsByTable.get('OrganizationTagAssignments'), localJsonColumnsByTable.get('OrganizationTagAssignments'));
    await upsertRowsById(localClient, 'AffiliateScrapeSources', state.sources, localColumnsByTable.get('AffiliateScrapeSources'), localJsonColumnsByTable.get('AffiliateScrapeSources'));
    await upsertRowsById(localClient, 'AffiliateScrapeMappings', state.mappings, localColumnsByTable.get('AffiliateScrapeMappings'), localJsonColumnsByTable.get('AffiliateScrapeMappings'));
    await upsertRowsById(localClient, 'AffiliateScrapeRuns', state.runs, localColumnsByTable.get('AffiliateScrapeRuns'), localJsonColumnsByTable.get('AffiliateScrapeRuns'));
    await upsertRowsById(localClient, 'AffiliateImportCandidates', state.candidates, localColumnsByTable.get('AffiliateImportCandidates'), localJsonColumnsByTable.get('AffiliateImportCandidates'));
    await upsertRowsById(localClient, 'Events', state.events, localColumnsByTable.get('Events'), localJsonColumnsByTable.get('Events'));
    await upsertRowsById(localClient, 'EventTags', state.eventTags, localColumnsByTable.get('EventTags'), localJsonColumnsByTable.get('EventTags'));
    await localClient.query(`DELETE FROM "EventTagAssignments" WHERE "eventId" = ANY($1::text[])`, [eventIds]);
    await upsertRowsById(localClient, 'EventTagAssignments', state.eventTagAssignments, localColumnsByTable.get('EventTagAssignments'), localJsonColumnsByTable.get('EventTagAssignments'));

    await localClient.query(
      `DELETE FROM "Divisions" WHERE scope = 'EVENT' AND "eventId" = ANY($1::text[])`,
      [eventIds],
    );
    await upsertRowsById(localClient, 'Divisions', divisions, localColumnsByTable.get('Divisions'), localJsonColumnsByTable.get('Divisions'));

    for (const division of structure.normalizedEventDivisions) {
      await localClient.query(
        `UPDATE "Divisions"
         SET scope = 'EVENT', status = 'ACTIVE', "organizationId" = NULL,
             key = $2, "divisionTypeId" = $3, "skillDivisionTypeId" = $4,
             "ageDivisionTypeId" = $5, "ratingType" = $6, gender = $7,
             "sourceDivisionId" = $8, "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          division.id,
          division.key,
          division.divisionTypeId,
          division.skillDivisionTypeId,
          division.ageDivisionTypeId,
          division.ratingType,
          division.gender,
          structure.sourceDivisionIdByEventDivisionId.get(division.id) ?? null,
        ],
      );
    }

    await localClient.query(
      `DELETE FROM "Divisions"
       WHERE scope = 'ORGANIZATION'
         AND "organizationId" = ANY($1::text[])
         AND id LIKE 'live_club_division_%'`,
      [organizationIds],
    );
    await upsertRowsById(
      localClient,
      'Divisions',
      structure.organizationDivisions.map(organizationDivisionRow),
      localColumnsByTable.get('Divisions'),
      localJsonColumnsByTable.get('Divisions'),
    );
    await localClient.query(
      `UPDATE "Organizations"
       SET "enabledFeatures" = CASE
         WHEN 'CLUB_TEAMS'::"OrganizationFeatureEnum" = ANY("enabledFeatures") THEN "enabledFeatures"
         ELSE array_append("enabledFeatures", 'CLUB_TEAMS'::"OrganizationFeatureEnum")
       END,
       "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = ANY($1::text[])`,
      [organizationIds],
    );
    if (structure.tryoutEventIds.length > 0) {
      await localClient.query(
        `UPDATE "Events" SET "eventType" = 'TRYOUT' WHERE id = ANY($1::text[])`,
        [structure.tryoutEventIds],
      );
    }
    await localClient.query('COMMIT');
  } catch (error) {
    await localClient.query('ROLLBACK');
    throw error;
  }
};

const main = async () => {
  await Promise.all([localClient.connect(), liveClient.connect()]);
  const state = await loadLiveState();
  const organizationDuplicates = await assertNoUniqueIdentityConflicts(state);
  const candidateDuplicates = await loadCandidateDuplicates(state.candidates);
  const events = buildEventEvidence(state);
  const reviewedOverrides = buildReviewedOverrides(state.events);
  const existingDivisionEventIds = new Set(state.divisions.map((row) => String(row.eventId)));
  const applicableOverrides = reviewedOverrides.filter((row) => !existingDivisionEventIds.has(row.eventId));
  const divisions = [
    ...state.divisions.map((row) => ({
      ...row,
      id: String(row.id),
      eventId: String(row.eventId),
      name: String(row.name),
    })) as LegacyClubDivisionRow[],
    ...applicableOverrides,
  ];
  const structure = buildClubStructurePlan(events, divisions);
  const tryoutIds = new Set(structure.tryoutEventIds);
  const falsePositiveTryoutTags = events.filter((event) =>
    !tryoutIds.has(event.id) && (event.tagSlugs ?? []).some((slug) => slug.toLowerCase() === 'tryouts'),
  );
  const unresolvedTryouts = events
    .filter((event) => tryoutIds.has(event.id))
    .filter((event) => !structure.normalizedEventDivisions.some((division) => division.eventId === event.id));
  const report: Row = {
    mode: apply ? 'apply' : 'dry-run',
    liveIsReadOnly: true,
    localDatabaseName,
    localStorageRoot: path.relative(process.cwd(), LOCAL_STORAGE_ROOT) || '.',
    counts: {
      organizations: state.organizations.length,
      organizationTagAssignments: state.organizationTagAssignments.length,
      events: state.events.length,
      eventDivisions: state.divisions.length,
      reviewedDivisionOverrides: applicableOverrides.length,
      sources: state.sources.length,
      mappings: state.mappings.length,
      runs: state.runs.length,
      candidates: state.candidates.length,
      referencedFiles: state.files.length,
      tryoutEvents: structure.tryoutEventIds.length,
      organizationDivisions: structure.organizationDivisions.length,
      organizationDivisionsWithSeasonPrice: structure.organizationDivisions.filter((row) => row.price !== null).length,
      linkedTryoutDivisions: structure.sourceDivisionIdByEventDivisionId.size,
    },
    tryouts: events.filter((event) => tryoutIds.has(event.id)).map((event) => ({
      id: event.id,
      organizationId: event.organizationId,
      name: event.name,
      divisions: structure.normalizedEventDivisions.filter((division) => division.eventId === event.id).length,
    })),
    falsePositiveTryoutTags: falsePositiveTryoutTags.map((event) => ({ id: event.id, name: event.name, eventType: event.eventType })),
    unresolvedTryouts: unresolvedTryouts.map((event) => ({ id: event.id, name: event.name })),
    organizationDuplicates,
    candidateDuplicates: {
      count: candidateDuplicates.length,
      rows: candidateDuplicates,
    },
  };

  if (unresolvedTryouts.length > 0) {
    throw new Error(`Tryout events are missing reviewed divisions: ${JSON.stringify(report.unresolvedTryouts)}`);
  }

  if (apply) {
    const files = await materializeFiles(state.files);
    report.files = {
      downloaded: files.downloadedRows.length,
      reused: files.reused,
      failed: files.failures,
    };
    try {
      await applyState(
        state,
        events,
        divisions,
        structure,
        files.downloadedRows,
        organizationDuplicates,
        candidateDuplicates,
      );
    } catch (error) {
      await Promise.allSettled(files.downloadedRows.map(async (file) => {
        if (!file.path) return;
        await fs.unlink(path.resolve(LOCAL_STORAGE_ROOT, file.path));
      }));
      throw error;
    }
    report.applied = true;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, apply ? 'apply.json' : 'dry-run.json');
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
};

main()
  .catch((error) => {
    console.error('[sync-live-clubs-to-local] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([localClient.end(), liveClient.end()]);
  });
