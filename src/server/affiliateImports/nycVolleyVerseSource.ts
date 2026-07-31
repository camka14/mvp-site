import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_VOLLEYVERSE_HOME_URL = 'https://www.nycvolleyverse.com/';
export const NYC_VOLLEYVERSE_TRYOUT_FAQ_URL = 'https://www.nycvolleyverse.com/tryouts-faq';
export const NYC_VOLLEYVERSE_PROGRAMMING_URL = 'https://www.nycvolleyverse.com/programming';
export const NYC_VOLLEYVERSE_RISING_STARS_URL = 'https://www.nycvolleyverse.com/risingstars';
export const NYC_VOLLEYVERSE_CLASSES_BROOKLYN_URL = 'https://www.nycvolleyverse.com/classes-bk';
export const NYC_VOLLEYVERSE_CLASSES_STATEN_ISLAND_URL = 'https://www.nycvolleyverse.com/classes-si';
export const NYC_VOLLEYVERSE_LOGO_SOURCE_URL = 'https://irp.cdn-website.com/134a6501/dms3rep/multi/VV-Horizontal-FullColor.svg';

export const NYC_VOLLEYVERSE_ORG_DESCRIPTION =
  'NYC VolleyVerse is a New York City volleyball educational nonprofit offering boys and girls club teams in Brooklyn and Staten Island, plus classes, camps, private lessons, and after-school programming for grades K-12.';

export const NYC_VOLLEYVERSE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '95a1dab8-8fa1-4fb8-8576-2e855d8e301d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-volleyverse-nycvolleyverse-com',
  intakeName: 'NYC VolleyVerse',
  baseUrl: NYC_VOLLEYVERSE_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: 'a7ad0949-2883-47a3-84df-cda6521bc74a',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:59:32.247Z',
  pages: [
    { url: NYC_VOLLEYVERSE_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: NYC_VOLLEYVERSE_PROGRAMMING_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NYC_VOLLEYVERSE_RISING_STARS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_VOLLEYVERSE_TRYOUT_FAQ_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycvolleyverse.com/tryouts-brooklyn', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycvolleyverse.com/tryouts-statenisland', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NYC_VOLLEYVERSE_CLASSES_BROOKLYN_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_VOLLEYVERSE_CLASSES_STATEN_ISLAND_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycvolleyverse.com/locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycvolleyverse.com/teams-bk', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycvolleyverse.com/teams-si', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 4 },
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

export const NYC_VOLLEYVERSE_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NYC VolleyVerse',
    officialActionUrl: NYC_VOLLEYVERSE_TRYOUT_FAQ_URL,
    sourceUrl: NYC_VOLLEYVERSE_HOME_URL,
    organizerName: 'NYC VolleyVerse',
    sportName: 'Volleyball',
    formatLabel: 'Boys and girls club teams, classes, camps, private lessons, and after-school volleyball',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing New York City volleyball programs',
    scheduleText: 'The stored official homepage describes club teams in Brooklyn and Staten Island, Rising Stars, classes, camps, private lessons, and after-school programming for grades K-12.',
    statusText: 'Review-only club profile; current tryout dates, class schedules, locations, prices, and registration rows require the unchecked detail and registration pages.',
    description: NYC_VOLLEYVERSE_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'Brooklyn', 'Staten Island'],
    logoUrl: NYC_VOLLEYVERSE_LOGO_SOURCE_URL,
    logoSourceUrl: NYC_VOLLEYVERSE_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage provides evergreen program context and says 2026-2027 club tryouts are open, but no complete current date, time, venue, price, or registration row is captured; no EVENT candidate is created.',
      'The stored programming, Rising Stars, classes, locations, tryout, and registration pages are UNCHECKED and remain withheld.',
      'The homepage states 13 travel teams, but no TEAM candidate is created because team mappings are out of scope.',
      'The stored first-party NYC VolleyVerse horizontal logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_VOLLEYVERSE_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYC_VOLLEYVERSE_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC VolleyVerse' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_VOLLEYVERSE_TRYOUT_FAQ_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_VOLLEYVERSE_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC VolleyVerse' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Boys and girls club teams, classes, camps, private lessons, and after-school volleyball' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing New York City volleyball programs' },
    description: { selector: 'body', mode: 'literal', value: NYC_VOLLEYVERSE_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Brooklyn, Staten Island' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYC_VOLLEYVERSE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycVolleyVerse.html');

export const NYC_VOLLEYVERSE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NYC_VOLLEYVERSE_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
