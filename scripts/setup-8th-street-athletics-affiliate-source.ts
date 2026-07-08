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
const ORG_ID = 'affiliate_org_8th_street_athletics';
const LOGO_FILE_ID = 'affiliate_file_8th_street_athletics_logo';
const SOURCE_ID = 'affiliate_source_8th_street_athletics_programs';
const SOURCE_KEY = '8th-street-athletics-programs';
const MAPPING_ID = 'affiliate_source_8th_street_athletics_programs_mapping_v1';
const ATHLETICS_URL = 'https://www.8thstreetacademy.org/athletics';
const PLAYPASS_DISCOVERY_URL = 'https://playpass.com/gresham-or/volleyball';
const COED_CAMP_URL = 'https://playpass.com/8thStreetAthletics/coed-1st-4th-grade-summer-volleyball-camp-AbMoq9H';
const GIRLS_CAMP_URL = 'https://playpass.com/8thStreetAthletics/girls-5th-8th-grade-summer-volleyball-camp-AWtaFJY';
const LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/60d270456ef0d67691794d22/cf4e92b5-9a05-43ba-8c5d-8cb82a05ba1b/favicon.ico?format=100w';
const ADDRESS = '3333 NE 8th St, Gresham, OR 97030';
const PUBLIC_SLUG = '8th-street-athletics';
const ORGANIZER_DESCRIPTION = '8th Street Athletics is the athletics program at 8th Street Academy in Gresham, offering youth sports programs and gym rental for volleyball, basketball, and pickleball use.';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: ATHLETICS_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: '8th Street Athletics Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: ATHLETICS_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Coed 1st-4th Grade Summer Volleyball Camp',
      officialActionUrl: COED_CAMP_URL,
      sourceUrl: COED_CAMP_URL,
      organizerName: '8th Street Athletics',
      sportName: 'Volleyball',
      formatLabel: 'Volleyball camp',
      city: 'Gresham, OR',
      venueName: '8th Street Academy',
      address: ADDRESS,
      startsAt: '2026-08-11T09:00:00-07:00',
      endsAt: '2026-08-13T10:30:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 11-13, 2026, 9:00-10:30 AM.',
      skillLevel: 'Beginner and all skill levels',
      ageGroup: '1st-4th grade',
      divisionText: 'Coed 1st-4th Grade',
      participantOptionsText: 'Individual camp registration through the official 8th Street Athletics Playpass page.',
      priceText: '$50',
      statusText: 'Spots are limited. Early-bird pricing ended June 30.',
      description: '8th Street Athletics describes this coed summer volleyball camp for 1st-4th graders as a beginner-friendly morning program focused on passing, setting, serving, teamwork, age-appropriate drills, and games. The source lists early-bird pricing at $40 through June 30 and $50 after.',
    },
    {
      listingKind: 'EVENT',
      title: 'Girls 5th-8th Grade Summer Volleyball Camp',
      officialActionUrl: GIRLS_CAMP_URL,
      sourceUrl: GIRLS_CAMP_URL,
      organizerName: '8th Street Athletics',
      sportName: 'Volleyball',
      formatLabel: 'Volleyball camp',
      city: 'Gresham, OR',
      venueName: '8th Street Academy',
      address: ADDRESS,
      startsAt: '2026-08-11T11:00:00-07:00',
      endsAt: '2026-08-13T13:30:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 11-13, 2026, 11:00 AM-1:30 PM.',
      skillLevel: 'All skill levels',
      ageGroup: '5th-8th grade',
      divisionText: 'Girls 5th-8th Grade',
      participantOptionsText: 'Individual camp registration through the official 8th Street Athletics Playpass page.',
      priceText: '$75',
      statusText: 'Spots are limited. Early-bird pricing ended June 30.',
      description: '8th Street Athletics describes this girls summer volleyball camp for 5th-8th graders as a skill-development session led by multiple experienced coaches, with drills, game play, and team dynamics as a focus. The source lists early-bird pricing at $60 through June 30, regular pricing at $75, and a possible $5 discount for players who volunteer with the younger camp.',
    },
    {
      listingKind: 'RENTAL',
      title: '8th Street Academy Gym Rental',
      officialActionUrl: ATHLETICS_URL,
      sourceUrl: ATHLETICS_URL,
      organizerName: '8th Street Athletics',
      sportName: 'Basketball',
      formatLabel: 'Gym rental',
      city: 'Gresham, OR',
      venueName: '8th Street Academy',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Email 8th Street Academy from the official athletics page to ask about gym-rental availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Request gym availability',
      participantOptionsText: 'Gym rental for volleyball, basketball, and pickleball use.',
      priceText: '$65/hour',
      statusText: 'Availability is by request through 8th Street Academy.',
      description: 'The 8th Street Academy athletics page lists gym rental for volleyball, basketball, and pickleball use at $65 per hour, with inquiries handled through the official page.',
      warnings: [
        'Stored as a rental link-out because the source does not publish a crawlable gym availability calendar.',
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
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
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
    originalName: '8th-street-athletics-logo.ico',
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
      originalName: '8th-street-athletics-logo.ico',
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
      originalName: '8th-street-athletics-logo.ico',
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
  const coordinates = await geocodeAddressToCoordinates(ADDRESS)
    ?? existing?.coordinates
    ?? null;
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Volleyball', 'Basketball', 'Pickleball']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: '8th Street Athletics',
      location: 'Gresham, OR',
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: ATHLETICS_URL,
      sports,
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: '8th Street Athletics programs',
      publicIntroText: 'Find 8th Street Athletics youth sports programs, camps, and gym rental links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: '8th Street Athletics',
      location: 'Gresham, OR',
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: ATHLETICS_URL,
      sports,
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: '8th Street Athletics programs',
      publicIntroText: 'Find 8th Street Athletics youth sports programs, camps, and gym rental links.',
      coordinates,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: '8th Street Athletics Programs and Gym Rental',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.8thstreetacademy.org/',
    listUrl: ATHLETICS_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual program/rental source from 8th Street Academy athletics page plus current 8th Street Athletics Playpass event details. Playpass discovery is used only to identify organizer-owned current rows, not as a generic aggregator scrape.',
    metadata: {
      inspectedAt: '2026-07-06',
      officialSiteRobotsAllowed: true,
      officialSiteRobotsNote: 'Squarespace public athletics page is allowed; internal config/search/account/API/static paths are disallowed and not used.',
      playpassRobotsAllowed: true,
      playpassRobotsNote: 'Playpass disallows /activities/, /organizers/, dashboard, users, terms, privacy, and legal paths. The public custom organizer/event URLs used here are not disallowed.',
      discoveryUrl: PLAYPASS_DISCOVERY_URL,
      logoSourceUrl: LOGO_SOURCE_URL,
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
      notes: 'Manual 8th Street Athletics current volleyball camp and gym rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual 8th Street Athletics current volleyball camp and gym rental mapping.',
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

  console.log(`8th Street Athletics affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-8th-street-athletics-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
