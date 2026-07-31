import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const DUSC_HOME_URL = 'https://dusc.net/';
export const DUSC_LOGO_SOURCE_URL = 'https://dusc.net/wp-content/uploads/2019/03/PAL_Logo_FINAL.png';
export const DUSC_ORG_DESCRIPTION = 'Downtown United Soccer Club (DUSC), established in 1982, is a New York City youth soccer nonprofit serving players of all ages and abilities through academy, recreational league, classes, camps, and competitive development programs in a positive and supportive environment.';

export const DUSC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7e0cebb2-e9af-4ce8-9e0b-68d1a57dd98f',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-downtown-united-soccer-club-home-dusc-net',
  intakeName: 'Downtown United Soccer Club Home',
  baseUrl: 'https://dusc.net',
  complianceStatus: 'ALLOWED',
  runId: '77e0839a-e804-4564-b062-21dc22c85547',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:34:43.953Z',
  pages: [
    { url: DUSC_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://dusc.net/programs/academy', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://dusc.net/programs/recreation-league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://dusc.net/programs/classes', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://dusc.net/programs/camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://dusc.net/register', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://dusc.net/coaches/malorie-warents', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const DUSC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Downtown United Soccer Club (DUSC)',
    officialActionUrl: DUSC_HOME_URL,
    sourceUrl: DUSC_HOME_URL,
    organizerName: 'Downtown United Soccer Club',
    sportName: 'Soccer',
    formatLabel: 'Youth academy, recreational league, classes, camps, and competitive soccer development',
    city: 'New York, NY',
    venueName: 'Downtown Manhattan and greater NYC area',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing youth soccer programs',
    scheduleText: 'The stored DUSC home page lists academy, rec league, classes, and camps, and says the club serves approximately 5,000 participants annually in Downtown Manhattan and the greater NYC area.',
    statusText: 'Review-only club profile; current program and registration rows require their stored detail pages to be reviewed separately.',
    description: DUSC_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Academy', 'New York'],
    warnings: [
      'The stored allowed home page does not provide a complete current date, price, capacity, or registration row for a specific event, so no EVENT candidate is created.',
      'The stored intake marks program, registration, team, and rental pages UNCHECKED; those rows are withheld.',
      'The stored first-party DUSC logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const DUSC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: DUSC_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Downtown United Soccer Club (DUSC)' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: DUSC_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: DUSC_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Downtown United Soccer Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: DUSC_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/downtownUnitedSoccerClub.html');

export const DUSC_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: DUSC_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
