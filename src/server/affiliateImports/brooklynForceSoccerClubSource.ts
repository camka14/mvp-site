import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const BROOKLYN_FORCE_HOME_URL = 'http://www.brooklynforcesoccer.com/';
export const BROOKLYN_FORCE_LOGO_SOURCE_URL = 'https://irp.cdn-website.com/6becc46a/dms3rep/multi/opt/BFSC_Home_Yellow_W_Lock-up_Logo-198w.png';
export const BROOKLYN_FORCE_ORG_DESCRIPTION = 'Brooklyn Force Soccer is a youth soccer club founded in 2019 that provides development clinics, camps, advanced training, and competitive club travel programs for players in Brooklyn. Its stored home page emphasizes long-term development, character, teamwork, and player growth.';

export const BROOKLYN_FORCE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b8d04c99-1cc4-4bc5-a478-357b987e168d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-brooklyn-soccer-club-for-kids-adults-brooklynforcesoccer-com',
  intakeName: 'Brooklyn Soccer Club for Kids & Adults',
  baseUrl: 'http://www.brooklynforcesoccer.com',
  complianceStatus: 'ALLOWED',
  runId: '84516571-7fd8-4d57-9ae1-5b4d09995373',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:33:18.382Z',
  pages: [
    { url: BROOKLYN_FORCE_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'http://www.brooklynforcesoccer.com/tryouts', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'http://www.brooklynforcesoccer.com/rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'http://www.brooklynforcesoccer.com/juniors-academy', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'http://www.brooklynforcesoccer.com/developmentleague', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const BROOKLYN_FORCE_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Brooklyn Force Soccer',
    officialActionUrl: BROOKLYN_FORCE_HOME_URL,
    sourceUrl: BROOKLYN_FORCE_HOME_URL,
    organizerName: 'Brooklyn Force Soccer',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer development, clinics, camps, training, and competitive travel programs',
    city: 'Brooklyn, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing youth soccer development programs',
    scheduleText: 'The stored home page describes development clinics and camps, advanced soccer training, and competitive club travel programs for players at all levels. Outdoor training and home game locations are in Park Slope and downtown Brooklyn.',
    statusText: 'Review-only club profile; current program, tryout, and registration rows require their stored detail pages to be reviewed separately.',
    description: BROOKLYN_FORCE_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Training', 'Brooklyn'],
    warnings: [
      'The stored allowed home page does not provide a complete current date, price, capacity, or registration row for a specific event, so no EVENT candidate is created.',
      'The stored intake marks program, tryout, rental, league, and team pages UNCHECKED; those rows are withheld.',
      'The stored first-party Brooklyn Force lock-up logo was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const BROOKLYN_FORCE_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: BROOKLYN_FORCE_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Brooklyn Force Soccer' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BROOKLYN_FORCE_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: BROOKLYN_FORCE_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Brooklyn Force Soccer' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Training, Brooklyn' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: BROOKLYN_FORCE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/brooklynForceSoccerClub.html');

export const BROOKLYN_FORCE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: BROOKLYN_FORCE_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
