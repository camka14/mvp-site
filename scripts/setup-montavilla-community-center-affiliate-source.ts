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
const ORG_ID = 'affiliate_org_portland_parks_recreation';
const LOGO_FILE_ID = 'affiliate_file_portland_parks_recreation_logo';
const SOURCE_ID = 'affiliate_source_montavilla_community_center_rentals';
const SOURCE_KEY = 'montavilla-community-center-rentals';
const MAPPING_ID = 'affiliate_source_montavilla_community_center_rentals_mapping_v1';
const BASE_URL = 'https://www.portland.gov/parks';
const LIST_URL = 'https://www.portland.gov/parks/montavilla-community-center';
const LOGO_SOURCE_URL = 'https://www.portland.gov/themes/custom/cloudy/images/brand/seal-logo.png';
const ADDRESS = '8219 NE Glisan Street, Portland, OR 97220';
const ORG_SPORTS = ['Baseball', 'Softball', 'Grass Soccer', 'Football', 'Ultimate Frisbee', 'Lacrosse', 'Tennis', 'Basketball', 'Volleyball', 'Pickleball'];

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Montavilla Community Center Gym and Room Rentals',
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
      title: 'Montavilla Community Center Gym and Room Rentals',
      officialActionUrl: LIST_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Parks & Recreation',
      sportName: 'Basketball',
      formatLabel: 'Community center gym rental',
      city: 'Portland, OR',
      venueName: 'Montavilla Community Center',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'After-hours rentals are listed for Saturday 4:00-7:00 PM and Sunday 10:00 AM-6:00 PM. Renters must call at least two weeks before the desired date.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Rental requests by community center availability',
      participantOptionsText: 'Gym, multipurpose room, sports party, indoor park party, and bounce-house party options.',
      statusText: 'The source says prices vary by business-hours and after-hours rates and asks renters to call 503-823-4101 for rates and availability.',
      description: 'Montavilla Community Center is a Portland Parks & Recreation neighborhood community center with a gym and multipurpose classrooms. The rental page lists a 96 by 60 foot gym with sports surface flooring that can be set as a single basketball court or volleyball court, plus a 34 by 21 foot multipurpose room with a sink, counter space, tables, chairs, and TV/DVD player. After-hours rentals are listed for Saturday 4:00 PM to 7:00 PM and Sunday 10:00 AM to 6:00 PM. Party packages include sports, indoor park, and bounce-house options. Renters are asked to call 503-823-4101 at least two weeks before the desired rental date to check rates, availability, and reserve a room.',
      warnings: [
        'Stored as a rental link-out because the official rental flow is phone-based and the page does not expose live availability.',
        'Drop-in activity schedules and registered classes are ActiveNet links and are not imported as rental candidates.',
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
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-parks-recreation-logo.png',
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
      originalName: 'portland-parks-recreation-logo.png',
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
      originalName: 'portland-parks-recreation-logo.png',
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
      name: 'Portland Parks & Recreation',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, recreation facilities, community centers, tennis courts, and public sports programming across Portland.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
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
      name: 'Portland Parks & Recreation',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, recreation facilities, community centers, tennis courts, and public sports programming across Portland.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
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
    name: 'Montavilla Community Center Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual Montavilla Community Center rental source from the official Portland.gov page. Rental reservations are phone-based.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'portland.gov robots.txt allows the public Montavilla Community Center page; ActiveNet activity links are kept outbound-only and not scraped.',
      logoSourceUrl: LOGO_SOURCE_URL,
      phoneReservationNumber: '503-823-4101',
      excludedPrograms: [
        'Drop-in schedules and registered classes are linked through ActiveNet and are not part of this rental source.',
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
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
      notes: 'Manual Montavilla Community Center gym and room rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Montavilla Community Center gym and room rental mapping.',
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

  console.log(`Montavilla Community Center rental affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-montavilla-community-center-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
