import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL = 'https://www.columbiasummertenniscamp.com/';
export const COLUMBIA_SUMMER_TENNIS_CAMP_REGISTRATION_URL = 'https://blumecustomer.com/cmportal/columbia/login';
export const COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/5e23f5_3a08526eadce4514958a77391643883e%7Emv2.jpg/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/5e23f5_3a08526eadce4514958a77391643883e%7Emv2.jpg';
export const COLUMBIA_SUMMER_TENNIS_CAMP_ORG_DESCRIPTION =
  'Columbia Summer Tennis Camp operates at the Milstein Family Tennis Center in New York, offering serious-environment tennis instruction, technique and movement training, strength and conditioning, speed and agility work, drills, individual instruction, and match play for ages 6-17.';

export const COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '6f37b1e5-34e4-4583-a807-80badcd4e11f',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-columbia-summer-tennis-camp-home-columbiasummertenniscamp-com',
  intakeName: 'Columbia Summer Tennis Camp Home',
  baseUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '4d3281db-e6ff-4ad5-b674-2e45e153abac',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:29.439Z',
  pages: [
    { url: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.columbiasummertenniscamp.com/category/all-products', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-1', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-10', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-11', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-3', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-4', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-5', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-6', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-7', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-8', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.columbiasummertenniscamp.com/product-page/i-m-a-product-9', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 1 },
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

export const COLUMBIA_SUMMER_TENNIS_CAMP_OFFICIAL_URLS = [
  COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  COLUMBIA_SUMMER_TENNIS_CAMP_REGISTRATION_URL,
  'https://docs.google.com/forms/d/e/1FAIpQLSf3AxRn7685YqoP-ezgaLakbgoMigN3S7duHpd3WtdyG-8jA/viewform?usp=header',
  'https://www.instagram.com/milsteinfamilytenniscenter/',
] as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Columbia Summer Tennis Camp',
  officialActionUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  sourceUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  organizerName: 'Columbia Summer Tennis Camp',
  sportName: 'Tennis',
  formatLabel: 'Summer tennis camp, tennis instruction, conditioning, drills, and match play',
  city: 'New York, NY',
  venueName: 'Milstein Family Tennis Center',
  address: '603 W 218th Street, New York, NY 10034',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026 Columbia Summer Tennis Camp, June 15-August 14',
  scheduleText: 'The stored homepage describes the camp as operating Monday-Friday from June 15 through August 14, with July 3 off, daily and weekly options, instruction for ages 6-17, free catered lunches, and rain-or-shine operation.',
  statusText: 'Review-only tennis camp profile; current registration products and daily schedules require the official linked pages.',
  description: COLUMBIA_SUMMER_TENNIS_CAMP_ORG_DESCRIPTION,
  tags: ['Club', 'Tennis', 'Camp', 'Youth', 'New York'],
  logoUrl: COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  logoSourceUrl: COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage identifies the Milstein Family Tennis Center and the exact New York address.',
    'Product pages and detailed daily schedule are UNCHECKED; no product-specific inventory is inferred.',
    'Only favicon-level Columbia Summer Tennis Camp branding is stored; no suitable organization logo is assigned and logo disposition is MANUAL_REVIEW.',
  ],
};

const eventCandidate = {
  listingKind: 'EVENT' as const,
  title: '2026 Columbia Summer Tennis Camp',
  officialActionUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  sourceUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  organizerName: 'Columbia Summer Tennis Camp',
  sportName: 'Tennis',
  formatLabel: 'Summer tennis camp with technical training, conditioning, drills, instruction, and match play',
  city: 'New York, NY',
  venueName: 'Milstein Family Tennis Center',
  address: '603 W 218th Street, New York, NY 10034',
  startsAt: '2026-06-15T00:00:00-04:00',
  endsAt: '2026-08-14T00:00:00-04:00',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'June 15-August 14, 2026',
  scheduleText: 'Monday-Friday, June 15-August 14, 2026, with July 3 off. The stored page says daily and weekly registration options are available and does not publish daily camp hours.',
  ageGroup: 'Ages 6-17',
  priceText: '$250 per day; $1,000 for the full week',
  statusText: 'Ongoing at review; the stored homepage says camp registration is open and directs families to the official registration flow.',
  description: 'The 2026 Columbia Summer Tennis Camp at the Milstein Family Tennis Center provides tennis instruction and match play for ages 6-17 from June 15 through August 14, 2026.',
  tags: ['Event', 'Tennis', 'Camp', 'Youth', 'New York'],
  logoUrl: COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  logoSourceUrl: COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage publishes the camp date range, address, ages, and daily/weekly prices but no daily camp hours; no time is inferred.',
    'The registration form, Blume registration flow, product pages, and daily schedule are UNCHECKED and remain outbound-only.',
  ],
};

export const COLUMBIA_SUMMER_TENNIS_CAMP_MANUAL_CANDIDATES = [organizationCandidate, eventCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: '2026 Columbia Summer Tennis Camp' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Columbia Summer Tennis Camp' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Tennis, Camp, Youth, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: COLUMBIA_SUMMER_TENNIS_CAMP_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/columbiaSummerTennisCamp.html');

export const COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
