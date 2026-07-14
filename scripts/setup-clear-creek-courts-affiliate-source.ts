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
const ORG_ID = 'affiliate_org_the_courts_at_clear_creek';
const LOGO_FILE_ID = 'affiliate_file_the_courts_at_clear_creek_logo';
const SOURCE_ID = 'affiliate_source_the_courts_at_clear_creek_rentals';
const SOURCE_KEY = 'the-courts-at-clear-creek-rentals';
const MAPPING_ID = 'affiliate_mapping_the_courts_at_clear_creek_rentals_v1';
const BASE_URL = 'https://courtsatclearcreek.com/';
const LIST_URL = 'https://courtsatclearcreek.com/facility/';
const BOOKING_URL = 'https://www.secure-booker.com/TheCourtsatClearCreek/MakeAppointment/Search.aspx';
const LOGO_SOURCE_URL = 'https://a9skwjxw27dk-u6814.pressidiumcdn.com/wp-content/uploads/2017/06/COURTS-Color.png';
const RENTAL_RATES_URL = 'https://a9skwjxw27dk-u6814.pressidiumcdn.com/wp-content/uploads/2017/07/Rental-Rates-July-2017.pdf';
const FACILITY_ADDRESS = '334 NE 219th Ave, Gresham, OR 97030';
const ORG_SPORTS = ['Basketball', 'Volleyball', 'Badminton', 'Indoor Soccer'];

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'The Courts at Clear Creek Court and Event Rentals',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: BOOKING_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'The Courts at Clear Creek Court and Event Rentals',
      officialActionUrl: BOOKING_URL,
      sourceUrl: LIST_URL,
      organizerName: 'The Courts at Clear Creek',
      sportName: 'Basketball',
      formatLabel: 'Indoor court and event rental',
      city: 'Gresham, OR',
      venueName: 'The Courts at Clear Creek',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Book court, team, meeting, party, and event rental time through the official Secure Booker page. Contact the venue for multi-week rental availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Book on official calendar',
      participantOptionsText: 'Rental options listed by the source include main court, auxiliary court, full court, coach/team/meeting room, parties, and events.',
      priceText: 'Court rentals start at $25-$50 per hour. Party/event rentals are listed at $200-$500 for a 3-hour minimum, plus security deposit; the facility page says additional hours are $120 per hour.',
      statusText: 'Official booking and availability are handled on Secure Booker.',
      description: 'The Courts at Clear Creek offers indoor basketball, volleyball, badminton, indoor soccer-style court use, team practices, special events, social gatherings, team-building activities, and birthday parties. The facility page lists a main court, auxiliary court, and banquet party room, with volleyball nets, baseball mound, pitching nets, soccer goals, wheelchair accessibility, restrooms, and parking. Source rental-rate materials list main court, auxiliary court, full-court, meeting-room, and party/event rental prices; the official booking page controls current availability.',
      warnings: [
        'Stored as a rental/facility link-out because the source does not expose dated public event rows or real-time availability in the BracketIQ-owned flow.',
        'The 2017 rental-rates PDF says additional party/event hours are $100 per hour, while the current facility page says $120 per hour. The candidate keeps the current page value and leaves detailed pricing in the description/admin fields.',
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
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'the-courts-at-clear-creek-logo.png',
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
      originalName: 'the-courts-at-clear-creek-logo.png',
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
      originalName: 'the-courts-at-clear-creek-logo.png',
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
  const coordinates = await geocodeAddressToCoordinates(FACILITY_ADDRESS)
    ?? existing?.coordinates
    ?? null;
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...ORG_SPORTS]));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'The Courts at Clear Creek',
      location: 'Gresham, OR',
      address: FACILITY_ADDRESS,
      description: 'The Courts at Clear Creek is an indoor sports and event venue in Gresham offering basketball, volleyball, badminton, open court activities, team practices, indoor soccer-style use, parties, meetings, and event rentals.',
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
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'The Courts at Clear Creek',
      location: 'Gresham, OR',
      address: FACILITY_ADDRESS,
      description: 'The Courts at Clear Creek is an indoor sports and event venue in Gresham offering basketball, volleyball, badminton, open court activities, team practices, indoor soccer-style use, parties, meetings, and event rentals.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      operatesAthleticFacility: true,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'The Courts at Clear Creek Rentals',
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual rental/facility source. The public site describes court, team room, meeting room, party, and event rentals; current booking availability remains on Secure Booker.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 20,
      bookingRobotsAllowed: true,
      platform: 'WordPress facility page with Secure Booker outbound booking link',
      bookingUrl: BOOKING_URL,
      rentalRatesUrl: RENTAL_RATES_URL,
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
      notes: 'Manual rental mapping for The Courts at Clear Creek court, team room, meeting room, party, and event rental link-out.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual rental mapping for The Courts at Clear Creek court, team room, meeting room, party, and event rental link-out.',
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

  console.log(`The Courts at Clear Creek affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-clear-creek-courts-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
