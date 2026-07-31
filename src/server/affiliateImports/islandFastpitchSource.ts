import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ISLAND_FASTPITCH_HOME_URL = 'https://www.islandfastpitch.com/';
export const ISLAND_FASTPITCH_TOURNAMENTS_URL = 'https://www.islandfastpitch.com/tournaments';
export const ISLAND_FASTPITCH_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/b51729_45c63d0120f14bfb929013927fcc3cb8~mv2.png/v1/crop/x_0,y_9,w_500,h_482/fill/w_95,h_91,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Island%20Fastpitch%202026%20New%20Logo-1-white%20(3).png';
export const ISLAND_FASTPITCH_ORG_DESCRIPTION =
  'Island Fastpitch is a Long Island softball community and league with tournaments, events and clinics, and age-group play for 8U-10U, 12U, and 14U-18U.';

export const ISLAND_FASTPITCH_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '2ce484c8-7d54-4e9c-adde-dd98013a5188',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-home-islandfastpitch-com',
  intakeName: 'Home',
  baseUrl: 'https://www.islandfastpitch.com',
  complianceStatus: 'ALLOWED',
  runId: 'cfdb3d9b-a9df-4677-b9ba-10477396e61b',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:03.973Z',
  pages: [
    { url: ISLAND_FASTPITCH_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.islandfastpitch.com/fields', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/hotel-accomodations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/information', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/player-ads', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/player-waivers', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/shop', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/team-rosters', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/usssa', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/events-clinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/fall-league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/spring-league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/summer-league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: ISLAND_FASTPITCH_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/clinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/league-rules-and-policy', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.islandfastpitch.com/service-page/best-of-the-best-elite-league-tryouts', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 1 },
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

export const ISLAND_FASTPITCH_OFFICIAL_URLS = [
  ISLAND_FASTPITCH_HOME_URL,
  'https://www.islandfastpitch.com/league',
  'https://www.islandfastpitch.com/spring-league',
  'https://www.islandfastpitch.com/summer-league',
  'https://www.islandfastpitch.com/fall-league',
  ISLAND_FASTPITCH_TOURNAMENTS_URL,
  'https://www.islandfastpitch.com/events-clinics',
  'https://www.islandfastpitch.com/clinics',
  'https://www.islandfastpitch.com/shop',
  'https://www.islandfastpitch.com/fields',
  'https://www.islandfastpitch.com/information',
  'https://www.islandfastpitch.com/hotel-accomodations',
  'https://www.islandfastpitch.com/league-rules-and-policy',
  'https://www.islandfastpitch.com/player-ads',
  'https://www.islandfastpitch.com/player-waivers',
  'https://www.islandfastpitch.com/team-rosters',
  'https://www.islandfastpitch.com/usssa',
  'https://www.islandfastpitch.com/contact',
  'https://www.facebook.com/islandfastpitch',
  'https://www.instagram.com/islandfastpitch',
  'https://www.tiktok.com/@islandfastpitchli?_r=1&_t=ZP-936VrECcVKx',
  'https://www.youtube.com/@Islandfastpitch',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Island Fastpitch',
  officialActionUrl: ISLAND_FASTPITCH_HOME_URL,
  sourceUrl: ISLAND_FASTPITCH_HOME_URL,
  organizerName: 'Island Fastpitch',
  sportName: 'Softball',
  formatLabel: 'Softball leagues, tournaments, events, and clinics for 8U-10U, 12U, and 14U-18U',
  city: null,
  venueName: null,
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing Long Island softball leagues and programs',
  scheduleText: 'The stored homepage describes upcoming events and clinics, tournaments, and league play. It lists 8U-10U, 12U, and 14U-18U softball rules, including age-group-specific ball sizes and pitching distances.',
  statusText: 'Review-only softball club and league profile; current league, tournament, clinic, field, and registration details require the official linked pages.',
  description: ISLAND_FASTPITCH_ORG_DESCRIPTION,
  tags: ['Club', 'Softball', 'Youth', 'Tournaments', 'Clinics'],
  logoUrl: ISLAND_FASTPITCH_LOGO_SOURCE_URL,
  logoSourceUrl: ISLAND_FASTPITCH_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile for Island Fastpitch and describes Long Island softball league programming across 8U-10U, 12U, and 14U-18U divisions.',
    'League, tournament, event, clinic, field, registration, team-roster, and other detail pages are UNCHECKED; the homepage has no complete current dated event row or canonical venue address, so no EVENT, TEAM, or RENTAL candidate is inferred.',
    'The stored first-party white Island Fastpitch logo candidate was normalized to an opaque 1024px square PNG on a dark background.',
  ],
};

export const ISLAND_FASTPITCH_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ISLAND_FASTPITCH_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ISLAND_FASTPITCH_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Island Fastpitch' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ISLAND_FASTPITCH_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ISLAND_FASTPITCH_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Island Fastpitch' },
    sportName: { selector: 'body', mode: 'literal', value: 'Softball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Softball, Youth, Tournaments, Clinics' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: ISLAND_FASTPITCH_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/islandFastpitch.html');

export const ISLAND_FASTPITCH_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: ISLAND_FASTPITCH_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
