import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CLACKAMAS_JR_BASE_URL = 'https://clackamasjrvolleyball.com/home';
export const CLACKAMAS_JR_REGISTRATION_URL = 'https://clackamasjrvolleyball.com/current-programs';
export const CLACKAMAS_JR_SCHEDULE_URL = 'https://clackamasjrvolleyball.com/Practice/GameSchedules.aspx';
export const CLACKAMAS_JR_ROBOTS_URL = 'https://clackamasjrvolleyball.com/robots.txt';
export const CLACKAMAS_JR_CITY = 'Milwaukie, OR';
export const CLACKAMAS_JR_ORG_DESCRIPTION =
  'Clackamas Jr Rec is a recreational youth volleyball program serving elementary, middle-school, and high-school players in the Clackamas County area. The program publishes age divisions, season dates, practice and game information, registration fees, and coach/team guidance for its annual spring season.';

const division = (name: string, key: string, priceCents: number) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: key,
  priceCents,
  maxParticipants: null,
  ageCutoffLabel: name,
  ageCutoffSource: 'Clackamas Jr Rec public age-division and fee list, reviewed 2026-07-15.',
});

export const CLACKAMAS_JR_DIVISIONS = [
  division('Kindy', 'kindy', 6500),
  division('1st/2nd Grade', 'grades_1_2', 7000),
  division('3rd/4th Grade', 'grades_3_4', 10000),
  division('4th/5th Grade', 'grades_4_5', 10000),
  division('6th/7th Grade', 'grades_6_7', 12500),
  division('7th/8th Grade', 'grades_7_8', 12500),
  division('9th-12th Grade', 'grades_9_12', 12500),
];

const seasonDescription =
  'Clackamas Jr Rec publishes an annual recreational youth volleyball season. For Spring 2027, practices begin the week of March 29, games for 3rd-12th graders begin April 10, and the year-end tournament is scheduled for May 22-23 at Nelson High School. The public page lists Kindy through 9th-12th grade divisions with registration fees from $65 to $125; registration opens January 11, 2027. After February 28, the source adds a $15 late-registration fee. Players and families should review the official page and contact the program about team, practice-night, and gym availability before registering.';

export const CLACKAMAS_JR_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Clackamas Jr Rec',
    officialActionUrl: CLACKAMAS_JR_BASE_URL,
    sourceUrl: CLACKAMAS_JR_BASE_URL,
    organizerName: 'Clackamas Jr Rec',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Recreational youth volleyball program',
    city: CLACKAMAS_JR_CITY,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Annual spring recreational program',
    scheduleText: 'Annual spring program with age-based divisions, team practices, games, and a year-end tournament.',
    participantOptionsText: 'Register a player after selecting an age division and confirming team/practice availability with the program.',
    priceText: '$65-$125',
    statusText: 'The public page says 2026 registration is closed and Spring 2027 registration opens January 11, 2027.',
    description: `${CLACKAMAS_JR_ORG_DESCRIPTION} ${seasonDescription}`,
    warnings: [
      'The source does not publish one fixed facility address; practices and games use multiple gyms and team-selected practice locations.',
      'The optional pre-season clinic remains TBA at Milwaukie High School and is not imported as a dated event.',
    ],
  },
  {
    listingKind: 'EVENT' as const,
    title: 'Clackamas Jr Rec Spring 2027 Volleyball',
    officialActionUrl: CLACKAMAS_JR_REGISTRATION_URL,
    sourceUrl: CLACKAMAS_JR_BASE_URL,
    organizerName: 'Clackamas Jr Rec',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Recreational youth volleyball season',
    city: CLACKAMAS_JR_CITY,
    startsAt: '2027-03-29T00:00:00-07:00',
    endsAt: '2027-05-23T23:59:00-07:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'Practices begin the week of March 29, 2027. Games for 3rd-12th graders begin April 10. Year-end tournament dates are May 22-23, 2027.',
    dateDisplayMode: 'SCHEDULED' as const,
    dateDisplayText: 'Mar 29-May 23, 2027',
    ageGroup: 'Kindy-12th grade',
    divisionText: 'Kindy through 9th-12th grade',
    participantOptionsText: 'Player registration by age division; contact the program before registering if you need a specific coach, team, practice night, or location.',
    priceText: '$65-$125',
    statusText: 'Registration opens January 11, 2027. A $15 late fee applies after February 28, 2027.',
    description: seasonDescription,
    tags: ['League'],
    tagText: 'League',
    divisions: CLACKAMAS_JR_DIVISIONS,
    warnings: [
      'The source does not publish one fixed facility address; practices and games use multiple gyms and team-selected practice locations.',
      'The exact start time is not published; the event start represents the published week-of-March-29 season start.',
      'The optional pre-season clinic is TBA and excluded from candidates.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CLACKAMAS_JR_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: CLACKAMAS_JR_BASE_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Clackamas Jr Rec',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: CLACKAMAS_JR_BASE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: CLACKAMAS_JR_MANUAL_CANDIDATES,
};

export const CLACKAMAS_JR_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Clackamas Jr Rec public manual source snapshot.</main></body></html>',
    };
  },
};
