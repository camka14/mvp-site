/**
 * Repairs missing affiliate event coordinates from source-derived venue/address data.
 *
 * Default mode is dry-run against the local DB. Use --live to target DATABASE_URL_LIVE
 * and --apply to write coordinates back to Events plus any missing candidate address
 * fields inferred from source data.
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import { geocodeAddressToCoordinates } from '../src/server/geocoding';
import { parseVenueAddressFromLocationText } from '../src/server/affiliateImports/mappingExtractor';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type MissingEventRow = {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  coordinates: unknown;
  sourceId: string | null;
  sourceKey: string | null;
  candidateVenue: string | null;
  candidateAddress: string | null;
  candidateCity: string | null;
};

type RepairPlan = {
  row: MissingEventRow;
  venueName: string | null;
  address: string | null;
  city: string | null;
  geocodeQueries: string[];
  coordinates: [number, number] | null;
  reason: string | null;
};

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');

if (useLive) {
}

const databaseUrl = useLive ? process.env.DATABASE_URL_LIVE : process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(useLive ? 'DATABASE_URL_LIVE is missing.' : 'DATABASE_URL is missing.');
}

const connectionUrl = new URL(databaseUrl);
if (useLive) {
  connectionUrl.searchParams.set('sslmode', 'no-verify');
}

const client = new Client({
  connectionString: connectionUrl.toString(),
  ssl: useLive ? { rejectUnauthorized: false } : undefined,
});

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const isMissingCoordinates = (coordinates: unknown): boolean => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return true;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return !Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0);
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = nullableString(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

const isVagueVenue = (value: string | null | undefined): boolean => {
  const normalized = nullableString(value)?.toLowerCase() ?? '';
  return /\b(area|areas|metro|fields|gyms|courts|various|multiple)\b/.test(normalized);
};

const cityOnlyAddress = (value: string | null | undefined): boolean => {
  const normalized = nullableString(value) ?? '';
  return /^[A-Za-z .'-]+,\s*(?:OR|WA)$/i.test(normalized);
};

const withKnownSourceAddress = (row: MissingEventRow): Partial<Pick<RepairPlan, 'venueName' | 'address' | 'city'>> => {
  if (row.sourceKey === 'winterhawks-ice-adult-hockey') {
    if (/sherwood/i.test(row.name)) {
      return {
        venueName: 'Winterhawks ICE Center - Sherwood',
        address: '20407 SW Borchers Dr, Sherwood, OR 97140',
        city: 'Sherwood, OR',
      };
    }
    if (/beaverton|vmc/i.test(row.name)) {
      return {
        venueName: 'Winterhawks Skating Center - Beaverton',
        address: '9250 SW Beaverton Hillsdale Hwy, Beaverton, OR 97005',
        city: 'Beaverton, OR',
      };
    }
  }

  if (row.sourceKey === 'outloud-sports-portland-leagues') {
    return {
      venueName: row.location ?? row.candidateVenue ?? 'Portland metro area',
      address: 'Portland, OR',
      city: 'Portland, OR',
    };
  }

  return {};
};

const inferLocationParts = (row: MissingEventRow): Pick<RepairPlan, 'venueName' | 'address' | 'city'> => {
  const known = withKnownSourceAddress(row);
  const parsed = parseVenueAddressFromLocationText(row.name);
  return {
    venueName: nullableString(known.venueName)
      ?? nullableString(row.candidateVenue)
      ?? nullableString(row.location)
      ?? parsed.venueName,
    address: nullableString(known.address)
      ?? nullableString(row.candidateAddress)
      ?? nullableString(row.address)
      ?? parsed.address,
    city: nullableString(known.city)
      ?? nullableString(row.candidateCity)
      ?? parsed.city,
  };
};

const buildGeocodeQueries = (parts: Pick<RepairPlan, 'venueName' | 'address' | 'city'>): string[] => {
  const venueName = nullableString(parts.venueName);
  const address = nullableString(parts.address);
  const city = nullableString(parts.city);
  const fullAddress = address && city && !address.toLowerCase().includes(city.toLowerCase())
    ? `${address}, ${city}`
    : address;
  const shouldUseVenueWithAddress = venueName && fullAddress && !cityOnlyAddress(fullAddress) && !isVagueVenue(venueName);

  return uniqueStrings([
    fullAddress,
    shouldUseVenueWithAddress ? `${venueName}, ${fullAddress}` : null,
    venueName && city && !isVagueVenue(venueName) ? `${venueName}, ${city}` : null,
    city,
    venueName && !isVagueVenue(venueName) ? venueName : null,
  ]);
};

const geocodeFirst = async (queries: string[]): Promise<[number, number] | null> => {
  for (const query of queries) {
    const coordinates = await geocodeAddressToCoordinates(query);
    if (coordinates) return coordinates;
  }
  return null;
};

const loadRows = async (): Promise<MissingEventRow[]> => {
  const result = await client.query(`
    select e.id,
           e.name,
           e.location,
           e.address,
           e.coordinates,
           e."sourceId",
           s."sourceKey",
           c."venueName" as "candidateVenue",
           c.address as "candidateAddress",
           c.city as "candidateCity"
    from "Events" e
    left join "AffiliateImportCandidates" c on c.id = e."sourceId"
    left join "AffiliateScrapeSources" s on s.id = c."sourceId"
    where e."sourceType" = 'AFFILIATE_IMPORT'
      and e."archivedAt" is null
    order by s."sourceKey" nulls last, e.name
  `);
  return result.rows.filter((row: MissingEventRow) => isMissingCoordinates(row.coordinates));
};

const updateRow = async (plan: RepairPlan) => {
  if (!plan.coordinates) return;
  const inferredAddress = nullableString(plan.address);
  await client.query(
    `
      update "Events"
      set coordinates = $2::jsonb,
          address = coalesce(address, $3),
          "updatedAt" = now()
      where id = $1
    `,
    [plan.row.id, JSON.stringify(plan.coordinates), inferredAddress],
  );

  if (plan.row.sourceId) {
    await client.query(
      `
        update "AffiliateImportCandidates"
        set "venueName" = coalesce("venueName", $2),
            address = coalesce(address, $3),
            city = coalesce(city, $4)
        where id = $1
      `,
      [plan.row.sourceId, plan.venueName, inferredAddress, plan.city],
    );
  }
};

const main = async () => {
  await client.connect();
  const rows = await loadRows();
  const plans: RepairPlan[] = [];

  for (const row of rows) {
    const parts = inferLocationParts(row);
    const geocodeQueries = buildGeocodeQueries(parts);
    const coordinates = geocodeQueries.length ? await geocodeFirst(geocodeQueries) : null;
    plans.push({
      row,
      ...parts,
      geocodeQueries,
      coordinates,
      reason: coordinates ? null : 'No geocode result',
    });
  }

  if (apply) {
    for (const plan of plans) {
      await updateRow(plan);
    }
  }

  const repaired = plans.filter((plan) => plan.coordinates).length;
  const unresolved = plans.filter((plan) => !plan.coordinates);
  const bySource = plans.reduce<Record<string, { total: number; repaired: number; unresolved: number }>>((summary, plan) => {
    const key = plan.row.sourceKey ?? '(unknown)';
    summary[key] ??= { total: 0, repaired: 0, unresolved: 0 };
    summary[key].total += 1;
    if (plan.coordinates) summary[key].repaired += 1;
    else summary[key].unresolved += 1;
    return summary;
  }, {});

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    database: useLive ? 'live' : 'local',
    missingBefore: rows.length,
    repairable: repaired,
    unresolved: unresolved.length,
    bySource,
    unresolvedSamples: unresolved.slice(0, 20).map((plan) => ({
      id: plan.row.id,
      sourceKey: plan.row.sourceKey,
      name: plan.row.name,
      venueName: plan.venueName,
      address: plan.address,
      city: plan.city,
      geocodeQueries: plan.geocodeQueries,
      reason: plan.reason,
    })),
  }, null, 2));
};

main()
  .catch((error) => {
    console.error('[repair-affiliate-event-coordinates] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
