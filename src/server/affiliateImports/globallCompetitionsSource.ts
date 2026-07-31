import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const GLOBALL_COMPETITIONS_HOME_URL = 'https://globallcompetitions.com/';
export const GLOBALL_COMPETITIONS_MLS_GO_URL = 'https://globallcompetitions.com/mls-go/';
export const GLOBALL_COMPETITIONS_TOURNAMENTS_URL = 'https://globallcompetitions.com/tournaments/';
export const GLOBALL_COMPETITIONS_LEAGUES_URL = 'https://globallcompetitions.com/leagues/';
export const GLOBALL_COMPETITIONS_LOCATIONS_URL = 'https://globallcompetitions.com/locations/';
export const GLOBALL_COMPETITIONS_CONTACT_URL = 'https://globallcompetitions.com/contact/';
export const GLOBALL_COMPETITIONS_STORE_URL = 'https://globallcompetitions.square.site/';
export const GLOBALL_COMPETITIONS_BEACH_BASH_URL = 'https://beachbashli.com/';
export const GLOBALL_COMPETITIONS_KICK_OFF_URL = 'https://kickoffli.com/';
export const GLOBALL_COMPETITIONS_CAREERS_URL = 'https://globallcompetitions.com/careers/';
export const GLOBALL_COMPETITIONS_REFUND_URL = 'https://globallcompetitions.com/refund-policy/';
export const GLOBALL_COMPETITIONS_FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61557465693458';
export const GLOBALL_COMPETITIONS_INSTAGRAM_URL = 'https://www.instagram.com/globall.competitions/';
export const GLOBALL_COMPETITIONS_LOGO_SOURCE_URL = 'https://b3978837.smushcdn.com/3978837/wp-content/uploads/2022/03/globall_globe.png?lossy=2&strip=1&webp=1';
export const GLOBALL_COMPETITIONS_ORG_DESCRIPTION =
  'Globall Competitions has over 30 years of experience organizing elite to recreational sporting events for youths and adults, operating soccer tournaments and leagues in the New York region.';

export const GLOBALL_COMPETITIONS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'eb7490d3-e094-439c-b474-cc55d7aaafbc',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-competitions-globallcompetitions-com',
  intakeName: 'Competitions',
  baseUrl: 'https://globallcompetitions.com',
  complianceStatus: 'ALLOWED',
  runId: '2975283c-b4aa-464f-a70e-e448c5f64f02',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:42.655Z',
  pages: [
    { url: GLOBALL_COMPETITIONS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: GLOBALL_COMPETITIONS_MLS_GO_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: GLOBALL_COMPETITIONS_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: GLOBALL_COMPETITIONS_LEAGUES_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: GLOBALL_COMPETITIONS_LOCATIONS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: GLOBALL_COMPETITIONS_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/news', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/category/league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/category/tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/fright-night-soccer-tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: GLOBALL_COMPETITIONS_REFUND_URL, role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/mls-go-comes-to-long-island', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://globallcompetitions.com/game-on-new-sports-complex-in-nassau', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Globall Competitions',
  officialActionUrl: GLOBALL_COMPETITIONS_HOME_URL,
  sourceUrl: GLOBALL_COMPETITIONS_HOME_URL,
  organizerName: 'Globall Competitions',
  sportName: 'Soccer',
  formatLabel: 'Youth and adult soccer tournaments and leagues',
  city: 'New York region',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Year-round soccer tournaments and leagues',
  scheduleText: 'The stored allowed homepage describes MLS GO at Port Jefferson for Fall 2026, Beach Bash Sand Soccer, Fall Kick Off Classic, Winter Kickfest Youth Leagues, year-round tournaments, and youth and adult indoor leagues, but does not capture complete current dated rows.',
  statusText: 'Review-only competition organizer profile; linked league, tournament, location, and registration pages remain unchecked.',
  description: GLOBALL_COMPETITIONS_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Tournaments', 'Leagues', 'Youth', 'Adult', 'New York region'],
  logoUrl: null,
  logoSourceUrl: GLOBALL_COMPETITIONS_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed homepage identifies Globall Competitions as a New York-region soccer tournament and league organizer but does not publish a canonical street address.',
    'The homepage shows event/program names and one season label, but no complete current date, time, venue, or registration row; no EVENT or RENTAL candidate is emitted.',
    'Tournament, league, MLS GO, location, and detail pages are UNCHECKED and remain outbound-only; linked third-party Beach Bash and Kick Off Classic pages are not retried.',
    'The only stored branding candidate is a favicon globe image rather than a clearly identified full official logo; logo disposition is MANUAL_REVIEW.',
  ],
};

export const GLOBALL_COMPETITIONS_MANUAL_CANDIDATES = [organizationCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const GLOBALL_COMPETITIONS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: GLOBALL_COMPETITIONS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Globall Competitions' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: GLOBALL_COMPETITIONS_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: GLOBALL_COMPETITIONS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Globall Competitions' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth and adult soccer tournaments and leagues' },
    city: { selector: 'body', mode: 'literal', value: 'New York region' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round soccer tournaments and leagues' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Tournaments, Leagues, Youth, Adult, New York region' },
    description: { selector: 'body', mode: 'literal', value: GLOBALL_COMPETITIONS_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: GLOBALL_COMPETITIONS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/globallCompetitions.html');

export const GLOBALL_COMPETITIONS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: GLOBALL_COMPETITIONS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
