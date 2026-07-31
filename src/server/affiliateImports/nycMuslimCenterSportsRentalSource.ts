import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_MUSLIM_CENTER_SPORTS_URL = 'https://www.nycmc.net/sports';
export const NYC_MUSLIM_CENTER_HOME_URL = 'https://www.nycmc.net/';
export const NYC_MUSLIM_CENTER_EVENT_RENTAL_URL = 'https://www.nycmc.net/event-rental';
export const NYC_MUSLIM_CENTER_RENTAL_RULES_URL = 'https://www.nycmc.net/sports-rental-rule';
export const NYC_MUSLIM_CENTER_BOOKING_URL = 'https://www.catchcorner.com/facility-page/embedded/rental/nycmc';
export const NYC_MUSLIM_CENTER_ABOUT_URL = 'https://www.nycmc.net/about';
export const NYC_MUSLIM_CENTER_LOGO_SOURCE_URL = 'https://lirp.cdn-website.com/c98872b6/dms3rep/multi/opt/NYCMC_HD_logo%2B%281%29-1920w.png';
export const NYC_MUSLIM_CENTER_INSTAGRAM_URL = 'https://www.instagram.com/nycmuslimcenter_';
export const NYC_MUSLIM_CENTER_FACEBOOK_URL = 'https://www.facebook.com/nycmuslimcenter';
export const NYC_MUSLIM_CENTER_YOUTUBE_URL = 'https://www.youtube.com/NYCMuslimCenter';
export const NYC_MUSLIM_CENTER_ORG_DESCRIPTION =
  'NYC Muslim Center is a New York City Muslim community organization whose sports rental page offers an indoor NBA-sized court for community and sports bookings.';

export const NYC_MUSLIM_CENTER_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b3201f69-d3ba-4c57-84e5-2da6e0728ed5',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-sports-rental-nycmc-net',
  intakeName: 'Sports Rental',
  baseUrl: 'https://www.nycmc.net',
  complianceStatus: 'ALLOWED',
  runId: '5b88e181-0971-49b8-ba61-3556aef4dc58',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:38.293Z',
  pages: [
    { url: NYC_MUSLIM_CENTER_SPORTS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NYC_MUSLIM_CENTER_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_MUSLIM_CENTER_EVENT_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: NYC_MUSLIM_CENTER_RENTAL_RULES_URL, role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: NYC_MUSLIM_CENTER_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const NYC_MUSLIM_CENTER_OFFICIAL_URLS = [
  NYC_MUSLIM_CENTER_HOME_URL,
  NYC_MUSLIM_CENTER_SPORTS_URL,
  NYC_MUSLIM_CENTER_BOOKING_URL,
  NYC_MUSLIM_CENTER_EVENT_RENTAL_URL,
  NYC_MUSLIM_CENTER_RENTAL_RULES_URL,
  NYC_MUSLIM_CENTER_ABOUT_URL,
  NYC_MUSLIM_CENTER_INSTAGRAM_URL,
  NYC_MUSLIM_CENTER_FACEBOOK_URL,
  NYC_MUSLIM_CENTER_YOUTUBE_URL,
] as const;

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'NYC Muslim Center Sports Rental',
  officialActionUrl: NYC_MUSLIM_CENTER_BOOKING_URL,
  sourceUrl: NYC_MUSLIM_CENTER_SPORTS_URL,
  organizerName: 'NYC Muslim Center',
  sportName: 'Basketball',
  formatLabel: 'Indoor NBA-sized court rental with six adjustable basketball hoops',
  city: 'New York City, NY',
  venueName: 'NYC Muslim Center',
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing sports court booking; availability is handled through the official CatchCorner link',
  scheduleText: 'The stored allowed Sports Rental page promotes sports bookings on an NBA-sized court with six adjustable basketball hoops, on-site security, private bathrooms, air conditioning, athletic pads, soft nets, water fountains and refillable bottle stations, a ceiling sound system, and proximity to Masjid Eesa Ibn Maryam.',
  statusText: 'Review-only rental link-out; the stored evidence does not publish price, live availability, approved dates, or a canonical street address.',
  description: NYC_MUSLIM_CENTER_ORG_DESCRIPTION,
  tags: ['Rental', 'Basketball', 'Indoor Court', 'New York City'],
  logoUrl: NYC_MUSLIM_CENTER_LOGO_SOURCE_URL,
  logoSourceUrl: NYC_MUSLIM_CENTER_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed sports page describes New York City and an NBA-sized court but does not publish a canonical street address; address remains unset.',
    'Price, live availability, exact rental dates, and rental rules are not imported from the stored evidence; booking is preserved as an official CatchCorner outbound URL.',
    'Home, event-rental, classroom, about, and other pages are UNCHECKED; no additional EVENT or RENTAL candidate is created.',
    'The stored first-party NYC Muslim Center logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const NYC_MUSLIM_CENTER_MANUAL_CANDIDATES = [rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_MUSLIM_CENTER_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: NYC_MUSLIM_CENTER_SPORTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Muslim Center Sports Rental' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_MUSLIM_CENTER_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_MUSLIM_CENTER_SPORTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Muslim Center' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor NBA-sized court rental with six adjustable basketball hoops' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'NYC Muslim Center' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing sports court booking; availability is handled through the official CatchCorner link' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored allowed Sports Rental page promotes sports bookings on an NBA-sized court with six adjustable basketball hoops, on-site security, private bathrooms, air conditioning, athletic pads, soft nets, water fountains and refillable bottle stations, a ceiling sound system, and proximity to Masjid Eesa Ibn Maryam.' },
    statusText: { selector: 'body', mode: 'literal', value: 'Review-only rental link-out; the stored evidence does not publish price, live availability, approved dates, or a canonical street address.' },
    description: { selector: 'body', mode: 'literal', value: NYC_MUSLIM_CENTER_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Basketball, Indoor Court, New York City' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NYC_MUSLIM_CENTER_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycMuslimCenterSports.html');

export const NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NYC_MUSLIM_CENTER_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
