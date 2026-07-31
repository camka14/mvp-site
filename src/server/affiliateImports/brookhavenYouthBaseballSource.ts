import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const BROOKHAVEN_BASEBALL_URL = 'https://www.brookhavenny.gov/262/Baseball';
export const BROOKHAVEN_HOME_URL = 'https://www.brookhavenny.gov/';
export const BROOKHAVEN_BASEBALL_PAYMENTS_URL = 'https://www.brookhavenny.gov/265/Baseball-Payments';
export const BROOKHAVEN_BASEBALL_LOGO_SOURCE_URL = 'https://www.brookhavenny.gov/images/favicon.ico';
export const BROOKHAVEN_BASEBALL_ORG_DESCRIPTION =
  'The Town of Brookhaven Youth Baseball Program offers youth baseball leagues for ages 8 to 18 and spring and fall tournaments on artificial turf and grass fields throughout the Town of Brookhaven.';

export const BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b9b64bf7-d500-4b06-aa82-5daee2f30d0e',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-baseball-brookhavenny-gov',
  intakeName: 'Baseball',
  baseUrl: 'https://www.brookhavenny.gov',
  complianceStatus: 'ALLOWED',
  runId: 'f5831d83-9ba8-496f-ab9d-f1877a5608c8',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:19.785Z',
  pages: [
    { url: BROOKHAVEN_BASEBALL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: BROOKHAVEN_BASEBALL_PAYMENTS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: BROOKHAVEN_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/1423/Parks-Recreation', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/220/Sports', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/688/Events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/219/Programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/calendar.aspx?CID=29', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.brookhavenny.gov/DocumentCenter/View/703', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
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

export const BROOKHAVEN_BASEBALL_OFFICIAL_URLS = [
  BROOKHAVEN_HOME_URL,
  BROOKHAVEN_BASEBALL_URL,
  BROOKHAVEN_BASEBALL_PAYMENTS_URL,
  'https://www.brookhavenny.gov/1423/Parks-Recreation',
  'https://www.brookhavenny.gov/220/Sports',
  'https://www.brookhavenny.gov/688/Events',
  'https://www.brookhavenny.gov/219/Programs',
  'https://www.brookhavenny.gov/calendar.aspx?CID=29',
  'https://www.leaguelineup.com/tobbaseball',
  'https://www.brookhavenny.gov/DocumentCenter/View/703',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Town of Brookhaven Youth Baseball Program',
  officialActionUrl: BROOKHAVEN_BASEBALL_URL,
  sourceUrl: BROOKHAVEN_BASEBALL_URL,
  organizerName: 'Town of Brookhaven Youth Baseball Program',
  sportName: 'Baseball',
  formatLabel: 'Youth baseball leagues for ages 8-18 and spring and fall tournaments',
  city: 'Brookhaven, NY',
  venueName: 'Town of Brookhaven fields',
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Review-only Town of Brookhaven youth baseball program',
  scheduleText: 'The stored baseball page says the program offers summer and fall leagues for youth teams ages 8 to 18 and spring and fall tournaments on artificial turf and grass fields throughout the Town of Brookhaven. The page’s detailed league section is labeled 2021 and gives historical game formats, while current calendar and events pages are unchecked.',
  statusText: 'Review-only historical program summary; current league, tournament, field, payment, and registration details require the official linked pages.',
  description: BROOKHAVEN_BASEBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Baseball', 'Youth', 'Tournaments', 'Brookhaven'],
  logoUrl: BROOKHAVEN_BASEBALL_LOGO_SOURCE_URL,
  logoSourceUrl: BROOKHAVEN_BASEBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED baseball page describes the Town of Brookhaven youth baseball program and identifies fields throughout the Town of Brookhaven, but it does not publish a canonical street address.',
    'The detailed league section is explicitly labeled 2021 and the tournament rows omit a year; current calendar, events, programs, payments, and other pages are UNCHECKED, so no dated EVENT, TEAM, or RENTAL candidate is inferred.',
    'Only favicon-level Town of Brookhaven branding is stored; no suitable organization logo is assigned and logo disposition is MANUAL_REVIEW.',
  ],
};

export const BROOKHAVEN_BASEBALL_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const BROOKHAVEN_BASEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: BROOKHAVEN_BASEBALL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Town of Brookhaven Youth Baseball Program' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BROOKHAVEN_BASEBALL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: BROOKHAVEN_BASEBALL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Town of Brookhaven Youth Baseball Program' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    city: { selector: 'body', mode: 'literal', value: 'Brookhaven, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Youth, Tournaments, Brookhaven' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: BROOKHAVEN_BASEBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/brookhavenYouthBaseball.html');

export const BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
