import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOCCER_FRIENDS_USA_HOME_URL = 'https://www.soccerfriendsusa.com/';
export const SOCCER_FRIENDS_USA_PROGRAMS_URL = 'https://www.soccerfriendsusa.com/programs';
export const SOCCER_FRIENDS_USA_ABOUT_URL = 'https://www.soccerfriendsusa.com/about-us';
export const SOCCER_FRIENDS_USA_MINDBODY_URL = 'https://clients.mindbodyonline.com/classic/ws?studioid=12307';
export const SOCCER_FRIENDS_USA_LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/562cf78ce4b0be3275fd8615/1484599930182-LAZNRECSYGU1O61HKG3V/soccer+friends+logo.jpg?format=1500w';

export const SOCCER_FRIENDS_USA_ORG_DESCRIPTION =
  'Soccer Friends USA offers youth soccer programs in Queens, NY, including age-based classes from 18 months to 14 years, futsal academy, camps, all-girls and after-school programs, and travel-team development.';

export const SOCCER_FRIENDS_USA_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'f3ff83fa-dd19-49fd-a78c-cf308d1bd567',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-soccer-friends-usa-soccerfriendsusa-com',
  intakeName: 'Soccer Friends USA',
  baseUrl: 'https://www.soccerfriendsusa.com',
  complianceStatus: 'ALLOWED',
  runId: '4447a805-527d-468b-89cb-4bf8a307b5ad',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:56:51.008Z',
  pages: [
    { url: SOCCER_FRIENDS_USA_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: SOCCER_FRIENDS_USA_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_FRIENDS_USA_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.soccerfriendsusa.com/locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.soccerfriendsusa.com/futsal-academy-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.soccerfriendsusa.com/programs/summer-camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.soccerfriendsusa.com/programs/travel-teams', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_FRIENDS_USA_MINDBODY_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
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

export const SOCCER_FRIENDS_USA_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Soccer Friends USA',
    officialActionUrl: SOCCER_FRIENDS_USA_PROGRAMS_URL,
    sourceUrl: SOCCER_FRIENDS_USA_HOME_URL,
    organizerName: 'Soccer Friends USA',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer classes, futsal, camps, after-school, all-girls, and travel-team development',
    city: 'Queens, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing youth soccer programs',
    scheduleText: 'The stored official homepage describes small-class soccer programs for children from 18 months to 14 years, plus futsal academy, summer camps, all-girls programs, after-school programs, birthday parties, and travel teams.',
    statusText: 'Review-only club profile; current schedules, locations, prices, and registration rows require the unchecked program and registration pages.',
    description: SOCCER_FRIENDS_USA_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Futsal', 'Queens'],
    logoUrl: SOCCER_FRIENDS_USA_LOGO_SOURCE_URL,
    logoSourceUrl: SOCCER_FRIENDS_USA_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage provides evergreen program context but no complete current date, time, venue, price, or registration row; no EVENT candidate is created.',
      'The stored program, location, about, camp, futsal, and Mindbody registration pages are UNCHECKED and remain withheld.',
      'Travel teams are described as Queensborough United Soccer Club team participation; no TEAM candidate is created because team mappings are out of scope.',
      'The stored first-party Soccer Friends USA logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOCCER_FRIENDS_USA_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: SOCCER_FRIENDS_USA_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Soccer Friends USA' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOCCER_FRIENDS_USA_PROGRAMS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: SOCCER_FRIENDS_USA_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Soccer Friends USA' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth soccer classes, futsal, camps, after-school, all-girls, and travel-team development' },
    city: { selector: 'body', mode: 'literal', value: 'Queens, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing youth soccer programs' },
    description: { selector: 'body', mode: 'literal', value: SOCCER_FRIENDS_USA_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Futsal, Queens' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: SOCCER_FRIENDS_USA_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/soccerFriendsUsa.html');

export const SOCCER_FRIENDS_USA_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: SOCCER_FRIENDS_USA_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
