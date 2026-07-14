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
const ORG_ID = 'affiliate_org_ymca_columbia_willamette';
const LOGO_FILE_ID = 'affiliate_file_ymca_columbia_willamette_logo';
const SOURCE_ID = 'affiliate_source_ymca_cw_volleyball_programs';
const SOURCE_KEY = 'ymca-cw-volleyball-programs';
const MAPPING_ID = 'affiliate_source_ymca_cw_volleyball_programs_mapping_v1';
const HOME_URL = 'https://www.ymcacw.org/';
const LIST_URL = 'https://www.ymcacw.org/programs/sports/volleyball';
const LOGO_SOURCE_URL = 'https://www.ymcacw.org/themes/custom/ymca_cw/images/logo.svg';

const CLARK_ACTION_URL = 'https://operations.daxko.com/Online/5155/ProgramsV2/Search.mvc?category_ids=TAG8665&location_ids%5B0%5D=B515&location_ids%5B1%5D=S2559';
const BEAVERTON_ACTION_URL = 'https://operations.daxko.com/Online/5155/ProgramsV2/Search.mvc?keywords=&program_id=&expanded=categories%2Clocations&coming_soon=False&category_ids=TAG8665&all_categories=false&location_ids=S2036&all_locations=false&date_ranges%5B0%5D.start=&date_ranges%5B0%5D.end=&birth_dates=';
const SHERWOOD_ACTION_URL = 'https://operations.daxko.com/Online/5155/ProgramsV2/Search.mvc?keywords=&program_id=TMP41296&expanded=categories%2Clocations&coming_soon=False&category_ids=TAG19379&all_categories=false&location_ids=S3329&all_locations=false&date_ranges%5B0%5D.start=&date_ranges%5B0%5D.end=&birth_dates=';

const youthDivision = (name: string, key: string) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: 'u14',
  priceCents: null,
  maxParticipants: null,
  ageCutoffLabel: 'Youth volleyball program; exact age group varies by YMCA registration row',
  ageCutoffSource: 'YMCA Columbia-Willamette volleyball page',
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'YMCA Columbia-Willamette Volleyball Programs',
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
      listingKind: 'EVENT',
      title: 'Volleyball at Clark County YMCA',
      officialActionUrl: CLARK_ACTION_URL,
      sourceUrl: LIST_URL,
      organizerName: 'YMCA of Columbia-Willamette',
      sportName: 'Volleyball',
      formatLabel: 'Youth volleyball clinic',
      city: 'Vancouver, WA',
      venueName: 'Clark County YMCA',
      address: '11324 NE 51st Cir, Vancouver, WA 98682',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The public YMCA page describes an ongoing once-a-week, one-hour clinic. Current dates should be confirmed through the official YMCA registration link.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Ongoing youth clinic; check YMCA registration for current dates',
      skillLevel: 'Fundamentals and skill development',
      ageGroup: 'Youth',
      divisionText: 'Youth volleyball clinic',
      participantOptionsText: 'Individual registration through the official YMCA registration system.',
      priceText: null,
      statusText: 'The visible 2025 date line is stale; use the official YMCA registration link to confirm current sessions before publishing.',
      description: 'YMCA Columbia-Willamette describes the Clark County YMCA volleyball clinic as an ongoing youth program focused on serving, passing, setting, spiking, fundamentals, fun games, and drills. The public page says the clinic meets once a week for one hour, while current availability, dates, and price are handled through YMCA registration.',
      divisions: [
        youthDivision('Youth Volleyball Clinic', 'c_u14_clinic'),
      ],
      warnings: [
        'The public page still shows a Jan. 6-May 26, 2025 schedule line for this location; this candidate is no-fixed-date and should be reviewed against the official registration page.',
        'Daxko robots.txt disallows scraping, so the Daxko URL is outbound-only.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Volleyball at Beaverton Family YMCA',
      officialActionUrl: BEAVERTON_ACTION_URL,
      sourceUrl: LIST_URL,
      organizerName: 'YMCA of Columbia-Willamette',
      sportName: 'Volleyball',
      formatLabel: 'Youth volleyball camp',
      city: 'Beaverton, OR',
      venueName: 'Beaverton Family YMCA',
      address: '9685 SW Harvest Ct, Beaverton, OR 97005',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The public YMCA page describes volleyball camps at Beaverton Family YMCA. Current dates should be confirmed through the official YMCA registration link.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Youth camps; check YMCA registration for current dates',
      skillLevel: 'All abilities, fundamental skill development',
      ageGroup: 'Youth',
      divisionText: 'Youth volleyball camp',
      participantOptionsText: 'Individual registration through the official YMCA registration system.',
      priceText: null,
      statusText: 'Current dates, availability, and price are listed in YMCA registration rather than on the public page.',
      description: 'YMCA Columbia-Willamette describes Beaverton Family YMCA volleyball camps as programs with daily games, skill stations, small-sided play, full gameplay, and skill work for players of all abilities, with emphasis on passing and serving.',
      divisions: [
        youthDivision('Youth Volleyball Camp', 'c_u14_camp'),
      ],
      warnings: [
        'Daxko robots.txt disallows scraping, so the Daxko URL is outbound-only.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Volleyball at Sherwood Regional Family YMCA',
      officialActionUrl: SHERWOOD_ACTION_URL,
      sourceUrl: LIST_URL,
      organizerName: 'YMCA of Columbia-Willamette',
      sportName: 'Volleyball',
      formatLabel: 'Youth volleyball camps and sessions',
      city: 'Sherwood, OR',
      venueName: 'Sherwood Regional Family YMCA',
      address: '23000 SW Pacific Hwy, Sherwood, OR 97140',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The public YMCA page describes various volleyball camps and sessions at Sherwood Regional Family YMCA. Current dates should be confirmed through the official YMCA registration link.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Youth camps and sessions; check YMCA registration for current dates',
      skillLevel: 'Fundamentals, serving, passing, hitting, and gameplay',
      ageGroup: 'Youth',
      divisionText: 'Youth volleyball camps and sessions',
      participantOptionsText: 'Individual registration through the official YMCA registration system.',
      priceText: null,
      statusText: 'Current dates, availability, and price are listed in YMCA registration rather than on the public page.',
      description: 'YMCA Columbia-Willamette describes Sherwood Regional Family YMCA volleyball programming as youth camps and sessions where participants learn volleyball fundamentals, passing, hitting, serving, and gameplay.',
      divisions: [
        youthDivision('Youth Volleyball Camps and Sessions', 'c_u14_camps_sessions'),
      ],
      warnings: [
        'Daxko robots.txt disallows scraping, so the Daxko URL is outbound-only.',
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
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/svg+xml';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'ymca-columbia-willamette-logo.svg',
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
      originalName: 'ymca-columbia-willamette-logo.svg',
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
      originalName: 'ymca-columbia-willamette-logo.svg',
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
    select: { coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates('Portland, OR')
    ?? existing?.coordinates
    ?? null;

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'YMCA of Columbia-Willamette',
      location: 'Portland metro and SW Washington',
      address: 'Portland, OR',
      description: 'YMCA of Columbia-Willamette operates community centers and youth sports programs across the Portland metro area and Southwest Washington, including volleyball, basketball, pickleball, camps, clinics, and youth development programs.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Volleyball', 'Basketball', 'Pickleball'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'YMCA of Columbia-Willamette',
      location: 'Portland metro and SW Washington',
      address: 'Portland, OR',
      description: 'YMCA of Columbia-Willamette operates community centers and youth sports programs across the Portland metro area and Southwest Washington, including volleyball, basketball, pickleball, camps, clinics, and youth development programs.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Volleyball', 'Basketball', 'Pickleball'],
      status: 'UNLISTED',
      coordinates,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'YMCA Columbia-Willamette Volleyball Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual no-fixed-date source for public YMCA volleyball program summaries. Daxko registration paths are robots-blocked and preserved only as outbound action URLs.',
    metadata: {
      inspectedAt: '2026-07-06',
      ymcaRobotsAllowed: true,
      ymcaRobotsNote: 'YMCA public sports/volleyball page is allowed; Drupal admin/login/search paths are disallowed and not used.',
      daxkoRobotsAllowed: false,
      daxkoRobotsNote: 'operations.daxko.com robots.txt disallows /, so Daxko registration links are outbound-only and not scraped.',
      logoSourceUrl: LOGO_SOURCE_URL,
      limitations: [
        'The public page does not expose current prices.',
        'Clark County YMCA has a stale 2025 visible schedule line, so its candidate is no-fixed-date and review-only until registration is confirmed.',
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
      notes: 'Manual YMCA volleyball program mapping with outbound Daxko registration links only.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual YMCA volleyball program mapping with outbound Daxko registration links only.',
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

  console.log(`YMCA Columbia-Willamette volleyball affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-ymca-cw-volleyball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
