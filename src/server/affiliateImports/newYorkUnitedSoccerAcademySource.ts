import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYUSA_HOME_URL = 'https://www.nyunitedsoccer.com/';
export const NYUSA_SUMMER_URL = 'https://www.nyunitedsoccer.com/summer';
export const NYUSA_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/f132b9_00aa1413ea5f441eaf9d94a47f142f03~mv2.png/v1/fill/w_2500,h_2500,al_c/f132b9_00aa1413ea5f441eaf9d94a47f142f03~mv2.png';
export const NYUSA_ORG_DESCRIPTION = 'New York United Soccer Academy (NYUSA) offers youth soccer programs in Queens, including Pre-K, seasonal, development, travel, small-group, and summer-camp programming.';

export const NYUSA_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '140ed625-9c81-4042-b476-280d5a5e89e9',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-united-soccer-academy-nyusa-nyunitedsoccer-com',
  intakeName: 'New York United Soccer Academy- NYUSA',
  baseUrl: 'https://www.nyunitedsoccer.com',
  complianceStatus: 'ALLOWED',
  runId: '08c97a93-75e3-4030-aed0-9a9af7958b2a',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:21.399Z',
  pages: [
    { url: 'https://www.nyunitedsoccer.com/development-academy', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/personalized-training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/preksoccer', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/seasonal-soccer', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/sponsors', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYUSA_SUMMER_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/travel', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/ufl', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/fall', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/payment-request-page', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/product-page/purple-match-kit', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/product-page/red-match-kit', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/product-page/white-training-kit', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/sponsor-us', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/spring', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/winter', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYUSA_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.nyunitedsoccer.com/summer-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nyunitedsoccer.com/tryouts', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

export const NYUSA_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'New York United Soccer Academy',
    officialActionUrl: NYUSA_HOME_URL,
    sourceUrl: NYUSA_HOME_URL,
    organizerName: 'New York United Soccer Academy',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer academy programs, seasonal sessions, travel academy, small-group training, and camps',
    city: 'Queens, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing Queens youth soccer academy programs',
    scheduleText: 'The stored homepage lists Pre-K and seasonal training twice per week, a twice-weekly 10-month development academy, travel training three to four times per week, small-group sessions for all ages, and a Summer Camp 2026 program coming in July 2026.',
    statusText: 'Review-only club profile; current program, camp, tryout, and registration detail pages require separate review.',
    description: NYUSA_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Queens', 'Academy'],
    warnings: [
      'The stored allowed homepage does not provide a complete current date, time, venue, price, capacity, or registration row for a specific event, so no EVENT candidate is created.',
      'The stored intake marks program, camp, tryout, registration, team, and rental detail pages UNCHECKED; those rows are withheld.',
      'Summer Camp 2026 is described as coming in July 2026, but its unchecked detail page does not provide a complete dated row and no event is inferred.',
      'The stored first-party NYUSA crest candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYUSA_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYUSA_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York United Soccer Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYUSA_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYUSA_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York United Soccer Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Queens, Academy' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYUSA_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkUnitedSoccerAcademy.html');

export const NYUSA_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NYUSA_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
