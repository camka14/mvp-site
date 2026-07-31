import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const DV7_SOCCER_NEW_YORK_HOME_URL = 'https://www.dv7soccer.com/';
export const DV7_SOCCER_NEW_YORK_LISTING_URL = 'https://www.dv7soccer.com/dv7_academies/new_york';
export const DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL = 'https://www.dv7soccer.com/wp-content/uploads/2019/03/Crest_DV7_ACADEMY_2021_RGB-01.png';
export const DV7_SOCCER_NEW_YORK_ORG_DESCRIPTION =
  'DV7 Soccer Academy New York provides competitive and school-development soccer programs for youth players in Queens and nearby New York City locations, with year-round 2026/2027 programming, camps, clinics, and supplemental training.';

export const DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b5aa4ecb-3ccc-4ed4-8ec4-69f07d7b6100',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-dv7soccer-com',
  intakeName: 'New York',
  baseUrl: 'https://www.dv7soccer.com',
  complianceStatus: 'ALLOWED',
  runId: '4e4a2825-adf0-4df5-b3a3-dde76d8a6b55',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:10.912Z',
  pages: [
    { url: DV7_SOCCER_NEW_YORK_LISTING_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.dv7soccer.com/programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.dv7soccer.com/summercamps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.dv7soccer.com/tryouts', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://dv7.leagueapps.com/clubteams/4995316-dv7-school---season-202627', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://dv7.leagueapps.com/clubteams/4995387-dv7-kinder-soccer---season-202627', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://dv7.leagueapps.com/camps/4864921-dv7ny-x-soccer-center--summer-camp-2026---all-levels--ages-5-to-14', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://dv7.leagueapps.com/camps/4864901-dv7--high-performance-camp-2026', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
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

export const DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'DV7 Soccer Academy New York',
    officialActionUrl: DV7_SOCCER_NEW_YORK_LISTING_URL,
    sourceUrl: DV7_SOCCER_NEW_YORK_LISTING_URL,
    organizerName: 'DV7 Soccer Academy',
    sportName: 'Soccer',
    formatLabel: 'Competitive and school-development youth soccer programs, camps, clinics, and supplemental training',
    city: 'New York, NY',
    venueName: 'Queens and nearby New York City soccer locations',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round 2026/2027 New York soccer programs',
    scheduleText: 'The stored allowed New York academy listing describes 2026/2027 year-round competitive and school-development programs, with locations including Queens, Roosevelt Island, Randall\'s Island, Astoria, Maspeth, Long Island City, Woodside, and Staten Island-area references.',
    statusText: 'Review-only club profile; registration forms, LeagueApps details, summer-camp pages, tryouts, and exact facility addresses require separate review.',
    description: DV7_SOCCER_NEW_YORK_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Academy', 'New York'],
    logoUrl: DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL,
    logoSourceUrl: DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed New York academy listing supports an evergreen CLUB profile with 2026/2027 year-round programs but does not provide a complete current dated event row.',
      'The stored June-August 2026 camp date ranges are current or past as of 2026-07-31 and are not emitted as stale EVENT candidates; camp detail and registration pages are UNCHECKED.',
      'Tryout, LeagueApps registration, program, camp, and exact location details are UNCHECKED and remain withheld.',
      'TEAM rows are out of scope; no team candidate is created.',
      'The stored first-party DV7 Academy crest was normalized locally to an opaque 1024px square PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const DV7_SOCCER_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: DV7_SOCCER_NEW_YORK_LISTING_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'DV7 Soccer Academy New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: DV7_SOCCER_NEW_YORK_LISTING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: DV7_SOCCER_NEW_YORK_LISTING_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'DV7 Soccer Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Competitive and school-development youth soccer programs, camps, clinics, and supplemental training' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Queens and nearby New York City soccer locations' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round 2026/2027 New York soccer programs' },
    description: { selector: 'body', mode: 'literal', value: DV7_SOCCER_NEW_YORK_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/dv7SoccerNewYork.html');

export const DV7_SOCCER_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
