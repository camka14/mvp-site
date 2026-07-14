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
const ORG_ID = 'affiliate_org_tualatin_indoor_soccer';
const LOGO_FILE_ID = 'affiliate_file_tualatin_indoor_soccer_logo';
const SOURCE_ID = 'affiliate_source_tualatin_indoor_soccer_programs';
const SOURCE_KEY = 'tualatin-indoor-soccer-programs';
const MAPPING_ID = 'affiliate_source_tualatin_indoor_soccer_programs_mapping_v1';
const HOME_URL = 'https://www.tualatinindoor.com/';
const ADULT_URL = 'https://www.tualatinindoor.com/schedules/adult-league-information';
const ADULT_REGISTRATION_URL = 'https://www.tualatinindoor.com/registration/adult-team-registration';
const SOCCERKIDS_URL = 'https://www.tualatinindoor.com/schedules/soccerkids-information';
const SOCCERKIDS_REGISTRATION_URL = 'https://www.tualatinindoor.com/registration/soccerkids-registration';
const LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/56ddfbf4d28ecefc22b3c1be/56ddfbf4d28ecefc22b3c1d1_tis_webclip.png';
const ADDRESS = '11883 SW Itel Rd, Tualatin, OR 97062';

const ADULT_LEAGUE_PRICE_CENTS = 135000;
const SOCCERKIDS_PRICE_CENTS = 22500;

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Tualatin Indoor Soccer Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Tualatin Indoor Soccer Adult Indoor League',
      officialActionUrl: ADULT_REGISTRATION_URL,
      sourceUrl: ADULT_URL,
      organizerName: 'Tualatin Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult indoor soccer league',
      city: 'Tualatin, OR',
      venueName: 'Tualatin Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Summer 2026 adult league play began the week of June 15-21. Divisions include Men Open, Men O30, Coed, and Coed O30 schedule groups.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Seasonal adult indoor league registration',
      skillLevel: 'Open and age-group adult divisions',
      ageGroup: 'Adult; high-school players may be eligible for adult divisions under source rules',
      divisionText: 'Men Open; Men O30; Coed; Coed O30',
      participantOptionsText: 'Team registration through the official Tualatin Indoor Soccer adult team registration form.',
      priceText: '$1,350/team',
      statusText: 'The current Summer 2026 session has already started; use the official page to confirm next-session placement.',
      description: 'Tualatin Indoor Soccer lists a Summer 2026 adult indoor league with 10 or more games, two 22-minute halves, and team placement after the completed registration form is received. The source lists a $1,200 team fee plus $150 referee fee, for a $1,350 total team fee. Adult player cards are listed separately at $25 for 2025-26 and one-time day passes are listed at $5; those side fees remain in the details instead of the headline price.',
      divisions: [
        {
          name: 'Men Open',
          key: 'm_skill_open',
          gender: 'M',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          priceCents: ADULT_LEAGUE_PRICE_CENTS,
          maxParticipants: null,
        },
        {
          name: 'Men O30',
          key: 'm_age_30plus',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '30plus',
          priceCents: ADULT_LEAGUE_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '30+',
          ageCutoffSource: 'Tualatin Indoor Soccer Summer 2026 schedule group',
        },
        {
          name: 'Coed',
          key: 'c_skill_coed',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'COED',
          priceCents: ADULT_LEAGUE_PRICE_CENTS,
          maxParticipants: null,
        },
        {
          name: 'Coed O30',
          key: 'c_age_30plus',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '30plus',
          priceCents: ADULT_LEAGUE_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '30+',
          ageCutoffSource: 'Tualatin Indoor Soccer Summer 2026 schedule group',
        },
      ],
      warnings: [
        'Stored as a no-fixed-date affiliate event because the current posted Summer 2026 league started before 2026-07-06.',
        'Schedule links are league fixtures and are not imported as public registration events.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Tualatin Indoor Soccer SoccerKids Classes',
      officialActionUrl: SOCCERKIDS_REGISTRATION_URL,
      sourceUrl: SOCCERKIDS_URL,
      organizerName: 'Tualatin Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Youth soccer classes',
      city: 'Tualatin, OR',
      venueName: 'Tualatin Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Summer 2026 Saturday classes run June 27-August 29 with no class on July 4.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Summer Saturday youth classes through August 29',
      skillLevel: 'Youth beginner to advanced classes',
      ageGroup: '18 months through 9+',
      divisionText: 'Toddler Time; Pre-SoccerKids; Junior SoccerKids; Skills & Scrimmage; Advanced Academy',
      participantOptionsText: 'Individual child registration through the official SoccerKids registration form.',
      priceText: '$225',
      statusText: 'The source says Summer 2026 individual class registration is open.',
      description: 'Tualatin Indoor Soccer lists Summer 2026 SoccerKids classes on Saturdays only, starting June 27 and ending August 29, with no class on July 4. The source lists 9 classes for $225 and offers age-based classes from Toddler Time through Advanced Academy.',
      divisions: [
        {
          name: 'Toddler Time 18-36 months',
          key: 'c_age_u3_toddler_time',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u3',
          priceCents: SOCCERKIDS_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '18-36 months',
          ageCutoffSource: 'Tualatin Indoor Soccer SoccerKids page',
        },
        {
          name: 'Pre-SoccerKids 3-4 years',
          key: 'c_age_u4_pre_soccerkids',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u4',
          priceCents: SOCCERKIDS_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '3-4 years',
          ageCutoffSource: 'Tualatin Indoor Soccer SoccerKids page',
        },
        {
          name: 'Junior SoccerKids 5-6 years',
          key: 'c_age_u6_junior_soccerkids',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u6',
          priceCents: SOCCERKIDS_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '5-6 years',
          ageCutoffSource: 'Tualatin Indoor Soccer SoccerKids page',
        },
        {
          name: 'Skills & Scrimmage 7-11 years',
          key: 'c_age_u11_skills_scrimmage',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u11',
          priceCents: SOCCERKIDS_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '7-11 years',
          ageCutoffSource: 'Tualatin Indoor Soccer SoccerKids page',
        },
        {
          name: 'Advanced Academy 9+',
          key: 'c_age_9plus_advanced_academy',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '9plus',
          priceCents: SOCCERKIDS_PRICE_CENTS,
          maxParticipants: null,
          ageCutoffLabel: '9+',
          ageCutoffSource: 'Tualatin Indoor Soccer SoccerKids page',
        },
      ],
      warnings: [
        'Stored as a no-fixed-date class summary because the current Summer 2026 session started before 2026-07-06, even though the source still says registration is open.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'Tualatin Indoor Soccer Field Rentals',
      officialActionUrl: HOME_URL,
      sourceUrl: HOME_URL,
      organizerName: 'Tualatin Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor turf field rental',
      city: 'Tualatin, OR',
      venueName: 'Tualatin Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'June 2026 source availability lists Monday-Thursday before 6:15 PM, Friday before 7:00 PM, Saturday noon-close, and Sunday 9:00 AM-noon.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Call or email for current field availability',
      participantOptionsText: 'Private field rental and party inquiries by phone or email.',
      priceText: '$175/hour',
      statusText: 'Availability is first come, first served and changes by month.',
      description: 'Tualatin Indoor Soccer lists private field rental at $175 per hour and asks renters to call 503-885-9300 or email fyi@tualatinindoor.com with requests. The source describes an indoor turf field, seating for 100+ spectators, private parties, and soccer programs for all ages.',
      warnings: [
        'Stored as a rental link-out because the source does not publish a live rental calendar.',
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
    originalName: 'tualatin-indoor-soccer-logo.png',
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
      originalName: 'tualatin-indoor-soccer-logo.png',
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
      originalName: 'tualatin-indoor-soccer-logo.png',
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
      name: 'Tualatin Indoor Soccer',
      location: 'Tualatin, OR',
      address: ADDRESS,
      description: 'Tualatin Indoor Soccer runs adult indoor soccer leagues, youth SoccerKids classes, field rentals, parties, and related indoor soccer programs in Tualatin.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
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
      name: 'Tualatin Indoor Soccer',
      location: 'Tualatin, OR',
      address: ADDRESS,
      description: 'Tualatin Indoor Soccer runs adult indoor soccer leagues, youth SoccerKids classes, field rentals, parties, and related indoor soccer programs in Tualatin.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
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
    name: 'Tualatin Indoor Soccer Programs and Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual evergreen program/rental source from public Webflow pages. Public robots.txt only lists a sitemap and no disallow rules.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'robots.txt only publishes a sitemap and no disallow rules.',
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
      notes: 'Manual Tualatin Indoor Soccer program and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Tualatin Indoor Soccer program and rental mapping.',
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

  console.log(`Tualatin Indoor Soccer affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-tualatin-indoor-soccer-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
