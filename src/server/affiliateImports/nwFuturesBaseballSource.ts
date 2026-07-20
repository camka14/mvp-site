import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NW_FUTURES_BASEBALL_HOME_URL = 'https://www.nwfutures.com/';
export const NW_FUTURES_BASEBALL_SUMMER_CAMP_URL = 'https://www.nwfutures.com/summer-camp/';
export const NW_FUTURES_BASEBALL_FALL_BALL_URL = 'https://www.nwfutures.com/fall-ball/';
export const NW_FUTURES_BASEBALL_ROBOTS_URL = 'https://www.nwfutures.com/robots.txt';
export const NW_FUTURES_BASEBALL_LOGO_SOURCE_URL =
  'https://www.nwfutures.com/wp-content/uploads/sites/1564/2023/02/NW-Futures-Logo-Final.png';
export const NW_FUTURES_BASEBALL_VENUE_NAME = 'Harmony Sports Complex';
export const NW_FUTURES_BASEBALL_ADDRESS = '1500 NE 192nd Ave, Vancouver, WA 98684';
export const NW_FUTURES_BASEBALL_ORG_DESCRIPTION =
  'NW Futures is a Portland-Vancouver youth baseball academy. Its public site provides player development, travel-team information, camps, lessons, and seasonal baseball programs.';

const ORGANIZER_NAME = 'NW Futures Baseball';

const summerCampCandidate = ({
  title,
  startsAt,
  endsAt,
  dateDisplayText,
}: {
  title: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
}) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
  sourceUrl: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
  organizerName: ORGANIZER_NAME,
  sportName: 'Baseball',
  formatLabel: 'Youth baseball summer camp',
  city: 'Vancouver, WA',
  venueName: NW_FUTURES_BASEBALL_VENUE_NAME,
  address: NW_FUTURES_BASEBALL_ADDRESS,
  startsAt,
  endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `${dateDisplayText}, 9:00 AM-2:00 PM.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText,
  skillLevel: null,
  ageGroup: 'Ages 6-12',
  divisionText: 'Ages 6-12',
  participantOptionsText: 'Individual player registration through the official NW Futures TeamSnap registration widget.',
  priceText: '$225 per player',
  statusText: 'The official source embeds a TeamSnap registration widget. No capacity or registration deadline is published.',
  description:
    'NW Futures Baseball summer camp provides baseball instruction for players ages 6-12 at Harmony Sports Complex. '
    + 'The source states the current camp price is $225 after its April 30 early-bird deadline.',
  tags: ['Camp'],
  tagText: 'Camp',
  divisions: [{
    name: 'Ages 6-12',
    key: 'ages_6_12',
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'youth',
    priceCents: 22500,
    maxParticipants: null,
    ageCutoffLabel: 'Ages 6-12',
    ageCutoffSource: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
  }],
  warnings: [
    'The public source does not state a maximum participant count or registration deadline.',
    'The page also lists a $175 early-bird price through April 30; the current $225 source price is used.',
  ],
});

export const NW_FUTURES_BASEBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: NW_FUTURES_BASEBALL_HOME_URL,
    sourceUrl: NW_FUTURES_BASEBALL_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Baseball',
    formatLabel: 'Youth baseball academy and travel-team program',
    city: 'Vancouver, WA',
    venueName: NW_FUTURES_BASEBALL_VENUE_NAME,
    address: NW_FUTURES_BASEBALL_ADDRESS,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Baseball programs by season',
    scheduleText: 'NW Futures publishes youth baseball camps, lessons, player development, travel-team information, and seasonal programs.',
    participantOptionsText: 'Use the official NW Futures website for current youth baseball program and registration information.',
    description: NW_FUTURES_BASEBALL_ORG_DESCRIPTION,
    warnings: [
      'Harmony Sports Complex is the reviewed public program venue, not a claimed organization headquarters.',
      'The official transparent NW Futures header logo is downloaded and normalized by the idempotent setup before the public organization is upserted.',
      'No TEAM candidates are created because the source does not publish stable roster-level team registration targets.',
    ],
  },
  summerCampCandidate({
    title: 'NW Futures Baseball Summer Camp - July 20-24',
    startsAt: '2026-07-20T09:00:00-07:00',
    endsAt: '2026-07-24T14:00:00-07:00',
    dateDisplayText: 'July 20-24, 2026',
  }),
  summerCampCandidate({
    title: 'NW Futures Baseball Summer Camp - July 27-31',
    startsAt: '2026-07-27T09:00:00-07:00',
    endsAt: '2026-07-31T14:00:00-07:00',
    dateDisplayText: 'July 27-31, 2026',
  }),
  summerCampCandidate({
    title: 'NW Futures Baseball Summer Camp - August 3-7',
    startsAt: '2026-08-03T09:00:00-07:00',
    endsAt: '2026-08-07T14:00:00-07:00',
    dateDisplayText: 'August 3-7, 2026',
  }),
  summerCampCandidate({
    title: 'NW Futures Baseball Summer Camp - August 10-14',
    startsAt: '2026-08-10T09:00:00-07:00',
    endsAt: '2026-08-14T14:00:00-07:00',
    dateDisplayText: 'August 10-14, 2026',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NW_FUTURES_BASEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NW_FUTURES_BASEBALL_HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: NW_FUTURES_BASEBALL_MANUAL_CANDIDATES,
};

// The public WordPress pages are reviewed source-controlled summaries. The
// mapping retains only the verified club row and remaining 2026 camp sessions.
export const NW_FUTURES_BASEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>NW Futures Baseball reviewed public camp source.</main></body></html>',
    };
  },
};
