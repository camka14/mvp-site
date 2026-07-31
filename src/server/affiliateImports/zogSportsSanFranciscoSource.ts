import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ZOG_SPORTS_SF_FOOTBALL_URL = 'https://www.zogsports.com/sf/football';
export const ZOG_SPORTS_HOME_URL = 'https://www.zogsports.com/';
export const ZOG_SPORTS_SF_LOGO_SOURCE_URL = 'https://www.zogsports.com/wp-content/uploads/2022/04/ZogSports-Social-Card-1200.jpg';
export const ZOG_SPORTS_SF_ORG_DESCRIPTION = 'ZogSports organizes adult social flag-football leagues in San Francisco and the East Bay, with weeknight and weekend games at local parks and facilities.';

export const ZOG_SPORTS_SF_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'e11c9e83-df4a-4c30-a0af-25b8d5284327',
  intakeSourceKey: 'san-francisco-bay-area-california-adult-football-leagues-in-san-francisco-east-bay-zogsports-com',
  intakeName: 'Adult Football Leagues in San Francisco East Bay',
  baseUrl: 'https://www.zogsports.com',
  complianceStatus: 'ALLOWED',
  runId: '632dec96-334f-44f0-a4a6-ffd4299d134b',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:29:43.528Z',
  pages: [
    { url: ZOG_SPORTS_SF_FOOTBALL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.zogsports.com/ny/pickleball', role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: ZOG_SPORTS_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zogsports.com/about-us', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zogsports.com/sf', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zogsports.com/sf/all-sports-san-francisco', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zogsports.com/sf/social-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.zogsports.com/rules/flag-football-rules', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 6 },
    { kind: 'PAGE_BRANDING', count: 2 },
    { kind: 'PAGE_HTML', count: 2 },
    { kind: 'PAGE_IMAGES', count: 2 },
    { kind: 'PAGE_LINKS', count: 2 },
    { kind: 'PAGE_MARKDOWN', count: 2 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 2 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 2 },
    { kind: 'ROBOTS', count: 2 },
  ],
} as const;

export const ZOG_SPORTS_SF_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'ZogSports San Francisco & East Bay',
    officialActionUrl: ZOG_SPORTS_SF_FOOTBALL_URL,
    sourceUrl: ZOG_SPORTS_SF_FOOTBALL_URL,
    organizerName: 'ZogSports',
    sportName: 'Flag Football',
    formatLabel: 'Adult social flag-football leagues',
    city: 'San Francisco Bay Area',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Weeknight and weekend adult flag-football leagues',
    scheduleText: 'The stored football page describes adult flag-football leagues in San Francisco and the East Bay, with weeknight and weekend games at local parks and facilities; current season dates, venues, prices, and registration rows are not captured.',
    statusText: 'Review-only club profile; current league registration details require the official ZogSports page.',
    description: ZOG_SPORTS_SF_ORG_DESCRIPTION,
    tags: ['Club', 'Flag Football', 'Adult', 'Social League'],
    logoUrl: ZOG_SPORTS_SF_LOGO_SOURCE_URL,
    logoSourceUrl: ZOG_SPORTS_SF_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed football page describes the league format and service area but does not contain complete current date, venue, price, and registration rows.',
      'No physical organization address is assigned because the stored page describes a San Francisco/East Bay service area and local parks/facilities rather than one headquarters venue.',
      'No EVENT or TEAM candidate is created from incomplete league and roster context.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ZOG_SPORTS_SF_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ZOG_SPORTS_SF_FOOTBALL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'ZogSports San Francisco & East Bay' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ZOG_SPORTS_SF_FOOTBALL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ZOG_SPORTS_SF_FOOTBALL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'ZogSports' },
    sportName: { selector: 'body', mode: 'literal', value: 'Flag Football' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult social flag-football leagues' },
    city: { selector: 'body', mode: 'literal', value: 'San Francisco Bay Area' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Weeknight and weekend adult flag-football leagues' },
    description: { selector: 'body', mode: 'literal', value: ZOG_SPORTS_SF_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Flag Football, Adult, Social League' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: ZOG_SPORTS_SF_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/zogSportsSanFrancisco.html');

export const ZOG_SPORTS_SF_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: ZOG_SPORTS_SF_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
