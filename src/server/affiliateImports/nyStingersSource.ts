import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NY_STINGERS_HOME_URL = 'https://nystingers.com/';
export const NY_STINGERS_ORG_DESCRIPTION = 'NY Stingers is a New York baseball academy focused on player development, competitive teams, tournament play, college exposure, and coaching for youth and elite athletes.';

export const NY_STINGERS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'abd6c117-9e96-4d87-bacf-0d1b451a4f97',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-ny-stingers-nystingers-com',
  intakeName: 'NY Stingers',
  baseUrl: 'https://nystingers.com',
  complianceStatus: 'ALLOWED',
  runId: '3dad0a31-d3c0-41e3-bf25-2cb6b2631e77',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:53.712Z',
  pages: [
    { url: NY_STINGERS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://nystingers.com/facilities', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nystingers.com/staff', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nystingers.com/teams', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
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

export const NY_STINGERS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NY Stingers',
    officialActionUrl: NY_STINGERS_HOME_URL,
    sourceUrl: NY_STINGERS_HOME_URL,
    organizerName: 'NY Stingers',
    sportName: 'Baseball',
    formatLabel: 'Youth baseball development, elite competition, tournament play, and college preparation',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing New York baseball academy programs',
    scheduleText: 'The stored homepage describes youth development for 8U–12U, elite competition and tournament play for 13U–18U, college preparation, 25+ competitive teams, 240+ players, and 30+ years of experience.',
    statusText: 'Review-only baseball academy profile; current teams, facilities, staff, and registration details require separate review.',
    description: NY_STINGERS_ORG_DESCRIPTION,
    tags: ['Club', 'Baseball', 'Youth', 'Academy', 'New York'],
    warnings: [
      'The stored allowed homepage does not provide a complete current dated event row, so no EVENT candidate is created.',
      'Teams, facilities, and staff pages are UNCHECKED; no TEAM or RENTAL candidate is inferred.',
      'No official logo candidate was captured in the stored intake; logo disposition is MANUAL_REVIEW.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NY_STINGERS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NY_STINGERS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NY Stingers' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NY_STINGERS_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NY_STINGERS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NY Stingers' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NY_STINGERS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nyStingers.html');

export const NY_STINGERS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NY_STINGERS_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
