import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL = 'https://www.zerogravitybasketball.com/site/register?region=New+York';
export const ZERO_GRAVITY_NEW_YORK_HOME_URL = 'https://www.zerogravitybasketball.com/';
export const ZERO_GRAVITY_NEW_YORK_LOGO_SOURCE_URL = 'https://resized-images.azureedge.net/uploads/161/BBALL_ZG_1024px.png?h=50';
export const ZERO_GRAVITY_NEW_YORK_ORG_DESCRIPTION = 'Zero Gravity Basketball provides the official New York tournament-listing and registration entry point captured in the stored intake; current tournament details require the official registration flow.';

export const ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ab0c048a-5bd6-47e5-ad1a-c9739090fb26',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-zerogravitybasketball-com',
  intakeName: 'New York',
  baseUrl: 'https://www.zerogravitybasketball.com',
  complianceStatus: 'ALLOWED',
  runId: 'e51aebfb-323a-4ca1-aeac-7231470cadb7',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:28:04.113Z',
  pages: [
    { url: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: ZERO_GRAVITY_NEW_YORK_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/page/events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/page/new-york', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/page/about', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/page/exposure', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/site?ID=11429', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zerogravitybasketball.com/site?ID=6376', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const ZERO_GRAVITY_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Zero Gravity Basketball New York',
    officialActionUrl: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL,
    sourceUrl: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL,
    organizerName: 'Zero Gravity Basketball',
    sportName: 'Basketball',
    formatLabel: 'Basketball tournament listing and registration',
    city: null,
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'New York basketball tournament registration',
    scheduleText: 'The stored New York page identifies Zero Gravity tournament listings and links the official New York registration flow, but it does not capture complete current tournament rows.',
    statusText: 'Review-only club profile; current tournament dates, venues, prices, and registration details require the official Zero Gravity flow.',
    description: ZERO_GRAVITY_NEW_YORK_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Tournament'],
    logoUrl: ZERO_GRAVITY_NEW_YORK_LOGO_SOURCE_URL,
    logoSourceUrl: ZERO_GRAVITY_NEW_YORK_LOGO_SOURCE_URL,
    warnings: [
      'The stored markdown contains the New York tournament-listing heading, Zero Gravity branding, and a registration entry point but no complete current tournament rows.',
      'All discovered event/detail pages are UNCHECKED and are not used to infer dates, venues, prices, or event candidates.',
      'No physical New York address is assigned because the stored page does not publish one; the parent 3Step Sports LLC mailing address is not treated as a local venue.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ZERO_GRAVITY_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Zero Gravity Basketball New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Zero Gravity Basketball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Basketball tournament listing and registration' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'New York basketball tournament registration' },
    description: { selector: 'body', mode: 'literal', value: ZERO_GRAVITY_NEW_YORK_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Tournament' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: ZERO_GRAVITY_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/zeroGravityBasketballNewYork.html');

export const ZERO_GRAVITY_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
