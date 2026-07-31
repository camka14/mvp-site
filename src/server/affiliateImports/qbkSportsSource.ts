import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const QBK_SPORTS_HOME_URL = 'https://www.qbksports.com/';
export const QBK_SPORTS_ABOUT_URL = 'https://www.qbksports.com/about-qbk-sports-nyc';
export const QBK_SPORTS_ADULT_CLASSES_URL = 'https://www.qbksports.com/beach-volleyball-classes-long-island-city';
export const QBK_SPORTS_YOUTH_CLASSES_URL = 'https://www.qbksports.com/youth-beach-volleyball-classes';
export const QBK_SPORTS_PARTY_URL = 'https://www.qbksports.com/adult-beach-party';
export const QBK_SPORTS_COMPETITIVE_URL = 'https://www.qbksports.com/adult-beach-volleyball-competitive-nyc';
export const QBK_SPORTS_RENTAL_URL = 'https://www.qbksports.com/nyc-venue-rental';
export const QBK_SPORTS_COURT_BOOKING_URL = 'https://www.catchcorner.com/facility-page/embedded/rental/692';
export const QBK_SPORTS_LOGO_SOURCE_URL =
  'https://static.wixstatic.com/media/e981a2_db8e063b583a46499e5325a617b92361~mv2.png/v1/fill/w_190,h_140,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/e981a2_db8e063b583a46499e5325a617b92361~mv2.png';

export const QBK_SPORTS_ORG_DESCRIPTION =
  'QBK Sports is a year-round indoor beach volleyball facility in Queens, NY with three sand-covered professional courts, a bar, food, lounge, adult and youth programs, leagues, tournaments, drop-ins, parties, and private court rentals.';

export const QBK_SPORTS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b454276d-5f6f-4130-834c-ae6865f8d9a5',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-compete-in-beach-volleyball-tournaments-qbksports-com',
  intakeName: 'Compete in Beach Volleyball Tournaments',
  baseUrl: 'https://www.qbksports.com',
  complianceStatus: 'ALLOWED',
  runId: 'fe966324-19d8-408b-84d7-0bf2cf5553d8',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:09.678Z',
  pages: [
    { url: QBK_SPORTS_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: QBK_SPORTS_ABOUT_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: QBK_SPORTS_ADULT_CLASSES_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: QBK_SPORTS_YOUTH_CLASSES_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: QBK_SPORTS_PARTY_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: QBK_SPORTS_COMPETITIVE_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: QBK_SPORTS_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.qbksports.com/post/beach-volleyball-nyc-guide', role: 'DETAIL', robotsStatus: 'ALLOWED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 29 },
    { kind: 'PAGE_BRANDING', count: 10 },
    { kind: 'PAGE_HTML', count: 9 },
    { kind: 'PAGE_IMAGES', count: 10 },
    { kind: 'PAGE_LINKS', count: 10 },
    { kind: 'PAGE_MARKDOWN', count: 10 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 10 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 10 },
    { kind: 'ROBOTS', count: 10 },
  ],
} as const;

const QBK_SPORTS_ADDRESS = '41-20 39th St, Queens, NY 11104';

export const QBK_SPORTS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'QBK Sports',
    officialActionUrl: QBK_SPORTS_HOME_URL,
    sourceUrl: QBK_SPORTS_HOME_URL,
    organizerName: 'QBK Sports',
    sportName: 'Beach Volleyball',
    formatLabel: 'Year-round indoor beach volleyball facility with adult and youth classes, leagues, tournaments, drop-ins, and parties',
    city: 'Queens, NY',
    venueName: 'QBK Sports',
    address: QBK_SPORTS_ADDRESS,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Indoor beach volleyball programs and facility activities',
    scheduleText: 'The stored official pages describe recurring adult classes and youth Cubs and Seals programs, plus leagues, tournaments, and drop-ins. Current dated event rows are withheld.',
    statusText: 'Review-only organization profile; current class, league, tournament, and drop-in availability requires a complete current source row.',
    description: QBK_SPORTS_ORG_DESCRIPTION,
    tags: ['Club', 'Beach Volleyball', 'Indoor Facility', 'Youth', 'Adult'],
    warnings: [
      'The stored capture provides recurring schedules and program summaries but no complete current date, time, venue, price, and action rows for safe EVENT creation.',
      'The address is taken from the stored official QBK Sports guide page and is retained as organization evidence, not as a date-specific event location.',
      'Youth Beach Lions tryouts are team-oriented material and are withheld; no TEAM candidate is created.',
      'The source intake run is PARTIAL; linked pages without complete captured rows remain withheld.',
    ],
  },
  {
    listingKind: 'RENTAL' as const,
    title: 'QBK Sports Indoor Beach Court Rental',
    officialActionUrl: QBK_SPORTS_COURT_BOOKING_URL,
    sourceUrl: QBK_SPORTS_HOME_URL,
    organizerName: 'QBK Sports',
    sportName: 'Beach Volleyball',
    formatLabel: 'Private indoor beach volleyball court rental by the hour',
    city: 'Queens, NY',
    venueName: 'QBK Sports',
    address: QBK_SPORTS_ADDRESS,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Private indoor beach volleyball court rentals by the hour',
    scheduleText: 'The stored official QBK Sports homepage says private court rentals are available by the hour and links to the CatchCorner booking flow.',
    statusText: 'Review-only rental listing; live availability and current rental price are determined on the official booking page.',
    description: 'Private court rentals are available by the hour at QBK Sports; reserve through the official CatchCorner booking flow.',
    tags: ['Rental', 'Beach Volleyball', 'Indoor Facility'],
    warnings: [
      'The captured official homepage confirms hourly private court rentals and the booking URL, but does not expose current availability or a general court-rental price.',
      'The $300/hour amount in the stored party page is an additional party court-time add-on and is not assigned to this general rental candidate.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const QBK_SPORTS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: QBK_SPORTS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'QBK Sports' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: QBK_SPORTS_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: QBK_SPORTS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'QBK Sports' },
    sportName: { selector: 'body', mode: 'literal', value: 'Beach Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Year-round indoor beach volleyball facility with adult and youth classes, leagues, tournaments, drop-ins, and parties' },
    city: { selector: 'body', mode: 'literal', value: 'Queens, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'QBK Sports' },
    address: { selector: 'body', mode: 'literal', value: QBK_SPORTS_ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Indoor beach volleyball programs and facility activities' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official pages describe recurring adult classes and youth programs, plus leagues, tournaments, and drop-ins; current dated rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: QBK_SPORTS_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Beach Volleyball, Indoor Facility, Youth, Adult' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: QBK_SPORTS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/qbkSports.html');

export const QBK_SPORTS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: QBK_SPORTS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
