/**
 * Backfills coordinates for affiliate rental facilities.
 *
 * Target records: Facilities rows with affiliateUrl set and missing/invalid coordinates.
 * Owner/sources: all affiliate rental sources.
 * Safe to run: local or live DB. Defaults to dry-run; pass --apply to update rows.
 * Behavior: geocodes facility name/address/city-style values, falls back to org coordinates,
 * and copies resolved facility coordinates to missing resource lat/long values.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

type Coordinates = [number, number];

let prisma: PrismaClientInstance;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const isValidCoordinates = (value: unknown): value is Coordinates => {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0);
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = nullableString(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

const buildFacilityQueries = (facility: {
  name: string;
  location: string;
  address: string | null;
  organizationName: string | null;
}): string[] => {
  const name = nullableString(facility.name);
  const location = nullableString(facility.location);
  const address = nullableString(facility.address);
  const organizationName = nullableString(facility.organizationName);
  const localOregonLocation = location
    && /^(gresham|portland|tigard|beaverton|lake oswego|tualatin|hillsboro|oregon city|troutdale)$/i.test(location)
    ? `${location}, OR`
    : null;

  return uniqueStrings([
    name && address && !address.toLowerCase().includes(name.toLowerCase())
      ? `${name}, ${address}`
      : null,
    address,
    name && location && !name.toLowerCase().includes(location.toLowerCase())
      ? `${name}, ${location}`
      : null,
    name && localOregonLocation
      ? `${name}, ${localOregonLocation}`
      : null,
    location && address && !address.toLowerCase().includes(location.toLowerCase())
      ? `${location}, ${address}`
      : null,
    organizationName && location && !organizationName.toLowerCase().includes(location.toLowerCase())
      ? `${organizationName}, ${location}`
      : null,
    location,
    name,
    organizationName,
  ]);
};

const geocodeFirstAvailable = async (queries: string[]): Promise<{ query: string; coordinates: Coordinates } | null> => {
  for (const query of queries) {
    const coordinates = await geocodeAddressToCoordinates(query);
    if (coordinates) return { query, coordinates };
  }
  return null;
};

const main = async () => {
  await loadAppModules();

  const apply = process.argv.includes('--apply');

  const facilities = await prisma.facilities.findMany({
    where: { affiliateUrl: { not: null } },
    select: {
      id: true,
      organizationId: true,
      name: true,
      location: true,
      address: true,
      coordinates: true,
    },
    orderBy: { name: 'asc' },
  });
  const missing = facilities.filter((facility) => !isValidCoordinates(facility.coordinates));
  const organizations = await prisma.organizations.findMany({
    where: { id: { in: [...new Set(missing.map((facility) => facility.organizationId))] } },
    select: { id: true, name: true, coordinates: true },
  });
  const orgById = new Map(organizations.map((organization) => [organization.id, organization]));

  let updated = 0;
  const unresolved: string[] = [];

  for (const facility of missing) {
    const organization = orgById.get(facility.organizationId);
    const geocodeResult = await geocodeFirstAvailable(buildFacilityQueries({
      name: facility.name,
      location: facility.location,
      address: facility.address,
      organizationName: organization?.name ?? null,
    }));
    const coordinates = geocodeResult?.coordinates
      ?? (isValidCoordinates(organization?.coordinates) ? organization.coordinates : null);

    if (!coordinates) {
      unresolved.push(`${facility.id} (${facility.name})`);
      console.log(`unresolved ${facility.id}: ${facility.name}`);
      continue;
    }

    const source = geocodeResult ? `geocoded "${geocodeResult.query}"` : 'source organization fallback';
    console.log(`${apply ? 'update' : 'dry-run'} ${facility.id}: ${coordinates.join(', ')} from ${source}`);

    if (apply) {
      await prisma.facilities.update({
        where: { id: facility.id },
        data: { coordinates },
      });
      await prisma.fields.updateMany({
        where: {
          facilityId: facility.id,
          archivedAt: null,
          OR: [{ lat: null }, { long: null }],
        },
        data: {
          lat: coordinates[1],
          long: coordinates[0],
        },
      });
    }
    updated += 1;
  }

  console.log(JSON.stringify({
    apply,
    checked: facilities.length,
    missing: missing.length,
    resolved: updated,
    unresolved,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
