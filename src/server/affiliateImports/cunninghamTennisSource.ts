import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CUNNINGHAM_HOME_URL = 'https://cunninghamtennis.com/';
export const CUNNINGHAM_RENTAL_URL = 'https://www.catchcorner.com/facility-page/embedded/rental/1253';
export const CUNNINGHAM_LOGO_SOURCE_URL = 'https://cunninghamtennis.com/wp-content/uploads/2021/04/cropped-Cunningham-Tennis-Logo-1.png';
export const CUNNINGHAM_DESCRIPTION = 'Cunningham Tennis offers junior and adult tennis programs, summer camps, private lessons, pickup tennis, and court booking through its official New York-area site.';

export const CUNNINGHAM_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '161bfdb1-d6b8-4195-b7e5-329d9d70e8cb',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-cunningham-tennis-cunninghamtennis-com',
  intakeName: 'Cunningham Tennis',
  baseUrl: 'https://cunninghamtennis.com',
  complianceStatus: 'ALLOWED',
  runId: 'b626a65c-6199-4481-a89d-d18e296df108',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:40.287Z',
  pages: [
    { url: CUNNINGHAM_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://cunninghamtennis.com/events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/adultprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/indooradultprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/indoorjuniorprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/juniorprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/schoolsprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/summeradultprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/summercamp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/summerjuniorprograms', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/book-court-online', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/indoor-rates', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://cunninghamtennis.com/outdoor-rates', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const CUNNINGHAM_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Cunningham Tennis',
    officialActionUrl: CUNNINGHAM_HOME_URL,
    sourceUrl: CUNNINGHAM_HOME_URL,
    organizerName: 'Cunningham Tennis',
    sportName: 'Tennis',
    formatLabel: 'Junior and adult tennis programs, summer camps, lessons, and pickup tennis',
    city: 'New York, NY',
    venueName: 'Cunningham Tennis',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing New York tennis programs',
    scheduleText: 'The stored homepage lists junior and adult programs, summer camp, private lessons, schools programs, pickup tennis, indoor and outdoor seasonal programming, and online court booking.',
    statusText: 'Review-only tennis club profile; program, rates, events, and location details require separate review.',
    description: CUNNINGHAM_DESCRIPTION,
    tags: ['Club', 'Tennis', 'Youth', 'Adult', 'New York'],
    warnings: [
      'The stored homepage does not provide a complete current dated event row, and the June 29, 2026 summer-session start is past by 2026-07-31, so no EVENT candidate is created.',
      'Program, rates, events, location, and rental detail pages are UNCHECKED; those rows are withheld.',
      'The stored first-party Cunningham Tennis logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
  {
    listingKind: 'RENTAL' as const,
    title: 'Cunningham Tennis Court Booking',
    officialActionUrl: CUNNINGHAM_RENTAL_URL,
    sourceUrl: CUNNINGHAM_HOME_URL,
    organizerName: 'Cunningham Tennis',
    sportName: 'Tennis',
    formatLabel: 'Online tennis court booking',
    city: 'New York, NY',
    venueName: 'Cunningham Tennis',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing online court booking',
    scheduleText: 'The stored homepage provides a Book Tennis Court Online link to the official CatchCorner facility booking page.',
    statusText: 'Review-only rental link-out; current court availability, pricing, and facility address require the unchecked booking/rates pages.',
    description: 'Cunningham Tennis provides an official online court-booking link for tennis court rentals.',
    tags: ['Rental', 'Tennis', 'Court', 'New York'],
    warnings: [
      'The official booking URL is outbound to CatchCorner from the allowed Cunningham Tennis homepage.',
      'The stored capture provides no public rental price, availability, hours, or exact street address.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CUNNINGHAM_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: CUNNINGHAM_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Cunningham Tennis' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: CUNNINGHAM_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: CUNNINGHAM_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Cunningham Tennis' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Tennis, Youth, Adult, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: CUNNINGHAM_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/cunninghamTennis.html');

export const CUNNINGHAM_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: CUNNINGHAM_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
