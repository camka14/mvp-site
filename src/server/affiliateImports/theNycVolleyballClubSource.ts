import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const THE_NYC_VOLLEYBALL_HOME_URL = 'https://thenycvolleyball.com/';
export const THE_NYC_VOLLEYBALL_TRYOUTS_URL = 'https://thenycvolleyball.com/tryouts/';
export const THE_NYC_VOLLEYBALL_BOYS_URL = 'https://thenycvolleyball.com/boys/';
export const THE_NYC_VOLLEYBALL_GIRLS_URL = 'https://thenycvolleyball.com/girls/';
export const THE_NYC_VOLLEYBALL_FACILITY_URL = 'https://thenycvolleyball.com/our-facility/';
export const THE_NYC_VOLLEYBALL_LEAGUEAPPS_TRYOUT_URL = 'https://thenycvolleyball.leagueapps.com/events/4694167-2025-26-team-tryouts';
export const THE_NYC_VOLLEYBALL_LOGO_SOURCE_URL = 'https://thenycvolleyball.com/wp-content/uploads/2024/09/TheNYCVolleyball-Logo-White.png';

export const THE_NYC_VOLLEYBALL_ORG_DESCRIPTION =
  'The NYC Volleyball Club develops competitive boys and girls volleyball programs through training, tryouts, and a team-first athlete development approach in Bronx, NY.';

export const THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '61b8a6c7-9fe9-433f-a768-3a0a670d59be',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-the-nyc-volleyball-club-home-page-thenycvolleyball-com',
  intakeName: 'The NYC Volleyball Club: Home Page',
  baseUrl: THE_NYC_VOLLEYBALL_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '4a511404-6f98-4d1f-9ffa-b06f2c40008c',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:58:55.115Z',
  pages: [
    { url: THE_NYC_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: THE_NYC_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: THE_NYC_VOLLEYBALL_BOYS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_NYC_VOLLEYBALL_GIRLS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_NYC_VOLLEYBALL_FACILITY_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_NYC_VOLLEYBALL_LEAGUEAPPS_TRYOUT_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://thenycvolleyball.com/about/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://thenycvolleyball.com/clinics/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://thenycvolleyball.com/register-now/', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
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

export const THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'The NYC Volleyball Club',
    officialActionUrl: THE_NYC_VOLLEYBALL_TRYOUTS_URL,
    sourceUrl: THE_NYC_VOLLEYBALL_HOME_URL,
    organizerName: 'The NYC Volleyball Club',
    sportName: 'Volleyball',
    formatLabel: 'Competitive boys and girls club volleyball programs',
    city: 'Bronx, NY',
    venueName: 'The NYC Volleyball facilities at Fordham',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing club volleyball programs',
    scheduleText: 'The stored official homepage describes competitive volleyball, boys and girls club programs, tryouts, clinics, and facilities at Fordham in the Bronx.',
    statusText: 'Review-only club profile; current program schedules, exact facility address, prices, and registration rows require the unchecked detail and registration pages.',
    description: THE_NYC_VOLLEYBALL_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'Bronx'],
    logoUrl: THE_NYC_VOLLEYBALL_LOGO_SOURCE_URL,
    logoSourceUrl: THE_NYC_VOLLEYBALL_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage provides evergreen club and Bronx/Fordham facility context but no complete current date, time, venue address, price, or registration row; no EVENT candidate is created.',
      'The stored boys, girls, facility, tryout, clinic, and registration pages are UNCHECKED and remain withheld.',
      'The stored LeagueApps URL is labeled 2025-26 and is not emitted as a dated event because its registration detail is outside the captured allowed page.',
      'No TEAM candidate is created because team mappings are out of scope.',
      'The stored first-party white TheNYCVolleyball logo candidate was flattened onto a dark opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const THE_NYC_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: THE_NYC_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'The NYC Volleyball Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: THE_NYC_VOLLEYBALL_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: THE_NYC_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'The NYC Volleyball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Competitive boys and girls club volleyball programs' },
    city: { selector: 'body', mode: 'literal', value: 'Bronx, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'The NYC Volleyball facilities at Fordham' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing club volleyball programs' },
    description: { selector: 'body', mode: 'literal', value: THE_NYC_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Bronx' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: THE_NYC_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/theNycVolleyballClub.html');

export const THE_NYC_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
