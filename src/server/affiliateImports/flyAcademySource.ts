import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FLY_ACADEMY_HOME_URL = 'https://theflyacademy.org/';
export const FLY_ACADEMY_TEAM_FLY_URL = 'https://theflyacademy.org/team-fly';
export const FLY_ACADEMY_LADY_FLY_URL = 'https://theflyacademy.org/lady-fly';
export const FLY_ACADEMY_SELECT_URL = 'https://theflyacademy.org/fly-select';
export const FLY_ACADEMY_TRYOUTS_URL = 'https://theflyacademy.org/tryouts';
export const FLY_ACADEMY_ROBOTS_URL = 'https://theflyacademy.org/robots.txt';
export const FLY_ACADEMY_ADDRESS = '14655 SW 72nd Ave, Portland, OR 97224';
export const FLY_ACADEMY_LOGO_SOURCE_URL =
  'https://images.squarespace-cdn.com/content/v1/5e7e42bd023c3d0568f3ecf9/1585491956868-LIA3RL9KI8Q69KJKYRS1/Fly+logo_white_no+background.png';
export const FLY_ACADEMY_ORG_DESCRIPTION =
  'Fly Academy is a Portland youth basketball program for athletes ages 8-18. Its Team Fly, Lady Fly, Fly Select, and Junior Fly programs combine skills training, team practices, local leagues, and tournament play for boys and girls across elementary through high-school age groups.';

const ORGANIZER_NAME = 'Fly Academy';

export const FLY_ACADEMY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: FLY_ACADEMY_HOME_URL,
    sourceUrl: FLY_ACADEMY_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Basketball',
    formatLabel: 'Youth competitive basketball club',
    city: 'Portland, OR',
    venueName: 'Fly Academy',
    address: FLY_ACADEMY_ADDRESS,
    skillLevel: 'Competitive and select programs',
    ageGroup: 'Ages 8-18',
    divisionText: 'Boys grades 3rd-12th; girls grades 4th-12th; select teams 10U-17U',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Basketball programs by season',
    scheduleText:
      'Team Fly and Lady Fly describe fall, winter, and spring seasons. Fly Select describes fall/winter and spring/summer seasons. The site does not currently publish dated future tryout occurrences.',
    participantOptionsText:
      'Use the official Fly Academy tryouts page to choose a boys local, boys travel, girls local, or girls travel pathway and follow the current registration instructions.',
    priceText: '$500-$3,250 per season',
    statusText:
      'The current public pages list seasonal fee ranges and program pathways, but no future tryout date, time, or location.',
    description:
      'Fly Academy describes Team Fly boys local programs for grades 3rd-12th, Lady Fly girls local programs for grades 4th-9th, and Fly Select travel programs for boys and girls from 10U through 17U. The official pages describe skills training, practices, leagues, tournaments, and seasonal costs; families should use the official site for current team openings and registration.',
    warnings: [
      'The public tryouts page identifies boys local, boys travel, girls local, and girls travel pathways but does not publish a date, time, or location for an upcoming tryout. No dated tryout event is created.',
      'Team Fly and Lady Fly list general season price ranges of $500-$950 by program and season. Fly Select lists general season ranges of $1,500-$3,250. These are not assigned as one fixed organization-division price because the public source does not publish one current total for each age and gender pathway.',
      'No TEAM candidates are created. The public pages describe program-level teams but do not expose a stable roster-level registration target.',
      'The official white Fly Academy logo is downloaded and normalized by the idempotent source setup before the public organization is upserted.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FLY_ACADEMY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FLY_ACADEMY_HOME_URL,
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
      value: FLY_ACADEMY_HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: FLY_ACADEMY_MANUAL_CANDIDATES,
};

// The source is manually reviewed before each mapping change. Its public pages
// contain evergreen program content, so this client ensures repeat setup runs
// validate the saved manual mapping without issuing an unnecessary page scrape.
export const FLY_ACADEMY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Fly Academy reviewed club source snapshot.</main></body></html>',
    };
  },
};
