import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOFIVE_CHITOWN_HOME_URL = 'https://www.sofive.com/';
export const SOFIVE_CHITOWN_LOCATION_URL = 'https://www.sofive.com/locations/chitown';
export const SOFIVE_CHITOWN_RENTAL_URL = 'https://www.sofive.com/rent-a-field/chitown';
export const SOFIVE_CHITOWN_PICKUP_URL = 'https://www.sofive.com/pickup/chitown';
export const SOFIVE_CHITOWN_LEAGUES_URL = 'https://www.sofive.com/house-soccer-leagues/chitown';
export const SOFIVE_CHITOWN_LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/6821a564b613eae724040553/682477152d0f7e4a372ec03d_SOFIVE.svg';

export const SOFIVE_CHITOWN_ORG_DESCRIPTION =
  'Sofive Chitown is an indoor soccer facility in Pilsen, Chicago with five indoor 5-a-side fields, a training field, video replay technology, a viewing lounge, bar and café, and adult and youth soccer programs.';

export const SOFIVE_CHITOWN_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b04e4b4e-baba-4e48-896c-941419ea8edf',
  intakeSourceKey: 'chicago-illinois-metropolitan-area-indoor-soccer-in-pilsen-chicago-sofive-com',
  intakeName: 'Indoor Soccer in Pilsen Chicago',
  baseUrl: 'https://www.sofive.com',
  complianceStatus: 'ALLOWED',
  runId: '3f1eaf6b-b060-4758-8601-8987d1293066',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:22:27.371Z',
  pages: [
    { url: SOFIVE_CHITOWN_LOCATION_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: SOFIVE_CHITOWN_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: SOFIVE_CHITOWN_PICKUP_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: SOFIVE_CHITOWN_LEAGUES_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
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

const SOFIVE_CHITOWN_ADDRESS = '2343 S Throop St, Chicago, IL 60608';

export const SOFIVE_CHITOWN_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Sofive Chitown',
    officialActionUrl: SOFIVE_CHITOWN_LOCATION_URL,
    sourceUrl: SOFIVE_CHITOWN_LOCATION_URL,
    organizerName: 'Sofive',
    sportName: 'Soccer',
    formatLabel: 'Indoor 5-a-side soccer facility with adult and youth leagues, pickup, classes, tournaments, and events',
    city: 'Chicago, IL',
    venueName: 'Sofive Chitown',
    address: SOFIVE_CHITOWN_ADDRESS,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Indoor soccer programs and facility activities',
    scheduleText: 'The stored location page lists opening hours of Monday-Friday 3 PM-1 AM (2 AM Friday) and Saturday-Sunday 8 AM-1 AM, plus adult and youth soccer pathways. Current dated league and tournament rows are withheld.',
    statusText: 'Review-only facility organization profile; current program dates and availability require complete captured detail rows.',
    description: SOFIVE_CHITOWN_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Indoor Facility', 'Adult', 'Youth'],
    warnings: [
      'The stored location page provides facility facts, hours, and official program links but no complete current date, time, price, and registration rows for safe EVENT creation.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
  {
    listingKind: 'RENTAL' as const,
    title: 'Sofive Chitown Indoor Soccer Field Rental',
    officialActionUrl: SOFIVE_CHITOWN_RENTAL_URL,
    sourceUrl: SOFIVE_CHITOWN_LOCATION_URL,
    organizerName: 'Sofive',
    sportName: 'Soccer',
    formatLabel: 'Indoor 5-a-side field and training-field rental',
    city: 'Chicago, IL',
    venueName: 'Sofive Chitown',
    address: SOFIVE_CHITOWN_ADDRESS,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Indoor soccer field rental',
    scheduleText: 'The stored location page links to the official Sofive Chitown Rent a Field path; the captured evidence does not expose current rental availability or price.',
    statusText: 'Review-only rental listing; current availability and price require the official rental flow.',
    description: 'Sofive Chitown offers indoor 5-a-side fields and a training field; use the official local Rent a Field page for booking details.',
    tags: ['Rental', 'Soccer', 'Indoor Facility'],
    warnings: [
      'The stored location page confirms the local rental action URL and field inventory but does not publish current rental price or availability.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOFIVE_CHITOWN_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: SOFIVE_CHITOWN_LOCATION_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Sofive Chitown' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOFIVE_CHITOWN_LOCATION_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: SOFIVE_CHITOWN_LOCATION_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Sofive' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor 5-a-side soccer facility with adult and youth leagues, pickup, classes, tournaments, and events' },
    city: { selector: 'body', mode: 'literal', value: 'Chicago, IL' },
    venueName: { selector: 'body', mode: 'literal', value: 'Sofive Chitown' },
    address: { selector: 'body', mode: 'literal', value: SOFIVE_CHITOWN_ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Indoor soccer programs and facility activities' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored location page lists facility hours and adult and youth soccer pathways; current dated rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: SOFIVE_CHITOWN_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Indoor Facility, Adult, Youth' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: SOFIVE_CHITOWN_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/sofiveChitown.html');

export const SOFIVE_CHITOWN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: SOFIVE_CHITOWN_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
