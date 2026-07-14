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
const ORG_ID = 'affiliate_org_cascade_athletic_clubs_gresham';
const LOGO_FILE_ID = 'affiliate_file_cascade_athletic_clubs_gresham_logo';
const SOURCE_ID = 'affiliate_source_cascade_athletic_clubs_gresham_sports_programs';
const SOURCE_KEY = 'cascade-athletic-clubs-gresham-sports-programs';
const MAPPING_ID = 'affiliate_mapping_cascade_athletic_clubs_gresham_sports_programs_v1';
const BASE_URL = 'https://cascadeac.com/';
const LIST_URL = 'https://cascadeac.com/gresham/sports-programs/';
const BASKETBALL_URL = 'https://cascadeac.com/gresham/sports-programs/basketball/';
const PICKLEBALL_URL = 'https://cascadeac.com/gresham/sports-programs/pickleball/';
const RACQUETBALL_URL = 'https://cascadeac.com/gresham/sports-programs/racquetball/';
const TENNIS_URL = 'https://cascadeac.com/gresham/sports-programs/tennis/';
const CLUB_AUTOMATION_URL = 'https://cascadeac.clubautomation.com/';
const TENNIS_DOUBLES_FORM_URL = 'https://docs.google.com/forms/d/1Fhl7Jzd1YURHpZpVt3nhEmEEFpGqrvZSyjLihd6tqrE/viewform?edit_requested=true';
const LOGO_SOURCE_URL = 'https://cascadeac.com/wp-content/uploads/2024/04/logo-blue.png';
const ADDRESS = '19201 SE Division St, Gresham, OR 97030';
const ORG_SPORTS = ['Basketball', 'Pickleball', 'Racquetball', 'Tennis'];
const PUBLIC_SLUG = 'cascade-athletic-clubs-gresham';
const ORGANIZER_DESCRIPTION = 'Cascade Athletic Clubs Gresham is a multi-sport athletic club with basketball, pickleball, racquetball, tennis, swimming, fitness, youth programs, court reservations, and club sports programming.';

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Cascade Athletic Clubs Gresham manual source snapshot.</main></body></html>',
    };
  },
};

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Cascade Athletic Clubs Gresham Sports Programs',
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
      title: "Cascade Gresham Men's 4-on-4 Basketball League",
      officialActionUrl: BASKETBALL_URL,
      sourceUrl: BASKETBALL_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Basketball',
      formatLabel: 'Basketball league',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Thursday league games are listed from 6:00-10:00 PM. Current fall league dates are marked coming soon on the source page.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall league details coming soon',
      skillLevel: 'Adult recreational basketball',
      ageGroup: '18+; 16-17 with director approval',
      participantOptionsText: 'Players may sign up as individuals or as a team. Non-members must be sponsored by a member.',
      priceText: '$20-$90',
      statusText: 'Fall leagues are marked coming soon on the source page.',
      description: "Cascade Athletic Clubs Gresham lists a men's 4-on-4 basketball league with weekly Thursday games, round-robin play, playoffs, and a pizza party after each season. The source says players can join as individuals or teams, rosters are due before the season starts, adults 18+ are eligible, and 16-17 year olds may play with director approval. Public pricing is listed as $20 per season for members and $90 per season for non-members.",
      divisions: [
        {
          name: "Men's 18+",
          key: 'm_age_18plus',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '18plus',
          ageCutoffLabel: '18+',
          ageCutoffSource: 'Cascade Athletic Clubs Gresham basketball page',
        },
      ],
      warnings: [
        'Stored as a no-fixed-date program because current fall league dates were marked coming soon during inspection.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Cascade Gresham 40+ Basketball Open Play',
      officialActionUrl: BASKETBALL_URL,
      sourceUrl: BASKETBALL_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Basketball',
      formatLabel: 'Open play',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Tuesdays 5:00-7:30 PM in Gym 1.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Tuesdays 5:00-7:30 PM',
      skillLevel: 'Adult open play',
      ageGroup: '40+',
      participantOptionsText: 'No signup required according to the source page.',
      priceText: 'Free',
      statusText: 'Free for members.',
      description: 'Cascade Athletic Clubs Gresham lists 40+ basketball open play on Tuesdays from 5:00-7:30 PM in Gym 1. The source describes it as 4-on-4 basketball with no signup required and free access for members.',
      divisions: [
        {
          name: 'Coed 40+',
          key: 'c_age_40plus',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '40plus',
          priceCents: 0,
          ageCutoffLabel: '40+',
          ageCutoffSource: 'Cascade Athletic Clubs Gresham basketball page',
        },
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Cascade Gresham Pickleball Leagues',
      officialActionUrl: CLUB_AUTOMATION_URL,
      sourceUrl: PICKLEBALL_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Pickleball',
      formatLabel: 'Pickleball league',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Monday leagues are listed 6:00-8:30 PM and Wednesday leagues are listed 5:00-9:00 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Monday and Wednesday pickleball leagues',
      skillLevel: 'Recreational pickleball league play',
      ageGroup: 'Adult',
      participantOptionsText: 'Individual registration through the official Cascade booking flow. The source lists a 48-player limit.',
      maxParticipantsText: '48 players',
      priceText: '$20-$30',
      statusText: 'Current league availability is handled in Cascade Club Automation.',
      description: 'Cascade Athletic Clubs Gresham lists pickleball leagues on Mondays from 6:00-8:30 PM and Wednesdays from 5:00-9:00 PM. The public source page lists a 48-player limit and membership-dependent per-person pricing: Tennis & Pickleball members $20, members $25, and non-members $30. Current registration and availability are handled through the official Cascade Club Automation flow.',
      divisions: [
        {
          name: 'Coed',
          key: 'c_skill_open',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          maxParticipants: 48,
        },
      ],
      warnings: [
        'ClubAutomation robots.txt disallows scraping, so it is used only as the official action URL.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Cascade Gresham Racquetball Singles Open Play',
      officialActionUrl: RACQUETBALL_URL,
      sourceUrl: RACQUETBALL_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Racquetball',
      formatLabel: 'Open play',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Mondays 6:00-8:00 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Mondays 6:00-8:00 PM',
      skillLevel: 'Beginner-friendly singles open play',
      ageGroup: 'Adult',
      participantOptionsText: 'The source says beginners are welcome and equipment can be borrowed.',
      maxParticipantsText: '20 players',
      priceText: 'Free-$20',
      statusText: 'Free for members; non-members pay a guest fee.',
      description: 'Cascade Athletic Clubs Gresham lists beginner-friendly singles racquetball open play every Monday from 6:00-8:00 PM. The source says no equipment is required because players can borrow what they need, capacity is 20 players, members play free, and non-members pay a $20 guest fee.',
      divisions: [
        {
          name: 'Coed',
          key: 'c_skill_open',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          maxParticipants: 20,
        },
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Cascade Gresham Tennis Doubles Flights',
      officialActionUrl: TENNIS_DOUBLES_FORM_URL,
      sourceUrl: TENNIS_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Tennis',
      formatLabel: 'Tennis doubles program',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Monthly doubles flights with rotating partners; current placement and signup are handled by the Tennis Office or linked Google Form.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Monthly doubles flights',
      skillLevel: 'Tennis doubles players',
      ageGroup: 'Adult',
      participantOptionsText: 'Players rotate partners after each set and top game winners move up to a higher court each week.',
      statusText: 'No stable public price was visible on the source page.',
      description: 'Cascade Athletic Clubs Gresham describes tennis doubles flights as monthly doubles play with rotating partners after each set. The top game winners each week move up to a higher court. The public page directs players to sign up monthly through the Tennis Office and exposes a Google Form link for registration, but no stable public price was visible during inspection.',
      divisions: [
        {
          name: 'Coed',
          key: 'c_skill_open',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
        },
      ],
      warnings: [
        'Stored as no-fixed-date because the source describes the monthly program but does not publish a stable current session date range.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'Cascade Gresham Pickleball Court Reservations',
      officialActionUrl: CLUB_AUTOMATION_URL,
      sourceUrl: PICKLEBALL_URL,
      organizerName: 'Cascade Athletic Clubs Gresham',
      sportName: 'Pickleball',
      formatLabel: 'Pickleball court rental',
      city: 'Gresham, OR',
      venueName: 'Cascade Athletic Clubs Gresham',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Court reservations are handled through the official Cascade app or Club Automation link.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Reserve current court availability online',
      participantOptionsText: 'The Gresham page lists six indoor courts and four outdoor courts. Tennis or Pickleball members can reserve up to 7 days ahead; other members may make same-day reservations at no cost.',
      statusText: 'Current reservation availability is handled in Cascade Club Automation.',
      description: 'Cascade Athletic Clubs Gresham lists pickleball court reservations for its six indoor courts and four outdoor courts. The public page says all court usage requires a reservation, two names are required for each one-hour reservation, Tennis or Pickleball members can reserve up to 7 days ahead, and members without a Tennis or Pickleball membership may make same-day court reservations at no cost. Current availability is handled through the official Cascade app or Club Automation flow.',
      warnings: [
        'Stored as a rental/facility link-out because real-time court availability is in Club Automation, which disallows scraping.',
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
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'cascade-athletic-clubs-gresham-logo.png',
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
      originalName: 'cascade-athletic-clubs-gresham-logo.png',
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
      originalName: 'cascade-athletic-clubs-gresham-logo.png',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...ORG_SPORTS]));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Cascade Athletic Clubs Gresham',
      location: 'Gresham, OR',
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LIST_URL,
      sports,
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Cascade Athletic Clubs Gresham programs',
      publicIntroText: 'Find Cascade Gresham sports programs, court reservations, youth programs, and club links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Cascade Athletic Clubs Gresham',
      location: 'Gresham, OR',
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: LIST_URL,
      sports,
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Cascade Athletic Clubs Gresham programs',
      publicIntroText: 'Find Cascade Gresham sports programs, court reservations, youth programs, and club links.',
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
    name: 'Cascade Athletic Clubs Gresham Sports Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual Cascade Gresham evergreen source. Public WordPress pages describe sports programs and court reservations; Club Automation and PlayMetrics stay outbound-only when present.',
    metadata: {
      inspectedAt: '2026-07-04',
      refreshedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'cascadeac.com robots.txt allows public pages outside /wp-admin/. cascadeac.clubautomation.com robots.txt disallows / and playmetrics.com robots.txt disallows /signup, so downstream booking/registration systems are action URLs only.',
      platform: 'WordPress sports-program pages with Club Automation and Google Forms outbound links',
      logoSourceUrl: LOGO_SOURCE_URL,
      externalSystems: {
        clubAutomationUrl: CLUB_AUTOMATION_URL,
        tennisDoublesFormUrl: TENNIS_DOUBLES_FORM_URL,
      },
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
      notes: 'Manual Cascade Athletic Clubs Gresham basketball, pickleball, racquetball, tennis, and court reservation source.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Cascade Athletic Clubs Gresham basketball, pickleball, racquetball, tennis, and court reservation source.',
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

  console.log(`Cascade Athletic Clubs Gresham affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-cascade-athletic-clubs-gresham-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
