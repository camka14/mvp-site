import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NY_URBAN_HOME_URL = 'https://www.nyurban.com/';
export const NY_URBAN_OPEN_PLAY_URL = 'https://www.nyurban.com/open-play-volleyball';
export const NY_URBAN_ENROLL_URL = 'https://nyurban.com/?page_id=400&filter_id=1&gametypeid=1';
export const NY_URBAN_PLAYER_REGISTRATION_URL = 'https://www.nyurban.com/player-registration?type=vb';
export const NY_URBAN_LOGO_SOURCE_URL = 'https://www.nyurban.com/wp-content/themes/twentyeleven/images/openplay_volyball_logo.png';

export const NY_URBAN_ORG_DESCRIPTION =
  'New York Urban Professionals Volleyball League offers recurring volleyball open play and clinics at Manhattan school and campus venues.';

export const NY_URBAN_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '9c84cd57-895c-4be7-b2f0-1fa8165ff831',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-ny-urban-professionals-volleyball-league-open-play-nyurban-com',
  intakeName: 'NY Urban Professionals Volleyball League / Open Play',
  baseUrl: 'https://www.nyurban.com',
  complianceStatus: 'ALLOWED',
  runId: 'b450f9ad-2f02-4f92-923a-5a806c49de5f',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:55:11.142Z',
  pages: [
    { url: NY_URBAN_OPEN_PLAY_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NY_URBAN_PLAYER_REGISTRATION_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyurban.com/open-play-volleyball-no', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyurban.com/volleyball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyurban.com/volleyball/clinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyurban.com/vb-open-scrimmage-registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NY_URBAN_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'New York Urban Professionals Volleyball League',
  officialActionUrl: NY_URBAN_OPEN_PLAY_URL,
  sourceUrl: NY_URBAN_OPEN_PLAY_URL,
  organizerName: 'New York Urban Professionals Volleyball League',
  sportName: 'Volleyball',
  formatLabel: 'Volleyball open play and clinics',
  city: 'New York, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Recurring New York Urban volleyball open play and clinics',
  scheduleText: 'The stored official open-play listing describes recurring Friday and Sunday volleyball sessions and clinics at Manhattan school and campus venues.',
  statusText: 'Review-only club profile; current registration and exact session dates require the unchecked detail and enrollment pages.',
  description: NY_URBAN_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Open Play', 'Clinic', 'New York'],
  warnings: [
    'The stored allowed listing supports recurring program summaries; exact dates are directed to a next-page enrollment flow that is not captured.',
    'The stored detail, registration, and clinic pages are UNCHECKED and remain withheld.',
    'No TEAM candidate is created because team mappings are out of scope.',
    'The stored first-party NY Urban logo was retained as an official screenshot crop because its white-on-transparent asset requires the captured blue header background for legibility.',
  ],
};

type EventCandidateParams = {
  title: string;
  venueName: string | null;
  address: string | null;
  scheduleText: string;
  dateDisplayMode: 'ONGOING' | 'NO_FIXED_DATE';
  dateDisplayText: string;
  formatLabel: string;
  priceText: string;
  participantOptionsText: string;
  description: string;
};

const eventCandidate = (params: EventCandidateParams) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: NY_URBAN_ENROLL_URL,
  sourceUrl: NY_URBAN_OPEN_PLAY_URL,
  organizerName: 'New York Urban Professionals Volleyball League',
  sportName: 'Volleyball',
  formatLabel: params.formatLabel,
  city: 'New York, NY',
  venueName: params.venueName,
  address: params.address,
  timeZone: 'America/New_York',
  startsAt: null,
  endsAt: null,
  dateDisplayMode: params.dateDisplayMode,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  priceText: params.priceText,
  participantOptionsText: params.participantOptionsText,
  statusText: 'Review-only recurring volleyball program; verify current dates and checkout location through the official enrollment flow.',
  description: params.description,
  tags: ['Event', 'Volleyball', params.formatLabel],
  warnings: [
    'The stored listing does not provide a fixed calendar date; current dates are directed to the official enrollment page and are not inferred.',
    'The stored enrollment and detail pages are UNCHECKED.',
  ],
});

export const NY_URBAN_EVENT_CANDIDATES = [
  eventCandidate({
    title: 'NY Urban Friday Intermediate Open Play - W.50th Street Campus',
    venueName: 'W.50th Street Campus',
    address: '525 W.50th btw 10th & 11th',
    scheduleText: 'Fridays, 7:00-10:30 PM. The listing describes 3 full-size courts for intermediate players and 3 teams of 8 per court.',
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Recurring Friday open play',
    formatLabel: 'Intermediate open play',
    priceText: '$18',
    participantOptionsText: 'Intermediate players; three teams of eight per court.',
    description: 'NY Urban lists recurring Friday intermediate volleyball open play at W.50th Street Campus, 525 W.50th between 10th and 11th. The stored listing gives a 7:00-10:30 PM schedule, three full-size courts, and $18 pricing.',
  }),
  eventCandidate({
    title: 'NY Urban Friday Advanced Open Play - Beacon H.S.',
    venueName: 'Beacon H.S.',
    address: '522 West 44th St (between 10th & 11th Ave)',
    scheduleText: 'Fridays, 7:30-10:00 PM. The listing describes advanced and advanced-intermediate play with three teams of seven per court.',
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Recurring Friday open play',
    formatLabel: 'Advanced open play',
    priceText: '$16',
    participantOptionsText: 'Advanced and advanced-intermediate players; three teams of seven per court.',
    description: 'NY Urban lists recurring Friday advanced and advanced-intermediate volleyball open play at Beacon H.S., 522 West 44th Street between 10th and 11th Avenue. The stored listing gives a 7:30-10:00 PM schedule and $16 pricing.',
  }),
  eventCandidate({
    title: 'NY Urban Brandeis H.S. Open Play',
    venueName: 'Brandeis H.S.',
    address: 'W.84th St. (between Columbus & Amsterdam)',
    scheduleText: 'The stored listing gives July and August pricing and times of 7:15-10:30 PM, with three courts and three levels: intermediate, beginner, and advanced beginner.',
    dateDisplayMode: 'NO_FIXED_DATE',
    dateDisplayText: 'July and August; year not stated in the stored listing',
    formatLabel: 'Multi-level open play',
    priceText: '$9-$15',
    participantOptionsText: 'Intermediate, beginner, and advanced-beginner players; three teams of seven per court.',
    description: 'NY Urban lists July and August volleyball open play at Brandeis H.S. on West 84th Street between Columbus and Amsterdam. The stored listing gives 7:15-10:30 PM, three levels, and $15 on two main courts or $9 on the small court.',
  }),
  eventCandidate({
    title: 'NY Urban Sunday Intermediate Open Play - Chelsea School',
    venueName: 'Chelsea School',
    address: '281 9th Ave (between 26th & 27th)',
    scheduleText: 'Sundays, two intermediate sessions from 12:00-3:30 PM and 4:00-7:30 PM. The listing describes three teams of eight per court.',
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Recurring Sunday intermediate open play',
    formatLabel: 'Intermediate open play',
    priceText: '$16',
    participantOptionsText: 'Intermediate players; three teams of eight per court.',
    description: 'NY Urban lists two recurring Sunday intermediate volleyball sessions at Chelsea School, 281 9th Avenue between 26th and 27th. The stored listing gives 12:00-3:30 PM and 4:00-7:30 PM sessions at $16.',
  }),
  eventCandidate({
    title: 'NY Urban Sunday Beginner Open Play - Chelsea School',
    venueName: 'Chelsea School',
    address: '281 9th Ave (between 26th & 27th)',
    scheduleText: 'Sundays, 9:00 AM-noon. The listing describes one beginner session on two main courts.',
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Recurring Sunday beginner open play',
    formatLabel: 'Beginner open play',
    priceText: '$13',
    participantOptionsText: 'Beginner players; one session on two main courts.',
    description: 'NY Urban lists a recurring Sunday beginner volleyball session at Chelsea School, 281 9th Avenue between 26th and 27th. The stored listing gives a 9:00 AM-noon schedule and $13 pricing.',
  }),
  eventCandidate({
    title: 'NY Urban Volleyball Clinics',
    venueName: null,
    address: null,
    scheduleText: 'Various weekdays, 7:00-10:00 PM. The listing says to verify specific dates on the next page; Friday location is either RSMA at 300 W. 61st/Cor WEA or W50th Campus at 525 W50th/10th & 11th.',
    dateDisplayMode: 'NO_FIXED_DATE',
    dateDisplayText: 'Various weekdays; specific dates not stated',
    formatLabel: 'Volleyball clinic',
    priceText: '$19',
    participantOptionsText: 'Open clinic enrollment through the official date and enrollment flow.',
    description: 'NY Urban lists three-hour volleyball clinics on various weekdays from 7:00-10:00 PM at $19. The stored listing directs players to verify specific dates and location at checkout.',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NY_URBAN_MANUAL_CANDIDATES = [organizationCandidate, ...NY_URBAN_EVENT_CANDIDATES] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NY_URBAN_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NY_URBAN_OPEN_PLAY_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Urban Professionals Volleyball League' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NY_URBAN_ENROLL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NY_URBAN_OPEN_PLAY_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Urban Professionals Volleyball League' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Volleyball open play and clinics' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Recurring volleyball open play and clinics' },
    description: { selector: 'body', mode: 'literal', value: NY_URBAN_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Volleyball, Open Play, Clinic, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NY_URBAN_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nyUrbanVolleyball.html');

export const NY_URBAN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NY_URBAN_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
