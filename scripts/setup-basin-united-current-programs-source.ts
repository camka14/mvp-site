/**
 * Basin United current program source setup.
 *
 * The public site mixes current and expired rows on generic pages, so this
 * source records the current, manually verified 2026 programs only. The
 * separate facility-rental source remains responsible for rental inventory.
 */
import dotenv from 'dotenv';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_basin_united_soccer_club';
const SOURCE_ID = 'affiliate_source_basin_united_current_programs';
const SOURCE_KEY = 'basin-united-current-programs';
const MAPPING_ID = 'affiliate_mapping_basin_united_current_programs_v1';
const CLUB_URL = 'https://www.mikesfieldhouse.org/basin-united-soccer-club';
const PROGRAMS_URL = 'https://www.mikesfieldhouse.org/newpageaabf0709';
const CAMPS_URL = 'https://www.mikesfieldhouse.org/camps/clinics';
const ADDRESS = '4500 Foothills Blvd, Klamath Falls, OR 97603';
const VENUE = "Mike's Fieldhouse and Steen Sports Park";
const FALL_REGISTRATION_URL = 'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=4685&GroupID=4069108';
const TECHNICAL_REGISTRATION_URL = 'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=4685&GroupID=4036995';
const TACTICAL_REGISTRATION_URL = 'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=4685&GroupID=4036982';
const GOALKEEPER_REGISTRATION_URL = 'https://tms.ezfacility.com/OnlineRegistrations/Register.aspx?CompanyID=4685&GroupID=4037019';

const ageDivision = (
  name: string,
  key: string,
  divisionTypeId: string,
  priceCents: number,
  ageCutoffLabel: string,
  ageCutoffSource: string,
): ManualDivision => ({
  name,
  key,
  gender: 'C',
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  maxParticipants: null,
  ageCutoffLabel,
  ageCutoffSource,
});

const fallDivisions: ManualDivision[] = [
  ageDivision('Little Kickers', 'c_age_u4_little_kickers', 'u4', 9500, 'Ages 2-3', FALL_REGISTRATION_URL),
  ageDivision('Grasshoppers', 'c_age_youth_grasshoppers', 'youth', 9500, 'Grasshoppers division; exact age not stated', FALL_REGISTRATION_URL),
  ageDivision('Kinder Coed', 'c_age_u6_kinder', 'u6', 9500, 'Kindergarten', FALL_REGISTRATION_URL),
  ageDivision('1st-2nd Grade', 'c_age_u8_1st_2nd', 'u8', 9500, '1st-2nd grade', FALL_REGISTRATION_URL),
  ageDivision('3rd-4th Grade', 'c_age_u10_3rd_4th', 'u10', 9500, '3rd-4th grade', FALL_REGISTRATION_URL),
  ageDivision('5th-6th Grade', 'c_age_u12_5th_6th', 'u12', 9500, '5th-6th grade', FALL_REGISTRATION_URL),
  ageDivision('7th-8th Grade', 'c_age_u14_7th_8th', 'u14', 9500, '7th-8th grade', FALL_REGISTRATION_URL),
];

const campDivisions = (sourceUrl: string): ManualDivision[] => [
  ageDivision('Half-Day, Ages 6-14', 'c_age_u14_half_day', 'u14', 20000, 'Ages 6-14', sourceUrl),
  ageDivision('Full-Day, 3rd Grade and Up', 'c_age_u14_full_day', 'u14', 25000, 'Ages 6-14; full-day registration is limited to 3rd grade and up', sourceUrl),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: PROGRAMS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Basin United Current Programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: PROGRAMS_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Basin United Fall 2026 Recreational Soccer',
      officialActionUrl: FALL_REGISTRATION_URL,
      sourceUrl: PROGRAMS_URL,
      organizerName: 'Basin United Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth recreational soccer league',
      city: 'Klamath Falls, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2026-09-12T00:00:00-07:00',
      endsAt: '2026-10-24T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Training begins the week of September 7. Games begin September 11-12 and the eight-game season runs through October 24, 2026; exact team times are assigned by the club.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 12-October 24, 2026',
      ageGroup: 'Ages 2-3 through 8th grade',
      divisionText: 'Little Kickers; Grasshoppers; Kinder Coed; 1st-2nd; 3rd-4th; 5th-6th; 7th-8th Grade',
      participantOptionsText: 'Individual player registration',
      priceText: '$95',
      statusText: 'Regular registration is open through August 14, 2026.',
      registrationDeadlineText: 'August 14, 2026',
      description: 'Basin United lists an eight-game Fall 2026 recreational soccer season for Little Kickers through 8th grade. Training begins the week of September 7 and games begin September 11-12. Registration is $95 per player and includes the official Basin United uniform shirt. The source says practice locations and times are assigned by coaches and game days may be adjusted when rescheduling is necessary.',
      tags: ['League'],
      divisions: fallDivisions,
      warnings: [
        'The registration page contains an obsolete April-May line, but its detailed division rows and the club programs page consistently list the current September 12-October 24, 2026 season.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Basin United Technical Soccer Camp 2026',
      officialActionUrl: TECHNICAL_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: 'Basin United Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Technical soccer camp',
      city: 'Klamath Falls, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2026-07-13T09:00:00-07:00',
      endsAt: '2026-07-17T16:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 13-17, 2026. Half-day options run 9:00 AM-noon or 1:00 PM-4:00 PM; full-day registration is available for 3rd grade and up.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 13-17, 2026',
      ageGroup: 'Ages 6-14',
      divisionText: 'Half-Day; Full-Day for 3rd grade and up',
      participantOptionsText: 'Individual camp registration',
      priceText: '$200-$250',
      statusText: 'Preregistration and full payment are required.',
      description: 'Basin United describes this five-day camp as technical training in shooting, passing, ball control, and dribbling through games and drills. Half-day registration is $200 and full-day registration is $250 for players in 3rd grade and up. A camp T-shirt is included.',
      tags: ['Camp'],
      divisions: campDivisions(TECHNICAL_REGISTRATION_URL),
    },
    {
      listingKind: 'EVENT',
      title: 'Basin United Tactical Soccer Camp 2026',
      officialActionUrl: TACTICAL_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: 'Basin United Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Tactical soccer camp',
      city: 'Klamath Falls, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2026-08-17T09:00:00-07:00',
      endsAt: '2026-08-21T16:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 17-21, 2026. Half-day options run 9:00 AM-noon or 1:00 PM-4:00 PM; full-day registration is available for 3rd grade and up.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 17-21, 2026',
      ageGroup: 'Ages 6-14',
      divisionText: 'Half-Day; Full-Day for 3rd grade and up',
      participantOptionsText: 'Individual camp registration',
      priceText: '$200-$250',
      statusText: 'Preregistration and full payment are required.',
      description: 'Basin United describes this five-day camp as tactical training focused on field and player awareness, player roles, decision making, strategy, and applying technical skills in game situations. Half-day registration is $200 and full-day registration is $250 for players in 3rd grade and up. A camp T-shirt is included.',
      tags: ['Camp'],
      divisions: campDivisions(TACTICAL_REGISTRATION_URL),
    },
    {
      listingKind: 'EVENT',
      title: 'Basin United Goalkeeper Camp 2026',
      officialActionUrl: GOALKEEPER_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: 'Basin United Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Goalkeeper camp',
      city: 'Klamath Falls, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2026-08-24T09:00:00-07:00',
      endsAt: '2026-08-27T12:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 24-27, 2026 from 9:00 AM to noon.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 24-27, 2026',
      ageGroup: 'Ages 8-16',
      divisionText: 'Goalkeepers ages 8-16',
      participantOptionsText: 'Individual camp registration',
      priceText: '$150',
      statusText: 'Preregistration and full payment are required.',
      description: 'Basin United lists a four-day goalkeeper camp covering shot blocking, handling, footwork, diving, crosses, distribution, one-on-one situations, and decision making. The registration option charges $150 and includes a camp T-shirt.',
      tags: ['Camp'],
      divisions: [
        ageDivision('Goalkeepers Ages 8-16', 'c_age_u16_goalkeepers', 'u16', 15000, 'Ages 8-16', GOALKEEPER_REGISTRATION_URL),
      ],
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

const prepareOrganization = async () => {
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
  if (!organization?.logoId) {
    throw new Error('Basin United must exist with an official logo before source setup.');
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Basin United references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: { ownerId: owner.id, updatedAt: new Date() },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: ORG_ID },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    ORG_ID,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      'Event Manager',
      'League Operator',
      'Training Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Basin United Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.mikesfieldhouse.org/',
    listUrl: PROGRAMS_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for current dated Basin United programs on mixed current/expired public pages.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [CLUB_URL, PROGRAMS_URL, CAMPS_URL],
      skippedRows: [
        { url: CLUB_URL, reason: 'Current programs are handled by this validated manual mapping.' },
        { url: PROGRAMS_URL, reason: 'Current programs are handled by this validated manual mapping.' },
        { url: CAMPS_URL, reason: 'Current future camps are handled by this validated manual mapping.' },
        { label: 'Foundation Soccer Camp', reason: 'June 22-26, 2026 dates are past.' },
        { label: 'Fall Soccer Tryouts', reason: 'June 8-9, 2026 dates are past.' },
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
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manually verified Basin United current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified Basin United current-program mapping.',
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
  await prepareOrganization();
  await upsertSourceAndMapping();
  console.log('Basin United current-program source is ready with four candidates.');

  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-basin-united-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
