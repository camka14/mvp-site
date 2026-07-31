import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOCCER_COLISEUM_SCHEDULE_URL = 'https://soccercoliseum.com/tournaments/schedule';
export const SOCCER_COLISEUM_HOME_URL = 'https://soccercoliseum.com/';
export const SOCCER_COLISEUM_TOURNAMENTS_URL = 'https://soccercoliseum.com/tournaments/';
export const SOCCER_COLISEUM_YOUTH_LEAGUES_URL = 'https://soccercoliseum.com/youth-leagues/';
export const SOCCER_COLISEUM_ADULT_LEAGUES_URL = 'https://soccercoliseum.com/adult-leagues/';
export const SOCCER_COLISEUM_YOUTH_TRAINING_URL = 'https://soccercoliseum.com/youth-training/';
export const SOCCER_COLISEUM_CAMPS_URL = 'https://soccercoliseum.com/camps/';
export const SOCCER_COLISEUM_RENTALS_URL = 'https://soccercoliseum.com/rentals/';
export const SOCCER_COLISEUM_ABOUT_URL = 'https://soccercoliseum.com/about/';
export const SOCCER_COLISEUM_CONTACT_URL = 'https://soccercoliseum.com/contact/';
export const SOCCER_COLISEUM_LOGO_SOURCE_URL = 'https://soccercoliseum.com/logo-transparent.png';
export const SOCCER_COLISEUM_ORG_DESCRIPTION =
  'The Soccer Coliseum is an indoor youth soccer tournament arena offering 5v5 competition, certified referees, awards, leagues, training, camps, and rentals.';

export const SOCCER_COLISEUM_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'e53d8d60-ec60-4b7b-a8b4-6a18c05e5670',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-tournament-schedule-soccercoliseum-com',
  intakeName: 'Tournament Schedule',
  baseUrl: 'https://soccercoliseum.com',
  complianceStatus: 'ALLOWED',
  runId: '446e15cf-0277-4a42-9317-96a06c5f627f',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:26.668Z',
  pages: [
    { url: SOCCER_COLISEUM_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: SOCCER_COLISEUM_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_YOUTH_LEAGUES_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_ADULT_LEAGUES_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_YOUTH_TRAINING_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_RENTALS_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: SOCCER_COLISEUM_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://soccercoliseum.com/class-policy/', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://soccercoliseum.com/refund-and-liability-policy/', role: 'POLICY', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'The Soccer Coliseum',
  officialActionUrl: SOCCER_COLISEUM_SCHEDULE_URL,
  sourceUrl: SOCCER_COLISEUM_SCHEDULE_URL,
  organizerName: 'The Soccer Coliseum',
  sportName: 'Soccer',
  formatLabel: 'Indoor youth 5v5 soccer tournaments, leagues, training, camps, and rentals',
  city: 'Teaneck, NJ',
  venueName: 'Teaneck Armory, NJ',
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Winter indoor tournament arena; Winter 2026-2027 dates coming soon',
  scheduleText: 'The stored allowed schedule page describes an indoor 5v5 tournament arena with 4 + goalie, certified referees, 1st and 2nd place awards, and a Tournament At A Glance section naming Teaneck Armory, NJ. It says the displayed previous Winter schedule is for reference and Winter 2026-2027 dates are coming soon.',
  statusText: 'Review-only tournament-arena profile; current tournament dates and rental inventory are withheld until stored official pages publish them.',
  description: SOCCER_COLISEUM_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Tournament', 'League', 'Indoor', 'Teaneck'],
  logoUrl: SOCCER_COLISEUM_LOGO_SOURCE_URL,
  logoSourceUrl: SOCCER_COLISEUM_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed schedule names Teaneck Armory, NJ but does not publish a canonical street address; address remains unset.',
    'The displayed 35-tournament schedule is explicitly the previous Winter season and Winter 2026-2027 dates are coming soon; all past tournament rows are withheld as stale.',
    'Tournament overview, leagues, camps, training, rentals, about, contact, and policy pages are UNCHECKED; no EVENT, RENTAL, or TEAM candidate is created.',
    'The stored first-party Soccer Coliseum logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
  ],
};

export const SOCCER_COLISEUM_MANUAL_CANDIDATES = [organizationCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOCCER_COLISEUM_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: SOCCER_COLISEUM_SCHEDULE_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'The Soccer Coliseum' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOCCER_COLISEUM_SCHEDULE_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: SOCCER_COLISEUM_SCHEDULE_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'The Soccer Coliseum' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor youth 5v5 soccer tournaments, leagues, training, camps, and rentals' },
    city: { selector: 'body', mode: 'literal', value: 'Teaneck, NJ' },
    venueName: { selector: 'body', mode: 'literal', value: 'Teaneck Armory, NJ' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Winter indoor tournament arena; Winter 2026-2027 dates coming soon' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Tournament, League, Indoor, Teaneck' },
    description: { selector: 'body', mode: 'literal', value: SOCCER_COLISEUM_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: SOCCER_COLISEUM_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/soccerColiseum.html');

export const SOCCER_COLISEUM_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: SOCCER_COLISEUM_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
