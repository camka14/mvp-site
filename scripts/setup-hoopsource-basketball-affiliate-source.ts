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
const ORG_ID = 'affiliate_org_hoopsource_basketball';
const LOGO_FILE_ID = 'affiliate_file_hoopsource_basketball_logo';
const SOURCE_ID = 'affiliate_source_hoopsource_basketball_portland_events';
const SOURCE_KEY = 'hoopsource-basketball-portland-events';
const MAPPING_ID = 'affiliate_source_hoopsource_basketball_portland_events_mapping_v1';
const HOME_URL = 'https://hoopsourcebasketball.com/';
const LIST_URL = 'https://hoopsourcebasketball.com/all-events/';
const LOGO_SOURCE_URL = 'https://hoopsourcebasketball.com/wp-content/uploads/2023/07/Hoopsource-Horizontal.svg';
const ORGANIZER_NAME = 'HoopSource Basketball';
const PORTLAND_AREA_ADDRESS = 'Portland, OR';

type DivisionInput = {
  name: string;
  key: string;
  gender: 'M' | 'F' | 'C';
  divisionTypeId: string;
  priceCents: number;
  ageCutoffLabel: string;
};

type EventInput = {
  title: string;
  sourceUrl: string;
  actionUrl: string;
  formatLabel: string;
  city: string;
  venueName: string;
  address: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  scheduleText: string;
  registrationDeadlineText: string;
  priceCents: number;
  priceText: string;
  divisionText: string;
  skillLevel: string;
  ageGroup: string;
  gameplay: string;
  description: string;
  divisions: DivisionInput[];
};

const division = (row: DivisionInput) => ({
  name: row.name,
  key: row.key,
  gender: row.gender,
  ratingType: 'SKILL' as const,
  divisionTypeId: row.divisionTypeId,
  priceCents: row.priceCents,
  maxParticipants: null,
  ageCutoffLabel: row.ageCutoffLabel,
  ageCutoffSource: 'HoopSource event detail page',
});

const tournamentDivisions = (priceCents: number) => [
  division({
    name: 'Boys D1 Youth and High School',
    key: 'm_skill_d1_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_d1_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school boys divisions',
  }),
  division({
    name: 'Boys D2 Youth and High School',
    key: 'm_skill_d2_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_d2_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school boys divisions',
  }),
  division({
    name: 'Boys D3 Youth and High School',
    key: 'm_skill_d3_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_d3_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school boys divisions',
  }),
  division({
    name: 'Girls D1 Youth and High School',
    key: 'f_skill_d1_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_d1_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school girls divisions',
  }),
  division({
    name: 'Girls D2 Youth and High School',
    key: 'f_skill_d2_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_d2_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school girls divisions',
  }),
  division({
    name: 'Girls D3 Youth and High School',
    key: 'f_skill_d3_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_d3_age_u19',
    priceCents,
    ageCutoffLabel: 'Youth and high school girls divisions',
  }),
];

const groundZeroDivisions = (priceCents: number) => [
  division({
    name: 'Boys D4 Beginner Youth',
    key: 'm_skill_d4_age_u14',
    gender: 'M',
    divisionTypeId: 'skill_d4_age_u14',
    priceCents,
    ageCutoffLabel: 'Boys 2nd-8th grade',
  }),
  division({
    name: 'Girls D4 Beginner Youth',
    key: 'f_skill_d4_age_u14',
    gender: 'F',
    divisionTypeId: 'skill_d4_age_u14',
    priceCents,
    ageCutoffLabel: 'Girls 4th-8th grade',
  }),
];

const highSchoolLeagueDivisions = (priceCents: number) => [
  division({
    name: 'Girls Frosh',
    key: 'f_skill_frosh_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_frosh_age_u19',
    priceCents,
    ageCutoffLabel: 'High school girls Frosh division',
  }),
  division({
    name: 'Girls JV',
    key: 'f_skill_jv_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_jv_age_u19',
    priceCents,
    ageCutoffLabel: 'High school girls JV division',
  }),
  division({
    name: 'Girls Varsity',
    key: 'f_skill_varsity_age_u19',
    gender: 'F',
    divisionTypeId: 'skill_varsity_age_u19',
    priceCents,
    ageCutoffLabel: 'High school girls Varsity division',
  }),
  division({
    name: 'Boys Frosh',
    key: 'm_skill_frosh_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_frosh_age_u19',
    priceCents,
    ageCutoffLabel: 'High school boys Frosh division',
  }),
  division({
    name: 'Boys JV',
    key: 'm_skill_jv_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_jv_age_u19',
    priceCents,
    ageCutoffLabel: 'High school boys JV division',
  }),
  division({
    name: 'Boys Varsity',
    key: 'm_skill_varsity_age_u19',
    gender: 'M',
    divisionTypeId: 'skill_varsity_age_u19',
    priceCents,
    ageCutoffLabel: 'High school boys Varsity division',
  }),
];

const youthLeagueDivisions = (priceCents: number) => [
  division({
    name: 'Girls 4th-8th Grade',
    key: 'f_skill_d1_d3_age_u14',
    gender: 'F',
    divisionTypeId: 'skill_d1_d3_age_u14',
    priceCents,
    ageCutoffLabel: 'Girls 4th-8th grade; registration uses the 2026-2027 academic school year',
  }),
  division({
    name: 'Boys 2nd-8th Grade',
    key: 'm_skill_d1_d3_age_u14',
    gender: 'M',
    divisionTypeId: 'skill_d1_d3_age_u14',
    priceCents,
    ageCutoffLabel: 'Boys 2nd-8th grade; registration uses the 2026-2027 academic school year',
  }),
];

const eventCandidate = (input: EventInput) => ({
  listingKind: 'EVENT' as const,
  title: input.title,
  officialActionUrl: input.actionUrl,
  sourceUrl: input.sourceUrl,
  organizerName: ORGANIZER_NAME,
  sportName: 'Basketball',
  formatLabel: input.formatLabel,
  city: input.city,
  venueName: input.venueName,
  address: input.address,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: input.scheduleText,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: input.dateDisplayText,
  skillLevel: input.skillLevel,
  ageGroup: input.ageGroup,
  divisionText: input.divisionText,
  participantOptionsText: 'Team registration through the official HoopSource Exposure Events registration page.',
  priceText: input.priceText,
  registrationDeadlineText: input.registrationDeadlineText,
  statusText: `${input.registrationDeadlineText}. Team placement and final divisions are handled by HoopSource.`,
  description: `${input.description} The source lists ${input.gameplay.toLowerCase()}, requires online team registration/payment, and says final division placement is handled by HoopSource for competitive balance. Spectator admission, hotel requirements, refund terms, roster forms, waivers, and media access details remain on the official event page.`,
  divisions: input.divisions,
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'HoopSource Portland Basketball Events',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayText'],
  },
  manualCandidates: [
    eventCandidate({
      title: 'Summer Sizzle',
      sourceUrl: 'https://hoopsourcebasketball.com/events/summer-sizzle/',
      actionUrl: 'https://basketball.exposureevents.com/257996/summer-sizzle-boys-and-girls-high-school-and-youth/registration',
      formatLabel: 'Basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-07-17T00:00:00-07:00',
      endsAt: '2026-07-19T23:59:00-07:00',
      dateDisplayText: 'July 17-19, 2026',
      scheduleText: 'July 17-19, 2026. The source lists a 4-game minimum and says exact game schedules are posted through HoopSource/Exposure.',
      registrationDeadlineText: 'Register and pay by July 11, 2026, or until capacity is met',
      priceCents: 39500,
      priceText: '$395',
      divisionText: 'Boys & Girls Youth and High School D1-D3',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth and high school',
      gameplay: '4 game minimum',
      description: 'Summer Sizzle is a HoopSource boys and girls youth/high-school basketball tournament in the Portland area.',
      divisions: tournamentDivisions(39500),
    }),
    eventCandidate({
      title: 'End of Summer Run',
      sourceUrl: 'https://hoopsourcebasketball.com/events/end-of-summer-run/',
      actionUrl: 'https://basketball.exposureevents.com/259282/end-of-summer-run-boys-and-girls-high-school-and-youth/registration',
      formatLabel: 'Basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-07-24T00:00:00-07:00',
      endsAt: '2026-07-26T23:59:00-07:00',
      dateDisplayText: 'July 24-26, 2026',
      scheduleText: 'July 24-26, 2026. The source lists a 4-game minimum and says exact game schedules are posted through HoopSource/Exposure.',
      registrationDeadlineText: 'Register and pay by July 18, 2026, or until capacity is met',
      priceCents: 39500,
      priceText: '$395',
      divisionText: 'Boys & Girls Youth and High School D1-D3',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth and high school',
      gameplay: '4 game minimum',
      description: 'End of Summer Run is a HoopSource boys and girls youth/high-school basketball tournament in the Portland area.',
      divisions: tournamentDivisions(39500),
    }),
    eventCandidate({
      title: 'The Source Fall Open',
      sourceUrl: 'https://hoopsourcebasketball.com/events/the-source-fall-open/',
      actionUrl: 'https://basketball.exposureevents.com/268294/the-source-fall-open-2026-boys-and-girls-high-school-and-youth/registration',
      formatLabel: 'Basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-09-12T00:00:00-07:00',
      endsAt: '2026-09-13T23:59:00-07:00',
      dateDisplayText: 'September 12-13, 2026',
      scheduleText: 'September 12-13, 2026. The source lists a 4-game minimum and says exact game schedules are posted through HoopSource/Exposure.',
      registrationDeadlineText: 'Register and pay by September 5, 2026, or until capacity is met',
      priceCents: 39500,
      priceText: '$395',
      divisionText: 'Boys & Girls Youth and High School D1-D3',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth and high school',
      gameplay: '4 game minimum',
      description: 'The Source Fall Open is a HoopSource boys and girls youth/high-school basketball tournament in Portland.',
      divisions: tournamentDivisions(39500),
    }),
    eventCandidate({
      title: 'Ground Zero Basketball Fall Session #1',
      sourceUrl: 'https://hoopsourcebasketball.com/events/ground-zero-basketball-1/',
      actionUrl: 'https://basketball.exposureevents.com/268299/fall-session-1-ground-zero-basketball-2026-boys-and-girls-youth-beginners/registration',
      formatLabel: 'Beginner basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-09-12T00:00:00-07:00',
      endsAt: '2026-09-13T23:59:00-07:00',
      dateDisplayText: 'September 12-13, 2026',
      scheduleText: 'September 12-13, 2026. The source lists a 3-game minimum for beginner/Ground Zero teams.',
      registrationDeadlineText: 'Register and pay by September 5, 2026, or until capacity is met',
      priceCents: 29900,
      priceText: '$299',
      divisionText: 'Boys & Girls Youth Beginner D4',
      skillLevel: 'Beginner / D4',
      ageGroup: 'Boys 2nd-8th grade; girls 4th-8th grade',
      gameplay: '3 game minimum',
      description: 'Ground Zero Basketball Fall Session #1 is a HoopSource beginner-level youth basketball event for teams building confidence and seeking fair matchups against similar-level competition.',
      divisions: groundZeroDivisions(29900),
    }),
    eventCandidate({
      title: 'High School HoopSource Fall League',
      sourceUrl: 'https://hoopsourcebasketball.com/events/high-school-hoopsource-fall-league/',
      actionUrl: 'https://basketball.exposureevents.com/268666/hoopsource-fall-league-2026-high-school-boys-and-girls-saturday-games/registration',
      formatLabel: 'Basketball league',
      city: 'Portland Metro, OR',
      venueName: 'Portland metro area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-09-19T00:00:00-07:00',
      endsAt: '2026-10-17T23:59:00-07:00',
      dateDisplayText: 'September 19-October 17, 2026',
      scheduleText: 'Five straight Saturdays from September 19-October 17, 2026, with two games per weekend for a 10-game season.',
      registrationDeadlineText: 'Register and pay by September 12, 2026',
      priceCents: 97500,
      priceText: '$975',
      divisionText: 'Girls and Boys High School Frosh, JV, and Varsity',
      skillLevel: 'D1, D2, D3 levels across Frosh, JV, and Varsity',
      ageGroup: 'High school',
      gameplay: '10 game league season',
      description: 'High School HoopSource Fall League is a five-week Portland metro team league for girls and boys Frosh, JV, and Varsity divisions.',
      divisions: highSchoolLeagueDivisions(97500),
    }),
    eventCandidate({
      title: 'Youth HoopSource Fall League',
      sourceUrl: 'https://hoopsourcebasketball.com/events/youth-hoopsource-fall-league/',
      actionUrl: 'https://basketball.exposureevents.com/268668/hoopsource-fall-league-2026-youth-boys-and-girls-sunday-games/registration',
      formatLabel: 'Basketball league',
      city: 'Portland Metro, OR',
      venueName: 'Portland metro area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-09-20T00:00:00-07:00',
      endsAt: '2026-10-18T23:59:00-07:00',
      dateDisplayText: 'September 20-October 18, 2026',
      scheduleText: 'Five straight Sundays from September 20-October 18, 2026, with two games per weekend for a 10-game season.',
      registrationDeadlineText: 'Register and pay by September 13, 2026',
      priceCents: 97500,
      priceText: '$975',
      divisionText: 'Girls 4th-8th Grade; Boys 2nd-8th Grade',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth; registration uses the 2026-2027 academic school year',
      gameplay: '10 game league season',
      description: 'Youth HoopSource Fall League is a five-week Portland metro team league for girls 4th-8th grade and boys 2nd-8th grade divisions.',
      divisions: youthLeagueDivisions(97500),
    }),
    eventCandidate({
      title: 'Bridge City Fall Run',
      sourceUrl: 'https://hoopsourcebasketball.com/events/bridge-city-fall-run/',
      actionUrl: 'https://basketball.exposureevents.com/268296/bridge-city-fall-run-2026-boys-and-girls-high-school-and-youth/registration',
      formatLabel: 'Basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-10-24T00:00:00-07:00',
      endsAt: '2026-10-25T23:59:00-07:00',
      dateDisplayText: 'October 24-25, 2026',
      scheduleText: 'October 24-25, 2026. The source lists a 4-game minimum and says exact game schedules are posted through HoopSource/Exposure.',
      registrationDeadlineText: 'Register and pay by October 17, 2026, or until capacity is met',
      priceCents: 39500,
      priceText: '$395',
      divisionText: 'Boys & Girls Youth and High School D1-D3',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth and high school',
      gameplay: '4 game minimum',
      description: 'Bridge City Fall Run is a HoopSource boys and girls youth/high-school basketball tournament in the Portland area.',
      divisions: tournamentDivisions(39500),
    }),
    eventCandidate({
      title: 'Ground Zero Basketball Fall Session #2',
      sourceUrl: 'https://hoopsourcebasketball.com/events/ground-zero-basketball-2/',
      actionUrl: 'https://basketball.exposureevents.com/268300/fall-session-2-ground-zero-basketball-2026-boys-and-girls-youth-beginners/registration',
      formatLabel: 'Beginner basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-10-24T00:00:00-07:00',
      endsAt: '2026-10-25T23:59:00-07:00',
      dateDisplayText: 'October 24-25, 2026',
      scheduleText: 'October 24-25, 2026. The source lists a 3-game minimum for beginner/Ground Zero teams.',
      registrationDeadlineText: 'Register and pay by October 17, 2026, or until capacity is met',
      priceCents: 29900,
      priceText: '$299',
      divisionText: 'Boys & Girls Youth Beginner D4',
      skillLevel: 'Beginner / D4',
      ageGroup: 'Boys 2nd-8th grade; girls 4th-8th grade',
      gameplay: '3 game minimum',
      description: 'Ground Zero Basketball Fall Session #2 is a HoopSource beginner-level youth basketball event for teams building confidence and seeking fair matchups against similar-level competition.',
      divisions: groundZeroDivisions(29900),
    }),
    eventCandidate({
      title: 'Veterans Day Honors',
      sourceUrl: 'https://hoopsourcebasketball.com/events/veterans-day-honors/',
      actionUrl: 'https://basketball.exposureevents.com/268298/veterans-day-honors-2026-boys-and-girls-high-school-and-youth/registration',
      formatLabel: 'Basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-11-07T00:00:00-08:00',
      endsAt: '2026-11-08T23:59:00-08:00',
      dateDisplayText: 'November 7-8, 2026',
      scheduleText: 'November 7-8, 2026. The source lists a 4-game minimum and says exact game schedules are posted through HoopSource/Exposure.',
      registrationDeadlineText: 'Register and pay by October 31, 2026, or until capacity is met',
      priceCents: 39500,
      priceText: '$395',
      divisionText: 'Boys & Girls Youth and High School D1-D3',
      skillLevel: 'D1, D2, D3',
      ageGroup: 'Youth and high school',
      gameplay: '4 game minimum',
      description: 'Veterans Day Honors is a HoopSource boys and girls youth/high-school basketball tournament in the Portland area.',
      divisions: tournamentDivisions(39500),
    }),
    eventCandidate({
      title: 'Ground Zero Basketball Fall Session #3',
      sourceUrl: 'https://hoopsourcebasketball.com/events/ground-zero-basketball-3/',
      actionUrl: 'https://basketball.exposureevents.com/268301/fall-session-3-ground-zero-basketball-2026-boys-and-girls-youth-beginners/registration',
      formatLabel: 'Beginner basketball tournament',
      city: 'Portland, OR',
      venueName: 'Portland area gyms',
      address: PORTLAND_AREA_ADDRESS,
      startsAt: '2026-11-14T00:00:00-08:00',
      endsAt: '2026-11-15T23:59:00-08:00',
      dateDisplayText: 'November 14-15, 2026',
      scheduleText: 'November 14-15, 2026. The source lists a 3-game minimum for beginner/Ground Zero teams.',
      registrationDeadlineText: 'Register and pay by November 7, 2026, or until capacity is met',
      priceCents: 29900,
      priceText: '$299',
      divisionText: 'Boys & Girls Youth Beginner D4',
      skillLevel: 'Beginner / D4',
      ageGroup: 'Boys 2nd-8th grade; girls 4th-8th grade',
      gameplay: '3 game minimum',
      description: 'Ground Zero Basketball Fall Session #3 is a HoopSource beginner-level youth basketball event for teams building confidence and seeking fair matchups against similar-level competition.',
      divisions: groundZeroDivisions(29900),
    }),
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
      accept: 'image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/svg+xml';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'hoopsource-basketball-logo.svg',
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
      originalName: 'hoopsource-basketball-logo.svg',
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
      originalName: 'hoopsource-basketball-logo.svg',
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
  const coordinates = await geocodeAddressToCoordinates(PORTLAND_AREA_ADDRESS)
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
      address: PORTLAND_AREA_ADDRESS,
      description: 'HoopSource Basketball organizes youth and high-school basketball tournaments, leagues, showcase events, schedules, and team registration across Oregon, Washington, and the broader Northwest.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Basketball'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: PORTLAND_AREA_ADDRESS,
      description: 'HoopSource Basketball organizes youth and high-school basketball tournaments, leagues, showcase events, schedules, and team registration across Oregon, Washington, and the broader Northwest.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Basketball'],
      status: 'UNLISTED',
      coordinates,
      operatesAthleticFacility: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'HoopSource Portland Basketball Events',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual first-pass source for current HoopSource Portland/Beaverton-area basketball events. Auburn/Seattle rows are intentionally outside this local pass. Rows with elapsed payment deadlines are skipped.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'robots.txt disallows /calendar/action*, /events/action*, and query URLs, but allows the public /all-events/ list and clean /events/<slug>/ detail pages used here. Crawl-delay is 3.',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedRows: [
        'Portland Rise was skipped because the published register/pay deadline was July 4, 2026.',
        'SUPER24 Stage #3 in Beaverton was skipped because the published register/pay deadline was April 1, 2026.',
        'Auburn, Seattle, and Tukwila rows were left out of this local Portland metro pass.',
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
      notes: 'Manual current Portland-area HoopSource basketball event mapping with official Exposure Events registration URLs.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual current Portland-area HoopSource basketball event mapping with official Exposure Events registration URLs.',
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

  console.log(`HoopSource Basketball affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-hoopsource-basketball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
