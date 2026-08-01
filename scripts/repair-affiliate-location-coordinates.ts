/**
 * Audits and repairs missing affiliate event and organization coordinates.
 *
 * The command is dry-run by default. Use --apply to persist only successfully
 * resolved coordinate pairs. On the OVH app container, omit --live because its
 * normal DATABASE_URL already points at production. --live remains available
 * for an operator machine that has DATABASE_URL_LIVE configured.
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  resolveAddressToPlace,
  type GeocodeCoordinates,
  type GooglePlaceResolution,
} from '../src/server/geocoding';
import {
  buildAffiliateEventLocationQueries,
  buildAffiliatePlaceLocationQueries,
  normalizeAffiliateCoordinates,
} from '../src/server/affiliateImports/locationResolution';
import { parseVenueAddressFromLocationText } from '../src/server/affiliateImports/mappingExtractor';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type RepairScope = 'all' | 'events' | 'organizations';

type MissingEventRow = {
  kind: 'EVENT';
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  coordinates: unknown;
  candidateId: string | null;
  sourceKey: string | null;
  candidateVenue: string | null;
  candidateAddress: string | null;
  candidateCity: string | null;
};

type MissingOrganizationRow = {
  kind: 'ORGANIZATION';
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  coordinates: unknown;
  originType: string | null;
  sourceKeys: string | null;
};

type MissingLocationRow = MissingEventRow | MissingOrganizationRow;

type RepairPlan = {
  row: MissingLocationRow;
  queries: string[];
  successfulQuery: string | null;
  coordinates: GeocodeCoordinates | null;
  resolution: GooglePlaceResolution | null;
  reason: string | null;
};

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const argValue = (name: string): string | null => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  const value = raw?.slice(prefix.length).trim() ?? '';
  return value.length ? value : null;
};

const useLive = hasFlag('--live');
const apply = hasFlag('--apply');
const scopeValue = argValue('scope')?.toLowerCase() ?? 'all';
if (!['all', 'events', 'organizations'].includes(scopeValue)) {
  throw new Error('--scope must be all, events, or organizations.');
}
const scope = scopeValue as RepairScope;
const search = argValue('search')?.toLowerCase() ?? null;
const region = argValue('region')?.toLowerCase() ?? null;
if (region && region !== 'new-york') {
  throw new Error('The only named region currently supported is --region=new-york. Use --search for another filter.');
}
const limitValue = Number(argValue('limit') ?? '0');
if (!Number.isInteger(limitValue) || limitValue < 0) {
  throw new Error('--limit must be a non-negative integer.');
}

const databaseUrl = useLive ? process.env.DATABASE_URL_LIVE : process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(useLive ? 'DATABASE_URL_LIVE is missing.' : 'DATABASE_URL is missing.');
}
if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
  throw new Error(
    'GOOGLE_MAPS_API_KEY is missing. Configure a server-only key with Places API (New) and Geocoding API before auditing or repairing coordinates.',
  );
}

const connectionUrl = new URL(databaseUrl);
if (useLive) connectionUrl.searchParams.set('sslmode', 'no-verify');
const client = new Client({
  connectionString: connectionUrl.toString(),
  ssl: useLive ? { rejectUnauthorized: false } : undefined,
});

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const newYorkPattern = /\bnew york\b|\bnyc\b|,\s*ny(?:\s|,|\d|$)|\bbrooklyn\b|\bbronx\b|\bqueens\b|\bstaten island\b|\bmanhattan\b|\blong island\b/i;

const rowSearchText = (row: MissingLocationRow): string => {
  if (row.kind === 'EVENT') {
    return [
      row.name,
      row.location,
      row.address,
      row.candidateVenue,
      row.candidateAddress,
      row.candidateCity,
      row.sourceKey,
    ].filter(Boolean).join(' ');
  }
  return [row.name, row.location, row.address, row.sourceKeys].filter(Boolean).join(' ');
};

const isSelected = (row: MissingLocationRow): boolean => {
  const text = rowSearchText(row);
  if (region === 'new-york' && !newYorkPattern.test(text)) return false;
  if (search && !text.toLowerCase().includes(search)) return false;
  return true;
};

const loadEventRows = async (): Promise<MissingEventRow[]> => {
  const result = await client.query(`
    select 'EVENT'::text as kind,
           e.id,
           e.name,
           e.location,
           e.address,
           e.coordinates,
           c.id as "candidateId",
           s."sourceKey",
           c."venueName" as "candidateVenue",
           c.address as "candidateAddress",
           c.city as "candidateCity"
    from "Events" e
    left join "AffiliateImportCandidates" c on c.id = e."sourceId"
    left join "AffiliateScrapeSources" s on s.id = c."sourceId"
    where e."sourceType" = 'AFFILIATE_IMPORT'
      and e."archivedAt" is null
    order by s."sourceKey" nulls last, e.name, e.id
  `);
  return result.rows
    .filter((row: MissingEventRow) => !normalizeAffiliateCoordinates(row.coordinates))
    .map((row: MissingEventRow) => ({ ...row, kind: 'EVENT' }));
};

const loadOrganizationRows = async (): Promise<MissingOrganizationRow[]> => {
  const result = await client.query(`
    select 'ORGANIZATION'::text as kind,
           o.id,
           o.name,
           o.location,
           o.address,
           o.coordinates,
           o."originType"::text as "originType",
           (
             select string_agg(distinct s."sourceKey", ', ' order by s."sourceKey")
             from "AffiliateScrapeSources" s
             where s."organizationId" = o.id
           ) as "sourceKeys"
    from "Organizations" o
    where (
      o."originType" = 'AFFILIATE_IMPORTED'
      or exists (
        select 1 from "AffiliateScrapeSources" s where s."organizationId" = o.id
      )
      or exists (
        select 1 from "AffiliateImportCandidates" c where c."publishedOrganizationId" = o.id
      )
    )
    order by o.name, o.id
  `);
  return result.rows
    .filter((row: MissingOrganizationRow) => !normalizeAffiliateCoordinates(row.coordinates))
    .map((row: MissingOrganizationRow) => ({ ...row, kind: 'ORGANIZATION' }));
};

const buildQueries = (row: MissingLocationRow): string[] => {
  if (row.kind === 'ORGANIZATION') {
    return buildAffiliatePlaceLocationQueries({
      name: row.name,
      location: row.location,
      address: row.address,
      city: row.location,
    });
  }

  const parsed = parseVenueAddressFromLocationText(nullableString(row.location) ?? '');
  const venueName = nullableString(row.candidateVenue) ?? nullableString(row.location) ?? parsed.venueName;
  const address = nullableString(row.candidateAddress) ?? nullableString(row.address) ?? parsed.address;
  const city = nullableString(row.candidateCity) ?? parsed.city;
  return buildAffiliateEventLocationQueries({ location: venueName, address, city });
};

const resolveQueries = async (queries: string[]): Promise<Pick<RepairPlan,
  'successfulQuery' | 'coordinates' | 'resolution' | 'reason'>> => {
  let lastResolution: GooglePlaceResolution | null = null;
  for (const query of queries) {
    const resolution = await resolveAddressToPlace(query);
    lastResolution = resolution;
    if (resolution.coordinates) {
      return {
        successfulQuery: query,
        coordinates: resolution.coordinates,
        resolution,
        reason: null,
      };
    }
  }
  return {
    successfulQuery: null,
    coordinates: null,
    resolution: lastResolution,
    reason: queries.length
      ? `No coordinate result (${lastResolution?.status ?? 'NO_RESULT'}).`
      : 'No source-backed address, city, or place is available.',
  };
};

const applyPlans = async (plans: RepairPlan[]) => {
  const resolved = plans.filter((plan) => plan.coordinates);
  if (!resolved.length) return;
  await client.query('begin');
  try {
    for (const plan of resolved) {
      const table = plan.row.kind === 'EVENT' ? 'Events' : 'Organizations';
      await client.query(
        `update "${table}" set coordinates = $2::jsonb, "updatedAt" = now() where id = $1`,
        [plan.row.id, JSON.stringify(plan.coordinates)],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
};

const increment = (summary: Record<string, number>, key: string) => {
  summary[key] = (summary[key] ?? 0) + 1;
};

const main = async () => {
  await client.connect();
  const rows: MissingLocationRow[] = [];
  if (scope !== 'organizations') rows.push(...await loadEventRows());
  if (scope !== 'events') rows.push(...await loadOrganizationRows());

  const selectedRows = rows.filter(isSelected);
  const boundedRows = limitValue > 0 ? selectedRows.slice(0, limitValue) : selectedRows;
  const plans: RepairPlan[] = [];
  for (const row of boundedRows) {
    const queries = buildQueries(row);
    plans.push({ row, queries, ...(await resolveQueries(queries)) });
  }

  if (apply) await applyPlans(plans);

  const byKind: Record<string, { missing: number; repairable: number; unresolved: number }> = {};
  const byProvider: Record<string, number> = {};
  const byFailure: Record<string, number> = {};
  plans.forEach((plan) => {
    byKind[plan.row.kind] ??= { missing: 0, repairable: 0, unresolved: 0 };
    byKind[plan.row.kind].missing += 1;
    if (plan.coordinates) {
      byKind[plan.row.kind].repairable += 1;
      increment(byProvider, plan.resolution?.provider ?? 'UNKNOWN');
    } else {
      byKind[plan.row.kind].unresolved += 1;
      increment(byFailure, plan.resolution?.status ?? 'NO_QUERIES');
    }
  });

  const resolved = plans.filter((plan) => plan.coordinates);
  const unresolved = plans.filter((plan) => !plan.coordinates);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    database: useLive ? 'DATABASE_URL_LIVE' : 'DATABASE_URL',
    scope,
    filters: { region, search, limit: limitValue || null },
    selectedMissingRows: boundedRows.length,
    repairable: resolved.length,
    unresolved: unresolved.length,
    byKind,
    byProvider,
    byFailure,
    resolvedSamples: resolved.slice(0, 20).map((plan) => ({
      kind: plan.row.kind,
      id: plan.row.id,
      name: plan.row.name,
      successfulQuery: plan.successfulQuery,
      coordinates: plan.coordinates,
      provider: plan.resolution?.provider,
      formattedAddress: plan.resolution?.formattedAddress,
    })),
    unresolvedSamples: unresolved.slice(0, 20).map((plan) => ({
      kind: plan.row.kind,
      id: plan.row.id,
      name: plan.row.name,
      location: plan.row.location,
      address: plan.row.address,
      queries: plan.queries,
      reason: plan.reason,
      attempts: plan.resolution?.attempts,
    })),
  }, null, 2));
};

main()
  .catch((error) => {
    console.error('[repair-affiliate-location-coordinates] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
