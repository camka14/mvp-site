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
const ORG_ID = 'affiliate_org_mjcc_sportsplex';
const LOGO_FILE_ID = 'affiliate_file_mjcc_sportsplex_logo';
const SOURCE_ID = 'affiliate_source_mjcc_sportsplex_programs';
const SOURCE_KEY = 'mjcc-sportsplex-programs';
const MAPPING_ID = 'affiliate_source_mjcc_sportsplex_programs_mapping_v1';
const LEAGUE_URL = 'https://www.oregonjcc.org/sports/indoor-soccer/adult-leagues-info';
const REGISTRATION_URL = 'https://www.oregonjcc.org/sports/indoor-soccer/adult-leagues-info/soccer-registration-form';
const RENTAL_URL = 'https://www.oregonjcc.org/sports/rent-the-sportsplex';
const LOGO_SOURCE_URL = 'https://www.oregonjcc.org/uploaded/themes/MJCC_2015_default/images/mjcc_logo.png';
const ADDRESS = '6651 SW Capitol Highway, Portland, OR 97219';

const LEAGUE_PRICE_CENTS = 72500;

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LEAGUE_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'MJCC Sportsplex Indoor Soccer Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: REGISTRATION_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'MJCC Sportsplex Adult Co-ed Indoor Soccer League',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: LEAGUE_URL,
      organizerName: 'Mittleman Jewish Community Center',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult co-ed indoor soccer league',
      city: 'Portland, OR',
      venueName: 'MJCC Sportsplex',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sessions run about every eight weeks. The current public page lists a Summer Session from July 7-August 26 and adult night choices of Sunday, Tuesday, and Wednesday.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Seasonal adult co-ed league sessions',
      skillLevel: 'Recreational to competitive co-ed',
      ageGroup: 'Adult',
      divisionText: 'Adult co-ed',
      participantOptionsText: 'Team-captain registration through MJCC online registration. Free agents can email the Soccer Coordinator for help finding a team.',
      priceText: '$725/team',
      statusText: 'Current-session registration closes seven days before the first game, so verify the next open session on the official registration page.',
      description: 'MJCC Sportsplex runs adult co-ed indoor soccer leagues in its climate-controlled indoor soccer facility. The source says sessions usually run every eight weeks, with games made up of two 22-minute halves and six players on the field at once. The listed 8-week adult session fee is $725 per team including referee fees. A $100 deposit is due at registration, each player needs a $10 annual waiver, and late balances can incur a $50 charge; those extra terms stay in the details rather than the headline price.',
      divisions: [
        {
          name: 'Adult Co-ed',
          key: 'c_age_adult_coed',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '18plus',
          priceCents: LEAGUE_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: 'Adult',
          ageCutoffSource: 'MJCC adult leagues page',
        },
      ],
      warnings: [
        'Stored as a no-fixed-date affiliate event because the public page describes recurring sessions but the current posted Summer Session registration deadline has passed as of 2026-07-06.',
        'Do not import schedule-page games as public affiliate events; they are league fixtures, not registration opportunities.',
        'Daxko registration itself is not scraped because MJCC robots.txt disallows /daxko; the official MJCC registration instructions page is preserved as the action URL.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'MJCC Sportsplex Rental',
      officialActionUrl: RENTAL_URL,
      sourceUrl: RENTAL_URL,
      organizerName: 'Mittleman Jewish Community Center',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor field and sportsplex rental',
      city: 'Portland, OR',
      venueName: 'MJCC Sportsplex',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Use the official MJCC Sportsplex rental page to inquire about availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Inquire for rental availability',
      participantOptionsText: 'Sportsplex rental options include multi-purpose indoor field space for soccer, lacrosse, softball, kickball, and related uses, plus small side turf and nearby MJCC rental spaces.',
      statusText: 'The source does not publish public rental pricing or real-time availability.',
      description: 'MJCC describes the Sportsplex, also known as The Bubble, as a multi-purpose indoor field space that supports soccer, lacrosse, softball, kickball, and similar activities. The rental page also lists a gymnastics area, small side turf, sound system, tables and chairs for party setups, climate control, parking, and related campus rental spaces.',
      warnings: [
        'Stored as a rental link-out because MJCC does not publish a crawlable rental availability calendar or public Sportsplex price table.',
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
    originalName: 'mjcc-sportsplex-logo.png',
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
      originalName: 'mjcc-sportsplex-logo.png',
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
      originalName: 'mjcc-sportsplex-logo.png',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Indoor Soccer']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Mittleman Jewish Community Center Sportsplex',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'The MJCC Sportsplex in Southwest Portland hosts indoor soccer leagues and multi-purpose indoor turf rentals for soccer, lacrosse, softball, kickball, and related activities.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LEAGUE_URL,
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
      name: 'Mittleman Jewish Community Center Sportsplex',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'The MJCC Sportsplex in Southwest Portland hosts indoor soccer leagues and multi-purpose indoor turf rentals for soccer, lacrosse, softball, kickball, and related activities.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LEAGUE_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
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
    name: 'MJCC Sportsplex Indoor Soccer and Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.oregonjcc.org',
    listUrl: LEAGUE_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual evergreen program/rental source from public Finalsite pages. Daxko registration is outbound only because robots.txt disallows /daxko.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'Finalsite robots.txt disallows /page.cfm, /fs/, /daxko, and several retired/private paths, but the adult league info, soccer registration instructions, and Sportsplex rental pages used by this source are allowed. Crawl-delay is 5.',
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
      notes: 'Manual MJCC Sportsplex evergreen league and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual MJCC Sportsplex evergreen league and rental mapping.',
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

  console.log(`MJCC Sportsplex affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-mjcc-sportsplex-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
