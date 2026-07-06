import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

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
const ORG_ID = 'affiliate_org_salmon_creek_indoor';
const LOGO_FILE_ID = 'affiliate_file_salmon_creek_indoor_logo';
const SOURCE_ID = 'affiliate_source_salmon_creek_indoor_programs';
const SOURCE_KEY = 'salmon-creek-indoor-programs';
const MAPPING_ID = 'affiliate_source_salmon_creek_indoor_programs_mapping_v1';
const HOME_URL = 'https://www.scsoccerarena.com/';
const LEAGUES_URL = 'https://www.scsoccerarena.com/leagues.html';
const ADULT_INDIVIDUAL_URL = 'https://www.scsoccerarena.com/individual-registration.html';
const DROP_IN_URL = 'https://www.scsoccerarena.com/soccer-drop-in.html';
const YOUTH_WINTER_URL = 'https://www.scsoccerarena.com/youth-winter-leagues.html';
const LIL_KICKERS_URL = 'https://www.scsoccerarena.com/lil-kickers.html';
const FIELD_RENTALS_URL = 'https://www.scsoccerarena.com/field-rentals.html';
const PARTIES_URL = 'https://www.scsoccerarena.com/parties.html';
const ADDRESS = '110 NW 139th St, Vancouver, WA 98685';

const svgLogo = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 360" role="img" aria-labelledby="title desc">
  <title id="title">Salmon Creek Indoor Sports</title>
  <desc id="desc">Recreated green and white Salmon Creek Indoor Sports wordmark with soccer ball.</desc>
  <rect width="960" height="360" fill="#173c2b"/>
  <path d="M132 88c94-54 237-62 358-15 98 38 194 37 308-3-64 62-186 89-303 58-133-35-250-29-363 25z" fill="#35a857"/>
  <g transform="translate(760 70)">
    <circle cx="90" cy="90" r="73" fill="#f8faf7" stroke="#0b0f0c" stroke-width="14"/>
    <polygon points="90,34 121,58 109,96 71,96 59,58" fill="#0b0f0c"/>
    <polygon points="36,93 62,112 53,146 21,131" fill="#0b0f0c"/>
    <polygon points="144,93 159,131 127,146 118,112" fill="#0b0f0c"/>
    <polygon points="70,156 110,156 123,184 57,184" fill="#0b0f0c"/>
  </g>
  <text x="70" y="162" font-family="Arial Black, Impact, sans-serif" font-size="76" fill="#ffffff" letter-spacing="2">SALMON CREEK</text>
  <text x="78" y="238" font-family="Arial Black, Impact, sans-serif" font-size="58" fill="#ffffff" letter-spacing="4">INDOOR SPORTS</text>
  <rect x="76" y="258" width="555" height="16" rx="8" fill="#35a857"/>
</svg>`;

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Salmon Creek Indoor manual source snapshot.</main></body></html>',
    };
  },
};

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LEAGUES_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Salmon Creek Indoor Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LEAGUES_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Salmon Creek Indoor Adult House Team Registration',
      officialActionUrl: ADULT_INDIVIDUAL_URL,
      sourceUrl: ADULT_INDIVIDUAL_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult house team registration',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Summer Session 2026 is listed as June 27 to September 4, with house-team starts on June 27, June 28, July 1, and July 2.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Current adult house-team session in progress',
      skillLevel: 'A, B, C, and D levels; recreational through competitive',
      ageGroup: 'Adult 16+',
      divisionText: "Women's B/C; Women's D; Coed B; Coed C; Coed D; Men's B; Men's C; Men's 40+ B; Men's 40+ C; Men's 30+; Coed 30+ B; Coed 30+ C",
      participantOptionsText: 'Individual players register for house teams or ask to be placed with private teams that need players.',
      priceText: '$126-$140',
      statusText: 'The source listed remaining spots on current Summer 2026 house teams, but the starts were already past on 2026-07-06.',
      description: 'Salmon Creek Indoor lets individual adult players sign up for house teams when they do not have a team. The source lists the Summer 2026 session as June 27 to September 4 with 9-game and 10-game house-team options, $126 to $140 per person, and a maximum of 13 players per house team. Adult divisions include women, men, coed, and 30+/40+ options across B, C, and D levels. The visible starts had already passed by 2026-07-06, so this row is stored as a no-fixed-date review summary instead of a scheduled event.',
      divisions: [
        {
          name: "Women's",
          key: 'f_skill_womens',
          gender: 'F',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          priceCents: 14000,
          maxParticipants: 13,
        },
        {
          name: "Men's",
          key: 'm_skill_mens',
          gender: 'M',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          priceCents: 14000,
          maxParticipants: 13,
        },
        {
          name: 'Coed',
          key: 'c_skill_coed',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'COED',
          priceCents: 12600,
          maxParticipants: 13,
        },
        {
          name: "Men's 30+",
          key: 'm_age_30plus',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '30plus',
          priceCents: 14000,
          maxParticipants: 13,
          ageCutoffLabel: '30+',
          ageCutoffSource: 'Salmon Creek Indoor individual registration page',
        },
        {
          name: "Men's 40+",
          key: 'm_age_40plus',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '40plus',
          priceCents: 14000,
          maxParticipants: 13,
          ageCutoffLabel: '40+',
          ageCutoffSource: 'Salmon Creek Indoor individual registration page',
        },
        {
          name: 'Coed 30+',
          key: 'c_age_30plus',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '30plus',
          priceCents: 14000,
          maxParticipants: 13,
          ageCutoffLabel: '30+',
          ageCutoffSource: 'Salmon Creek Indoor individual registration page',
        },
      ],
      warnings: [
        'Stored as a no-fixed-date summary because all visible Summer 2026 house-team starts were before 2026-07-06.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Salmon Creek Indoor Adult Drop-In Soccer',
      officialActionUrl: DROP_IN_URL,
      sourceUrl: DROP_IN_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Open play',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: "Women's drop-in: Fridays 9:30-11:00 AM. Coed drop-in: Fridays 12:00-1:30 PM and Saturdays 12:00-1:30 PM.",
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Friday and Saturday adult drop-in sessions',
      skillLevel: 'Beginner, intermediate, and advanced players welcome',
      ageGroup: '16+',
      participantOptionsText: 'Online registration required; teams are randomly formed by staff.',
      maxParticipantsText: '28 participants',
      priceText: '$10-$12',
      statusText: 'Sessions can be canceled due to participation, weather, or scheduling conflicts.',
      description: 'Salmon Creek Indoor lists adult drop-in soccer for women on Friday mornings and coed players on Friday and Saturday midday sessions. The source lists a $10 member rate, $12 non-member rate, a $100 ten-time pass for members, annual membership options of $30 individual or $60 family, and an online-registration cap of 28 participants. Players must be 16 or older, have an online account with a signed waiver, and play without referees.',
      warnings: [
        'Stored as ongoing because individual drop-in dates can change and are booked through the official registration flow.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Salmon Creek Indoor Winter 2026/27 Competitive Youth Leagues',
      officialActionUrl: YOUTH_WINTER_URL,
      sourceUrl: YOUTH_WINTER_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Youth indoor soccer league',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      startsAt: '2026-11-14T00:00:00-08:00',
      endsAt: '2027-02-14T23:59:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Winter 2026/27 season runs November 14, 2026 through February 14, 2027, with no games December 18-January 1 and games resuming January 2-3, 2027.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'November 14, 2026 - February 14, 2027',
      skillLevel: 'Competitive youth teams',
      ageGroup: 'U10, U12, and U14',
      divisionText: 'Boys U10; Boys U12; Boys U14; Girls U10; Girls U12; Girls U14',
      participantOptionsText: 'Team registration for competitive youth teams; team managers provide level of play during registration.',
      statusText: 'Registration opens at the beginning of September 2026; source lists team cost as TBD and requires a $200 deposit at registration.',
      registrationDeadlineText: 'Registration opens at the beginning of September 2026.',
      description: 'Salmon Creek Indoor lists Winter 2026/27 competitive youth leagues for U10, U12, and U14 boys and girls teams. The season runs November 14, 2026 to February 14, 2027, with a winter break from December 18 to January 1 and games resuming January 2 and 3, 2027. The source lists 12 games, primary Saturday play for boys, primary Sunday play for girls, possible mid-week games or double-headers, 7v7 for U10/U12, 6v6 for U14, and a $200 deposit at registration while full team cost is still TBD.',
      divisions: [
        {
          name: 'Boys U10',
          key: 'm_age_u10',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: 'u10',
          maxParticipants: null,
          ageCutoffLabel: 'U10',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
        {
          name: 'Boys U12',
          key: 'm_age_u12',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: 'u12',
          maxParticipants: null,
          ageCutoffLabel: 'U12',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
        {
          name: 'Boys U14',
          key: 'm_age_u14',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: 'u14',
          maxParticipants: null,
          ageCutoffLabel: 'U14',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
        {
          name: 'Girls U10',
          key: 'f_age_u10',
          gender: 'F',
          ratingType: 'AGE',
          divisionTypeId: 'u10',
          maxParticipants: null,
          ageCutoffLabel: 'U10',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
        {
          name: 'Girls U12',
          key: 'f_age_u12',
          gender: 'F',
          ratingType: 'AGE',
          divisionTypeId: 'u12',
          maxParticipants: null,
          ageCutoffLabel: 'U12',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
        {
          name: 'Girls U14',
          key: 'f_age_u14',
          gender: 'F',
          ratingType: 'AGE',
          divisionTypeId: 'u14',
          maxParticipants: null,
          ageCutoffLabel: 'U14',
          ageCutoffSource: 'Salmon Creek Indoor winter youth league page',
        },
      ],
      warnings: [
        'Team cost is TBD on the public source page, so headline price is left unspecified and the $200 deposit remains in the details.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: "Salmon Creek Indoor Lil' Kickers and Skills Institute",
      officialActionUrl: LIL_KICKERS_URL,
      sourceUrl: LIL_KICKERS_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Youth soccer classes',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Summer 2026 session is listed as June 27-August 30 with open enrollment and prorated class fees.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Youth soccer classes with open enrollment',
      skillLevel: 'Developmental youth soccer classes',
      ageGroup: '18 months to 12 years',
      divisionText: "Lil' Kickers; Skills Institute",
      participantOptionsText: 'Register for the current session or book a free class through the official page.',
      statusText: 'The current Summer 2026 session already started, but the source says open enrollment is available with prorated fees.',
      description: "Salmon Creek Indoor offers Lil' Kickers and Skills Institute youth soccer classes. The source lists a Summer 2026 session from June 27 to August 30, says classes are open-enrollment with prorated fees after the start date, and describes Lil' Kickers for children 18 months to 9 years plus Skills Institute for children ages 5 to 12. No current public class price was visible in the crawlable page text, so headline price is left unspecified.",
      divisions: [
        {
          name: "Lil' Kickers",
          key: 'c_age_lil_kickers',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u9',
          maxParticipants: null,
          ageCutoffLabel: '18 months-9 years',
          ageCutoffSource: "Salmon Creek Indoor Lil' Kickers page",
        },
        {
          name: 'Skills Institute',
          key: 'c_age_skills_institute',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u12',
          maxParticipants: null,
          ageCutoffLabel: '5-12 years',
          ageCutoffSource: "Salmon Creek Indoor Lil' Kickers page",
        },
      ],
      warnings: [
        'Stored as a no-fixed-date class summary because the current session started before 2026-07-06 and the source says open enrollment remains available.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'Salmon Creek Indoor Field Rentals',
      officialActionUrl: FIELD_RENTALS_URL,
      sourceUrl: FIELD_RENTALS_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor turf field rental',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Field rental availability changes by season and facility programming; online booking and inquiry are available through the official field-rentals page.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Book online or inquire for current field availability',
      participantOptionsText: 'West Field is listed at 153 x 74 feet and East Field at 153 x 75 feet.',
      priceText: '$110-$150/hour',
      statusText: 'Pricing updated April 22, 2026 on the source page.',
      description: 'Salmon Creek Indoor offers indoor field rentals on two turf fields for practices, small-sided games, and recreational play. The source lists West Field at 153 x 74 feet and East Field at 153 x 75 feet. Field rentals are priced per 60-minute increment: $110/hour off-peak on weekdays before 3:30 PM, $135/hour weekdays 3:30-5:30 PM, and $150/hour weekdays after 5:30 PM plus weekends. Customers need an account with a digitally signed waiver before booking field time.',
      warnings: [
        'Stored as a rental link-out because detailed live availability remains in the official booking flow.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'Salmon Creek Indoor Birthday Parties',
      officialActionUrl: PARTIES_URL,
      sourceUrl: PARTIES_URL,
      organizerName: 'Salmon Creek Indoor',
      sportName: 'Indoor Soccer',
      formatLabel: 'Sports party rental',
      city: 'Vancouver, WA',
      venueName: 'Salmon Creek Indoor Sports Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Party packages are available year-round and subject to facility availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Year-round party packages by availability',
      participantOptionsText: 'Party package includes one hour of field rental and one hour in the back party room for 10-15 kids.',
      priceText: '$300',
      statusText: 'Front party room add-on for 15-25 kids is listed separately at $75.',
      description: 'Salmon Creek Indoor lists a $300 party package with one hour of field rental and one hour in the back party room for 10-15 kids. The larger front party room for 15-25 kids is an additional $75. The source says soccer balls, dodgeballs, two pop-up Pugg goals, colored pennies, and cones are provided; outside food and non-alcoholic drinks are allowed; and full payment is required at booking.',
      warnings: [
        'Stored as a rental link-out because parties are booked by request and subject to availability.',
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

const upsertLogo = async (ownerId: string) => {
  const data = Buffer.from(svgLogo);
  const contentType = 'image/svg+xml';
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'salmon-creek-indoor-logo.svg',
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
      originalName: 'salmon-creek-indoor-logo.svg',
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
      originalName: 'salmon-creek-indoor-logo.svg',
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
      name: 'Salmon Creek Indoor',
      location: 'Vancouver, WA',
      address: ADDRESS,
      description: 'Salmon Creek Indoor is a Vancouver indoor soccer facility with adult and youth leagues, drop-in soccer, youth classes, camps, field rentals, parties, and team events.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Salmon Creek Indoor',
      location: 'Vancouver, WA',
      address: ADDRESS,
      description: 'Salmon Creek Indoor is a Vancouver indoor soccer facility with adult and youth leagues, drop-in soccer, youth classes, camps, field rentals, parties, and team events.',
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
    name: 'Salmon Creek Indoor Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LEAGUES_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual Salmon Creek Indoor source from official public pages. Do not import discontinued pickleball drop-in.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: null,
      robotsNote: 'robots.txt returned 403/openresty from local inspection; no disallow rule was identified. Public pages were available through browser/search index and are official Salmon Creek pages.',
      logoNote: 'Direct logo asset was not reliably fetchable from the blocked host, so the private source org uses a recreated SVG wordmark based on the visible Salmon Creek Indoor Sports branding.',
      scrapeFetchNote: 'The host returned 403/500-style responses through local and ScrapingDog fetches during setup, so the setup script uses a static manual snapshot for local candidate validation. Official source/action URLs remain the Salmon Creek pages.',
      excludedPrograms: [
        'Pickleball drop-in: public page says sessions ended effective July 2, 2026.',
        'Current Summer 2026 adult house-team starts were before 2026-07-06, so they are no-fixed-date summaries instead of scheduled candidates.',
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
      notes: 'Manual Salmon Creek Indoor programs, drop-in, youth league, field rental, and party rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Salmon Creek Indoor programs, drop-in, youth league, field rental, and party rental mapping.',
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

  console.log(`Salmon Creek Indoor affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
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
    console.error('[setup-salmon-creek-indoor-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
