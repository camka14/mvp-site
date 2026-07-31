import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const TRUGO16_ATHLETICS_HOME_URL = 'https://trugo16athletics.com/';
export const TRUGO16_ATHLETICS_TRYOUT_URL = 'https://trugo16athletics.com/zt-ny-tryouts-11u-17u';
export const TRUGO16_ATHLETICS_LOGO_SOURCE_URL = 'https://trugo16athletics.com/web/image/website/1/logo/Trugo16Athletics?unique=33c2a61';
export const TRUGO16_ATHLETICS_ORG_DESCRIPTION = 'Trugo16 Athletics provides lessons, programs, and cage rentals, with ZT New York players receiving year-round facility access and seasonal discounted rates.';

export const TRUGO16_ATHLETICS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '663682d5-30a9-4784-9976-3e314a3e3dde',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-zt-new-york-tryouts-11u-17u-join-elite-baseball-teams-trugo16ath',
  intakeName: 'ZT New York Tryouts (11U-17U)',
  baseUrl: 'https://trugo16athletics.com',
  complianceStatus: 'ALLOWED',
  runId: '1418bc65-6d3c-4f34-8de3-03a0a03e257e',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:25:17.615Z',
  pages: [
    { url: TRUGO16_ATHLETICS_TRYOUT_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://trugo16athletics.com/about-trugo16athletics', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/appointment', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/contactus', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/news-events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/zt-ny-summer-schedules', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/baseball-youth-development', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://trugo16athletics.com/youth-development', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const TRUGO16_ATHLETICS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Trugo16 Athletics',
    officialActionUrl: TRUGO16_ATHLETICS_TRYOUT_URL,
    sourceUrl: TRUGO16_ATHLETICS_TRYOUT_URL,
    organizerName: 'Trugo16 Athletics',
    sportName: 'Baseball',
    formatLabel: 'Baseball lessons, programs, cage rentals, and player development',
    city: null,
    venueName: 'Trugo16 Athletics',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round athletics programs and cage rentals',
    scheduleText: 'The stored ZT New York page says membership at Trugo16 Athletics includes discounted lessons, programs, and cage rentals; ZT New York players have access from May through December and discounted rates from January through April.',
    statusText: 'Review-only club profile; current lesson, program, and cage-rental details require the official Trugo16 Athletics site.',
    description: TRUGO16_ATHLETICS_ORG_DESCRIPTION,
    tags: ['Club', 'Baseball', 'Training', 'Cage Rental'],
    logoUrl: TRUGO16_ATHLETICS_LOGO_SOURCE_URL,
    logoSourceUrl: TRUGO16_ATHLETICS_LOGO_SOURCE_URL,
    warnings: [
      'The stored page is a ZT New York 11U-17U tryout page; team logos and team participation are withheld as TEAM-only material.',
      'The stored capture does not contain complete current lesson, program, or cage-rental date, venue, price, and booking rows, so no EVENT or RENTAL candidate is created.',
      'The official Trugo16 Athletics wordmark from stored page branding was normalized to an opaque 1024px PNG with a dark background without altering the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const TRUGO16_ATHLETICS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: TRUGO16_ATHLETICS_TRYOUT_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Trugo16 Athletics' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: TRUGO16_ATHLETICS_TRYOUT_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: TRUGO16_ATHLETICS_TRYOUT_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Trugo16 Athletics' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Baseball lessons, programs, cage rentals, and player development' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round athletics programs and cage rentals' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored ZT New York page says membership at Trugo16 Athletics includes discounted lessons, programs, and cage rentals; ZT New York players have access from May through December and discounted rates from January through April.' },
    description: { selector: 'body', mode: 'literal', value: TRUGO16_ATHLETICS_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Training, Cage Rental' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: TRUGO16_ATHLETICS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/trugo16Athletics.html');

export const TRUGO16_ATHLETICS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: TRUGO16_ATHLETICS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
