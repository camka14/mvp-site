import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const MANHATTAN_YOUTH_VOLLEYBALL_URL = 'https://www.manhattanyouth.org/sports/volleyball';
export const MANHATTAN_YOUTH_PIER25_URL = 'https://www.manhattanyouth.org/pier-25';
export const MANHATTAN_YOUTH_VOLLEYBALL_BOOKING_URL = 'https://playtomic.io/pier-25-volleyball-manhattan-youth-rec/d6531ecc-55f1-44ca-b374-0443b9ed1cc2?q=BEACH_VOLLEY~2024-04-15~~';
export const MANHATTAN_YOUTH_LOGO_SOURCE_URL = 'https://www.manhattanyouth.org/sites/manhattanyouth/themes/manhattanyouth/img/logo-white.png';

export const MANHATTAN_YOUTH_ORG_DESCRIPTION =
  'Manhattan Youth offers Pier 25 beach volleyball court rentals in Manhattan, with online booking, daily rental hours, and space for groups of up to 12.';

export const MANHATTAN_YOUTH_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '08f131dc-6fd8-4bc3-a60f-264761d6b7ca',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-volleyball-manhattanyouth-org',
  intakeName: 'Volleyball',
  baseUrl: 'https://www.manhattanyouth.org',
  complianceStatus: 'ALLOWED',
  runId: '0d69f2c4-9dd6-4847-a313-1ee97cef4432',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:04:40.188Z',
  pages: [
    { url: MANHATTAN_YOUTH_VOLLEYBALL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: MANHATTAN_YOUTH_PIER25_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.manhattanyouth.org/pier-25/friday-night-youth-volleyball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.manhattanyouth.org/camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: MANHATTAN_YOUTH_VOLLEYBALL_BOOKING_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 4 },
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

export const MANHATTAN_YOUTH_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'Manhattan Youth Pier 25 Beach Volleyball Court Rentals',
    officialActionUrl: MANHATTAN_YOUTH_VOLLEYBALL_BOOKING_URL,
    sourceUrl: MANHATTAN_YOUTH_VOLLEYBALL_URL,
    organizerName: 'Manhattan Youth',
    sportName: 'Volleyball',
    formatLabel: 'Beach volleyball court rental',
    city: 'New York, NY',
    venueName: 'Pier 25',
    address: null,
    timeZone: 'America/New_York',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Court rentals daily, 10:00 AM–9:00 PM',
    scheduleText: 'The stored allowed volleyball page lists Pier 25 beach-volleyball court rentals every day from 10:00 AM to 9:00 PM, with reservations accepted up to seven days in advance.',
    priceText: '$100 per hour',
    participantOptionsText: 'Up to 12 people per court; one court per group.',
    statusText: 'Review-only rental link-out; live availability and checkout are handled through the official Playtomic booking flow.',
    description: MANHATTAN_YOUTH_ORG_DESCRIPTION,
    tags: ['Rental', 'Volleyball', 'Beach', 'Pier 25', 'Manhattan'],
    logoUrl: MANHATTAN_YOUTH_LOGO_SOURCE_URL,
    logoSourceUrl: MANHATTAN_YOUTH_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed listing supports the rental price, daily hours, advance-booking window, and group limit, but not a canonical street address or live availability.',
      'The stored Pier 25 detail, Friday youth-volleyball, camps, and Playtomic booking pages are UNCHECKED and remain outbound-only.',
      'The stored April 25-July 25, 2026 community-volleyball date range is past as of 2026-07-31 and is not emitted as a current EVENT candidate.',
      'The stored first-party Manhattan Youth white logo was flattened onto a dark opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const MANHATTAN_YOUTH_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: MANHATTAN_YOUTH_VOLLEYBALL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Manhattan Youth Pier 25 Beach Volleyball Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: MANHATTAN_YOUTH_VOLLEYBALL_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: MANHATTAN_YOUTH_VOLLEYBALL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Manhattan Youth' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Beach volleyball court rental' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Pier 25' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Court rentals daily, 10:00 AM–9:00 PM' },
    priceText: { selector: 'body', mode: 'literal', value: '$100 per hour' },
    participantOptionsText: { selector: 'body', mode: 'literal', value: 'Up to 12 people per court; one court per group.' },
    description: { selector: 'body', mode: 'literal', value: MANHATTAN_YOUTH_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Volleyball, Beach, Pier 25, Manhattan' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: MANHATTAN_YOUTH_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/manhattanYouthVolleyballRental.html');

export const MANHATTAN_YOUTH_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: MANHATTAN_YOUTH_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
