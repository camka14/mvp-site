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
const ORG_ID = 'affiliate_org_dbat_pdx_west';
const LOGO_FILE_ID = 'affiliate_file_dbat_pdx_west_logo';
const SOURCE_ID = 'affiliate_source_dbat_pdx_west_programs';
const SOURCE_KEY = 'dbat-pdx-west-programs';
const MAPPING_ID = 'affiliate_source_dbat_pdx_west_programs_mapping_v1';
const HOME_URL = 'https://www.dbatpdxwest.com/';
const LIST_URL = 'https://www.dbatpdxwest.com/camps';
const CAGES_URL = 'https://www.dbatpdxwest.com/batting-cages#Rentals';
const LESSONS_URL = 'https://www.dbatpdxwest.com/lessons#Lessons';
const HITTRAX_URL = 'https://www.dbatpdxwest.com/hittrax-leagues';
const BIRTHDAY_URL = 'https://www.dbatpdxwest.com/birthday-parties';
const TEAM_PRACTICES_URL = 'https://www.dbatpdxwest.com/team-practices';
const LEAGUE_TAKEOVERS_URL = 'https://www.dbatpdxwest.com/league-takeovers';
const ROOKIE_CLASS_URL = 'https://app.dbathub.com/customers/138-d-bat-pdx-west/events/22486-rookie-level-class-age-5-8-baseball-and-softball';
const TURTLE_CAMP_URL = 'https://app.dbathub.com/customers/138-d-bat-pdx-west/events/83757-turtle-thomas-elite-skills-summer-camp-ages-7-14-7-20-7-24';
const LOGO_SOURCE_URL = 'https://lirp.cdn-website.com/41fc25d3/dms3rep/multi/opt/D-BAT+Logo-1920w.png';
const ADDRESS = '11131 SW Greenburg Rd, Tigard, OR 97223';
const ORGANIZER_NAME = 'D-BAT PDX West';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'D-BAT PDX West Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode', 'dateDisplayText'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'D-BAT PDX West Batting Cage Rentals',
      officialActionUrl: CAGES_URL,
      sourceUrl: CAGES_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Batting cage rental',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The source says rentable cages are available in 30-minute increments; machine cage lanes are first-come, first-served.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Cage rentals by booking availability',
      participantOptionsText: 'Individual, parent-child, coach-player, and team practice rentals.',
      statusText: 'The public page does not list a single cage-rental price.',
      description: 'D-BAT PDX West lists 15 rentable cages that do not include pitching machines: 12 cages for hitting, fielding, catching, and agility practice plus 3 dedicated pitching cages for pitchers and catchers. Cages can be rented in 30-minute increments for 30, 60, or 90 minutes. The source says baseballs, softballs, batting tees, L-screens, and related cage equipment are provided. Pitching-machine lanes use real baseballs and softballs but are first-come, first-served rather than advance rental.',
      warnings: [
        'Stored as a rental link-out because live cage availability and prices are handled by the official booking flow.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'D-BAT PDX West Rookie Level Class',
      officialActionUrl: ROOKIE_CLASS_URL,
      sourceUrl: ROOKIE_CLASS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Baseball and softball class',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The rendered D-BAT Hub page lists Tuesdays and Thursdays from 4:00 PM to 5:00 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Tuesdays and Thursdays by booking availability',
      skillLevel: 'Rookie beginner fundamentals',
      ageGroup: 'Ages 5-8',
      divisionText: 'Coed ages 5-8',
      maxParticipantsText: '6 athletes per class',
      participantOptionsText: 'Open booking for weekly classes; source recommends 1-2 classes per week over 6-8 weeks.',
      priceText: '$30',
      statusText: 'Rendered D-BAT Hub detail page lists purchase price as $30.',
      description: 'D-BAT PDX West describes the Rookie Level Class as a beginner baseball and softball class for ages 5-8. The class focuses on hitting, throwing, catching, fielding, base-running, rules, positions, teamwork, and equipment care. The source says class size is limited to no more than 6 athletes per class, with Tuesdays and Thursdays from 4:00 PM to 5:00 PM listed on the rendered D-BAT Hub detail page.',
      divisions: [
        {
          name: 'Coed ages 5-8',
          key: 'c_age_5_8',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u8',
          priceCents: 3000,
          maxParticipants: 6,
          ageCutoffLabel: 'Ages 5-8',
          ageCutoffSource: 'D-BAT Hub Rookie Level Class detail page',
        },
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'D-BAT PDX West Turtle Thomas Elite Skills Summer Camp',
      officialActionUrl: TURTLE_CAMP_URL,
      sourceUrl: TURTLE_CAMP_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Baseball summer camp',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-24T14:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 20-24, 2026 from 9:00 AM to 2:00 PM each day.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 20-24, 2026',
      skillLevel: 'Elite skills camp',
      ageGroup: 'Ages 7-14',
      divisionText: 'Ages 7-14',
      participantOptionsText: 'Players can register for 1, 2, 3, 4, or all 5 days.',
      priceText: '$85-$375',
      statusText: 'Rendered D-BAT Hub detail page lists purchase price as $85+.',
      description: 'The Turtle Thomas Elite Skills Summer Camp is listed for baseball players ages 7-14 from July 20 to July 24, 2026, 9:00 AM to 2:00 PM each day. The source says each day has a focus: hitting on days 1 and 2, pitching and catching on day 3, and hitting and fielding on days 4 and 5. Pricing is listed as 1 day for $85, 2 days for $165, 3 days for $240, 4 days for $310, and all 5 days for $375. Players should bring a bat and glove if available, a sack lunch, athletic or turf shoes, and no cleats.',
      divisions: [
        {
          name: 'Ages 7-14',
          key: 'm_age_7_14',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: 'u14',
          priceCents: 8500,
          maxParticipants: null,
          ageCutoffLabel: 'Ages 7-14',
          ageCutoffSource: 'D-BAT Hub Turtle Thomas camp detail page',
        },
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'D-BAT PDX West Lessons',
      officialActionUrl: LESSONS_URL,
      sourceUrl: LESSONS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Baseball and softball lessons',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Lessons are booked through the official lesson flow; the public page lists 30-minute and 60-minute instruction.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Lessons by instructor availability',
      skillLevel: 'Baseball and softball instruction',
      participantOptionsText: 'Hitting, pitching, catching, fielding, slapping, infield/outfield, and related skill instruction depending on instructor.',
      statusText: 'The public page does not list a single lesson price.',
      description: 'D-BAT PDX West lists baseball and softball lessons taught by a roster of instructors across hitting, pitching, catching, fielding, slapping, infield/outfield, and related skill areas. The source says lessons are offered in both 30-minute and 60-minute formats and are customized to each ballplayer with parent, guardian, and coach involvement as desired.',
      warnings: [
        'Stored as ongoing because current lesson slots and prices are handled by the official booking flow.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'D-BAT PDX West HitTrax Leagues',
      officialActionUrl: HITTRAX_URL,
      sourceUrl: HITTRAX_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'HitTrax league',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The public page says to see the flyer for the next HitTrax league, but no current future date was visible in static text.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'HitTrax league timing by current facility schedule',
      skillLevel: '10U, 12U, 14U, and adult teams',
      ageGroup: 'Youth and adult',
      divisionText: '10U; 12U; 14U; Adult',
      participantOptionsText: 'Each age division is described as up to 6 teams with 4-6 players each.',
      statusText: 'No current future league date or price was visible on the public source page.',
      description: 'D-BAT PDX West describes HitTrax leagues using a dedicated HitTrax cage with swing analytics, MLB ballpark selection, home run derby, batting practice, and league play. The public page says each age division consists of up to 6 teams with 4-6 players each and that teams are forming for 10U, 12U, 14U, and adult divisions. No current future date or price was visible in the public page text.',
      warnings: [
        'Stored as no-fixed-date because the page describes league availability but does not expose a current dated league row.',
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'D-BAT PDX West Team Practices and Facility Takeovers',
      officialActionUrl: TEAM_PRACTICES_URL,
      sourceUrl: TEAM_PRACTICES_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Team practice and facility rental',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Team practices and league takeovers are arranged through the facility; league takeovers are generally non-public hours, weekend mornings, or after hours.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Team practice and takeover scheduling by request',
      participantOptionsText: 'Team practices, league workouts, tryouts, evaluations, player development sessions, and special events.',
      statusText: 'The source asks leagues and teams to call 503-506-5020 for takeover scheduling.',
      description: 'D-BAT PDX West lists team practices and league takeovers for teams, leagues, and special events. The league takeover page says the facility can be used during non-public hours, typically Saturday or Sunday morning or after hours on both days, for league workouts, tryouts, evaluations, and player development sessions on a year-round basis. The public page asks groups to call the facility to discuss scheduling.',
      warnings: [
        `League takeover details are on ${LEAGUE_TAKEOVERS_URL}; the team-practice page is kept as the primary action URL because it is the visible register path.`,
      ],
    },
    {
      listingKind: 'RENTAL',
      title: 'D-BAT PDX West Birthday Parties',
      officialActionUrl: BIRTHDAY_URL,
      sourceUrl: BIRTHDAY_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Baseball',
      formatLabel: 'Birthday party rental',
      city: 'Tigard, OR',
      venueName: ORGANIZER_NAME,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Birthday-party requests are submitted through the official source page.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Birthday parties by request',
      participantOptionsText: 'Birthday party request form with requested date and time.',
      statusText: 'The public page says to ask the front desk for details or submit the contact form.',
      description: 'D-BAT PDX West advertises birthday party rentals at the facility. The public page says party details are available from the front desk or by submitting the birthday party request form with a requested date and time. The home page notes birthday party options range from DIY to all-inclusive, but no single public price was visible.',
      warnings: [
        'Stored as a rental link-out because party package availability and pricing are handled by the facility.',
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
    originalName: 'dbat-pdx-west-logo.png',
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
      originalName: 'dbat-pdx-west-logo.png',
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
      originalName: 'dbat-pdx-west-logo.png',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Baseball', 'Softball']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Tigard, OR',
      address: ADDRESS,
      description: 'D-BAT PDX West is an indoor baseball and softball training facility in Tigard with batting cages, lessons, camps, clinics, HitTrax leagues, team practices, league takeovers, memberships, and birthday parties.',
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
      taxOrganizationType: 'SOLE_PROPRIETOR',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Tigard, OR',
      address: ADDRESS,
      description: 'D-BAT PDX West is an indoor baseball and softball training facility in Tigard with batting cages, lessons, camps, clinics, HitTrax leagues, team practices, league takeovers, memberships, and birthday parties.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
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
    name: 'D-BAT PDX West Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual D-BAT PDX West source from public Duda pages plus rendered D-BAT Hub detail pages. D-BAT Hub event list showed 0 available rows, so only directly linked current detail pages from the official source were included.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'dbatpdxwest.com robots.txt allows / for User-agent * with Content-Signal search=yes, ai-train=no, use=reference. app.dbathub.com robots.txt returned 404, and D-BAT Hub is used only for official action/detail URLs linked from the source site.',
      logoSourceUrl: LOGO_SOURCE_URL,
      renderedDetailPages: [
        ROOKIE_CLASS_URL,
        TURTLE_CAMP_URL,
      ],
      skippedRows: [
        'D-BAT Hub Camps & Clinics category page rendered 0 available rows, so it is not used as a repeated scrape list.',
        'No public current date or price was visible for HitTrax leagues, lessons, team practices, league takeovers, or birthday parties.',
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
      notes: 'Manual D-BAT PDX West facility, class, camp, lesson, league, and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual D-BAT PDX West facility, class, camp, lesson, league, and rental mapping.',
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

  console.log(`D-BAT PDX West affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-dbat-pdx-west-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
