/**
 * Capital FC current program source setup.
 *
 * The club site mixes current registration, already-started programs, expired
 * tournaments, and linked Coerver offerings. This source keeps only future or
 * genuinely ongoing rows that were verified against the official pages.
 */
import dotenv from 'dotenv';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive && process.env.DATABASE_URL_LIVE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];
type ManualDivision = NonNullable<ManualCandidate['divisions']>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_capital_fc';
const SOURCE_ID = 'affiliate_source_capital_fc_current_programs';
const SOURCE_KEY = 'capital-fc-current-programs';
const MAPPING_ID = 'affiliate_mapping_capital_fc_current_programs_v1';
const BASE_URL = 'https://www.cfcsalem.com/';
const HOME_URL = 'https://www.cfcsalem.com/';
const REC_URL = 'https://www.cfcsalem.com/rec';
const MIGHTY_MITES_URL = 'https://www.cfcsalem.com/mighty-mites';
const CHERRY_CITY_CUP_URL = 'https://www.cfcsalem.com/cherrycitycup';
const GOLF_URL = 'https://www.cfcsalem.com/golf';
const SUMMER_URL = 'https://www.cfcsalem.com/summer';
const ADULT_URL = 'https://www.cfcsalem.com/adultsoccer';
const TRYOUTS_URL = 'https://www.cfcsalem.com/tryouts';
const COERVER_SCHEDULE_URL = 'https://or.coervernw.com/schedule';
const COERVER_API_URL = 'https://4v4eisnrkq.us-west-2.awsapprunner.com/programs';
const PIONEER_ADDRESS = '5201 State St, Salem, OR 97317';
const ESCC_ADDRESS = '1850 45th Ave NE, Salem, OR 97305';
const SALEM_INDOOR_ADDRESS = '4701 Portland Rd NE, Salem, OR 97305';

const ageDivision = (
  name: string,
  key: string,
  divisionTypeId: string,
  priceCents: number | null,
  ageCutoffLabel: string,
  sourceUrl: string,
  gender: 'M' | 'F' | 'C' = 'C',
  maxParticipants?: number,
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  maxParticipants,
  ageCutoffLabel,
  ageCutoffSource: sourceUrl,
});

const skillDivision = (
  name: string,
  key: string,
  priceCents: number,
  gender: 'M' | 'F' | 'C' = 'C',
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: 'SKILL',
  divisionTypeId: key,
  priceCents,
});

const fallRecDivisions: ManualDivision[] = [
  ['Boys Kindergarten', 'm_age_u6_kindergarten', 'u6', 'Kindergarten', 'M'],
  ['Girls Kindergarten', 'f_age_u6_kindergarten', 'u6', 'Kindergarten', 'F'],
  ['Boys 1st Grade', 'm_age_u7_1st_grade', 'u7', '1st grade', 'M'],
  ['Girls 1st Grade', 'f_age_u7_1st_grade', 'u7', '1st grade', 'F'],
  ['Boys 2nd Grade', 'm_age_u8_2nd_grade', 'u8', '2nd grade', 'M'],
  ['Girls 2nd Grade', 'f_age_u8_2nd_grade', 'u8', '2nd grade', 'F'],
  ['Boys 3rd Grade', 'm_age_u9_3rd_grade', 'u9', '3rd grade', 'M'],
  ['Girls 3rd Grade', 'f_age_u9_3rd_grade', 'u9', '3rd grade', 'F'],
  ['Boys 4th-5th Grade', 'm_age_u11_4th_5th_grade', 'u11', '4th-5th grade', 'M'],
  ['Girls 4th-5th Grade', 'f_age_u11_4th_5th_grade', 'u11', '4th-5th grade', 'F'],
  ['Boys Middle School', 'm_age_u14_middle_school', 'u14', '6th-8th grade', 'M'],
  ['Girls Middle School', 'f_age_u14_middle_school', 'u14', '6th-8th grade', 'F'],
].map(([name, key, divisionTypeId, ageCutoffLabel, gender]) => ageDivision(
  name,
  key,
  divisionTypeId,
  17500,
  ageCutoffLabel,
  REC_URL,
  gender as 'M' | 'F',
));

const cherryCityDivisions: ManualDivision[] = [
  ['U9', 'u9', 49500],
  ['U10', 'u10', 49500],
  ['U11', 'u11', 59500],
  ['U12', 'u12', 59500],
  ['U13', 'u13', 69500],
  ['U14', 'u14', 69500],
].map(([name, divisionTypeId, priceCents]) => ageDivision(
  name as string,
  `c_age_${divisionTypeId}`,
  divisionTypeId as string,
  priceCents as number,
  name as string,
  CHERRY_CITY_CUP_URL,
));

const coerverCandidate = (params: {
  title: string;
  programId: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  currentParticipants: number;
  spotsRemaining: number;
}): ManualCandidate => ({
  listingKind: 'EVENT',
  title: params.title,
  officialActionUrl: `https://or.coervernw.com/programs/${params.programId}`,
  sourceUrl: SUMMER_URL,
  organizerName: 'Capital FC',
  sportName: 'Grass Soccer',
  formatLabel: 'Coerver soccer camp',
  city: 'Salem, OR',
  venueName: 'Pioneer Sports Park',
  address: PIONEER_ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `${params.dateDisplayText}, Monday-Thursday from 9:00 AM to noon.`,
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: params.dateDisplayText,
  ageGroup: 'Ages 4-14',
  divisionText: 'Boys and girls ages 4-14',
  maxParticipantsText: '100',
  currentParticipantsText: String(params.currentParticipants),
  spotsRemainingText: String(params.spotsRemaining),
  participantOptionsText: 'Individual camp registration',
  priceText: '$195',
  statusText: `${params.spotsRemaining} of 100 source-listed spots remain.`,
  description: 'Capital FC promotes this Coerver Summer Camp for boys and girls ages 4-14. The four mornings focus on ball mastery, skill development, small-sided games, competitions, and a mini challenge cup. The linked Coerver program lists a $195 registration fee.',
  tags: ['Camp'],
  divisions: [ageDivision(
    'Ages 4-14',
    'c_age_u14_ages_4_14',
    'u14',
    19500,
    'Ages 4-14',
    COERVER_API_URL,
    'C',
    100,
  )],
});

const fallPracticeCandidate = (params: {
  title: string;
  programId: string;
  startsAt: string;
  endsAt: string;
  timeLabel: string;
}): ManualCandidate => ({
  listingKind: 'EVENT',
  title: params.title,
  officialActionUrl: `https://or.coervernw.com/programs/${params.programId}`,
  sourceUrl: REC_URL,
  organizerName: 'Capital FC',
  sportName: 'Grass Soccer',
  formatLabel: 'Optional Friday technical training',
  city: 'Salem, OR',
  venueName: 'Pioneer Sports Park',
  address: PIONEER_ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `Fridays, September 11-October 30, 2026 from ${params.timeLabel}.`,
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: 'September 11-October 30, 2026',
  ageGroup: 'Kindergarten-8th grade',
  divisionText: 'Boys and girls, kindergarten-8th grade',
  maxParticipantsText: '50',
  currentParticipantsText: '0',
  spotsRemainingText: '50',
  participantOptionsText: 'Individual training registration',
  priceText: '$95',
  statusText: 'The linked Coerver program is open with 50 source-listed spots.',
  description: 'Capital FC offers this optional Friday Coerver training for recreational players who want additional ball mastery, dribbling, one-on-one development, and confidence work during the Fall 2026 season. The linked program lists a $95 fee.',
  tags: ['Clinic'],
  divisions: [ageDivision(
    'Kindergarten-8th Grade',
    `c_age_u14_fall_practice_${params.programId}`,
    'u14',
    9500,
    'Kindergarten-8th grade',
    COERVER_API_URL,
    'C',
    50,
  )],
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Capital FC current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Capital FC Fall 2026 Recreational Soccer',
      officialActionUrl: 'https://cfcsalem.byga.net/programs/op50htaw8p/signup',
      sourceUrl: REC_URL,
      organizerName: 'Capital FC',
      sportName: 'Grass Soccer',
      formatLabel: 'Fall recreational soccer league',
      city: 'Salem, OR',
      venueName: 'Pioneer Sports Park',
      address: PIONEER_ADDRESS,
      startsAt: '2026-09-08T00:00:00-07:00',
      endsAt: '2026-10-31T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Training begins the week of September 8, games begin September 12, and the final games are October 31, 2026. Team practice times are assigned separately.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 8-October 31, 2026',
      ageGroup: 'Kindergarten-8th grade',
      divisionText: 'Boys and girls kindergarten-8th grade',
      participantOptionsText: 'Individual player registration',
      priceText: '$175',
      statusText: 'Registration is open through August 16, 2026.',
      registrationDeadlineText: 'August 16, 2026',
      description: 'Capital FC lists an eight-week Fall 2026 recreational season for boys and girls in kindergarten through 8th grade. The $175 fee includes a CFC jersey, weekly training, and Saturday league games. Kindergarten through 3rd grade teams are grouped by grade and gender; 4th-8th grade teams play in gendered 4th-5th grade or middle-school divisions. Optional Friday Coerver training is registered separately.',
      tags: ['League'],
      divisions: fallRecDivisions,
      warnings: [
        'The official page specifies the first training week and game dates but not a universal event time; midnight stores the source-provided date boundary rather than inventing a practice time.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Capital FC Fall 2026 Mighty Mites',
      officialActionUrl: 'https://cfcsalem.byga.net/programs/lil8qof3bs/signup',
      sourceUrl: MIGHTY_MITES_URL,
      organizerName: 'Capital FC',
      sportName: 'Grass Soccer',
      formatLabel: 'Beginner preschool soccer program',
      city: 'Salem, OR',
      venueName: 'East Salem Community Center',
      address: ESCC_ADDRESS,
      startsAt: '2026-09-12T09:00:00-07:00',
      endsAt: '2026-10-31T16:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Eight Saturday sessions from September 12 through October 31, 2026. Families select a 45-minute time slot between 9:00 AM and 4:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 12-October 31, 2026',
      ageGroup: 'Ages 3-5',
      divisionText: 'Preschool ages 3-5',
      participantOptionsText: 'Individual child registration; parents may participate with children younger than 3 after contacting the office',
      priceText: '$130',
      statusText: 'Registration is open through August 16, 2026.',
      registrationDeadlineText: 'August 16, 2026',
      description: 'Capital FC Mighty Mites is a beginner program led by Coerver staff for preschool players ages 3-5. The source lists eight 45-minute Saturday sessions at the East Salem Community Center and a $130 fee that includes a Mighty Mites shirt. Parents of younger players may contact the club about parent-assisted participation.',
      tags: ['Clinic'],
      divisions: [ageDivision('Ages 3-5', 'c_age_u6_mighty_mites', 'u6', 13000, 'Ages 3-5', MIGHTY_MITES_URL)],
      warnings: [
        'The page twice calls September 12 and October 31 Wednesdays even though both dates fall on Saturday and the same page says sessions run on Saturdays; the Saturday schedule is used.',
        'A secondary summary says six weeks, while the detailed section says eight weeks and the date range contains eight Saturdays; the detailed eight-session schedule is used.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Capital FC Cherry City Cup 2026',
      officialActionUrl: 'https://system.gotsport.com/event_regs/df8ecc18e0',
      sourceUrl: CHERRY_CITY_CUP_URL,
      organizerName: 'Capital FC',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth team tournament',
      city: 'Salem, OR',
      venueName: 'Pioneer Sports Park',
      address: PIONEER_ADDRESS,
      startsAt: '2026-09-04T13:00:00-07:00',
      endsAt: '2026-09-06T20:30:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'September 4-6, 2026. Friday games begin at 1:00 PM; Saturday and Sunday games run between 8:30 AM and 8:30 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 4-6, 2026',
      ageGroup: 'U9-U14',
      divisionText: 'U9; U10; U11; U12; U13; U14',
      participantOptionsText: 'Team registration with a three-game guarantee',
      priceText: '$495-$695',
      statusText: 'Current registration fees apply through July 15; registration closes August 25, 2026.',
      registrationDeadlineText: 'August 25, 2026',
      description: 'Capital FC hosts the Cherry City Cup over Labor Day weekend at Pioneer Sports Park. Teams receive three games over three days, with finals on Sunday. Current fees through July 15 are $495 for U9-U10, $595 for U11-U12, and $695 for U13-U14. After July 15, those fees rise to $545, $645, and $745. The source also lists a 4% card-processing fee and a $10 weekend parking fee.',
      tags: ['Tournament'],
      divisions: cherryCityDivisions,
    },
    {
      listingKind: 'EVENT',
      title: 'Capital FC Golf Tournament 2026',
      officialActionUrl: GOLF_URL,
      sourceUrl: GOLF_URL,
      organizerName: 'Capital FC',
      sportName: 'Other',
      formatLabel: 'Four-person scramble golf tournament',
      city: 'Salem, OR',
      venueName: 'Illahe Hills Country Club',
      address: '3376 Country Club Dr S, Salem, OR 97302',
      startsAt: '2026-08-24T12:30:00-07:00',
      endsAt: '2026-08-24T18:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Monday, August 24, 2026. Registration opens at 10:30 AM, shotgun start is 12:30 PM, and the awards reception follows play.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 24, 2026',
      divisionText: 'Individual; Corporate four-person team',
      participantOptionsText: 'Individual or four-person team registration',
      priceText: '$250-$1,000',
      statusText: 'Use the official page to email Capital FC and reserve a spot.',
      description: 'Capital FC describes this fundraiser as a four-person scramble with team and skills-contest prizes. Individual registration is $250 and a corporate four-person team is $1,000. The fee includes a cart, practice facilities, lunch, a tee prize, and the post-tournament awards reception.',
      tags: ['Tournament', 'Fundraiser'],
      divisions: [
        skillDivision('Individual Player', 'individual_player', 25000),
        skillDivision('Corporate Four-Person Team', 'corporate_team', 100000),
      ],
      warnings: [
        'The official page gives the shotgun start and reception sequence but no fixed end time; 6:00 PM is an administrative display boundary and the detailed schedule remains authoritative.',
      ],
    },
    coerverCandidate({
      title: 'Capital FC July Coerver Summer Camp 2026',
      programId: 'cmo81tdm30009mu01l8o3cbbq',
      startsAt: '2026-07-13T09:00:00-07:00',
      endsAt: '2026-07-16T12:00:00-07:00',
      dateDisplayText: 'July 13-16, 2026',
      currentParticipants: 30,
      spotsRemaining: 70,
    }),
    coerverCandidate({
      title: 'Capital FC August Coerver Summer Camp 2026',
      programId: 'cmo82ervn000emu013eacemm6',
      startsAt: '2026-08-10T09:00:00-07:00',
      endsAt: '2026-08-13T12:00:00-07:00',
      dateDisplayText: 'August 10-13, 2026',
      currentParticipants: 13,
      spotsRemaining: 87,
    }),
    fallPracticeCandidate({
      title: 'Capital FC Fall Extra Rec Practice - 5:10 PM',
      programId: 'cmqd44anq000io801cpi3c3rc',
      startsAt: '2026-09-11T17:10:00-07:00',
      endsAt: '2026-10-30T18:00:00-07:00',
      timeLabel: '5:10 PM-6:00 PM',
    }),
    fallPracticeCandidate({
      title: 'Capital FC Fall Extra Rec Practice - 6:10 PM',
      programId: 'cmqd4hdrh000ko801rz9iql1l',
      startsAt: '2026-09-11T18:10:00-07:00',
      endsAt: '2026-10-30T19:00:00-07:00',
      timeLabel: '6:10 PM-7:00 PM',
    }),
    {
      listingKind: 'EVENT',
      title: "Capital FC Women's Saturday Open Play",
      officialActionUrl: 'https://cfcsalem.byga.net/programs/wzlst1pvvd/signup',
      sourceUrl: ADULT_URL,
      organizerName: 'Capital FC',
      sportName: 'Indoor Soccer',
      formatLabel: "Women's weekly open play",
      city: 'Salem, OR',
      venueName: 'Salem Indoor',
      address: SALEM_INDOOR_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Saturday nights at 8:00 PM. Check the official adult soccer page for current availability before attending.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Saturday nights at 8:00 PM',
      divisionText: "Women's open play",
      participantOptionsText: 'Individual drop-in; free adult membership required',
      priceText: '$8',
      statusText: 'The source lists an $8 drop-in fee.',
      description: "Capital FC lists weekly women's open play at Salem Indoor on Saturday nights at 8:00 PM. Players must hold the club's free adult membership before participating, and the source lists an $8 drop-in fee.",
      tags: ['Open Play'],
      divisions: [skillDivision("Women's Open Play", 'womens_open_play', 800, 'F')],
    },
    {
      listingKind: 'EVENT',
      title: 'Capital FC Friday Coed Open Play',
      officialActionUrl: 'https://cfcsalem.byga.net/programs/wzlst1pvvd/signup',
      sourceUrl: ADULT_URL,
      organizerName: 'Capital FC',
      sportName: 'Grass Soccer',
      formatLabel: 'Coed weekly open play',
      city: 'Salem, OR',
      venueName: 'Pioneer Sports Park',
      address: PIONEER_ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Friday nights at 8:00 PM. Check the official adult soccer page for current availability before attending.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Friday nights at 8:00 PM',
      divisionText: 'Coed open play',
      participantOptionsText: 'Individual drop-in; free adult membership required',
      priceText: '$5',
      statusText: 'The source lists a $5 drop-in fee.',
      description: "Capital FC lists weekly coed open play at the club complex on Friday nights at 8:00 PM. Players must hold the club's free adult membership before participating, and the source lists a $5 drop-in fee.",
      tags: ['Open Play'],
      divisions: [skillDivision('Coed Open Play', 'coed_open_play', 500)],
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
    select: { id: true, logoId: true },
  });
  if (!organization?.logoId) {
    throw new Error('Capital FC must exist with an official logo before source setup.');
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Capital FC references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      website: BASE_URL,
      location: 'Salem, OR',
      address: PIONEER_ADDRESS,
      updatedAt: new Date(),
    },
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
      'Tournament Organizer',
      'Training Provider',
      'Facility Operator',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Capital FC Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for current Capital FC registrations, tournaments, camps, and ongoing open play.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [
        HOME_URL,
        REC_URL,
        MIGHTY_MITES_URL,
        CHERRY_CITY_CUP_URL,
        GOLF_URL,
        SUMMER_URL,
        ADULT_URL,
        TRYOUTS_URL,
        COERVER_SCHEDULE_URL,
        COERVER_API_URL,
      ],
      skippedRows: [
        { url: HOME_URL, reason: 'Current programs are handled by this validated manual mapping.' },
        { url: REC_URL, reason: 'Fall Rec and both current optional Friday practices are handled by this mapping.' },
        { url: MIGHTY_MITES_URL, reason: 'Fall Mighty Mites is handled by this mapping.' },
        { url: CHERRY_CITY_CUP_URL, reason: 'The future 2026 tournament is handled by this mapping.' },
        { url: GOLF_URL, reason: 'The future 2026 golf fundraiser is handled by this mapping.' },
        { url: SUMMER_URL, reason: 'Future linked Coerver camps are handled by this mapping.' },
        { url: ADULT_URL, reason: 'Current fixed weekly open-play rows are handled by this mapping.' },
        { url: TRYOUTS_URL, reason: 'All published 2026-27 tryout dates were in May 2026 and are past.' },
        { label: 'Capital Cup 2026', reason: 'June 19-28, 2026 dates and registration deadlines are past.' },
        { label: 'Summer Rec Soccer', reason: 'The program started July 7, 2026 and cannot be added as a new future candidate.' },
        { label: 'Real Madrid Foundation Camp', reason: 'July 6-10, 2026 already started before this review.' },
        { label: 'June Coerver Summer Camp', reason: 'June 15-18, 2026 dates are past.' },
        { label: 'Tuesday coed open play', reason: 'The source says it runs only seasonally when leagues are not in play and does not confirm that it is currently active.' },
        { label: 'Outdoor 7v7 League', reason: 'The page says the next league is in January but provides no year, dates, fee, or active registration.' },
        { label: 'Indoor High School League', reason: 'The linked registration currently says registration is not available.' },
        { label: 'Presidents Tournament', reason: 'The linked event page returns 404 and supplies no current date or registration details.' },
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
      notes: 'Manually verified Capital FC current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified Capital FC current-program mapping.',
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
  console.log(`Capital FC current-program source is ready with ${mapping.manualCandidates?.length ?? 0} candidates.`);

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
    console.error('[setup-capital-fc-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
