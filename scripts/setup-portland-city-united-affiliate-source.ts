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
const ORG_ID = 'affiliate_org_portland_city_united';
const LOGO_FILE_ID = 'affiliate_file_portland_city_united_logo';
const SOURCE_ID = 'affiliate_source_portland_city_united_programs';
const SOURCE_KEY = 'portland-city-united-programs';
const MAPPING_ID = 'affiliate_source_portland_city_united_programs_mapping_v1';
const HOME_URL = 'https://www.pcusc.org/';
const CAMPS_URL = 'https://www.pcusc.org/post/pdx-youth-soccer-camps';
const TECHNICAL_ACADEMY_URL = 'https://www.pcusc.org/post/technicalacademy';
const ROSE_CITY_CLASSIC_URL = 'https://www.pcusc.org/post/rose-city-classic-tournament';
const SUMMER_CLASSIC_URL = 'https://www.pcusc.org/post/summerclassic';
const CAMP_REGISTRATION_URL = 'https://login.stacksports.com/login?client_id=612b0399b1854a002e427f78&redirect_uri=https://core-api.bluesombrero.com/login/redirect/portal/30578&app_name=Portland+City+United+Soccer+Club&portalid=30578&instancekey=tshq';
const TECHNICAL_ACADEMY_FALL_URL = 'https://pcusc.byga.net/programs/zfxi8ta17/signup';
const ROSE_CITY_CLASSIC_REGISTRATION_URL = 'https://system.gotsport.com/event_regs/748264b6ae';
const LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/7e16f0_e383eeea2a8040d1b5f0a30d70f31968~mv2.png';
const ORGANIZER_NAME = 'Portland City United Soccer Club';
const BUCKMAN_ADDRESS = '426 NE 12th St, Portland, OR 97232';
const PORTLAND_CHRISTIAN_ADDRESS = '12425 NE San Rafael St, Portland, OR 97230';

const ageDivision = (
  name: string,
  divisionTypeId: string,
  priceCents: number,
  maxParticipants: number | null,
) => ({
  name,
  key: `c_${divisionTypeId}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  priceCents,
  maxParticipants,
  ageCutoffLabel: `${name} using the August 1 youth soccer seasonal age cycle`,
  ageCutoffSource: 'PCU tournament/program source page',
});

const roseCityClassicDivisions = [
  ageDivision('U9', 'u9', 50000, 14),
  ageDivision('U10', 'u10', 50000, 14),
  ageDivision('U11', 'u11', 60000, 18),
  ageDivision('U12', 'u12', 60000, 18),
  ageDivision('U13', 'u13', 70000, 22),
  ageDivision('U14', 'u14', 70000, 22),
  ageDivision('U15', 'u15', 70000, 22),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland City United Soccer Club Programs',
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
      listingKind: 'CLUB',
      title: ORGANIZER_NAME,
      officialActionUrl: HOME_URL,
      sourceUrl: HOME_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer club',
      city: 'Portland, OR',
      venueName: 'Buckman Field Complex',
      address: BUCKMAN_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'PCU runs youth soccer teams, academies, camps, leagues, tournaments, and development pathways for U5-U19 players.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Club programs by season',
      participantOptionsText: 'Youth teams, academies, camps, tournaments, and development programs.',
      description: 'Portland City United Soccer Club is a Portland youth soccer club serving U5-U19 players with teams, academies, camps, leagues, tournaments, ECNL RL and Pre-ECNL RL pathways, financial aid, and training facilities at Buckman Field Complex and Portland Christian High School.',
      warnings: [
        'Publishes as a public organization candidate, not as an evergreen event.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'PCU Rose City Classic Tournament',
      officialActionUrl: ROSE_CITY_CLASSIC_REGISTRATION_URL,
      sourceUrl: ROSE_CITY_CLASSIC_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer tournament',
      city: 'Portland, OR',
      venueName: 'Buckman Field Complex and Portland-area fields',
      address: BUCKMAN_ADDRESS,
      startsAt: '2026-08-15T00:00:00-07:00',
      endsAt: '2026-08-16T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 15-16, 2026. The source says schedules are expected August 10, 2026.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 15-16, 2026',
      skillLevel: 'Gold, Silver, and Bronze brackets',
      ageGroup: 'U9-U15',
      divisionText: 'U9; U10; U11; U12; U13; U14; U15',
      maxParticipantsText: 'Roster limits vary by age group: 14 for U9-U10, 18 for U11-U12, and 22 for U13-U15.',
      participantOptionsText: 'Team registration',
      priceText: '$500-$700',
      registrationDeadlineText: 'August 1, 2026',
      statusText: 'Team registration open on the official GotSport form.',
      description: 'The PCU Rose City Classic is listed for August 15-16, 2026 with team registration open and a registration deadline of August 1, 2026. PCU lists U9-U15 age groups with Gold, Silver, and Bronze divisions. Published locations include Buckman Field, Delta Park, Portland Christian, and additional fields to be determined. Fees are $500 for U9-U10, $600 for U11-U12, and $700 for U13-U15, with a 4 percent credit-card fee if applicable.',
      divisions: roseCityClassicDivisions,
    },
    {
      listingKind: 'EVENT',
      title: 'PCU Skills Camp #2',
      officialActionUrl: CAMP_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer skills camp',
      city: 'Portland, OR',
      venueName: 'Buckman Field Complex',
      address: BUCKMAN_ADDRESS,
      startsAt: '2026-07-13T09:30:00-07:00',
      endsAt: '2026-07-16T12:30:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 13-16, 2026 from 9:30 AM to 12:30 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 13-16, 2026',
      skillLevel: 'Competitive skills training',
      ageGroup: 'Ages 9-14',
      divisionText: 'Coed U14',
      participantOptionsText: 'Individual registration',
      priceText: '$195',
      statusText: 'Registration is linked through the official PCU Stack Sports flow.',
      description: 'PCU Skills Camp #2 is listed for July 13-16, 2026 from 9:30 AM to 12:30 PM at Buckman Field Complex. The source says this camp is best suited for 9-14 year olds who play competitively or are interested in higher-level training, with speed, agility, technical, tactical, and position-specific work led by PCU licensed competitive coaches and a goalkeeper coach.',
      divisions: [
        ageDivision('U14', 'u14', 19500, null),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'PCU Summer Day Camp #3',
      officialActionUrl: CAMP_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer day camp',
      city: 'Portland, OR',
      venueName: 'Buckman Field Complex',
      address: BUCKMAN_ADDRESS,
      startsAt: '2026-07-27T09:00:00-07:00',
      endsAt: '2026-07-30T14:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 27-30, 2026 from 9:00 AM to 2:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 27-30, 2026',
      skillLevel: 'Recreational and competitive players',
      ageGroup: 'Ages 5-14',
      divisionText: 'Coed U14',
      participantOptionsText: 'Individual registration',
      priceText: '$225',
      statusText: 'Registration is linked through the official PCU Stack Sports flow.',
      description: 'PCU Summer Day Camp #3 is listed for July 27-30, 2026 from 9:00 AM to 2:00 PM at Buckman Field Complex. PCU describes the day camp as a mix of sportsmanship, skill-building, social activities, small- and large-sided games, technical development, team building, Wacky Wednesday, Jersey Day, and a camp-wide tournament for 5-14 year olds.',
      divisions: [
        ageDivision('U14', 'u14', 22500, null),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'PCU Advanced High School Camp',
      officialActionUrl: CAMP_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'High school soccer camp',
      city: 'Portland, OR',
      venueName: 'Buckman Field Complex',
      address: BUCKMAN_ADDRESS,
      startsAt: '2026-07-27T10:00:00-07:00',
      endsAt: '2026-07-30T12:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 27-30, 2026 from 10:00 AM to 12:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 27-30, 2026',
      skillLevel: 'High school pre-tryout training',
      ageGroup: 'High school players',
      divisionText: 'Coed U19',
      participantOptionsText: 'Individual registration',
      priceText: '$275',
      statusText: 'Registration is linked through the official PCU Stack Sports flow.',
      description: 'PCU Advanced High School Camp is listed for July 27-30, 2026 from 10:00 AM to 12:00 PM at Buckman Field Complex. The source says the camp is for high schoolers, including incoming freshmen, who play competitively or are interested in higher-level training. It focuses on technical and physical work to prepare athletes for high school soccer tryouts and beyond.',
      divisions: [
        ageDivision('U19', 'u19', 27500, null),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'PCU Fall Technical Development Academy',
      officialActionUrl: TECHNICAL_ACADEMY_FALL_URL,
      sourceUrl: TECHNICAL_ACADEMY_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Indoor Soccer',
      formatLabel: 'Soccer technical academy',
      city: 'Portland, OR',
      venueName: 'Portland Christian High School Futsal Courts',
      address: PORTLAND_CHRISTIAN_ADDRESS,
      startsAt: '2026-09-07T18:00:00-07:00',
      endsAt: '2026-11-10T20:15:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'September 7-November 10, 2026. Groups train Monday or Tuesday in 1-hour sessions at 6:00 PM or 7:15 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 7-November 10, 2026',
      skillLevel: 'Open to all levels and abilities',
      ageGroup: '4th-8th graders, U10-U14',
      divisionText: 'Coed U14',
      participantOptionsText: 'Individual registration',
      priceText: '$200',
      registrationDeadlineText: 'September 1, 2026',
      statusText: 'Fall registration is linked through the official PCU BYGA form.',
      description: 'PCU Fall Technical Development Academy is listed for September 7-November 10, 2026 at the Portland Christian High School futsal courts. The source says the academy is for 4th-8th graders, U10-U14, and is open to current PCU players, players from other competitive clubs, and recreational players. The program includes ten 1-hour Monday or Tuesday sessions focused on dribbling, passing, receiving, and shooting. The listed fee is $200 and the registration deadline is September 1, 2026.',
      divisions: [
        ageDivision('U14', 'u14', 20000, null),
      ],
      warnings: [
        'Spring academy details were skipped because the source labels it Spring 2027 but lists February-April 2026 dates.',
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
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-city-united-logo.png',
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
      originalName: 'portland-city-united-logo.png',
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
      originalName: 'portland-city-united-logo.png',
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
    select: { coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates(BUCKMAN_ADDRESS)
    ?? existing?.coordinates
    ?? null;

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: BUCKMAN_ADDRESS,
      description: 'Portland City United Soccer Club serves Portland youth soccer players with teams, academies, camps, tournaments, financial aid, and development pathways from U5 through U19.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
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
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: BUCKMAN_ADDRESS,
      description: 'Portland City United Soccer Club serves Portland youth soccer players with teams, academies, camps, tournaments, financial aid, and development pathways from U5 through U19.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
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
    name: 'Portland City United Soccer Club Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual PCU source. Produces a public club candidate plus current future tournament, camp, and academy rows. Closed, past, and inconsistent-date rows are skipped.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'pcusc.org robots.txt allows public pages for User-agent: * and only disallows lightbox/internal gallery paths.',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedRows: [
        {
          title: 'PCU Summer Classic Tournament',
          url: SUMMER_CLASSIC_URL,
          reason: 'Future tournament page says registration is closed for 2026.',
        },
        {
          title: '26/27 Season Tryouts',
          url: 'https://www.pcusc.org/post/26-27-season-tryouts',
          reason: 'Tryout schedule is from May and should not become an evergreen club event.',
        },
        {
          title: 'Spring 2027 Technical Development Academy',
          url: TECHNICAL_ACADEMY_URL,
          reason: 'Source heading says Spring 2027 but body lists February-April 2026 dates.',
        },
        {
          title: 'PCU Summer Day Camp #2',
          url: CAMPS_URL,
          reason: 'Started July 6, 2026 and should not be newly imported after it starts.',
        },
      ],
      sourcePages: [
        HOME_URL,
        CAMPS_URL,
        TECHNICAL_ACADEMY_URL,
        ROSE_CITY_CLASSIC_URL,
        SUMMER_CLASSIC_URL,
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...sourcePayload,
    },
    update: {
      updatedAt: new Date(),
      ...sourcePayload,
    },
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
      notes: 'Manual PCU club, tournament, camp, and academy candidates.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual PCU club, tournament, camp, and academy candidates.',
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
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  const shouldScrape = process.argv.includes('--scrape');
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    const logs = (result.run as any).logs ?? {};
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs.createdCandidateCount ?? 0}, updated ${logs.updatedCandidateCount ?? 0}, rejected ${logs.rejectedCount ?? 0}).`);
    for (const candidate of result.candidates) {
      console.log(`- ${candidate.listingKind}: ${candidate.title} [${candidate.dateDisplayMode ?? 'SCHEDULED'} ${candidate.dateDisplayText ?? candidate.startsAt ?? 'not specified'}]`);
    }
  } else {
    console.log(`Configured affiliate source ${SOURCE_KEY}. Run with --scrape to create/update candidates.`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma && typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  });
