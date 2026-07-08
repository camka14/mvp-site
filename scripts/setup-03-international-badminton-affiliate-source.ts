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
const ORG_ID = 'affiliate_org_03_international_badminton';
const LOGO_FILE_ID = 'affiliate_file_03_international_badminton_logo';
const SOURCE_ID = 'affiliate_source_03_international_badminton_programs';
const SOURCE_KEY = '03-international-badminton-programs';
const MAPPING_ID = 'affiliate_source_03_international_badminton_programs_mapping_v1';
const HOME_URL = 'https://www.03intlbadminton.net/';
const LIST_URL = 'https://www.03intlbadminton.net/lessons-1';
const COURT_RENTAL_URL = 'https://www.03intlbadminton.net/scheduling';
const CLASSES_URL = 'https://www.03intlbadminton.net/lessons-1';
const SUMMER_CAMP_URL = 'https://www.03intlbadminton.net/summer-camp';
const BEGINNER_CLASS_URL = 'https://www.03intlbadminton.net/badminton-beginner-class-beaverton';
const INTERMEDIATE_CLASS_URL = 'https://www.03intlbadminton.net/badminton-intermediate-class-beaverton';
const ADULT_LESSONS_URL = 'https://www.03intlbadminton.net/adult-badminton-lessons-beaverton';
const ELITE_TEAM_URL = 'https://www.03intlbadminton.net/badminton-elite-team-beaverton';
const MID_HIGH_TEAM_URL = 'https://www.03intlbadminton.net/badminton-midhigh-school-team-beaverton';
const CLACKAMAS_CLASSES_URL = 'https://www.03intlbadminton.net/clackamas-badminton-classes';
const REGISTRATION_FORM_URL = 'https://forms.gle/RLyfqSWnqf5JmCvS6';
const ADULT_LESSON_FORM_URL = 'https://forms.gle/RPnaXDaTK4vZoE3Q8';
const CLACKAMAS_FORM_URL = 'https://forms.gle/y5J9V7vdy9zd6n2B6';
const CAMP_FORM_URL = 'https://forms.gle/cB9nMVvTsDL5Lff29';
const CAMP_INDEX_FORM_URL = 'https://forms.gle/Lz3FbWksNQRPkSpS6';
const LOGO_SOURCE_URL = 'https://static1.squarespace.com/static/5af29b55620b85c15c132b97/t/68a7cea06babfb25e0ba778f/1755827872692/64891aa44c574793a913741724f6b3b4.jpg?format=1500w';
const ADDRESS = '10058 SW Arctic Dr, Beaverton, OR 97005';
const ORGANIZER_NAME = "03 International Badminton Club";
const CITY = 'Beaverton, OR';
const PUBLIC_SLUG = '03-international-badminton-club';
const ORGANIZER_DESCRIPTION = '03 International Badminton Club is a Beaverton badminton facility offering court rentals, youth and adult training, summer camps, tournaments, memberships, and team programs.';

const campDescription = (
  title: string,
  dateRange: string,
  morningCourse: string,
  priceText: string,
) => (
  `${ORGANIZER_NAME} lists ${title} for ages 7-12 from ${dateRange}. `
  + `The camp combines a morning ${morningCourse} course from 8:30 AM to 11:30 AM with an afternoon beginner badminton course from 12:30 PM to 3:30 PM. `
  + `The source lists ${priceText}, supervised lunch from 11:30 AM to 12:30 PM for full-day students, and possible cancellation if minimum enrollment is not met.`
);

const campCandidate = (
  title: string,
  sourceUrl: string,
  officialActionUrl: string,
  startsAt: string,
  endsAt: string,
  dateDisplayText: string,
  morningCourse: string,
  priceText: string,
) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl,
  sourceUrl,
  organizerName: ORGANIZER_NAME,
  sportName: 'Badminton',
  formatLabel: 'Youth summer camp',
  city: CITY,
  venueName: ORGANIZER_NAME,
  address: ADDRESS,
  startsAt,
  endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: 'Full day 8:30 AM-3:30 PM with supervised lunch; morning STEM course 8:30-11:30 AM and afternoon beginner badminton 12:30-3:30 PM.',
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText,
  skillLevel: 'Beginner badminton with STEM enrichment',
  ageGroup: 'Ages 7-12',
  participantOptionsText: 'Half-day or full-day camp registration.',
  priceText,
  statusText: 'The source says camps may be canceled if minimum enrollment is not met.',
  description: campDescription(title, dateDisplayText, morningCourse, priceText),
  warnings: [
    'Created only for future camp sessions visible on the source as of 2026-07-06; earlier June sessions were skipped as past.',
  ],
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: ORGANIZER_NAME,
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode', 'dateDisplayText'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: '03 International Badminton Court Rentals',
      officialActionUrl: COURT_RENTAL_URL,
      sourceUrl: COURT_RENTAL_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Badminton court rental',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Public source lists court rental through the official court rental page; exact court availability is handled by the embedded booking flow.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Court rentals by booking availability',
      participantOptionsText: 'Badminton court reservations and club membership access.',
      statusText: 'The public court rental page does not expose a reliable repeated availability table.',
      description: '03 International Badminton Club lists badminton court rentals at its Beaverton facility. The public page directs users to the official court rental page, while current court availability and booking details are handled by the embedded booking flow. The site also lists a club membership program where members can earn points from court bookings and receive booking priority.',
      warnings: [
        'Stored as a rental link-out because the booking widget does not expose a stable public card list.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Beginner Classes',
      officialActionUrl: REGISTRATION_FORM_URL,
      sourceUrl: BEGINNER_CLASS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Youth badminton class',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Source-listed spring term had Tuesday 4:30-5:30 PM, Thursday 4:30-5:30 PM, and Saturday 10:00-11:00 AM class options.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Beginner class schedule by current term',
      skillLevel: 'Beginner',
      ageGroup: 'Youth',
      participantOptionsText: '1, 2, or 3 sessions per week depending on the selected class package.',
      priceText: '$300-$600',
      statusText: 'The visible spring 2026 term ended before 2026-07-06; confirm the current term before publishing.',
      description: 'The beginner class page describes a youth badminton program focused on fundamental rules, grips, swings, basic footwork, teamwork, and confidence-building games. The visible spring 2026 term ran March 30 to June 12 with 1 session per week for $300, 2 sessions per week for $500, and 3 sessions per week for $600. Extra sessions were listed at a $35 drop-in price, and missed classes were not eligible for make-ups or credits.',
      warnings: [
        'Stored as no-fixed-date because the visible spring 2026 class term is over and the page is a reusable program page.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Intermediate Classes',
      officialActionUrl: REGISTRATION_FORM_URL,
      sourceUrl: INTERMEDIATE_CLASS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Youth badminton class',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Source-listed spring term had Monday, Tuesday, Thursday, and Saturday class options.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Intermediate class schedule by current term',
      skillLevel: 'Intermediate',
      ageGroup: 'Youth',
      participantOptionsText: '2, 3, or 4 sessions per week depending on the selected class package.',
      priceText: '$740-$960',
      statusText: 'The visible spring 2026 term ended before 2026-07-06; confirm the current term before publishing.',
      description: 'The intermediate class page describes technical training, one-on-one drills, half-court tactical awareness, front-court net play, agility, footwork, and stamina. The visible spring 2026 term ran March 30 to June 12 with 2 sessions per week for $740, 3 sessions per week for $860, and 4 sessions per week for $960. Extra sessions were listed at a $45 drop-in price, and missed classes were not eligible for make-ups or credits.',
      warnings: [
        'Stored as no-fixed-date because the visible spring 2026 class term is over and the page is a reusable program page.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Adult Lessons',
      officialActionUrl: ADULT_LESSON_FORM_URL,
      sourceUrl: ADULT_LESSONS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Adult badminton lessons',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Beginner lessons were listed Thursday 6:00-7:00 PM and Saturday 9:00-10:00 AM; intermediate lessons were listed Wednesday and Friday 7:00-8:30 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Adult lessons by current lesson availability',
      skillLevel: 'Beginner and intermediate',
      ageGroup: 'Adult',
      participantOptionsText: 'Beginner, intermediate, and private group lesson options.',
      priceText: '$190-$250',
      statusText: 'The public page lists punch-card pricing and asks private groups to contact the club for scheduling.',
      description: 'The adult lessons page lists beginner and intermediate badminton lesson options. Beginner lessons cover forehand and backhand grips, basic footwork, and overhead and underhand shots, with a 10-session punch card listed at $190 and valid for 3 months. Intermediate lessons focus on consistency, accuracy, shot variety, advanced footwork, and full-court coverage, with a 10-session punch card listed at $250 and valid for 3 months. The page also offers private group training by request.',
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Elite Team Training',
      officialActionUrl: REGISTRATION_FORM_URL,
      sourceUrl: ELITE_TEAM_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Elite youth badminton training',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Source-listed spring term had Monday, Tuesday, Wednesday, Friday, and Saturday training options.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Elite team training by current term',
      skillLevel: 'Advanced and competition-focused',
      ageGroup: 'Youth',
      participantOptionsText: '3, 4, or 5 sessions per week depending on the selected training package.',
      priceText: '$1,230-$1,560',
      statusText: 'The visible spring 2026 term ended before 2026-07-06; confirm the current term before publishing.',
      description: 'The elite team page describes advanced technical skills, footwork, physical conditioning, singles and doubles strategy, mental toughness, and competition-oriented training. The visible spring 2026 term ran March 30 to June 21 with 3 sessions per week for $1,230, 4 sessions per week for $1,460, and 5 sessions per week for $1,560. Extra sessions were listed at a $55 drop-in price, and missed classes were not eligible for make-ups or credits.',
      warnings: [
        'Stored as no-fixed-date because the visible spring 2026 team term is over and the page is a reusable program page.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Middle and High School Team',
      officialActionUrl: REGISTRATION_FORM_URL,
      sourceUrl: MID_HIGH_TEAM_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Middle and high school badminton training',
      city: CITY,
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Source-listed spring term had Monday 6:30-7:30 PM, Wednesday 6:00-7:00 PM, and Friday 6:00-7:00 PM class options.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Middle and high school team schedule by current term',
      skillLevel: 'Beginner foundation through intermediate skills',
      ageGroup: 'Middle school and high school',
      participantOptionsText: '1, 2, or 3 sessions per week depending on the selected class package.',
      priceText: '$300-$575',
      statusText: 'The visible spring 2026 term ended before 2026-07-06; confirm the current term before publishing.',
      description: 'The middle and high school team page describes training for students who want to learn badminton recreationally while building a foundation for competition. The visible spring 2026 term ran March 30 to June 12 with 1 session per week for $300, 2 sessions per week for $475, and 3 sessions per week for $575. Extra sessions were listed at a $35 drop-in price, and missed classes were not eligible for make-ups or credits.',
      warnings: [
        'Stored as no-fixed-date because the visible spring 2026 team term is over and the page is a reusable program page.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: '03 International Badminton Clackamas Junior Classes',
      officialActionUrl: CLACKAMAS_FORM_URL,
      sourceUrl: CLACKAMAS_CLASSES_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Badminton',
      formatLabel: 'Junior badminton classes',
      city: 'Clackamas, OR',
      venueName: ORGANIZER_NAME,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Source-listed spring term had junior beginner Saturdays 1:00-2:00 PM and junior intermediate Saturdays 2:00-3:30 PM.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Clackamas junior class schedule by current term',
      skillLevel: 'Junior beginner and junior intermediate',
      ageGroup: 'Youth',
      participantOptionsText: 'Junior beginner and junior intermediate class registration.',
      priceText: '$180-$225',
      statusText: 'The visible spring 2026 term ended before 2026-07-06; confirm the current term before publishing.',
      description: 'The Clackamas classes page lists junior beginner and junior intermediate badminton classes. The visible spring 2026 term ran April 4 to June 12. Junior beginner was listed Saturdays from 1:00 PM to 2:00 PM at $180 for 6 sessions, and junior intermediate was listed Saturdays from 2:00 PM to 3:30 PM at $225 for 6 sessions. The source lists several no-training dates during the term.',
      warnings: [
        'Stored as no-fixed-date because the visible spring 2026 class term is over and the page is a reusable program page.',
      ],
    },
    campCandidate(
      '03 International Badminton Beaverton Summer Camp: Engineering Olympiad',
      'https://www.03intlbadminton.net/beaverton-2',
      CAMP_INDEX_FORM_URL,
      '2026-07-20T08:30:00-07:00',
      '2026-07-24T15:30:00-07:00',
      'July 20-24, 2026',
      'Engineering Olympiad',
      '$289-$449',
    ),
    campCandidate(
      '03 International Badminton Beaverton Summer Camp: EcoForce Environmental Engineering',
      'https://www.03intlbadminton.net/beaverton-626630-copy',
      CAMP_FORM_URL,
      '2026-07-27T08:30:00-07:00',
      '2026-07-31T15:30:00-07:00',
      'July 27-31, 2026',
      'EcoForce Environmental Engineering',
      '$289-$449',
    ),
    campCandidate(
      '03 International Badminton Beaverton Summer Camp: Robo Games',
      'https://www.03intlbadminton.net/beaverton-7',
      CAMP_FORM_URL,
      '2026-08-10T08:30:00-07:00',
      '2026-08-14T15:30:00-07:00',
      'August 10-14, 2026',
      'Lego Spike Robotics: Robo Games',
      '$289-$449',
    ),
    campCandidate(
      '03 International Badminton Beaverton Summer Camp: Orbiters and Landers',
      'https://www.03intlbadminton.net/beaverton-3',
      CAMP_INDEX_FORM_URL,
      '2026-08-17T08:30:00-07:00',
      '2026-08-21T15:30:00-07:00',
      'August 17-21, 2026',
      'Orbiters and Landers aerospace engineering',
      '$289-$449',
    ),
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
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: '03-international-badminton-logo.jpg',
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
      originalName: '03-international-badminton-logo.jpg',
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
      originalName: '03-international-badminton-logo.jpg',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Badminton']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: CITY,
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
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
      publicHeadline: '03 International Badminton Club programs',
      publicIntroText: 'Find 03 International Badminton court rentals, classes, camps, tournaments, and training links.',
      taxOrganizationType: 'SOLE_PROPRIETOR',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: CITY,
      address: ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: '03 International Badminton Club programs',
      publicIntroText: 'Find 03 International Badminton court rentals, classes, camps, tournaments, and training links.',
      coordinates,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'SOLE_PROPRIETOR',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: '03 International Badminton Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual 03 International Badminton source from public Squarespace pages. Program pages are mixed with completed tournaments and ended class terms, so candidates are manually summarized and dated only when source pages expose future camp sessions.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: '03intlbadminton.net robots.txt allows public pages through User-agent * while disallowing config/search/account/API/static and query variants. Public program, class, camp, tournament, membership, and court-rental paths were inspected.',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedPastOrClosedRows: [
        'Spring 2026 beginner, intermediate, elite, mid/high school, and Clackamas class terms are retained only as no-fixed-date program summaries because the listed terms ended before 2026-07-06.',
        'Completed or registration-closed 2025 and early-2026 tournament pages were not imported as candidates.',
        'June 2026 summer camp sessions were skipped as past as of 2026-07-06.',
      ],
      scrapeFetchNote: 'ScrapingDog returned HTTP 504 for the Squarespace root during local setup. The mapping listUrl uses /lessons-1 instead because that public source page fetches successfully while manualCandidates preserve the inspected source URLs.',
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
      notes: 'Manual 03 International Badminton court rental, program, class, and camp mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual 03 International Badminton court rental, program, class, and camp mapping.',
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

  console.log(`03 International Badminton affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-03-international-badminton-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
