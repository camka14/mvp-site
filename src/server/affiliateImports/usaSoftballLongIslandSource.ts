import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const USA_SOFTBALL_LI_HOME_URL = 'https://usasoftballli.com/';
export const USA_SOFTBALL_LI_REGISTRATION_URL = 'https://usasoftballli.com/usa-registration/';
export const USA_SOFTBALL_LI_ORG_DESCRIPTION =
  'USA Softball Long Island is a Long Island softball organization presenting leagues, tournaments, and events for youth and adult athletes, with a focus on athlete safety, integrity, excellence, and support for member organizations.';

export const USA_SOFTBALL_LI_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7b096591-9e9b-4b74-9e57-f711f00b767d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-usa-softball-long-island-home-usasoftballli-com',
  intakeName: 'USA Softball Long Island: Home',
  baseUrl: 'https://usasoftballli.com',
  complianceStatus: 'ALLOWED',
  runId: '339c488c-233f-401b-8b72-f75c7ead298d',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:03.217Z',
  pages: [
    { url: 'https://usasoftballli.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://usasoftballli.com/usa-registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/59-2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/feed', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/author/wesco', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/category/uncategorized', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/news', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/news-2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/2021/06/summer-tournaments-and-camps-in-full-swing', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/2021/04/new-league-joins-usa-softball-long-island', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://usasoftballli.com/register', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
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

export const USA_SOFTBALL_LI_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'USA Softball Long Island',
    officialActionUrl: USA_SOFTBALL_LI_HOME_URL,
    sourceUrl: USA_SOFTBALL_LI_HOME_URL,
    organizerName: 'USA Softball Long Island',
    sportName: 'Softball',
    formatLabel: 'Youth and adult softball leagues, tournaments, and events',
    city: 'Long Island, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing Long Island softball leagues, tournaments, and events',
    scheduleText: 'The stored allowed homepage describes youth and adult leagues, professionally run tournaments at recreational and competitive levels, and softball events on Long Island.',
    statusText: 'Review-only club profile; the official registration, contact, news, and linked program pages are unchecked.',
    description: USA_SOFTBALL_LI_ORG_DESCRIPTION,
    tags: ['Club', 'Softball', 'Youth', 'Adult', 'Long Island'],
    warnings: [
      'The stored allowed homepage supports an evergreen CLUB profile but does not provide a current complete dated event row.',
      'The captured tournament teasers are historical 2021 or missing a year and are not emitted as EVENT candidates.',
      'Registration, contact, news, and linked program pages are UNCHECKED and remain withheld.',
      'Only a favicon-level USA Softball Long Island mark was stored; the generic Divi logo candidate is not used and logo disposition is MANUAL_REVIEW.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const USA_SOFTBALL_LI_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: USA_SOFTBALL_LI_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'USA Softball Long Island' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: USA_SOFTBALL_LI_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: USA_SOFTBALL_LI_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'USA Softball Long Island' },
    sportName: { selector: 'body', mode: 'literal', value: 'Softball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth and adult softball leagues, tournaments, and events' },
    city: { selector: 'body', mode: 'literal', value: 'Long Island, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing Long Island softball leagues, tournaments, and events' },
    description: { selector: 'body', mode: 'literal', value: USA_SOFTBALL_LI_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Softball, Youth, Adult, Long Island' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: USA_SOFTBALL_LI_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/usaSoftballLongIsland.html');

export const USA_SOFTBALL_LI_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: USA_SOFTBALL_LI_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
