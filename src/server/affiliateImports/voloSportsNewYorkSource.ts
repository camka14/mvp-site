import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const VOLO_NEW_YORK_HOME_URL = 'https://www.volosports.com/new-york-metro-area';
export const VOLO_NEW_YORK_FLAG_FOOTBALL_URL = 'https://www.volosports.com/new-york-metro-area/flag-football';
export const VOLO_NEW_YORK_PICKLEBALL_URL = 'https://www.volosports.com/new-york-metro-area/pickleball';
export const VOLO_NEW_YORK_SOFTBALL_URL = 'https://www.volosports.com/new-york-metro-area/softball';
export const VOLO_NEW_YORK_VOLLEYBALL_URL = 'https://www.volosports.com/new-york-metro-area/volleyball';
export const VOLO_NEW_YORK_LOGO_SOURCE_URL = 'https://www.volosports.com/icons/volo-logo-blue.webp';
export const VOLO_NEW_YORK_ORG_DESCRIPTION = 'Volo Sports offers adult recreational leagues, drop-ins, pickups, and events across New York Metro Area, with solo, friend, full-team, and corporate signup options.';

export const VOLO_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '0d600914-7edb-4bba-874e-02810e2c924a',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-leagues-and-pickup-games-in-new-york-metro-area-volosports-com',
  intakeName: 'Leagues and Pickup Games in New York Metro Area',
  baseUrl: 'https://www.volosports.com',
  complianceStatus: 'ALLOWED',
  runId: 'b4ffdfbb-05b3-4feb-beab-0d4db9e793ae',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:27:23.161Z',
  pages: [
    { url: VOLO_NEW_YORK_HOME_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: VOLO_NEW_YORK_FLAG_FOOTBALL_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: VOLO_NEW_YORK_PICKLEBALL_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: VOLO_NEW_YORK_SOFTBALL_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: VOLO_NEW_YORK_VOLLEYBALL_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://www.volosports.com/discover/new-york-metro-area', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.volosports.com/discover/new-york-metro-area?category=leagues', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.volosports.com/discover/new-york-metro-area?category=daily-sports&programType=pickup', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.volosports.com/new-york-metro-area/event', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.volosports.com/signup', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 24 },
    { kind: 'PAGE_BRANDING', count: 5 },
    { kind: 'PAGE_HTML', count: 5 },
    { kind: 'PAGE_IMAGES', count: 5 },
    { kind: 'PAGE_LINKS', count: 5 },
    { kind: 'PAGE_MARKDOWN', count: 5 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 5 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 5 },
    { kind: 'ROBOTS', count: 5 },
  ],
} as const;

export const VOLO_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Volo Sports New York Metro Area',
    officialActionUrl: VOLO_NEW_YORK_HOME_URL,
    sourceUrl: VOLO_NEW_YORK_HOME_URL,
    organizerName: 'Volo Sports',
    sportName: 'Multi-sport',
    formatLabel: 'Adult recreational leagues, drop-ins, pickups, events, and corporate leagues',
    city: 'New York Metro Area',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round recreational sports programming',
    scheduleText: 'The stored New York Metro Area page describes weekly leagues and playoffs, single-game drop-ins, pickups, and corporate leagues across 25 neighborhoods and 76 venues. Individual program dates, venues, and current registration rows are not captured in the stored evidence.',
    statusText: 'Review-only club profile; current league and pickup registration details require the official Volo pages.',
    description: VOLO_NEW_YORK_ORG_DESCRIPTION,
    tags: ['Club', 'Multi-sport', 'Adult', 'Leagues', 'Pickups'],
    logoUrl: VOLO_NEW_YORK_LOGO_SOURCE_URL,
    logoSourceUrl: VOLO_NEW_YORK_LOGO_SOURCE_URL,
    warnings: [
      'The stored sport pages describe league, drop-in, pickup, and corporate formats but do not expose complete current date, venue, price, and registration rows for import.',
      'No physical organization address is assigned because the stored evidence describes a metro-wide program across multiple neighborhoods and venues.',
      'No TEAM candidate is created because the stored pages describe signup formats rather than stable roster-level teams; no EVENT or RENTAL candidate is created without complete current rows.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const VOLO_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: VOLO_NEW_YORK_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Volo Sports New York Metro Area' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: VOLO_NEW_YORK_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: VOLO_NEW_YORK_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Volo Sports' },
    sportName: { selector: 'body', mode: 'literal', value: 'Multi-sport' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult recreational leagues, drop-ins, pickups, events, and corporate leagues' },
    city: { selector: 'body', mode: 'literal', value: 'New York Metro Area' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round recreational sports programming' },
    description: { selector: 'body', mode: 'literal', value: VOLO_NEW_YORK_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Multi-sport, Adult, Leagues, Pickups' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: VOLO_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/voloSportsNewYork.html');

export const VOLO_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: VOLO_NEW_YORK_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
