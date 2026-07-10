import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualDivision = NonNullable<
  NonNullable<AffiliateScrapeMapping['manualCandidates']>[number]['divisions']
>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_troutdale_indoor_sports';
const SOURCE_ID = 'affiliate_source_troutdale_indoor_sports_programs';
const SOURCE_KEY = 'troutdale-indoor-sports-programs';
const MAPPING_ID = 'affiliate_mapping_troutdale_indoor_sports_programs_v1';
const HOME_URL = 'https://www.troutdaleindoorsports.com/';
const ADULT_URL = 'https://www.troutdaleindoorsports.com/adult';
const YOUTH_URL = 'https://www.troutdaleindoorsports.com/youth';
const BASKETBALL_URL = 'https://www.troutdaleindoorsports.com/baksetball';
const BOOKING_URL = 'https://nattyhatty.com/114/bookings';
const FACILITY_ADDRESS = '1255 NE 8th St, Gresham, OR 97030';

const skillDivision = (
  name: string,
  gender: 'M' | 'F' | 'C',
  divisionTypeId: string,
  priceCents: number,
): ManualDivision => ({
  name,
  key: `${gender.toLowerCase()}_skill_${divisionTypeId}`,
  gender,
  ratingType: 'SKILL',
  divisionTypeId,
  priceCents,
  maxParticipants: null,
});

const ageDivision = (age: number, priceCents: number): ManualDivision => ({
  name: `U${age}`,
  key: `c_age_u${age}`,
  gender: 'C',
  ratingType: 'AGE',
  divisionTypeId: `u${age}`,
  priceCents,
  maxParticipants: null,
  ageCutoffLabel: `U${age} based on the oldest player's birth year`,
  ageCutoffSource: YOUTH_URL,
});

const adultSoccerDivisions: ManualDivision[] = [
  skillDivision('Men D1', 'M', 'd1', 85000),
  skillDivision('Men D2', 'M', 'd2', 85000),
  skillDivision('Men D3', 'M', 'd3', 85000),
  skillDivision('Men 30+', 'M', '30-plus', 85000),
  skillDivision('Coed', 'C', 'coed', 85000),
];

const youthSoccerDivisions: ManualDivision[] = Array.from(
  { length: 12 },
  (_, index) => ageDivision(index + 7, 53000),
);

const basketballDivisions: ManualDivision[] = [
  skillDivision('Men Advanced D1', 'M', 'd1', 85000),
  skillDivision('Men Intermediate D2', 'M', 'd2', 85000),
  skillDivision('Men Amateur D3', 'M', 'd3', 85000),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Troutdale Indoor Sports Programs',
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
      title: 'Troutdale Indoor Sports Adult Soccer Leagues',
      officialActionUrl: ADULT_URL,
      sourceUrl: ADULT_URL,
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult indoor soccer league',
      city: 'Troutdale, OR',
      venueName: 'Troutdale Indoor Sports',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Eight-week sessions with games Monday-Friday from 7:00 PM to 11:00 PM. Check the official page for the current session.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Sessions offered throughout the year',
      skillLevel: 'D1, D2, D3, 30+, and seasonal coed play',
      ageGroup: 'Adults',
      divisionText: 'Men D1; Men D2; Men D3; Men 30+; Coed',
      participantOptionsText: 'Team registration',
      priceText: '$850',
      statusText: 'Confirm the current session and registration status on the official page.',
      description: 'Troutdale Indoor Sports offers adult indoor soccer in Men D1, D2, D3, seasonal Men 30+, and seasonal coed play. The source lists eight guaranteed league games with the possibility of quarterfinal, semifinal, and final games. Team registration is $850 for an eight-week session and includes referee fees. Player cards are separate: $25 for new members, $15 for renewals, and $10 for replacements.',
      tags: ['League'],
      divisions: adultSoccerDivisions,
    },
    {
      listingKind: 'EVENT',
      title: 'Troutdale Indoor Sports Youth Soccer League',
      officialActionUrl: YOUTH_URL,
      sourceUrl: YOUTH_URL,
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Indoor Soccer',
      formatLabel: 'Youth indoor soccer league',
      city: 'Troutdale, OR',
      venueName: 'Troutdale Indoor Sports',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Eight-game sessions are played Saturday-Sunday between 7:00 AM and 7:00 PM. Check the official page for the current session.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Sessions offered by season',
      skillLevel: 'Youth birth-year divisions',
      ageGroup: 'U7-U18',
      divisionText: 'U7; U8; U9; U10; U11; U12; U13; U14; U15; U16; U17; U18',
      participantOptionsText: 'Team registration',
      priceText: '$530',
      statusText: 'Confirm the current session and age brackets on the official page.',
      description: 'Troutdale Indoor Sports lists youth indoor soccer for U7-U18, with teams registered according to the birth year of the oldest player. The eight-game team fee is $530 including referee payments. The source also lists a $475 promotion for teams that pay the season balance within their first three league games. Player cards are mandatory and priced separately at $10 for new members or renewals, $5 for replacements, and $2 for a temporary ID.',
      tags: ['League'],
      divisions: youthSoccerDivisions,
    },
    {
      listingKind: 'EVENT',
      title: "Troutdale Indoor Sports Men's Basketball League",
      officialActionUrl: BASKETBALL_URL,
      sourceUrl: BASKETBALL_URL,
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Basketball',
      formatLabel: "Men's indoor basketball league",
      city: 'Troutdale, OR',
      venueName: 'Troutdale Indoor Sports',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Seven-week sessions with Friday games from 6:00 PM to 10:45 PM and Sunday games from 2:00 PM to 10:45 PM. Check the official page for the current session.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Year-round seven-week sessions',
      skillLevel: 'Advanced D1, Intermediate D2, and Amateur D3',
      ageGroup: 'Ages 15+',
      divisionText: 'Men Advanced D1; Men Intermediate D2; Men Amateur D3',
      participantOptionsText: 'Team registration; individual players may ask for team placement',
      priceText: '$850',
      statusText: 'Call the facility to confirm the next session and reserve a place.',
      description: "Troutdale Indoor Sports runs a year-round men's basketball league for ages 15 and older at Advanced D1, Intermediate D2, and Amateur D3 levels. Sessions usually run seven weeks with seven games. Games are listed for Friday evenings and Sunday afternoons and evenings. The source lists a flat team fee of $850 per seven-week session and says players without a team may request help finding one.",
      tags: ['League'],
      divisions: basketballDivisions,
    },
    {
      listingKind: 'EVENT',
      title: 'Troutdale Indoor Sports Indoor Soccer Friendly Match',
      officialActionUrl: ADULT_URL,
      sourceUrl: ADULT_URL,
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor soccer friendly match',
      city: 'Troutdale, OR',
      venueName: 'Troutdale Indoor Sports',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Friendly matches are available by phone based on facility availability.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Call for availability',
      divisionText: 'Open',
      participantOptionsText: 'Team booking',
      priceText: '$75',
      statusText: 'Call Troutdale Indoor Sports to confirm availability.',
      description: 'Troutdale Indoor Sports lists indoor soccer friendly matches for $75 per game. Match times are not published as fixed dates; teams should call the facility to confirm current field availability before planning a game.',
      tags: ['Pickup Game'],
      divisions: [skillDivision('Open', 'C', 'open', 7500)],
    },
    {
      listingKind: 'RENTAL',
      title: 'Troutdale Indoor Sports Field and Court Rentals',
      officialActionUrl: BOOKING_URL,
      sourceUrl: HOME_URL,
      organizerName: 'Troutdale Indoor Sports',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor field and basketball court rental',
      city: 'Troutdale, OR',
      venueName: 'Troutdale Indoor Sports',
      address: FACILITY_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Use the official booking calendar for current field and court availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Book on official calendar',
      participantOptionsText: 'Indoor soccer field and basketball court rentals.',
      statusText: 'Current availability and pricing are shown in the official booking calendar.',
      description: 'Troutdale Indoor Sports offers a spacious indoor soccer field and basketball court for rentals. The official site directs renters to its external booking calendar to review open field and court times and complete the booking process.',
      tags: ['Rental'],
    },
  ],
};

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: '<html><body></body></html>',
    fetchedAt: new Date().toISOString(),
  }),
};

const requireOwnerAndOrganization = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }

  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { id: true, name: true, logoId: true },
  });
  if (!organization) {
    throw new Error(`Organization ${ORG_ID} was not found.`);
  }
  if (!organization.logoId) {
    throw new Error('Troutdale Indoor Sports must have an official logo before source setup.');
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Troutdale Indoor Sports references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      operatesAthleticFacility: true,
      updatedAt: new Date(),
    },
  });
  await syncOrganizationTags(
    ORG_ID,
    ['Event Manager', 'Facility', 'League Operator', 'Rental Provider'],
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Troutdale Indoor Sports Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manually verified evergreen source for stable Troutdale programs that do not expose reliable dated registration rows.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-summary-evergreen',
      sourcePages: [HOME_URL, ADULT_URL, YOUTH_URL, BASKETBALL_URL, BOOKING_URL],
      replacedSourceKeys: [
        'troutdale-indoor-sports-adult-soccer-leagues',
        'troutdale-indoor-sports-youth-soccer-league',
        'troutdale-indoor-sports-mens-basketball-league',
        'troutdale-indoor-sports-rentals',
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...sourcePayload },
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
      notes: 'Manual source-backed Troutdale program and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual source-backed Troutdale program and rental mapping.',
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
  await requireOwnerAndOrganization();
  await upsertSourceAndMapping();
  console.log('Troutdale Indoor Sports source and validated mapping are ready.');

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the five candidates locally.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-troutdale-indoor-sports-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
