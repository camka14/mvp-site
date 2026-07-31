import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOFIVE_BROOKLYN_SOURCE_URL = 'https://www.sofive.com/rent-a-field/brooklyn';
export const SOFIVE_BROOKLYN_HOME_URL = 'https://www.sofive.com/';
export const SOFIVE_BROOKLYN_LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/6821a564b613eae724040553/682477152d0f7e4a372ec03d_SOFIVE.svg';

export const SOFIVE_BROOKLYN_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ec980607-fd14-44a4-8f42-c3de8e281cff',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-rent-a-soccer-field-in-brooklyn-new-york-sofive-com',
  intakeName: 'Rent a Soccer Field in Brooklyn New York',
  baseUrl: 'https://www.sofive.com',
  complianceStatus: 'ALLOWED',
  runId: 'e8829750-f248-4e8b-8911-84fb2b36d591',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:23:01.701Z',
  pages: [
    { url: SOFIVE_BROOKLYN_SOURCE_URL, role: 'RENTAL', robotsStatus: 'ALLOWED' },
    { url: 'https://www.sofive.com/locations/brooklyn', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.sofive.com/rent-a-soccer-field', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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

export const SOFIVE_BROOKLYN_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'Sofive Brooklyn Indoor Soccer Field Rental',
    officialActionUrl: SOFIVE_BROOKLYN_SOURCE_URL,
    sourceUrl: SOFIVE_BROOKLYN_SOURCE_URL,
    organizerName: 'Sofive',
    sportName: 'Soccer',
    formatLabel: 'Indoor soccer field rental',
    city: 'Brooklyn, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Sofive Brooklyn field rental',
    scheduleText: 'The stored discovery evidence identifies the official Sofive Brooklyn Rent a Field path; current facility details, hours, price, and availability were not captured.',
    statusText: 'Review-only rental path; current availability and price require the official Sofive booking flow.',
    description: 'The stored Sofive intake identifies an official Brooklyn field-rental path. Review the official page for current facility, price, and availability details.',
    tags: ['Rental', 'Soccer', 'Indoor Facility'],
    warnings: [
      'The Brooklyn location and rental paths are stored as discovery evidence, but no complete captured location page supplies a street address, facility inventory, price, hours, or availability.',
      'No dated EVENT or TEAM candidate is created from the partial tournament/location discovery capture.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOFIVE_BROOKLYN_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: SOFIVE_BROOKLYN_SOURCE_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Sofive Brooklyn Indoor Soccer Field Rental' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOFIVE_BROOKLYN_SOURCE_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: SOFIVE_BROOKLYN_SOURCE_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Sofive' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor soccer field rental' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Sofive Brooklyn field rental' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored discovery evidence identifies the official Sofive Brooklyn rental path; current details were not captured.' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Soccer, Indoor Facility' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: SOFIVE_BROOKLYN_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/sofiveBrooklyn.html');
export const SOFIVE_BROOKLYN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: SOFIVE_BROOKLYN_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
