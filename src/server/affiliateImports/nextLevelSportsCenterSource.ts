import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEXT_LEVEL_HOME_URL = 'https://nextlevelsportscenter.com/';
export const NEXT_LEVEL_COURT_RENTALS_URL = 'https://nextlevelsportscenter.com/court-rentals-next-level-sports-center';
export const NEXT_LEVEL_CLINICS_URL = 'https://nextlevelsportscenter.com/basketball-clinics-next-level-sports-center';
export const NEXT_LEVEL_BIRTHDAY_EVENTS_URL = 'https://nextlevelsportscenter.com/schedule-birthday-party-event-indoor-basketball-court-huntington-new-york';
export const NEXT_LEVEL_LOGO_SOURCE_URL = 'https://nextlevelsportscenter.com/wp-content/uploads/2019/02/nextlevelblk.png';
export const NEXT_LEVEL_ORG_DESCRIPTION =
  'Next Level Sports Center is a modern indoor basketball facility on Long Island with two regulation-sized basketball courts, a half-court training area, court rentals, basketball clinics, birthday parties and events, private coaching, and a state-of-the-art shooting machine.';

export const NEXT_LEVEL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '1477c856-b37c-48bb-ac1e-c8cd42ba4ca6',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-indoor-basketball-court-huntington-long-island-new-york-nextleve',
  intakeName: 'Indoor Basketball Court - Huntington Long Island New York',
  baseUrl: NEXT_LEVEL_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '378d3b66-da72-4f5c-b5a7-c06c4618db41',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:11:04.567Z',
  pages: [
    { url: NEXT_LEVEL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: NEXT_LEVEL_COURT_RENTALS_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: NEXT_LEVEL_CLINICS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEXT_LEVEL_BIRTHDAY_EVENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://nextlevelsportscenter.com/category/rental', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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

export const NEXT_LEVEL_OFFICIAL_URLS = [
  NEXT_LEVEL_HOME_URL,
  NEXT_LEVEL_COURT_RENTALS_URL,
  NEXT_LEVEL_CLINICS_URL,
  NEXT_LEVEL_BIRTHDAY_EVENTS_URL,
  'https://nextlevelsportscenter.com/about',
  'https://nextlevelsportscenter.com/contact-us',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Next Level Sports Center',
  officialActionUrl: NEXT_LEVEL_HOME_URL,
  sourceUrl: NEXT_LEVEL_HOME_URL,
  organizerName: 'Next Level Sports Center',
  sportName: 'Basketball',
  formatLabel: 'Indoor basketball facility with regulation courts, training area, clinics, private coaching, and events',
  city: 'Huntington, NY',
  venueName: 'Next Level Sports Center',
  address: '156 Railroad Street, Huntington NY',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing indoor basketball facility and programs',
  scheduleText: 'The stored ALLOWED homepage describes two regulation-sized basketball courts, a half-court training area, court rentals, birthday parties and events, basketball instructional clinics, private coaching, and a shooting machine.',
  statusText: 'Review-only facility profile; current court availability, clinic schedules, and event packages require the official linked pages.',
  description: NEXT_LEVEL_ORG_DESCRIPTION,
  tags: ['Club', 'Basketball', 'Indoor Facility', 'Courts', 'Huntington'],
  logoUrl: NEXT_LEVEL_LOGO_SOURCE_URL,
  logoSourceUrl: NEXT_LEVEL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage identifies Next Level Sports Center and the exact Huntington address.',
    'Court rentals, clinic, birthday-event, contact, and other detail pages are UNCHECKED; no dated or priced inventory is inferred.',
    'The stored first-party Next Level Sports Center logo was normalized locally to an opaque 1024px square PNG on white.',
  ],
};

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'Next Level Sports Center Indoor Basketball Court Rentals',
  officialActionUrl: NEXT_LEVEL_COURT_RENTALS_URL,
  sourceUrl: NEXT_LEVEL_HOME_URL,
  organizerName: 'Next Level Sports Center',
  sportName: 'Basketball',
  formatLabel: 'Indoor regulation basketball court rentals for leagues, clubs, companies, groups, and friends',
  city: 'Huntington, NY',
  venueName: 'Next Level Sports Center',
  address: '156 Railroad Street, Huntington NY',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing indoor basketball court rental path',
  scheduleText: 'The stored homepage describes court rentals tailored to leagues, organizations, and groups and links to the official court-rental page. Current availability and reservation windows are not stored.',
  statusText: 'Review-only rental link-out; current court availability, pricing, and reservation details require the official court-rental page.',
  description: 'Next Level Sports Center offers indoor basketball court rentals for leagues, clubs, companies, organizations, groups, and friends at its Huntington, Long Island facility.',
  tags: ['Rental', 'Basketball', 'Indoor Courts', 'Huntington'],
  logoUrl: NEXT_LEVEL_LOGO_SOURCE_URL,
  logoSourceUrl: NEXT_LEVEL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports the court-rental path and identifies the facility address.',
    'The official court-rentals page is UNCHECKED; no current availability, price, reservation date, or package is inferred.',
  ],
};

export const NEXT_LEVEL_MANUAL_CANDIDATES = [clubCandidate, rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEXT_LEVEL_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: NEXT_LEVEL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Next Level Sports Center Indoor Basketball Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEXT_LEVEL_COURT_RENTALS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEXT_LEVEL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Next Level Sports Center' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    city: { selector: 'body', mode: 'literal', value: 'Huntington, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Basketball, Indoor Courts, Huntington' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NEXT_LEVEL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nextLevelSportsCenter.html');

export const NEXT_LEVEL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NEXT_LEVEL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
