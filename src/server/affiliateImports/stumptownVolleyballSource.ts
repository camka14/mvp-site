import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from './types';

export const SOURCE_URL = 'https://www.stumptownvb.com/';
export const TRYOUTS_URL = 'https://www.stumptownvb.com/tryouts';
export const ABOUT_URL = 'https://www.stumptownvb.com/about';
export const SCHEDULE_URL = 'https://www.stumptownvb.com/schedule';
export const TRAINING_URL = 'https://www.stumptownvb.com/training';
export const LOGO_SOURCE_URL =
  'https://static.wixstatic.com/media/57b50a_5ca55400235141c6932f1024f5c6562c~mv2.png';

export const SOURCE_ID = 'affiliate_source_stumptown_volleyball_club';
export const SOURCE_KEY = 'stumptown-volleyball-club';
export const ORG_ID = 'affiliate_org_stumptown_volleyball_club';
export const MAPPING_ID = 'affiliate_mapping_stumptown_volleyball_club_v1';
export const PUBLIC_SLUG = 'stumptown-volleyball-club';
export const OWNER_EMAIL = 'samuel.r@razumly.com';

export const ORG_NAME = 'Stumptown Volleyball Club';
export const ORG_DESCRIPTION =
  'Stumptown Volleyball Club is an inclusive Portland junior volleyball club and USAV junior development program focused on fundamentals, team play, work ethic, sportsmanship, and player development. The club offers seasonal teams, tryouts, training, sand sessions, and tournament opportunities.';

export const WITHHELD_ROWS = [
  {
    title: '2025-26 junior volleyball tryouts',
    reason:
      'The official Tryouts page is labeled 2025-26, its November dates omit the year, and the page says the information meeting has already occurred. The importer does not infer a year from month/day text.',
    sourceUrl: TRYOUTS_URL,
  },
  {
    title: '2025-26 CEVA Power League schedule',
    reason:
      'The official Schedule page is labeled 2025-26; tournament rows omit years and locations are mostly TBD. These are not current future event rows as of the inspection date.',
    sourceUrl: SCHEDULE_URL,
  },
  {
    title: 'Stumptown Calendar',
    reason:
      'The public Calendar page only links to an embedded calendar without a crawlable event list in the rendered output.',
    sourceUrl: 'https://www.stumptownvb.com/general-8',
  },
  {
    title: 'Club facilities and practices',
    reason:
      'The site lists Fulton Community Center, Multnomah Arts Center, and Sellwood Community House as locations, but it does not publish a facility rental inventory or current booking availability.',
    sourceUrl: SCHEDULE_URL,
  },
];

const manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']> = [
  {
    listingKind: 'CLUB',
    title: ORG_NAME,
    officialActionUrl: SOURCE_URL,
    sourceUrl: SOURCE_URL,
    organizerName: ORG_NAME,
    sportName: 'Indoor Volleyball',
    formatLabel: 'Junior volleyball club',
    city: 'Portland, OR',
    venueName: ORG_NAME,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Club programs by season',
    scheduleText:
      'Stumptown publishes junior club teams, tryouts, practices, tournaments, training, and sand sessions on its official website.',
    participantOptionsText:
      'Use the official Stumptown Volleyball Club website for current team, tryout, training, and registration information.',
    description: `${ORG_DESCRIPTION} Use the official website for current season information and registration instructions.`,
    warnings: WITHHELD_ROWS.map((row) => `${row.title}: ${row.reason}`),
  },
  {
    listingKind: 'EVENT',
    title: 'Stumptown Volleyball Lessons - All Ages',
    officialActionUrl: TRAINING_URL,
    sourceUrl: TRAINING_URL,
    organizerName: ORG_NAME,
    sportName: 'Indoor Volleyball',
    formatLabel: 'Private volleyball lessons',
    city: 'Portland, OR',
    startsAt: null,
    endsAt: null,
    timeZone: 'America/Los_Angeles',
    dateDisplayMode: 'NO_FIXED_DATE',
    dateDisplayText: 'No fixed date',
    scheduleText: 'Schedule by contacting Stumptown; lesson location and court fee are arranged with the club.',
    ageGroup: 'All ages',
    divisionText: 'All positions, ages, and genders',
    participantOptionsText: 'Contact Stumptown Volleyball Club through the official training page.',
    priceText: '$40/hr plus court fee',
    tags: ['Clinic'],
    tagText: 'Clinic',
    description:
      'Stumptown offers volleyball lessons for all positions, ages, and genders. The club teaches passing, hitting, setting, serving, and other fundamentals, with sessions able to focus on a specific skill or a broad training plan. The listed cost is $40 per hour plus a court fee; contact the club for scheduling and location.',
    divisions: [
      {
        name: 'All ages',
        key: 'all_ages',
        gender: 'C',
        ratingType: 'AGE',
        divisionTypeId: 'open',
        priceCents: 4000,
        maxParticipants: null,
        ageCutoffLabel: 'All ages',
        ageCutoffSource: 'Stumptown Volleyball training page inspected 2026-07-15.',
      },
    ],
    warnings: [
      'The source does not publish a fixed lesson date, venue address, or public court-fee amount; those details remain with the official booking conversation.',
    ],
  },
  {
    listingKind: 'EVENT',
    title: 'Stumptown Summer Sand Training',
    officialActionUrl: TRAINING_URL,
    sourceUrl: TRAINING_URL,
    organizerName: ORG_NAME,
    sportName: 'Beach Volleyball',
    formatLabel: 'Sand training and play',
    city: 'Portland, OR',
    startsAt: null,
    endsAt: null,
    timeZone: 'America/Los_Angeles',
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'May-August; time and place TBD',
    scheduleText: 'May-August; 45 minutes of training followed by 45 minutes of playing. Time and place are TBD.',
    ageGroup: 'All ages',
    divisionText: 'Singles, doubles, and quads',
    participantOptionsText: 'Contact Stumptown Volleyball Club through the official training page.',
    priceText: '$10 per session',
    tags: ['Open Play', 'Clinic'],
    tagText: 'Open Play, Clinic',
    description:
      'Stumptown describes summer sand training for all ages and skill levels. Each session includes 45 minutes of training and 45 minutes of playing, with singles, doubles, and quads listed as formats. The source says the season runs May-August, while time and place are still TBD. The listed cost is $10 per session.',
    divisions: [
      {
        name: 'All ages and skill levels',
        key: 'all_ages_skill_levels',
        gender: 'C',
        ratingType: 'AGE',
        divisionTypeId: 'open',
        priceCents: 1000,
        maxParticipants: null,
        ageCutoffLabel: 'All ages',
        ageCutoffSource: 'Stumptown Volleyball training page inspected 2026-07-15.',
      },
    ],
    warnings: [
      'The source does not publish a fixed year, session date, time, or venue address; this is intentionally an evergreen program summary rather than a scheduled event.',
    ],
  },
];

export const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: SOURCE_URL,
  renderJavascript: true,
  waitMs: 1500,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: ORG_NAME,
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: SOURCE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates,
};

export const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Stumptown Volleyball Club manual source.</main></body></html>',
    };
  },
};

export { manualCandidates };
