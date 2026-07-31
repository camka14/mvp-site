import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const BIG_LEAGUE_ULTIMATE_URL = 'https://playbigleaguesports.com/ultimate-frisbee';
export const BIG_LEAGUE_ULTIMATE_HOME_URL = 'https://playbigleaguesports.com/';
export const BIG_LEAGUE_ULTIMATE_REGISTER_URL = 'http://bigleaguesports.leagueapps.com/leagues/activities/4996709-2026-summer-big-league-ultimate-frisbee-tues';
export const BIG_LEAGUE_ULTIMATE_LOGO_SOURCE_URL = 'https://playbigleaguesports.com/wp-content/uploads/2022/07/cropped-Screen-Shot-2022-07-29-at-1.47.00-PM-32x32.png';
export const BIG_LEAGUE_ULTIMATE_ORG_DESCRIPTION =
  'Big League Sports and Entertainment organizes recreational sports leagues and events, including the Summer 2026 Westchester Ultimate Frisbee Tuesday league.';

export const BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '8d45b719-ac4f-4603-8841-13f357ddc57e',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-ultimate-frisbee-playbigleaguesports-com',
  intakeName: 'Ultimate Frisbee',
  baseUrl: 'https://playbigleaguesports.com',
  complianceStatus: 'ALLOWED',
  runId: '2a4917da-99b5-40a8-b7c1-2f2454150e12',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:07.556Z',
  pages: [
    { url: BIG_LEAGUE_ULTIMATE_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://playbigleaguesports.com/new-league-alert-ultimate-frisbee', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://playbigleaguesports.com/events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: BIG_LEAGUE_ULTIMATE_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://playbigleaguesports.com/about', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://playbigleaguesports.com/soccer', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://playbigleaguesports.com/volleyball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://playbigleaguesports.com/pickleball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

const eventCandidate = {
  listingKind: 'EVENT' as const,
  title: '2026 Summer Westchester Ultimate Frisbee (Tues)',
  officialActionUrl: BIG_LEAGUE_ULTIMATE_REGISTER_URL,
  sourceUrl: BIG_LEAGUE_ULTIMATE_URL,
  organizerName: 'Big League Sports and Entertainment',
  sportName: 'Ultimate Frisbee',
  formatLabel: 'Summer ultimate frisbee league',
  city: 'Westchester, New York',
  venueName: null,
  address: null,
  startsAt: null,
  endsAt: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Started July 7, 2026; Tuesdays; in session as captured July 29, 2026',
  scheduleText: 'The stored allowed listing identifies a Summer 2026 Westchester Ultimate Frisbee Tuesday league with a July 7 start date and says it was in session when captured. It does not publish a start time, end date, venue, address, or price.',
  priceText: null,
  statusText: 'Review-only current-season league event with official LeagueApps registration link.',
  description: 'The 2026 Summer Westchester Ultimate Frisbee Tuesday league is a current-season recreational ultimate frisbee league in Westchester, New York, with registration through the official Big League Sports LeagueApps page.',
  tags: ['Event', 'Ultimate Frisbee', 'League', 'Summer 2026', 'Westchester'],
  warnings: [
    'The stored allowed listing supplies July 7, 2026 as the start date and says the league was in session at capture, but no time, end date, venue, address, or price is published; the start uses local midnight only as a date boundary.',
    'The Spring 2026 Tuesday league started April 21 and is marked Completed in stored evidence, so it is withheld as past.',
    'The official LeagueApps registration URL is retained as an outbound action link; the linked registration, home, events, and other program pages are UNCHECKED.',
    'TEAM mappings are out of scope and no team candidate is created.',
  ],
};

export const BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES = [eventCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const BIG_LEAGUE_ULTIMATE_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: BIG_LEAGUE_ULTIMATE_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: '2026 Summer Westchester Ultimate Frisbee (Tues)' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BIG_LEAGUE_ULTIMATE_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: BIG_LEAGUE_ULTIMATE_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Big League Sports and Entertainment' },
    sportName: { selector: 'body', mode: 'literal', value: 'Ultimate Frisbee' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Summer ultimate frisbee league' },
    city: { selector: 'body', mode: 'literal', value: 'Westchester, New York' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Started July 7, 2026; Tuesdays; in session as captured July 29, 2026' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Ultimate Frisbee, League, Summer 2026, Westchester' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/bigLeagueUltimateFrisbee.html');

export const BIG_LEAGUE_ULTIMATE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
