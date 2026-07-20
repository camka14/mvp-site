import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CARR_SPORTS_ACADEMY_HOME_URL = 'https://www.carrsportsacademy.com/';
export const CARR_SPORTS_ACADEMY_BOOKING_URL = 'https://www.carrsportsacademy.com/book-online';
export const CARR_SPORTS_ACADEMY_TEAMS_URL = 'https://www.carrsportsacademy.com/csa-elite-teams';
export const CARR_SPORTS_ACADEMY_ROBOTS_URL = 'https://www.carrsportsacademy.com/robots.txt';
export const CARR_SPORTS_ACADEMY_ADDRESS = '7960 SE 15th Ave, Portland, OR 97202';
export const CARR_SPORTS_ACADEMY_LOGO_SOURCE_URL =
  'https://static.wixstatic.com/media/6bdaee_cc896e96be694d56b5f83b781a19c946~mv2.png';
export const CARR_SPORTS_ACADEMY_ORG_DESCRIPTION =
  'Carr Sports Academy is an inner Southeast Portland youth basketball academy offering skills training, summer camps, competitive boys and girls teams, and development programs for elementary through high-school athletes.';

const ORGANIZER_NAME = 'Carr Sports Academy';
const TIME_ZONE = 'America/Los_Angeles';

type CampCandidateInput = {
  title: string;
  actionUrl: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  scheduleText: string;
  ageLabel: string;
  gender: 'C' | 'F';
  priceCents: number;
  maxParticipants: number;
  description: string;
};

const campCandidate = ({
  title,
  actionUrl,
  startsAt,
  endsAt,
  dateDisplayText,
  scheduleText,
  ageLabel,
  gender,
  priceCents,
  maxParticipants,
  description,
}: CampCandidateInput) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl: actionUrl,
  sourceUrl: actionUrl,
  organizerName: ORGANIZER_NAME,
  sportName: 'Basketball',
  formatLabel: 'Youth basketball camp',
  city: 'Portland, OR',
  venueName: ORGANIZER_NAME,
  address: CARR_SPORTS_ACADEMY_ADDRESS,
  startsAt,
  endsAt,
  timeZone: TIME_ZONE,
  scheduleText,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText,
  ageGroup: ageLabel,
  divisionText: ageLabel,
  participantOptionsText: 'Individual player registration through the official Carr Sports Academy booking page.',
  priceText: `$${(priceCents / 100).toFixed(0)}`,
  statusText: `The official booking page lists a maximum of ${maxParticipants} participants.`,
  description,
  tags: ['Camp'],
  tagText: 'Camp',
  divisions: [
    {
      name: ageLabel,
      key: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${gender.toLowerCase()}`,
      gender,
      ratingType: 'AGE' as const,
      skillDivisionTypeId: 'open',
      ageDivisionTypeId: 'youth',
      priceCents,
      maxParticipants,
      ageCutoffLabel: ageLabel,
      ageCutoffSource: actionUrl,
    },
  ],
  warnings: ['The source provides a booking capacity but does not publish a current remaining-spots count.'],
});

export const CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES = [
  campCandidate({
    title: 'Carr Sports Academy Summer Hoops Elite Camp',
    actionUrl: 'https://www.carrsportsacademy.com/service-page/summer-hoops-elite-camp-july-20-24th',
    startsAt: '2026-07-20T09:00:00-07:00',
    endsAt: '2026-07-24T12:00:00-07:00',
    dateDisplayText: 'July 20-24, 2026',
    scheduleText: 'July 20-24, 2026, 9 AM-Noon each day.',
    ageLabel: 'Grades 6-12',
    gender: 'C',
    priceCents: 29900,
    maxParticipants: 50,
    description: 'Coach Carr and staff lead this high-level basketball camp with strength and conditioning, ball handling, shooting, and live game situations for athletes in grades 6-12.',
  }),
  campCandidate({
    title: 'Carr Sports Academy Summer Girls Basketball Skills Camp 2',
    actionUrl: 'https://www.carrsportsacademy.com/service-page/summer-girls-basketball-skills-camp-2',
    startsAt: '2026-07-27T09:00:00-07:00',
    endsAt: '2026-07-31T12:00:00-07:00',
    dateDisplayText: 'July 27-31, 2026',
    scheduleText: 'July 27-31, 2026, 9 AM-Noon each day.',
    ageLabel: 'Girls grades 2-8',
    gender: 'F',
    priceCents: 25000,
    maxParticipants: 35,
    description: 'A girls-only basketball skills camp for grades 2-8 that covers fundamentals, skill development, and scrimmages.',
  }),
  campCandidate({
    title: 'Carr Sports Academy Competition and Game Camp',
    actionUrl: 'https://www.carrsportsacademy.com/service-page/competition-and-game-camp-july-27-31st',
    startsAt: '2026-07-27T12:00:00-07:00',
    endsAt: '2026-07-31T15:00:00-07:00',
    dateDisplayText: 'July 27-31, 2026',
    scheduleText: 'July 27-31, 2026, Noon-3 PM each day.',
    ageLabel: 'Grades 3-9',
    gender: 'C',
    priceCents: 25000,
    maxParticipants: 50,
    description: 'Coach Carr leads a game-focused basketball camp for grades 3-9 with small-sided and 5-on-5 play scenarios.',
  }),
  campCandidate({
    title: 'Carr Sports Academy Summer Hoops Elite Camp August 10-14',
    actionUrl: 'https://www.carrsportsacademy.com/service-page/summer-hoops-elite-camp-august-10-14th',
    startsAt: '2026-08-10T09:00:00-07:00',
    endsAt: '2026-08-14T15:00:00-07:00',
    dateDisplayText: 'August 10-14, 2026',
    scheduleText: 'August 10-14, 2026, 9 AM-3 PM each day.',
    ageLabel: 'Grades 6-12',
    gender: 'C',
    priceCents: 39900,
    maxParticipants: 50,
    description: 'Coach Carr and staff lead this advanced basketball camp with strength and conditioning, ball handling, shooting, and extended live game work for grades 6-12.',
  }),
  campCandidate({
    title: 'Carr Sports Academy Summer Hoops Camp August 17-21',
    actionUrl: 'https://www.carrsportsacademy.com/service-page/summer-hoops-camp-august-17-21st',
    startsAt: '2026-08-17T09:00:00-07:00',
    endsAt: '2026-08-21T15:00:00-07:00',
    dateDisplayText: 'August 17-21, 2026',
    scheduleText: 'August 17-21, 2026, 9 AM-3 PM each day.',
    ageLabel: 'Grades 1-9',
    gender: 'C',
    priceCents: 37500,
    maxParticipants: 50,
    description: 'An all-skill-level summer basketball camp for grades 1-9 with ball handling, shooting, defense, competitions, mini games, and 5-on-5 play.',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CARR_SPORTS_ACADEMY_WITHHELD_ROWS = [
  {
    title: 'Youth Summer Tournament Teams Grades 3-8',
    sourceUrl: CARR_SPORTS_ACADEMY_BOOKING_URL,
    reason: 'The booking page states registration closed June 30 and teams formed July 1, 2026; the published July 11-12 and July 18-19 tournaments are past.',
  },
  {
    title: '2026 Summer Breakfast Club',
    sourceUrl: CARR_SPORTS_ACADEMY_BOOKING_URL,
    reason: 'The multi-week program began June 22, 2026. Later sessions cannot be imported as a new event because the published event start is in the past.',
  },
  {
    title: '2026/2027 Grades 2-5, Grades 6-8, and High School Tryouts',
    sourceUrl: CARR_SPORTS_ACADEMY_BOOKING_URL,
    reason: 'The booking data exposes August dates and a $40 price but identifies the venue only as “SJB,” without a complete source-stated address. No tryout candidate is created until the official source publishes the venue address.',
  },
  {
    title: 'CSA Elite team roster rows',
    sourceUrl: CARR_SPORTS_ACADEMY_TEAMS_URL,
    reason: 'The public teams page describes program age ranges but no stable roster-level registration target.',
  },
];

export const CARR_SPORTS_ACADEMY_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: CARR_SPORTS_ACADEMY_BOOKING_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: { selector: 'body', mode: 'literal', value: CARR_SPORTS_ACADEMY_BOOKING_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES,
};

// Candidate fields were manually reviewed from Wix's rendered booking source.
// A setup run reuses this approved mapping rather than blind-fetching unreviewed data.
export const CARR_SPORTS_ACADEMY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Carr Sports Academy reviewed booking source snapshot.</main></body></html>',
    };
  },
};
