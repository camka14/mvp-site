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
const ORG_ID = 'affiliate_org_mountain_view_ice_arena';
const LOGO_FILE_ID = 'affiliate_file_mountain_view_ice_arena_logo';
const SOURCE_ID = 'affiliate_source_mountain_view_ice_arena_programs';
const SOURCE_KEY = 'mountain-view-ice-arena-programs';
const MAPPING_ID = 'affiliate_source_mountain_view_ice_arena_programs_mapping_v1';
const HOME_URL = 'https://mtviewice.com/';
const ADULT_HOCKEY_URL = 'https://mtviewice.com/adult-hockey';
const STICK_AND_PUCK_URL = 'https://mtviewice.com/pick-up%2Fstick-%26-puck-time';
const RINK_SCHEDULE_URL = 'https://15560.ezfacility.com/Sessions?reset=True';
const RENTALS_URL = 'https://mtviewice.com/rentals-%26-parties';
const LOGO_SOURCE_URL = 'https://img1.wsimg.com/isteam/ip/75b748b1-ce3b-440b-9e06-62c3b307696c/MVIA%20logo%20resize%207.15.jpg';
const ADDRESS = '14313 SE Mill Plain Blvd, Vancouver, WA 98684';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Mountain View Ice Arena Programs',
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
      title: 'Mountain View Ice Arena Fall Adult Hockey Leagues',
      officialActionUrl: ADULT_HOCKEY_URL,
      sourceUrl: ADULT_HOCKEY_URL,
      organizerName: 'Mountain View Ice Arena',
      sportName: 'Hockey',
      formatLabel: 'Adult hockey league',
      city: 'Vancouver, WA',
      venueName: 'Mountain View Ice Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The official adult hockey page labels the current program as Fall Adult Hockey Leagues 2026-27 and links to MVIA adult league schedules.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall 2026-27 adult hockey league info',
      skillLevel: 'Women, Over 35, C, and Advanced division links were visible on the Rose Cup page; current adult league details should be confirmed on the official page before publishing.',
      ageGroup: 'Adult',
      divisionText: 'Women; Over 35; C; Advanced',
      participantOptionsText: 'Use the official adult hockey page and rink schedule links to confirm current registration and league placement.',
      statusText: 'The linked EZFacility adult hockey and Rose Cup registration forms inspected on 2026-07-06 were closed, so this row is review-only and links to the official program page.',
      description: 'Mountain View Ice Arena publishes adult hockey information for Fall Adult Hockey Leagues 2026-27 and points users to MVIA league schedules. The separate Rose Cup 2026 page exposes Women, Over 35, C, and Advanced registration links, but those EZFacility forms were closed during inspection on 2026-07-06. Because no future start date or open registration price was exposed publicly, this candidate is a no-fixed-date program summary for manual review rather than a scheduled event.',
      divisions: [
        {
          name: 'Women',
          key: 'f_skill_women',
          gender: 'F',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          maxParticipants: null,
        },
        {
          name: 'Over 35',
          key: 'c_age_35plus',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '35plus',
          maxParticipants: null,
          ageCutoffLabel: '35+',
          ageCutoffSource: 'Mountain View Ice Arena Rose Cup 2026 page',
        },
        {
          name: 'C',
          key: 'c_skill_c',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'C',
          maxParticipants: null,
        },
        {
          name: 'Advanced',
          key: 'c_skill_advanced',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'ADVANCED',
          maxParticipants: null,
        },
      ],
      warnings: [
        'Closed EZFacility registration forms were not imported as scheduled events.',
        'No public league price or future league start date was available without entering a registration flow.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Mountain View Ice Arena Stick & Puck and Adult Drop-In Hockey',
      officialActionUrl: RINK_SCHEDULE_URL,
      sourceUrl: STICK_AND_PUCK_URL,
      organizerName: 'Mountain View Ice Arena',
      sportName: 'Hockey',
      formatLabel: 'Stick & puck / drop-in hockey',
      city: 'Vancouver, WA',
      venueName: 'Mountain View Ice Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Fall schedule listed on the source page: Stick Time Monday, Wednesday, and Friday from 12:15-1:30 PM; Pick-Up Tuesday and Thursday from 12:15-1:30 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Weekday fall stick time and pick-up hockey',
      skillLevel: 'Open stick time plus adult non-checking drop-in hockey',
      ageGroup: 'All ages for stick & puck; adult 18+ for drop-in hockey',
      participantOptionsText: 'Book sessions through the official EZFacility rink schedule or in person at the rink; online booking has priority.',
      priceText: '$18-$23',
      statusText: 'The source says online sessions are limited to 24 skaters, with rink-management exceptions.',
      description: 'Mountain View Ice Arena lists stick and puck ice time for all ages, with helmets, sticks, and gloves required and full equipment required for skaters under 18. The source lists 45-minute stick and puck at $18, 1-hour or 1-hour-15-minute stick and puck at $23, and 1-hour-15-minute adult drop-in hockey at $23. Adult drop-in hockey is 18+, full equipment required, non-checking, and goalies skate free.',
      warnings: [
        'Stored as an ongoing affiliate event because sessions are booked through the official rink schedule and individual dates can change.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'Mountain View Ice Arena Private Rink Rentals and Parties',
      officialActionUrl: RENTALS_URL,
      sourceUrl: RENTALS_URL,
      organizerName: 'Mountain View Ice Arena',
      sportName: 'Hockey',
      formatLabel: 'Private rink rental',
      city: 'Vancouver, WA',
      venueName: 'Mountain View Ice Arena',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Private rink rentals and birthday parties are handled by inquiry through the official rentals and parties page.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Inquire for private rink rental availability',
      participantOptionsText: 'Use the official rentals page to contact Mountain View Ice Arena about birthday parties, fundraising events, corporate team-building, and private rink rentals.',
      statusText: 'The source does not publish a live private-rental calendar.',
      description: 'Mountain View Ice Arena says groups can rent the rink for corporate team-building activities, birthdays, sporting events, special events, and fundraising. The source directs birthday-party inquiries to birthdaysatmvia@gmail.com and private rink rental inquiries to mviaez@gmail.com. No public private-rink rental price was listed in the crawlable page text, so price is left unspecified.',
      warnings: [
        'Stored as a rental link-out because the source does not publish a crawlable private-rental availability calendar.',
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
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'mountain-view-ice-arena-logo.jpg',
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
      originalName: 'mountain-view-ice-arena-logo.jpg',
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
      originalName: 'mountain-view-ice-arena-logo.jpg',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Hockey', 'Ice Skating']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Mountain View Ice Arena',
      location: 'Vancouver, WA',
      address: ADDRESS,
      description: 'Mountain View Ice Arena is a Vancouver ice rink with adult hockey, stick and puck sessions, public skating, youth hockey programs, private rink rentals, parties, and skating programs.',
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
      name: 'Mountain View Ice Arena',
      location: 'Vancouver, WA',
      address: ADDRESS,
      description: 'Mountain View Ice Arena is a Vancouver ice rink with adult hockey, stick and puck sessions, public skating, youth hockey programs, private rink rentals, parties, and skating programs.',
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
    name: 'Mountain View Ice Arena Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual Mountain View Ice Arena source. Closed EZFacility registrations are documented but not imported as scheduled candidates.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'robots.txt only declares User-agent: * and no disallow rules.',
      logoSourceUrl: LOGO_SOURCE_URL,
      closedRegistrationUrls: [
        'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=7047&GroupID=4045736',
        'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=7047&GroupID=4026968',
        'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=7047&GroupID=4026969',
        'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=7047&GroupID=4026970',
        'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=7047&GroupID=4026971',
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
      notes: 'Manual Mountain View Ice Arena program, drop-in hockey, and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Mountain View Ice Arena program, drop-in hockey, and rental mapping.',
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

  console.log(`Mountain View Ice Arena affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-mountain-view-ice-arena-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
