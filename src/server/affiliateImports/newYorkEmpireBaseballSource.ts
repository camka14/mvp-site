import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_EMPIRE_HOME_URL = 'https://newyorkempirebaseball.org/';
export const NEW_YORK_EMPIRE_TRAVEL_URL = 'https://newyorkempirebaseball.org/travel-baseball';
export const NEW_YORK_EMPIRE_LOGO_SOURCE_URL = 'https://newyorkempirebaseball.org/wp-content/uploads/2025/01/Logo-New-York-Empire-Baseball-2023-Text-300x95.png';

export const NEW_YORK_EMPIRE_ORG_DESCRIPTION =
  'New York Empire Baseball develops highly competitive travel baseball players ages 7–14 through coached practices, league and tournament play, and long-term player development in Manhattan.';

export const NEW_YORK_EMPIRE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '69505e28-d5f6-4ad8-a157-73489b543df6',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-competitive-travel-baseball-newyorkempirebaseball-org',
  intakeName: 'Competitive Travel Baseball',
  baseUrl: NEW_YORK_EMPIRE_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '1b23cdf3-cb7e-432c-972f-db3f0e008ff1',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:02:59.224Z',
  pages: [
    { url: NEW_YORK_EMPIRE_TRAVEL_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_EMPIRE_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://newyorkempirebaseball.org/locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://newyorkempirebaseball.org/facility', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://newyorkempirebaseball.org/programs/travel-baseball', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://newyorkempirebaseball.org/programs/club-league-baseball', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://newyorkempirebaseball.org/camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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
    { kind: 'ROBOTS', count: 2 },
  ],
} as const;

export const NEW_YORK_EMPIRE_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'New York Empire Baseball',
    officialActionUrl: NEW_YORK_EMPIRE_TRAVEL_URL,
    sourceUrl: NEW_YORK_EMPIRE_TRAVEL_URL,
    organizerName: 'New York Empire Baseball',
    sportName: 'Baseball',
    formatLabel: 'Competitive travel baseball and player development for ages 7–14',
    city: 'New York, NY',
    venueName: 'The Arena',
    address: '251 West 60 Street between West End Avenue & Amsterdam Avenue, New York, NY',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing travel baseball programs',
    scheduleText: 'The stored official travel-baseball listing describes teams for ages 7–14, practices up to three times each week, weekend league doubleheaders, tournament play, and indoor hitting and pitching training.',
    statusText: 'Review-only club profile; current team schedules, prices, tryout dates, and registration rows require the unchecked program and detail pages.',
    description: NEW_YORK_EMPIRE_ORG_DESCRIPTION,
    tags: ['Club', 'Baseball', 'Youth', 'Travel', 'Manhattan'],
    logoUrl: NEW_YORK_EMPIRE_LOGO_SOURCE_URL,
    logoSourceUrl: NEW_YORK_EMPIRE_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed travel-baseball listing provides evergreen club, age, schedule-pattern, and Arena address context but no complete current dated event row; no EVENT candidate is created.',
      'The stored facility, locations, program, camp, and other detail pages are UNCHECKED and remain withheld.',
      'Travel teams and rosters are described but no TEAM candidate is created because team mappings are out of scope.',
      'The stored first-party New York Empire Baseball wordmark was flattened onto a dark opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_EMPIRE_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NEW_YORK_EMPIRE_TRAVEL_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Empire Baseball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_EMPIRE_TRAVEL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_EMPIRE_TRAVEL_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Empire Baseball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Competitive travel baseball and player development for ages 7–14' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'The Arena' },
    address: { selector: 'body', mode: 'literal', value: '251 West 60 Street between West End Avenue & Amsterdam Avenue, New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing travel baseball programs' },
    description: { selector: 'body', mode: 'literal', value: NEW_YORK_EMPIRE_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Youth, Travel, Manhattan' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NEW_YORK_EMPIRE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkEmpireBaseball.html');

export const NEW_YORK_EMPIRE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NEW_YORK_EMPIRE_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
