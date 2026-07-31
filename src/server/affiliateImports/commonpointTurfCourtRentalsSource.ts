import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const COMMONPOINT_TURF_COURT_RENTALS_URL = 'https://www.commonpoint.org/turf-field-in-queens-new-york';
export const COMMONPOINT_HOME_URL = 'https://www.commonpoint.org/';
export const COMMONPOINT_COURT_LOGIN_URL = 'https://blumecustomer.com/cmportal/commonpointqueens/login';
export const COMMONPOINT_TURF_BOOKING_URL = 'https://www.catchcorner.com/organization-page/embedded/rental/commonpoint-queens---alley-pond/Soccer';
export const COMMONPOINT_LOGO_SOURCE_URL = 'https://www.commonpoint.org/wp-content/uploads/2024/07/Commonpoint_LogoTagline_RGB.png';
export const COMMONPOINT_ORG_DESCRIPTION =
  'Commonpoint Tennis and Athletic Center operates indoor tennis and pickleball courts and a 60×40 climate-controlled turf field in Alley Pond Park, with court and field rentals plus tennis, pickleball, soccer, flag football, lacrosse, and baseball use cases.';

export const COMMONPOINT_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'cd74b2f7-cec2-4aff-b26e-de2d249904fd',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-turf-and-court-rentals-commonpoint-org',
  intakeName: 'Turf and Court Rentals',
  baseUrl: 'https://www.commonpoint.org',
  complianceStatus: 'ALLOWED',
  runId: 'a98d6e90-498b-4b63-ab8f-e1edf473e9ef',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:38.474Z',
  pages: [
    { url: COMMONPOINT_TURF_COURT_RENTALS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: COMMONPOINT_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.commonpoint.org/facility-rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: COMMONPOINT_COURT_LOGIN_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: COMMONPOINT_TURF_BOOKING_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const COMMONPOINT_OFFICIAL_URLS = [
  COMMONPOINT_TURF_COURT_RENTALS_URL,
  COMMONPOINT_HOME_URL,
  COMMONPOINT_COURT_LOGIN_URL,
  COMMONPOINT_TURF_BOOKING_URL,
  'https://www.commonpoint.org/program/tennis-athletic-center',
  'https://www.commonpoint.org/program/adult-pickleball',
  'https://www.instagram.com/commonpointny',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Commonpoint Tennis and Athletic Center',
  officialActionUrl: COMMONPOINT_TURF_COURT_RENTALS_URL,
  sourceUrl: COMMONPOINT_TURF_COURT_RENTALS_URL,
  organizerName: 'Commonpoint Queens',
  sportName: 'Tennis, Pickleball, and Multi-sport Facility',
  formatLabel: 'Indoor tennis and pickleball courts plus a 60×40 climate-controlled turf field',
  city: 'Queens Village, NY',
  venueName: 'Commonpoint Tennis and Athletic Center at Alley Pond Park',
  address: '79-20 Winchester Boulevard, Queens Village, NY 11427',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing tennis, pickleball, and turf facility',
  scheduleText: 'The stored ALLOWED page says the facility is now booking tennis court and turf field rentals, with indoor tennis and pickleball courts and a 60×40 climate-controlled turf field in Alley Pond Park.',
  statusText: 'Review-only facility profile; booking availability and account-specific reservations remain in the official outbound flows.',
  description: COMMONPOINT_ORG_DESCRIPTION,
  tags: ['Club', 'Tennis', 'Pickleball', 'Soccer', 'Facility', 'Queens Village'],
  logoUrl: COMMONPOINT_LOGO_SOURCE_URL,
  logoSourceUrl: COMMONPOINT_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED rental page publishes the facility name, address, indoor courts, and 60×40 turf field.',
    'The site homepage, facility-rentals page, program detail pages, and booking/account flows are UNCHECKED; no additional program or availability rows are inferred.',
    'The stored first-party Commonpoint logo was normalized locally to an opaque 1024px square PNG on white.',
  ],
};

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'Commonpoint Turf and Court Rentals',
  officialActionUrl: COMMONPOINT_TURF_BOOKING_URL,
  sourceUrl: COMMONPOINT_TURF_COURT_RENTALS_URL,
  organizerName: 'Commonpoint Queens',
  sportName: 'Tennis, Pickleball, Soccer, Flag Football, Lacrosse, and Baseball',
  formatLabel: 'Indoor tennis and pickleball court rentals plus half and full climate-controlled turf field rentals',
  city: 'Queens Village, NY',
  venueName: 'Commonpoint Tennis and Athletic Center at Alley Pond Park',
  address: '79-20 Winchester Boulevard, Queens Village, NY 11427',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing facility rental booking',
  scheduleText: 'The stored page lists prime-time and off-peak windows for tennis, pickleball, and turf rentals. Court reservations may be made up to 2 days in advance; the page does not publish a date-specific availability calendar.',
  priceText: 'Tennis indoor courts: $38-$67/hr plus walk-in and senior rates; pickleball indoor courts: $31-$41/hr and outdoor season $35/hr; turf half field: $150-$280/hr; turf full field: $240-$530/hr, with contract discounts as listed on the stored page.',
  statusText: 'Review-only rental link-out; current availability and account-specific booking details require the official CatchCorner or court-login flow.',
  description: 'Commonpoint offers tennis and pickleball court rentals and half or full 60×40 turf field rentals for soccer, flag football, lacrosse, baseball, and other field uses at Alley Pond Park.',
  tags: ['Rental', 'Tennis', 'Pickleball', 'Soccer', 'Turf Field', 'Queens Village'],
  logoUrl: COMMONPOINT_LOGO_SOURCE_URL,
  logoSourceUrl: COMMONPOINT_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED page publishes the rental categories, booking links, time windows, and exact rates above.',
    'The official CatchCorner and court-login pages are UNCHECKED; no live availability, reservation date, or additional package is inferred.',
  ],
};

export const COMMONPOINT_MANUAL_CANDIDATES = [clubCandidate, rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const COMMONPOINT_TURF_COURT_RENTALS_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: COMMONPOINT_TURF_COURT_RENTALS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Commonpoint Turf and Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: COMMONPOINT_TURF_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: COMMONPOINT_TURF_COURT_RENTALS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Commonpoint Queens' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis, Pickleball, Soccer, Flag Football, Lacrosse, and Baseball' },
    city: { selector: 'body', mode: 'literal', value: 'Queens Village, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Tennis, Pickleball, Soccer, Turf Field, Queens Village' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: COMMONPOINT_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/commonpointTurfCourtRentals.html');

export const COMMONPOINT_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: COMMONPOINT_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
