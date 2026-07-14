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
const SOURCE_ID = 'affiliate_source_portland_tennis_center_court_rentals';
const SOURCE_KEY = 'portland-tennis-center-court-rentals';
const MAPPING_ID = 'affiliate_source_portland_tennis_center_court_rentals_mapping_v1';
const BASE_URL = 'https://www.portland.gov/parks';
const LIST_URL = 'https://www.portland.gov/parks/portland-tennis-center';
const COURT_CALENDAR_URL = 'https://anc.apm.activecommunities.com/portlandparks/calendars?onlineSiteId=25&no_scroll_top=true&defaultCalendarId=1&locationId=285&displayType=0&view=2';
const MEMBERSHIP_URL = 'https://anc.apm.activecommunities.com/portlandparks/membership/search?onlineSiteId=0&categoryIds=4&keyword=PTC&siteIds=25';
const LOGO_SOURCE_URL = 'https://www.portland.gov/themes/custom/cloudy/images/brand/seal-logo.png';
const ADDRESS = '324 NE 12th Ave, Portland, OR 97232';
const ORG_SPORTS = ['Baseball', 'Softball', 'Grass Soccer', 'Football', 'Ultimate Frisbee', 'Lacrosse', 'Tennis'];

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Tennis Center Court Reservations',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: COURT_CALENDAR_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'Portland Tennis Center Court Reservations',
      officialActionUrl: COURT_CALENDAR_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Parks & Recreation',
      sportName: 'Tennis',
      formatLabel: 'Indoor and outdoor tennis court reservation',
      city: 'Portland, OR',
      venueName: 'Portland Tennis Center',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Court reservations are handled through the official Portland Parks ActiveNet calendar. The public city page lists opening hours by season and says reservations open daily at 7:30 AM for outdoor courts and 8:30 AM for indoor courts.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Reserve courts through Portland Parks ActiveNet',
      participantOptionsText: 'The facility has 8 indoor courts and 4 outdoor courts, all lighted. Ball machines are available during select hours.',
      statusText: 'The source links court booking, activity registration, membership search, and contact forms to ActiveNet or Smartsheet; this candidate keeps only the official court calendar as the rental action URL.',
      description: 'Portland Tennis Center is a Portland Parks & Recreation tennis facility with 8 indoor and 4 outdoor lighted courts, changing rooms, lockers, a staff desk, a pro shop, and ADA-accessible bathrooms. The official page says court reservations are made through ActiveNet, with reservations opening daily at 7:30 AM for outdoor courts and 8:30 AM for indoor courts. The page also links to PTC monthly passes, drills, mixers, activities, ball-machine availability, and account setup, but current court availability and final prices live in the official ActiveNet flow.',
      warnings: [
        'Stored as a rental link-out because live court availability and prices are in ActiveNet.',
        'ActiveNet activity-search links for drills, mixers, and pickleball were not imported as events in this rental-first source.',
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
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, tennis courts, recreation facilities, and public sports programming across Portland.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
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
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, tennis courts, recreation facilities, and public sports programming across Portland.',
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
    name: 'Portland Tennis Center Court Reservations',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual Portland Tennis Center rental source. The city page publishes facility/court details and links to ActiveNet for live reservations.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'portland.gov robots.txt allows the public tennis-center path; ActiveNet calendar/activity links are kept outbound-only.',
      courtCalendarUrl: COURT_CALENDAR_URL,
      membershipUrl: MEMBERSHIP_URL,
      logoSourceUrl: LOGO_SOURCE_URL,
      excludedPrograms: [
        'ActiveNet drill, mixer, activity, and pickleball search links were not imported as events because this row is a rental-first source and no crawlable repeated public event rows were exposed on the city page.',
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
      notes: 'Manual Portland Tennis Center court reservation rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Portland Tennis Center court reservation rental mapping.',
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

  console.log(`Portland Tennis Center affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-portland-tennis-center-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
