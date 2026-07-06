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
const ORG_ID = 'affiliate_org_jumbos_pickleball_portland';
const LOGO_FILE_ID = 'affiliate_file_jumbos_pickleball_portland_logo';
const SOURCE_ID = 'affiliate_source_jumbos_pickleball_portland_programs';
const SOURCE_KEY = 'jumbos-pickleball-portland-programs';
const MAPPING_ID = 'affiliate_source_jumbos_pickleball_portland_programs_mapping_v1';
const HOME_URL = 'https://www.jumbospickleball.com/portland';
const PLAY_NOW_URL = 'https://portland.jumbospickleball.com/';
const BOOKING_PROGRAMS_URL = 'https://portland.jumbospickleball.com/programs?facility_id=992';
const DAILY_PROGRAMS_URL = 'https://www.jumbospickleball.com/programs';
const BEGINNERS_URL = 'https://www.jumbospickleball.com/beginners';
const CLINICS_URL = 'https://www.jumbospickleball.com/privates-clinics';
const CAMPS_URL = 'https://www.jumbospickleball.com/camps';
const PRIVATE_PARTIES_URL = 'https://www.jumbospickleball.com/privateparties';
const CORPORATE_EVENTS_URL = 'https://www.jumbospickleball.com/corp-events';
const LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/0960cf_724554d136a24f4999a1a99fdac2c7cf~mv2.png';
const ADDRESS = '2320 Lloyd Center, Portland, OR 97232';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: "Jumbo's Pickleball Portland Programs",
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
      title: "Jumbo's Pickleball Portland Daily Programs",
      officialActionUrl: PLAY_NOW_URL,
      sourceUrl: DAILY_PROGRAMS_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Organized play',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The official daily programs page describes Park Play, Club Play, and Verified Play as structured two-hour programs unless otherwise stated.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Daily organized pickleball programs',
      skillLevel: 'All levels, with level-based and verified play options',
      participantOptionsText: 'Members and non-members can use the official Portland booking page to view current sessions and availability.',
      statusText: 'The public page describes program types but does not publish a stable dated inventory or price table.',
      description: "Jumbo's Pickleball Portland describes daily organized programs for players who want structured pickleball beyond court time. The public page lists Park Play for non-members and players new to club pickleball, Club Play for choice-based organized formats such as Paddle Battle, Round Robin, or Jumble, and Verified Play for level-based structured games. The source says programs are two hours unless otherwise stated and directs players to the official Portland booking page for live session availability.",
      warnings: [
        'Stored as an ongoing program summary because live session dates and prices are only available through the official booking flow.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: "Jumbo's Pickleball Portland Beginner Programs",
      officialActionUrl: PLAY_NOW_URL,
      sourceUrl: BEGINNERS_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Beginner pickleball program',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Beginner 101/102, Rookie Rally 103, Beginner Paddle-Battle 104, and Beginner Jumble 104 are described on the public page; current sessions are in the official booking flow.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Beginner programs by current booking availability',
      skillLevel: 'Beginner and players new to pickleball',
      participantOptionsText: 'Use the official Portland booking page to find current beginner sessions.',
      statusText: 'No stable public session dates or prices were visible on the crawlable beginner page.',
      description: "Jumbo's Pickleball Portland describes beginner programs that mix instruction and game time for players new to pickleball. The source lists Beginner 101/102 foundations, Rookie Rally 103, Beginner Paddle-Battle 104, and Beginner Jumble 104, with a focus on supportive, low-pressure skill building and guided organized play. Current dates, availability, and prices should be confirmed through the official Portland booking page.",
      warnings: [
        'Stored as ongoing because the public page describes the program ladder, not a dated registration row.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: "Jumbo's Pickleball Portland Clinics and Private Lessons",
      officialActionUrl: BOOKING_PROGRAMS_URL,
      sourceUrl: CLINICS_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Clinics and private lessons',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The official instruction page describes game clinics, core clinics, camps, and private lessons; current offerings are listed in the Portland booking portal.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Clinics and lessons by current booking availability',
      skillLevel: 'Instruction for every level',
      participantOptionsText: 'Use the official Portland programs page to view current clinic and lesson inventory.',
      statusText: 'The Portland booking page returned no crawlable clinic rows during inspection, so this is review-only until a live offering appears.',
      description: "Jumbo's Pickleball describes instruction programs for players who want to learn and improve. The source lists high-energy game clinics, focused core clinics, camps, and private lessons that cover serves, returns, drives, drops, volleys, overheads, resets, footwork, shot selection, and doubles skills. The official Portland booking portal should be used for current dates, availability, and prices.",
      warnings: [
        'The crawlable Portland booking page did not expose current clinic rows during inspection.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: "Jumbo's Pickleball Portland Junior Camps",
      officialActionUrl: BOOKING_PROGRAMS_URL,
      sourceUrl: CAMPS_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Junior pickleball camps',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The official camps page describes summer junior pickleball camps; current camp dates are handled through the Portland booking portal.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Seasonal junior camp information',
      skillLevel: 'New and regular youth pickleball players',
      ageGroup: 'Junior players',
      participantOptionsText: 'Use the official Portland booking portal to confirm current junior camp sessions.',
      statusText: 'The public camps page does not publish a stable current date range or price for Portland camps.',
      description: "Jumbo's Pickleball describes junior summer camps led by its Head Pickleball Pro, with a positive atmosphere, themed days, age-appropriate training and games, coordination and endurance work, pickleball strokes, serving, warm-ups, drills, match play, and strategy. Because the public page did not expose current Portland camp dates or pricing during inspection, this candidate is a no-fixed-date summary for manual review.",
      warnings: [
        'No current Portland camp dates or prices were visible in the crawlable public page.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: "Jumbo's Pickleball Portland Court Reservations",
      officialActionUrl: PLAY_NOW_URL,
      sourceUrl: HOME_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Indoor pickleball court reservation',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Court availability is handled through the official Portland booking page.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Book current court availability online',
      participantOptionsText: 'The Portland page lists 8 tour-level courts and a 1+ hour minimum reservation.',
      statusText: 'Members and non-members are welcome; booking availability and prices live in the official Playbypoint flow.',
      description: "Jumbo's Pickleball Portland is an indoor pickleball facility at Lloyd Center with 8 tour-level courts, two lounges, strategic lighting, sound dampening, level-based programs, and member/non-member play. The source says reservations have a minimum of one hour and directs users to the official Portland booking page for current court availability.",
      warnings: [
        'Stored as a rental link-out because real-time court availability and pricing are in the official booking flow.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: "Jumbo's Pickleball Portland Private Parties and Corporate Events",
      officialActionUrl: PRIVATE_PARTIES_URL,
      sourceUrl: CORPORATE_EVENTS_URL,
      organizerName: "Jumbo's Pickleball Portland",
      sportName: 'Pickleball',
      formatLabel: 'Private party / corporate event rental',
      city: 'Portland, OR',
      venueName: "Jumbo's Pickleball Portland",
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Private parties and corporate events are handled through inquiry or booking links on the official pages.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Private events by inquiry and availability',
      participantOptionsText: 'Corporate packages shown on the public page range from 1 court for 2-7 people to 4 courts for 16-30 people.',
      statusText: 'No public party or corporate-event price was visible in the crawlable page text.',
      description: "Jumbo's Pickleball offers private parties and corporate team-building events at its pickleball courts. The public corporate events page describes packages including Dink for 1 court and 2-7 people, Volley for 2 courts and 8-14 people, Serve for 3 courts and 12-20 people, and Baseline for 4 courts and 16-30 people. The source routes booking and larger-event inquiries through the official Jumbo pages, and no public event-rental price was visible during inspection.",
      warnings: [
        'Stored as a rental link-out because pricing and availability are handled by inquiry or the official booking flow.',
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
    originalName: 'jumbos-pickleball-portland-logo.png',
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
      originalName: 'jumbos-pickleball-portland-logo.png',
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
      originalName: 'jumbos-pickleball-portland-logo.png',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Pickleball']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "Jumbo's Pickleball Portland",
      location: 'Portland, OR',
      address: ADDRESS,
      description: "Jumbo's Pickleball Portland is an indoor pickleball facility at Lloyd Center with tour-level courts, organized play, beginner programs, clinics, private lessons, camps, court reservations, parties, and corporate events.",
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
      name: "Jumbo's Pickleball Portland",
      location: 'Portland, OR',
      address: ADDRESS,
      description: "Jumbo's Pickleball Portland is an indoor pickleball facility at Lloyd Center with tour-level courts, organized play, beginner programs, clinics, private lessons, camps, court reservations, parties, and corporate events.",
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
    name: "Jumbo's Pickleball Portland Programs",
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.jumbospickleball.com/',
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual Jumbo Portland source from official public pages. Booking and live session availability remain outbound-only through Playbypoint.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'www.jumbospickleball.com robots.txt allows / and only disallows lightbox query paths. portland.jumbospickleball.com allows User-agent * but blocks several named AI crawlers; booking paths are kept as outbound action URLs instead of scraped inventory.',
      logoSourceUrl: LOGO_SOURCE_URL,
      excludedPrograms: [
        'May Madness and Silver Cup tournament links were not imported because visible tournament rows were completed or past-dated during inspection.',
        'Pacific Interclub League was treated as an external league directory, not a Jumbo-owned event row.',
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
      notes: "Manual Jumbo's Pickleball Portland program, court reservation, party, and corporate-event rental mapping.",
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: "Manual Jumbo's Pickleball Portland program, court reservation, party, and corporate-event rental mapping.",
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

  console.log(`Jumbo's Pickleball Portland affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-jumbos-pickleball-portland-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
