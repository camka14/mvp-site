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

if (process.argv.includes('--live')) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error('--live requires DATABASE_URL_LIVE.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.PG_POOL_MAX = '1';
  process.env.PG_CONNECTION_TIMEOUT_MS = '15000';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

type Coordinates = [number, number];

const knownFacilityLocations = new Map<string, { address: string; coordinates: Coordinates }>([
  ['Aspen Highland Park', { address: '147 NE 24th St, Gresham, OR', coordinates: [-122.4295172, 45.5142947] }],
  ['Gradin Community Sports Park', { address: '2303 SE Palmquist Rd, Gresham, OR', coordinates: [-122.4081577, 45.4881733] }],
  ['Hall Park', { address: '2727 NE 23rd St, Gresham, OR', coordinates: [-122.4048124, 45.5140931] }],
  ['Hollybrook Park', { address: '535 SW Birdsdale Dr, Gresham, OR', coordinates: [-122.4524411, 45.4917147] }],
  ['John Deere Field', { address: '2100 NE 181st Ave, Portland, OR', coordinates: [-122.4722489, 45.5381153] }],
  ['Kirk Park', { address: '1087 NE 188th Ave, Portland, OR', coordinates: [-122.4717215, 45.5304093] }],
  ['Main City Park', { address: '219 S Main Ave, Gresham, OR', coordinates: [-122.4312878, 45.4960928] }],
  ['North Gresham Park', { address: '1111 SE 217th Ave, Gresham, OR', coordinates: [-122.4416903, 45.5159903] }],
  ['Pat Pfeifer Park', { address: '424 NE 172nd Ave, Portland, OR', coordinates: [-122.4836648, 45.5240627] }],
  ['Red Sunset Park', { address: '2403 NE Red Sunset Dr, Gresham, OR', coordinates: [-122.4157328, 45.5143213] }],
  ['Rockwood Central Park', { address: '17707 SE Main St, Portland, OR', coordinates: [-122.480901, 45.5147614] }],
  ['Vance Park', { address: '1400 SE 182nd Ave, Portland, OR', coordinates: [-122.4745061, 45.5130725] }],
  ['PCC Cascade Campus Athletic Facility Rentals', { address: '705 N Killingsworth St, Portland, OR 97217', coordinates: [-122.6743642, 45.5635613] }],
  ['PCC Rock Creek Campus Athletic Facility Rentals', { address: '17705 NW Springville Rd, Portland, OR 97229', coordinates: [-122.8607684, 45.5677329] }],
  ['PCC Southeast Campus Athletic Facility Rentals', { address: '2305 SE 82nd Ave, Portland, OR 97216', coordinates: [-122.5799483, 45.5064162] }],
  ['PCC Sylvania Campus Athletic Facility Rentals', { address: '12000 SW 49th Ave, Portland, OR 97219', coordinates: [-122.7289709, 45.4400506] }],
  ['RCF East: Portland court rentals', { address: '5010 NE Oregon St, Portland, OR 97213', coordinates: [-122.6119285, 45.5291975] }],
  ['RCF West: Tigard court rentals', { address: '10831 SW Cascade Ave, Tigard, OR 97223', coordinates: [-122.7796914, 45.441913] }],
]);

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

const coordinatesMatch = (left: unknown, right: Coordinates): boolean => (
  isValidCoordinates(left)
  && Math.abs(Number(left[0]) - right[0]) < 0.000001
  && Math.abs(Number(left[1]) - right[1]) < 0.000001
);

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
  const missing = facilities.filter((facility) => {
    const known = knownFacilityLocations.get(facility.name);
    return !isValidCoordinates(facility.coordinates)
      || Boolean(known && (!coordinatesMatch(facility.coordinates, known.coordinates) || facility.address !== known.address));
  });
  const organizations = await prisma.organizations.findMany({
    where: { id: { in: [...new Set(missing.map((facility) => facility.organizationId))] } },
    select: { id: true, name: true, coordinates: true },
  });
  const orgById = new Map(organizations.map((organization) => [organization.id, organization]));

  let updated = 0;
  const unresolved: string[] = [];

  for (const facility of missing) {
    const organization = orgById.get(facility.organizationId);
    const knownLocation = knownFacilityLocations.get(facility.name) ?? null;
    const geocodeResult = knownLocation
      ? null
      : await geocodeFirstAvailable(buildFacilityQueries({
          name: facility.name,
          location: facility.location,
          address: facility.address,
          organizationName: organization?.name ?? null,
        }));
    const coordinates = knownLocation?.coordinates
      ?? geocodeResult?.coordinates
      ?? (isValidCoordinates(organization?.coordinates) ? organization.coordinates : null);

    if (!coordinates) {
      unresolved.push(`${facility.id} (${facility.name})`);
      console.log(`unresolved ${facility.id}: ${facility.name}`);
      continue;
    }

    const source = knownLocation
      ? 'verified facility address'
      : geocodeResult
        ? `geocoded "${geocodeResult.query}"`
        : 'source organization fallback';
    console.log(`${apply ? 'update' : 'dry-run'} ${facility.id}: ${coordinates.join(', ')} from ${source}`);

    if (apply) {
      await prisma.facilities.update({
        where: { id: facility.id },
        data: {
          coordinates,
          ...(knownLocation ? { address: knownLocation.address } : {}),
        },
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
