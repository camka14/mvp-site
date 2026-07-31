import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const POWERZONE_COURT_RENTAL_URL = 'https://www.powerzonevb.com/site/node/118';
export const POWERZONE_HOME_URL = 'https://www.powerzonevb.com/site';
export const POWERZONE_VOLLEYBALL_BOOKING_URL = 'https://www.powerzonevb.com/site/node/185';
export const POWERZONE_PICKLEBALL_RENTAL_URL = 'https://www.powerzonevb.com/site/pickleball-rentals';
export const POWERZONE_LOGO_SOURCE_URL = 'https://www.powerzonevb.com/site/sites/default/files/pwa/images/launcher-icon-180.png';
export const POWERZONE_ORG_DESCRIPTION =
  'PowerZone Volleyball is a volleyball facility with six indoor volleyball courts and a 30,000-square-foot Olympic Taraflex floor, offering court rentals for teams and groups, limited-schedule pickleball rentals, and special-event hosting.';

export const POWERZONE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7cc44b91-c160-40f9-b939-cc3cfb00a406',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-court-rental-powerzonevb-com',
  intakeName: 'Court Rental',
  baseUrl: 'https://www.powerzonevb.com',
  complianceStatus: 'ALLOWED',
  runId: '413e1a7b-678f-4a2b-bcd9-a4f8669c6832',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:26:13.339Z',
  pages: [
    { url: POWERZONE_COURT_RENTAL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: POWERZONE_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: POWERZONE_VOLLEYBALL_BOOKING_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: POWERZONE_PICKLEBALL_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.powerzonevb.com/site/gym-rules', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 1 },
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

export const POWERZONE_OFFICIAL_URLS = [
  POWERZONE_COURT_RENTAL_URL,
  POWERZONE_HOME_URL,
  POWERZONE_VOLLEYBALL_BOOKING_URL,
  POWERZONE_PICKLEBALL_RENTAL_URL,
  'https://www.powerzonevb.com/site/node/104',
  'https://www.facebook.com/powerzonevb/',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'PowerZone Volleyball',
  officialActionUrl: POWERZONE_HOME_URL,
  sourceUrl: POWERZONE_COURT_RENTAL_URL,
  organizerName: 'PowerZone Volleyball Inc.',
  sportName: 'Volleyball',
  formatLabel: 'Indoor volleyball facility with six courts, Olympic Taraflex floor, rentals, and special events',
  city: 'Long Island, NY',
  venueName: 'PowerZone Volleyball',
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing PowerZone Volleyball facility and rental program',
  scheduleText: 'The stored ALLOWED Court Rental page says PowerZone Volleyball has six indoor volleyball courts, a 30,000-square-foot Olympic Taraflex floor, and court rentals for teams and groups, plus special-event hosting.',
  statusText: 'Review-only volleyball facility profile; current booking availability and location details require the official linked pages.',
  description: POWERZONE_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Indoor Facility', 'Court Rental', 'Long Island'],
  logoUrl: POWERZONE_LOGO_SOURCE_URL,
  logoSourceUrl: POWERZONE_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED Court Rental page identifies PowerZone Volleyball, six indoor courts, and a 30,000-square-foot Taraflex floor, but it does not publish a canonical street address.',
    'The homepage, booking, pickleball, tournament, rules, and other detail pages are UNCHECKED; no additional inventory, dates, or prices are inferred.',
    'Only a favicon-level PowerZone branding candidate is stored; no suitable organization logo is assigned and logo disposition is MANUAL_REVIEW.',
  ],
};

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'PowerZone Volleyball Court Rental',
  officialActionUrl: POWERZONE_VOLLEYBALL_BOOKING_URL,
  sourceUrl: POWERZONE_COURT_RENTAL_URL,
  organizerName: 'PowerZone Volleyball Inc.',
  sportName: 'Volleyball',
  formatLabel: 'Indoor volleyball court rental for teams and groups',
  city: 'Long Island, NY',
  venueName: 'PowerZone Volleyball',
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing volleyball court rental path',
  scheduleText: 'The stored page says teams and groups can rent volleyball courts and links to the official Book Rental page. Current availability, booking windows, and reservation dates are not stored.',
  statusText: 'Review-only volleyball rental link-out; current availability, pricing, and reservation details require the official outbound flow.',
  description: 'PowerZone Volleyball offers indoor volleyball court rentals for teams and groups on its six-court Taraflex floor.',
  tags: ['Rental', 'Volleyball', 'Indoor Courts', 'Long Island'],
  logoUrl: POWERZONE_LOGO_SOURCE_URL,
  logoSourceUrl: POWERZONE_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED page supports volleyball court rentals and the official booking path.',
    'The booking page is UNCHECKED; no current availability, price, reservation date, or package is inferred.',
  ],
};

export const POWERZONE_MANUAL_CANDIDATES = [clubCandidate, rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const POWERZONE_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: POWERZONE_COURT_RENTAL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'PowerZone Volleyball Court Rental' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: POWERZONE_VOLLEYBALL_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: POWERZONE_COURT_RENTAL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'PowerZone Volleyball Inc.' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    city: { selector: 'body', mode: 'literal', value: 'Long Island, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Volleyball, Indoor Courts, Long Island' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: POWERZONE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/powerzoneVolleyballCourtRental.html');

export const POWERZONE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: POWERZONE_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
