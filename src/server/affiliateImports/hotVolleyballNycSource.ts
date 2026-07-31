import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const HOT_VOLLEYBALL_NYC_HOME_URL = 'https://www.hotvolleyballnyc.com/';
export const HOT_VOLLEYBALL_NYC_PROGRAMS_URL = 'https://www.hotvolleyballnyc.com/new-york-programs';
export const HOT_VOLLEYBALL_NYC_SUMMER_CAMPS_URL = 'https://www.hotvolleyballnyc.com/summer-camps';
export const HOT_VOLLEYBALL_NYC_TRYOUTS_URL = 'https://www.hotvolleyballnyc.com/club-tryouts';
export const HOT_VOLLEYBALL_NYC_SUMMER_REGISTRATION_URL = 'https://hotvolleyballnyc.playbookapi.com/programs/register/summer_camps_2026/';
export const HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL = 'https://www.hotvolleyballnyc.com/s/img/wp-content/uploads/2022/04/HVLogo-Final.png';

export const HOT_VOLLEYBALL_NYC_ORG_DESCRIPTION =
  'HOT Volleyball offers volleyball classes, skills development, camps, clinics, and club training for youth and adults, with programs in New York City, New Jersey, and Westchester.';

export const HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '0c6f4a9c-361b-4c21-908d-0ed7f5cd804b',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-high-octane-training-volleyball-nyc-hotvolleyballnyc-com',
  intakeName: 'High Octane Training Volleyball NYC',
  baseUrl: 'https://www.hotvolleyballnyc.com',
  complianceStatus: 'ALLOWED',
  runId: 'ea19cf81-24ac-464a-8979-55e7bcd74ddc',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:47:18.361Z',
  pages: [
    { url: HOT_VOLLEYBALL_NYC_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: HOT_VOLLEYBALL_NYC_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: HOT_VOLLEYBALL_NYC_SUMMER_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: HOT_VOLLEYBALL_NYC_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.hotvolleyballnyc.com/locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.hotvolleyballnyc.com/about-us-new', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.hotvolleyballnyc.com/contact-us-new', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.hotvolleyballnyc.com/the-league-hot-volleyball-nyc', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.hotvolleyballnyc.com/adult-skills-play', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
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

export const HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'High Octane Training Volleyball NYC',
    officialActionUrl: HOT_VOLLEYBALL_NYC_HOME_URL,
    sourceUrl: HOT_VOLLEYBALL_NYC_HOME_URL,
    organizerName: 'HOT Volleyball',
    sportName: 'Volleyball',
    formatLabel: 'Volleyball classes, skills development, camps, clinics, and club training for youth and adults',
    city: 'New York City',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing HOT Volleyball programs',
    scheduleText: 'The stored official homepage describes HOT Volleyball classes and NYC programs for youth and adults, plus camps, clinics, club tryouts, and skill development. Current dated program rows are withheld because linked detail pages were not captured.',
    statusText: 'Review-only club profile; current program, camp, tryout, location, and registration details require captured detail pages.',
    description: HOT_VOLLEYBALL_NYC_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'Adults', 'Training', 'New York City'],
    logoUrl: HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
    logoSourceUrl: HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage links to current Summer Camps 2026 registration, NYC programs, locations, and club tryouts, but those detail pages are UNCHECKED and no complete current event row is emitted.',
      'No street address or specific facility is assigned because the captured homepage does not establish a canonical NYC venue address.',
      'No EVENT candidate is created because the stored homepage does not provide a complete current date, time, venue, price, and registration row.',
      'No TEAM candidate is created because team mappings are out of scope.',
      'The stored first-party HOT Volleyball logo candidate was normalized to an opaque 1024px PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const HOT_VOLLEYBALL_NYC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: HOT_VOLLEYBALL_NYC_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'High Octane Training Volleyball NYC' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOT_VOLLEYBALL_NYC_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: HOT_VOLLEYBALL_NYC_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'HOT Volleyball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Volleyball classes, skills development, camps, clinics, and club training for youth and adults' },
    city: { selector: 'body', mode: 'literal', value: 'New York City' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing HOT Volleyball programs' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official homepage describes HOT Volleyball classes and NYC programs for youth and adults, plus camps, clinics, club tryouts, and skill development; current dated program rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: HOT_VOLLEYBALL_NYC_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Adults, Training, New York City' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: HOT_VOLLEYBALL_NYC_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/hotVolleyballNyc.html');

export const HOT_VOLLEYBALL_NYC_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
