import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_PARKS_PICKLEBALL_URL = 'https://www.nycgovparks.org/facilities/pickleball';
export const NYC_PARKS_PROGRAM_URL = 'https://www.nycgovparks.org/events/keyword%20Pickleball';
export const NYC_PARKS_HOME_URL = 'https://www.nycgovparks.org/';

export const NYC_PARKS_PICKLEBALL_ORG_DESCRIPTION =
  'NYC Parks provides public pickleball courts across the five boroughs, including outdoor courts at parks and recreation-center pathways for learning the sport.';

export const NYC_PARKS_PICKLEBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '99e778e5-9edc-4831-a00d-045be59315f3',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-pickleball-courts-nycgovparks-org',
  intakeName: 'Pickleball Courts',
  baseUrl: NYC_PARKS_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '51e2e7c7-49b0-4072-b4aa-ad90db40e91e',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:14.468Z',
  pages: [
    { url: NYC_PARKS_PICKLEBALL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NYC_PARKS_PROGRAM_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycgovparks.org/facilities', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycgovparks.org/parks/crotona-park', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycgovparks.org/programs/recreation-centers/membership', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 4 },
    { kind: 'PAGE_BRANDING', count: 3 },
    { kind: 'PAGE_HTML', count: 3 },
    { kind: 'PAGE_IMAGES', count: 3 },
    { kind: 'PAGE_LINKS', count: 3 },
    { kind: 'PAGE_MARKDOWN', count: 3 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 3 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 3 },
    { kind: 'ROBOTS', count: 3 },
  ],
} as const;

export const NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'NYC Parks Pickleball Courts',
    officialActionUrl: NYC_PARKS_PICKLEBALL_URL,
    sourceUrl: NYC_PARKS_PICKLEBALL_URL,
    organizerName: 'NYC Parks',
    sportName: 'Pickleball',
    formatLabel: 'Public outdoor pickleball courts citywide',
    city: 'New York, NY',
    venueName: 'NYC Parks pickleball courts across the five boroughs',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing public court access; location-specific details vary by park',
    scheduleText: 'The stored allowed facility page lists pickleball courts in the Bronx, Brooklyn, Manhattan, Queens, and Staten Island, with court counts and park-level addresses or cross-streets for each listed location.',
    priceText: null,
    participantOptionsText: 'Outdoor public courts; the stored page directs players to recreation-center programs for instruction and does not state reservation, permit, or fee details.',
    statusText: 'Review-only public facility link-out; court access rules, reservations, permits, fees, and live availability require location-specific official pages.',
    description: NYC_PARKS_PICKLEBALL_ORG_DESCRIPTION,
    tags: ['Rental', 'Pickleball', 'NYC Parks', 'Outdoor', 'New York'],
    warnings: [
      'The stored allowed facility page supports a citywide pickleball-court summary and named locations but does not publish price, live availability, reservation rules, or a single canonical address.',
      'Park detail, facilities, program, event, and recreation-center membership pages are UNCHECKED and remain withheld.',
      'The stored cross-linked Jr. Knicks and Ocean Breeze beach-soccer pages are unrelated or past as of 2026-07-31 and are not emitted.',
      'Only favicon-level NYC Parks branding is stored for this intake; logo disposition is MANUAL_REVIEW pending a suitable official organization mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_PARKS_PICKLEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: NYC_PARKS_PICKLEBALL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Parks Pickleball Courts' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_PARKS_PICKLEBALL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_PARKS_PICKLEBALL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Parks' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Public outdoor pickleball courts citywide' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'NYC Parks pickleball courts across the five boroughs' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing public court access; location-specific details vary by park' },
    description: { selector: 'body', mode: 'literal', value: NYC_PARKS_PICKLEBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Pickleball, NYC Parks, Outdoor, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycParksPickleballCourts.html');

export const NYC_PARKS_PICKLEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NYC_PARKS_PICKLEBALL_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
