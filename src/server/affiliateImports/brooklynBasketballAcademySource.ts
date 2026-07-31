import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const BBA_HOME_URL = 'https://www.bkbasketballacademy.com/';
export const BBA_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/f99eb6_0af898c2809d4af2b13688a408ac5344%7Emv2.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/f99eb6_0af898c2809d4af2b13688a408ac5344%7Emv2.png';
export const BBA_ORG_DESCRIPTION = 'Brooklyn Basketball Academy (BBA) offers year-round youth basketball training from pre-K through 10th grade, including development leagues and competitive AAU/Travel programs across Sunset Park, Gowanus, and DUMBO.';

export const BBA_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '88a16752-1e73-4034-8c3f-9bf8e3b25113',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-bba-bkbasketballacademy-com',
  intakeName: 'BBA',
  baseUrl: 'https://www.bkbasketballacademy.com',
  complianceStatus: 'ALLOWED',
  runId: '85f8ce8b-0fa7-4d2a-a2ac-d440a8b42c34',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:21.613Z',
  pages: [
    { url: 'https://www.bkbasketballacademy.com/aautravelboys', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/aautravelgirls', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/about', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/bba-performance', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/bba-skills', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/bklyn-cup', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/bklyn-cup-girls', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/bklynruns', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/careers', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/category/merch', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/donate', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/intro-to-basketball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/jr-bklyn-cup', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/memberships', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/pre-k-kindergarten', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/press', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/summer', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/team', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: BBA_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.bkbasketballacademy.com/boys-boot-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/clinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/girls-bootcamp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/rentals/birthdays', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/rentals/dumbo', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/rentals/gowanus', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.bkbasketballacademy.com/rentals/sunset-park', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const BBA_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Brooklyn Basketball Academy (BBA)',
    officialActionUrl: BBA_HOME_URL,
    sourceUrl: BBA_HOME_URL,
    organizerName: 'Brooklyn Basketball Academy',
    sportName: 'Basketball',
    formatLabel: 'Youth basketball training, development leagues, AAU/Travel competition, and gym-based programs',
    city: 'Brooklyn, NY',
    venueName: 'Sunset Park, Gowanus, and DUMBO locations',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing Brooklyn youth basketball programs',
    scheduleText: 'The stored homepage describes year-round training from pre-K through 10th grade, development leagues, competitive AAU/Travel programs, and three Brooklyn locations: Sunset Park at 162 25th Street, Gowanus at 152 6th Street, and DUMBO at 306 Water Street.',
    statusText: 'Review-only club profile; current competition-series, camp, seasonal, program, and rental detail pages require separate review.',
    description: BBA_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Youth', 'Brooklyn', 'Academy'],
    warnings: [
      'The stored allowed homepage has seasonal date text but does not provide an explicit year for the summer date ranges or a complete current event registration row, so no EVENT candidate is created.',
      'The stored intake marks program, camp, clinic, AAU/Travel, team, and rental detail pages UNCHECKED; those rows are withheld.',
      'The stored homepage lists three locations and rental callouts, but rental availability, pricing, and booking details are on unchecked pages, so no RENTAL candidate is created.',
      'The stored first-party BBA basketball-mark candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const BBA_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: BBA_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Brooklyn Basketball Academy (BBA)' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BBA_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: BBA_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Brooklyn Basketball Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Youth, Brooklyn, Academy' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: BBA_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/brooklynBasketballAcademy.html');

export const BBA_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: BBA_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
