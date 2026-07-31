import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const APTC_HOME_URL = 'https://www.aptcnyc.com/';
export const APTC_PICKLEBALL_RENTALS_URL = 'https://www.aptcnyc.com/pickleball-court-rentals';
export const APTC_WAIVER_URL = 'https://form.jotform.com/231957146485163';
export const APTC_LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/6491d13920223a1b55a9692c/4a2e437a-20af-48c6-8506-5b6e6483f762/logo.png?format=1500w';
export const APTC_ORG_DESCRIPTION = 'APTC at Queens College offers indoor and outdoor pickleball court rentals with published summer 2026 hourly rates, a reservation phone number, a waiver requirement, and a six-person-per-court limit.';

export const APTC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '2f6dba46-0a81-46cb-ab9b-1cb7f36d2d33',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-pickleball-court-rentals-aptcnyc-com',
  intakeName: 'Pickleball Court Rentals',
  baseUrl: 'https://www.aptcnyc.com',
  complianceStatus: 'ALLOWED',
  runId: 'e6b41f48-309c-4483-96c0-2aac422858b6',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:31:57.202Z',
  pages: [
    { url: APTC_PICKLEBALL_RENTALS_URL, role: 'RENTAL', robotsStatus: 'ALLOWED' },
    { url: APTC_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.aptcnyc.com/queens-college', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.aptcnyc.com/tennis-court-rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.aptcnyc.com/court-rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const APTC_RENTAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'APTC at Queens College Pickleball Court Rentals',
    officialActionUrl: APTC_PICKLEBALL_RENTALS_URL,
    sourceUrl: APTC_PICKLEBALL_RENTALS_URL,
    organizerName: 'APTC at Queens College',
    sportName: 'Pickleball',
    formatLabel: 'Indoor and outdoor hourly pickleball court rental',
    city: null,
    venueName: 'APTC at Queens College',
    address: null,
    timeZone: 'America/New_York',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Summer rates effective June 1, 2026 – August 15, 2026',
    scheduleText: 'Monday-Friday non-prime time is 8:00 AM-4:00 PM and prime time is 4:00 PM-10:00 PM. Saturday-Sunday prime time is 8:00 AM-5:00 PM.',
    participantOptionsText: `Reservations are by phone at (718) 264-2600. New players must complete the waiver form: ${APTC_WAIVER_URL}. A maximum of six people, including spectators and players, is allowed per court.`,
    priceText: 'Summer 2026 indoor: $30/hour Monday-Friday non-prime, $50/hour Monday-Friday prime, and $50/hour Saturday-Sunday prime. Summer 2026 outdoor: $40/hour Monday-Friday and $40/hour Saturday-Sunday.',
    statusText: 'Published summer 2026 rates are effective June 1-August 15, 2026; court times can be reserved a maximum of one week in advance.',
    description: APTC_ORG_DESCRIPTION,
    tags: ['Rental', 'Pickleball', 'Indoor', 'Outdoor', 'Hourly'],
    warnings: [
      'The stored rental page does not publish a street address or city; those fields remain unset.',
      'The stored September 2025-May 2026 rate table is retained only in source provenance, not presented as current pricing on this summer package.',
      'Live availability and reservation are handled by the official phone number; the Jotform waiver is an outbound supporting URL.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const APTC_PICKLEBALL_RENTALS_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: APTC_PICKLEBALL_RENTALS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'APTC at Queens College Pickleball Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: APTC_PICKLEBALL_RENTALS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: APTC_PICKLEBALL_RENTALS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'APTC at Queens College' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Pickleball, Indoor, Outdoor, Hourly' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: APTC_RENTAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/aptcnycPickleballRentals.html');

export const APTC_PICKLEBALL_RENTALS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: APTC_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
