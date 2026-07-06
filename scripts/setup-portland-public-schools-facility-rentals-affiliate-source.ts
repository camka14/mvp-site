import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_portland_public_schools';
const LOGO_FILE_ID = 'affiliate_file_portland_public_schools_logo';
const SOURCE_ID = 'affiliate_source_portland_public_schools_facility_rentals';
const SOURCE_KEY = 'portland-public-schools-facility-rentals';
const MAPPING_ID = 'affiliate_mapping_portland_public_schools_facility_rentals_v1';
const BASE_URL = 'https://www.facilitron.com/';
const LIST_URL = 'https://www.facilitron.com/pps97227';
const ROBOTS_URL = 'https://facilitron.com/robots.txt';
const LOGO_SOURCE_URL = 'https://d2rzw8waxoxhv2.cloudfront.net/logos/pps97227/1718744628969-510-281.jpg';
const ORG_SPORTS = [
  'Basketball',
  'Volleyball',
  'Grass Soccer',
  'Football',
  'Baseball',
  'Softball',
  'Tennis',
  'Swimming',
];

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Public Schools Facility Rentals',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'Portland Public Schools Facility Rentals',
      officialActionUrl: LIST_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Public Schools',
      sportName: 'Basketball',
      formatLabel: 'School gym and field rental',
      city: 'Portland, OR',
      venueName: 'Portland Public Schools facilities',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Request classrooms, gyms, pools, sports fields, theaters, and other school facilities through the official Facilitron Portland Public Schools page.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Request through Facilitron',
      participantOptionsText: 'Public facility examples on the source page include high school gyms, football turf fields, baseball and softball fields, tennis courts, auditoriums, cafeterias, classrooms, and other school spaces.',
      priceText: 'Not specified. Facility pricing, staffing, availability, and permit details are handled by Portland Public Schools and Facilitron during the official request flow.',
      statusText: 'Official availability and reservation requests are handled by Facilitron.',
      description: 'Portland Public Schools uses Facilitron for community facility rentals across Portland. The public PPS owner page lists rentable school spaces such as classrooms, gyms, pools, sports fields, theaters, auditoriums, cafeterias, tennis courts, and other school facilities. Use the official Facilitron page to search PPS facilities and start a rental request; BracketIQ does not show live availability for this source because the calendar and searchfacility paths are disallowed by Facilitron robots.txt.',
      warnings: [
        'Stored as a district-level rental/facility link-out because Facilitron robots.txt disallows calendar and searchfacility paths.',
        'Do not scrape Facilitron calendar availability for this source. Use the official PPS Facilitron page as the outbound action URL.',
        'Coordinates are city-level because this source represents a districtwide school-facility inventory rather than one physical facility.',
      ],
    },
  ],
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const downloadLogo = async () => {
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-public-schools-logo.jpg',
    contentType,
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'portland-public-schools-logo.jpg',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'portland-public-schools-logo.jpg',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { sports: true, coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates('Portland, OR')
    ?? existing?.coordinates
    ?? null;
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...ORG_SPORTS]));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Public Schools',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Public Schools uses Facilitron for community rental requests across district facilities, including classrooms, gyms, pools, sports fields, theaters, auditoriums, cafeterias, and other school spaces in Portland.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LIST_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Public Schools',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Public Schools uses Facilitron for community rental requests across district facilities, including classrooms, gyms, pools, sports fields, theaters, auditoriums, cafeterias, and other school spaces in Portland.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LIST_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      operatesAthleticFacility: true,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Portland Public Schools Facility Rentals',
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual rental/facility source. Facilitron allows the public PPS owner page but disallows calendar and searchfacility paths, so this stays a district-level link-out instead of an availability scraper.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsUrl: ROBOTS_URL,
      robotsNote: 'The public PPS owner page is not disallowed. Facilitron robots.txt disallows /*/calendar, /calendar/*, and /searchfacility/*, so calendar/search availability must not be scraped.',
      disallowedPaths: ['/*/calendar', '/*/calendar/', '/calendar/*', '/searchfacility/*'],
      platform: 'Facilitron public owner page with disallowed calendar/search availability paths',
      logoSourceUrl: LOGO_SOURCE_URL,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      sourceKey: SOURCE_KEY,
      ...sourcePayload,
    },
    update: sourcePayload,
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: SOURCE_ID,
        version: 1,
      },
    },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manual rental mapping for Portland Public Schools districtwide Facilitron rental link-out.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual rental mapping for Portland Public Schools districtwide Facilitron rental link-out.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Portland Public Schools facility rental affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-portland-public-schools-facility-rentals-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
