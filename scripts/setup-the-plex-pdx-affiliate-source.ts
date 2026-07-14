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
const ORG_ID = 'affiliate_org_the_plex_pdx';
const LOGO_FILE_ID = 'affiliate_file_the_plex_pdx_logo';
const SOURCE_ID = 'affiliate_source_the_plex_pdx_programs';
const SOURCE_KEY = 'the-plex-pdx-programs';
const MAPPING_ID = 'affiliate_mapping_the_plex_pdx_programs_v1';
const BASE_URL = 'https://www.theplexpdx.com';
const LIST_URL = 'https://www.theplexpdx.com/';
const ADULTS_URL = 'https://www.theplexpdx.com/adults';
const RENTALS_URL = 'https://www.theplexpdx.com/rentals';
const ROBOTS_URL = 'https://www.theplexpdx.com/robots.txt';
const ADULT_REGISTRATION_URL = 'https://apps.daysmartrecreation.com/dash/index.php?Action=ProgramFinder%2Findex&company=portlandindoor&facilityID=3&seasonID=412';
const LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/5a6a4dacbff20056810d674a/1525285099767-APSSEHCC60GVBOQ1VEC6/Plex_logo.png?format=1500w';
const FACILITY_ADDRESS = '8785 SW Beaverton Hillsdale Hwy, Portland, OR 97225';
const ORG_SPORTS = ['Indoor Soccer', 'Grass Soccer', 'Dodgeball', 'Flag Football'];
const TEAM_PRICE_CENTS = 123000;

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'The Plex PDX Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: ADULT_REGISTRATION_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'The Plex Adult Indoor Soccer Leagues',
      officialActionUrl: ADULT_REGISTRATION_URL,
      sourceUrl: ADULTS_URL,
      organizerName: 'The Plex',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult soccer league',
      city: 'Portland, OR',
      venueName: 'The Plex - Indoor Sports Arena',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Adult Coed Weekday games are played Mondays, Tuesdays, and Wednesdays between 6:10 PM and 10:20 PM. Adult Men games are played Thursdays and Fridays between 6:10 PM and 11:10 PM. Adult Coed Weekend games are played Saturdays and Sundays between 1:10 PM and 10:30 PM.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Seasonal adult league registration',
      skillLevel: 'Recreational',
      ageGroup: 'Adult',
      divisionText: 'Adult Coed Weekday, Adult Men, Adult Coed Weekend',
      participantOptionsText: 'Team registration through DASH. The Plex says teams register online, submit schedule requests, and commit to all scheduled game times and days.',
      priceText: '$1,230 per team',
      statusText: 'Registration is handled by The Plex through DASH/DaySmart.',
      description: 'The Plex offers adult recreational indoor soccer leagues for teams and individual players looking to get back in the game. The source lists Adult Coed Weekday, Adult Men, and Adult Coed Weekend leagues, with 10-game seasons and team registration through DASH. Team managers pay a minimum non-refundable deposit at registration and balances are paid during the season. Players also need a facility membership, and referee fees are paid directly before games; those additional details are source terms and are not included in the headline event price.',
      divisions: [
        {
          name: 'Adult Coed Weekday',
          key: 'c_skill_adult_coed_weekday',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'COED',
          priceCents: TEAM_PRICE_CENTS,
          maxParticipants: null,
        },
        {
          name: 'Adult Men',
          key: 'm_skill_adult_men',
          gender: 'M',
          ratingType: 'SKILL',
          divisionTypeId: 'MENS',
          priceCents: TEAM_PRICE_CENTS,
          maxParticipants: null,
        },
        {
          name: 'Adult Coed Weekend',
          key: 'c_skill_adult_coed_weekend',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'COED',
          priceCents: TEAM_PRICE_CENTS,
          maxParticipants: null,
        },
      ],
      warnings: [
        'Stored as a no-fixed-date affiliate event because the public page describes active seasonal leagues but does not expose a reliable future season start date on the source page.',
        'The $20 facility membership and $12 referee fee per team per game are kept in the description/details, not as the headline event price.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'The Plex Field Rentals and Birthday Parties',
      officialActionUrl: RENTALS_URL,
      sourceUrl: RENTALS_URL,
      organizerName: 'The Plex',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor turf field rental',
      city: 'Portland, OR',
      venueName: 'The Plex - Indoor Sports Arena',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Contact The Plex to reserve main-field, second-field, birthday-party, private-party, team-practice, and related rental time.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Contact facility to reserve',
      participantOptionsText: 'Rental options include the 185 x 85 main indoor turf field, the 88 x 36 second field, birthday packages, team practices, private parties, and other facility rentals.',
      priceText: 'Second field rentals are $100 per hour and main field rentals are $200 per hour. Birthday packages are listed at $300-$400 depending on field choice.',
      statusText: 'Official rental questions and reservations are handled directly by The Plex.',
      description: 'The Plex rental page lists a fully enclosed 185 x 85 main indoor turf field and an 88 x 36 second indoor turf field for birthdays, private parties, team practices, and more. Public pricing on the source page lists main field rentals at $200 per hour, second field rentals at $100 per hour, and a $25 non-refundable field-rental deposit at booking. Birthday packages include 2 hours of field space, party space, and a game coordinator, with listed package prices of $300 for the second field and $400 for the main field.',
      warnings: [
        'Stored as a rental/facility link-out because the public page gives rental options and pricing but does not expose live availability to BracketIQ.',
        'The source asks users to contact the facility for rental reservations, so the official action URL remains the rental information page.',
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
    originalName: 'the-plex-pdx-logo.png',
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
      originalName: 'the-plex-pdx-logo.png',
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
      originalName: 'the-plex-pdx-logo.png',
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
      name: 'The Plex',
      location: 'Portland, OR',
      address: FACILITY_ADDRESS,
      description: 'The Plex is an indoor sports arena in Southwest Portland offering adult recreational soccer leagues, youth soccer programs, summer camps, field rentals, birthday parties, private parties, and team-practice rentals.',
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
      name: 'The Plex',
      location: 'Portland, OR',
      address: FACILITY_ADDRESS,
      description: 'The Plex is an indoor sports arena in Southwest Portland offering adult recreational soccer leagues, youth soccer programs, summer camps, field rentals, birthday parties, private parties, and team-practice rentals.',
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
    name: 'The Plex PDX Programs and Rentals',
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual mixed source. The public Squarespace pages describe evergreen adult leagues and field rentals; DASH/DaySmart handles registration and live availability outside BracketIQ.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsUrl: ROBOTS_URL,
      robotsNote: 'Squarespace robots.txt allows public pages used by this source and disallows /config, /search, /account, /api, /static, and certain query formats. This source does not use blocked paths.',
      adultsUrl: ADULTS_URL,
      rentalsUrl: RENTALS_URL,
      adultRegistrationUrl: ADULT_REGISTRATION_URL,
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
      notes: 'Manual mixed mapping for The Plex adult indoor soccer league and field-rental link-outs.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual mixed mapping for The Plex adult indoor soccer league and field-rental link-outs.',
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

  console.log(`The Plex PDX affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-the-plex-pdx-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
