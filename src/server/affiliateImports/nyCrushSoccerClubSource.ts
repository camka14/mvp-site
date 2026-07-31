import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NY_CRUSH_TRYOUTS_FAQ_URL = 'https://nycramapovalleysc.com/club/tryouts-faqs/';
export const NY_CRUSH_HOME_URL = 'https://nycramapovalleysc.com/';
export const NY_CRUSH_REGISTER_URL = 'https://nycramapovalley.leagueapps.com/clubteams/4894309-tryouts---202627-season';
export const NY_CRUSH_LOGO_SOURCE_URL = 'https://nycramapovalleysc.com/wp-content/uploads/2024/07/Frame-2.jpg';
export const NY_CRUSH_ORG_DESCRIPTION =
  'New York Crush SC publishes soccer tryout guidance and official registration paths for its club program.';

export const NY_CRUSH_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b50c3dc2-9492-466d-85a2-fa1e3c7965f4',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-soccer-tryouts-for-ny-crush-soccer-club-nycramapovalleysc-com',
  intakeName: 'Soccer Tryouts for NY Crush Soccer Club',
  baseUrl: 'https://nycramapovalleysc.com',
  complianceStatus: 'ALLOWED',
  runId: 'ede02847-b4be-4890-862f-a9611b81ee3d',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:19.374Z',
  pages: [
    { url: NY_CRUSH_TRYOUTS_FAQ_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: 'https://nycramapovalleysc.com/register', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NY_CRUSH_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nycramapovalleysc.com/club/mission', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nycramapovalleysc.com/programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://nycramapovalleysc.com/teams', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nycramapovalleysc.com/fields', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://nycramapovalleysc.com/tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'New York Crush SC',
  officialActionUrl: NY_CRUSH_REGISTER_URL,
  sourceUrl: NY_CRUSH_TRYOUTS_FAQ_URL,
  organizerName: 'New York Crush SC',
  sportName: 'Soccer',
  formatLabel: 'Soccer club tryout guidance and registration',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Tryout FAQ and registration path; no current dates stored',
  scheduleText: 'The stored allowed Soccer Tryouts page covers registration, training-session attendance, notifications, weather, and next steps if accepted. It does not publish tryout dates, times, venues, or age-group rows.',
  statusText: 'Minimal review-only club profile; official home, program, team, field, and registration pages remain unchecked except for the stored tryout FAQ.',
  description: NY_CRUSH_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Tryouts', 'New York Crush SC'],
  logoUrl: NY_CRUSH_LOGO_SOURCE_URL,
  logoSourceUrl: NY_CRUSH_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed tryout FAQ identifies the club tryout workflow but does not publish a canonical city, street address, current date, time, venue, or age-group details; those fields remain unset.',
    'The home, mission, programs, teams, fields, tournament, and registration pages are UNCHECKED; no EVENT, RENTAL, or TEAM candidate is inferred.',
    'The stored first-party New York Crush SC organization logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
  ],
};

export const NY_CRUSH_MANUAL_CANDIDATES = [organizationCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NY_CRUSH_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NY_CRUSH_TRYOUTS_FAQ_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Crush SC' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NY_CRUSH_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NY_CRUSH_TRYOUTS_FAQ_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Crush SC' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Soccer club tryout guidance and registration' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Tryout FAQ and registration path; no current dates stored' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Tryouts, New York Crush SC' },
    description: { selector: 'body', mode: 'literal', value: NY_CRUSH_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NY_CRUSH_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nyCrushSoccerClub.html');

export const NY_CRUSH_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NY_CRUSH_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
