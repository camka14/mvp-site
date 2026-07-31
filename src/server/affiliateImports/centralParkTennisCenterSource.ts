import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CENTRAL_PARK_TENNIS_HOME_URL = 'https://www.centralparktenniscenter.com/';
export const CENTRAL_PARK_TENNIS_CLASSES_URL = 'https://www.centralparktenniscenter.com/collections/all';
export const CENTRAL_PARK_TENNIS_ADULTS_URL = 'https://www.centralparktenniscenter.com/collections/adults';
export const CENTRAL_PARK_TENNIS_JUNIORS_URL = 'https://www.centralparktenniscenter.com/collections/junior-programs';
export const CENTRAL_PARK_TENNIS_SUMMER_CAMP_URL = 'https://www.centralparktenniscenter.com/collections/summer-camp';
export const CENTRAL_PARK_TENNIS_PAYG_URL = 'https://www.centralparktenniscenter.com/collections/pay-as-you-play';
export const CENTRAL_PARK_TENNIS_LOGO_SOURCE_URL = 'https://www.centralparktenniscenter.com/cdn/shop/files/Group_1_1.png?v=1746201252&width=500';
export const CENTRAL_PARK_TENNIS_ORG_DESCRIPTION =
  'Central Park Tennis Center offers adult and junior tennis classes, clinics, afterschool and weekend programs, summer camps, pay-as-you-play clinics, and tennis-facility amenities in New York City.';

export const CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '288e2aad-b581-495b-9ce3-d99bce6c3c0d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-central-park-tennis-center-ny-tennis-at-central-park-centralpark',
  intakeName: 'Central Park Tennis Center NY Tennis at Central Park',
  baseUrl: 'https://www.centralparktenniscenter.com',
  complianceStatus: 'ALLOWED',
  runId: '8de41860-2003-4542-8e4d-3ad61b6b9010',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:23.866Z',
  pages: [
    { url: CENTRAL_PARK_TENNIS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.centralparktenniscenter.com/pages/future-class-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/summer-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/corporate-events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/rates', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/facilities', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/tennis-instruction', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/permits', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/customer_authentication/redirect?locale=en&region_country=US', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.centralparktenniscenter.com/pages/privacy-policy', role: 'POLICY', robotsStatus: 'UNCHECKED' },
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

export const CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Central Park Tennis Center',
    officialActionUrl: CENTRAL_PARK_TENNIS_CLASSES_URL,
    sourceUrl: CENTRAL_PARK_TENNIS_HOME_URL,
    organizerName: 'Central Park Tennis Center',
    sportName: 'Tennis',
    formatLabel: 'Adult and junior tennis classes, clinics, camps, and programs',
    city: 'New York City, NY',
    venueName: 'Central Park Tennis Center',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Adult and junior tennis programming',
    scheduleText: 'The stored homepage describes Adult Mid-Summer 2026 six-week packages, junior clinics and afterschool programs for ages 3-16, Junior Summer Camp 2026 for ages 3-16, and pay-as-you-play one-hour group clinics with morning, afternoon, and evening slots.',
    statusText: 'Review-only tennis center profile; current class and booking detail pages remain unchecked and the captured 2026 start dates are past as of 2026-07-31.',
    description: CENTRAL_PARK_TENNIS_ORG_DESCRIPTION,
    tags: ['Club', 'Tennis', 'Classes', 'Clinics', 'Camps', 'New York City'],
    logoUrl: CENTRAL_PARK_TENNIS_LOGO_SOURCE_URL,
    logoSourceUrl: CENTRAL_PARK_TENNIS_LOGO_SOURCE_URL,
    warnings: [
      'The allowed homepage identifies New York City programming and Central Park Tennis Center but does not publish a canonical street address, so no address is assigned.',
      'The listed Adult Mid-Summer 2026 start (July 20) and Junior Summer Camp 2026 start (June 8) were past as of 2026-07-31; no stale EVENT candidate is emitted.',
      'Future class schedule, rates, facilities, instruction, permits, authentication, and summer-camp detail pages are UNCHECKED; no current EVENT or RENTAL candidate is inferred.',
      'Seasonal locker rentals are not treated as facility rentals; the source does not provide a captured facility-rental row.',
      'The stored first-party NY Tennis at Central Park logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CENTRAL_PARK_TENNIS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: CENTRAL_PARK_TENNIS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Central Park Tennis Center' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: CENTRAL_PARK_TENNIS_CLASSES_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: CENTRAL_PARK_TENNIS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Central Park Tennis Center' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult and junior tennis classes, clinics, camps, and programs' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Central Park Tennis Center' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Adult and junior tennis programming' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Tennis, Classes, Clinics, Camps, New York City' },
    description: { selector: 'body', mode: 'literal', value: CENTRAL_PARK_TENNIS_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/centralParkTennisCenter.html');

export const CENTRAL_PARK_TENNIS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
