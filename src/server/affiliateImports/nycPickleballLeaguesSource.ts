import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_PICKLEBALL_HOME_URL = 'https://www.nycpickleball.com/';
export const NYC_PICKLEBALL_LEAGUES_URL = 'https://www.nycpickleball.com/leagues';
export const NYC_PICKLEBALL_BOOK_A_LESSON_URL = 'https://www.nycpickleball.com/bookalesson';
export const NYC_PICKLEBALL_LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/61c3936b9e2bca73236e3c9c/2ef514f5-951d-482b-9306-e555ffc39854/stacked_logo_black.png?format=1500w';

const LEVEL_1_REGISTRATION_URL = 'https://nycpickleball.podplay.app/community/series/019d8908-447c-7fff-9029-5032eeddd621';
const LEVEL_2_REGISTRATION_URL = 'https://nycpickleball.podplay.app/community/series/019d60b4-ef82-7dda-a795-7725592aa891';
const LEVEL_2_PLUS_REGISTRATION_URL = 'https://nycpickleball.podplay.app/community/series/019d8906-f34b-7992-8082-99471e55ec8f';
const LEVEL_3_REGISTRATION_URL = 'https://nycpickleball.podplay.app/community/series/019d6ae7-7649-7880-b4a0-c526a4c8e3e0';
const LEVEL_4_REGISTRATION_URL = 'https://nycpickleball.podplay.app/community/series/019d6aeb-a7ea-7880-b4a5-d1c13cfd7f3e';
const GOTHAM_PICKLEBALL_URL = 'https://www.gotham-pickleball.com/';
const GOTHAM_PICKLEBALL_ADDRESS = '5-25 46th Ave, Long Island City, NY 11101';

export const NYC_PICKLEBALL_ORG_DESCRIPTION =
  'NYC Pickleball runs coed individual ladder leagues in New York City and Queens, with weekly doubles play, rotating partners, and skill-based levels.';

export const NYC_PICKLEBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '95f99887-8218-4392-a5f3-f4fa1b535780',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-pickleball-leagues-nycpickleball-com',
  intakeName: 'NYC Pickleball Leagues',
  baseUrl: 'https://www.nycpickleball.com',
  complianceStatus: 'ALLOWED',
  runId: 'f7c39f1a-a8fc-44ee-9e37-ccd71e01abc9',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:48:50.873Z',
  pages: [
    { url: NYC_PICKLEBALL_LEAGUES_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NYC_PICKLEBALL_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycpickleball.com/events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NYC_PICKLEBALL_BOOK_A_LESSON_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycpickleball.com/contact-us', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycpickleball.com/terms-of-service', role: 'POLICY', robotsStatus: 'UNCHECKED' },
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

const staleLeagueWarning = 'The stored Spring/Summer 2026 league row has a past start date as of 2026-07-31; it is represented as a no-fixed-date program summary and no new date is inferred.';

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'NYC Pickleball',
  officialActionUrl: NYC_PICKLEBALL_LEAGUES_URL,
  sourceUrl: NYC_PICKLEBALL_LEAGUES_URL,
  organizerName: 'NYC Pickleball',
  sportName: 'Pickleball',
  formatLabel: 'Coed individual ladder leagues with rotating doubles partners',
  city: 'New York City',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'NYC Pickleball ladder leagues',
  scheduleText: 'The stored leagues page describes coed individual ladder leagues in Brooklyn and Queens, with weekly two-hour doubles games, rotating partners, and skill-based levels.',
  statusText: 'Review-only club profile; current league seasons and lesson details require a current captured page.',
  description: NYC_PICKLEBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Pickleball', 'Adult', 'League', 'New York City'],
  logoUrl: NYC_PICKLEBALL_LOGO_SOURCE_URL,
  logoSourceUrl: NYC_PICKLEBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored league rows list Spring/Summer 2026 starts that are past as of 2026-07-31; current season dates are not inferred.',
    'The stored events and lesson pages are UNCHECKED; no separate event or rental rows are created from them.',
    'No single street address is assigned because the organization operates leagues at multiple venues.',
    'No TEAM candidate is created because team mappings are out of scope.',
    'The stored first-party NYC Pickleball stacked logo candidate was normalized to an opaque 1024px PNG.',
  ],
};

type LeagueCandidateParams = {
  title: string;
  officialActionUrl: string;
  venueName: string;
  city: string | null;
  address: string | null;
  scheduleText: string;
  dateDisplayText: string;
  skillLevel: string;
  description: string;
};

const leagueCandidate = (params: LeagueCandidateParams) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: NYC_PICKLEBALL_LEAGUES_URL,
  organizerName: 'NYC Pickleball',
  sportName: 'Pickleball',
  formatLabel: 'Coed individual ladder league',
  city: params.city,
  venueName: params.venueName,
  address: params.address,
  timeZone: 'America/New_York',
  startsAt: null,
  endsAt: null,
  dateDisplayMode: 'NO_FIXED_DATE' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  skillLevel: params.skillLevel,
  participantOptionsText: 'Coed individual registration; players compete in doubles games with rotating partners on a four-court ladder.',
  statusText: 'Review-only evergreen league summary; the stored 2026 row is past as of 2026-07-31 and current registration dates require a fresh official capture.',
  description: params.description,
  tags: ['Event', 'Pickleball', 'League', 'Adult', 'Coed'],
  warnings: [
    staleLeagueWarning,
    'The stored page does not publish a public price for this league.',
  ],
});

export const NYC_PICKLEBALL_LEAGUE_CANDIDATES = [
  leagueCandidate({
    title: 'NYC Pickleball Level 1 Ladder League',
    officialActionUrl: LEVEL_1_REGISTRATION_URL,
    venueName: 'Major R. Owens Community Center',
    city: null,
    address: null,
    scheduleText: 'Sundays 5:00-7:00 PM at Major R. Owens Community Center. The stored page says this row starts Sunday, June 14, 2026.',
    dateDisplayText: 'No current season date; stored Spring/Summer 2026 row started June 14, 2026',
    skillLevel: 'DUPR 2.5 and below or no DUPR',
    description: 'NYC Pickleball describes a Level 1 coed individual ladder league for players with no DUPR or a DUPR of 2.5 and below. The stored row lists Sunday evening play from 5:00-7:00 PM at Major R. Owens Community Center and links to official PodPlay registration.',
  }),
  leagueCandidate({
    title: 'NYC Pickleball Level 2 Ladder League',
    officialActionUrl: LEVEL_2_REGISTRATION_URL,
    venueName: 'Gotham Pickleball',
    city: 'Long Island City, NY',
    address: GOTHAM_PICKLEBALL_ADDRESS,
    scheduleText: 'Saturdays 11:00 AM-1:00 PM or 1:00-3:00 PM at Gotham Pickleball. The stored page says this row starts Saturday, May 30, 2026.',
    dateDisplayText: 'No current season date; stored Spring/Summer 2026 row started May 30, 2026',
    skillLevel: 'DUPR 3.0 and below or no DUPR',
    description: 'NYC Pickleball describes a Level 2 coed individual ladder league for players with no DUPR or a DUPR of 3.0 and below. The stored row lists Saturday play at Gotham Pickleball in Long Island City and links to official PodPlay registration.',
  }),
  leagueCandidate({
    title: 'NYC Pickleball Level 2+ Ladder League',
    officialActionUrl: LEVEL_2_PLUS_REGISTRATION_URL,
    venueName: 'Major R. Owens Community Center',
    city: null,
    address: null,
    scheduleText: 'Mondays 6:00-8:00 PM at Major R. Owens Community Center. The stored page says this row starts Monday, June 1, 2026.',
    dateDisplayText: 'No current season date; stored Spring/Summer 2026 row started June 1, 2026',
    skillLevel: 'DUPR 2.5-3.5',
    description: 'NYC Pickleball describes a Level 2+ coed individual ladder league for players in the 2.5-3.5 DUPR range. The stored row lists Monday night play from 6:00-8:00 PM at Major R. Owens Community Center and links to official PodPlay registration.',
  }),
  leagueCandidate({
    title: 'NYC Pickleball Level 3 Ladder League',
    officialActionUrl: LEVEL_3_REGISTRATION_URL,
    venueName: 'Gotham Pickleball',
    city: 'Long Island City, NY',
    address: GOTHAM_PICKLEBALL_ADDRESS,
    scheduleText: 'Sundays 11:00 AM-1:00 PM or 1:00-3:00 PM at Gotham Pickleball. The stored page says this row starts Sunday, May 31, 2026.',
    dateDisplayText: 'No current season date; stored Spring/Summer 2026 row started May 31, 2026',
    skillLevel: 'DUPR 3.0-3.5',
    description: 'NYC Pickleball describes a Level 3 coed individual ladder league for players in the 3.0-3.5 DUPR range. The stored row lists Sunday play at Gotham Pickleball in Long Island City and links to official PodPlay registration.',
  }),
  leagueCandidate({
    title: 'NYC Pickleball Level 4 Ladder League',
    officialActionUrl: LEVEL_4_REGISTRATION_URL,
    venueName: 'Gotham Pickleball',
    city: 'Long Island City, NY',
    address: GOTHAM_PICKLEBALL_ADDRESS,
    scheduleText: 'Mondays at a 6:00 PM option or 8:00-10:00 PM at Gotham Pickleball; the stored page displays the first option as "6- PM". The stored page says this row starts Monday, June 1, 2026.',
    dateDisplayText: 'No current season date; stored Spring/Summer 2026 row started June 1, 2026',
    skillLevel: 'DUPR 3.5-4.0+',
    description: 'NYC Pickleball describes a Level 4 coed individual ladder league for players in the 3.5+ DUPR range. The stored row lists Monday night play at Gotham Pickleball in Long Island City and links to official PodPlay registration.',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_PICKLEBALL_MANUAL_CANDIDATES = [organizationCandidate, ...NYC_PICKLEBALL_LEAGUE_CANDIDATES] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_PICKLEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NYC_PICKLEBALL_LEAGUES_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Pickleball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_PICKLEBALL_LEAGUES_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_PICKLEBALL_LEAGUES_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Pickleball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Coed individual ladder leagues with rotating doubles partners' },
    city: { selector: 'body', mode: 'literal', value: 'New York City' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'NO_FIXED_DATE' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'NYC Pickleball ladder leagues' },
    description: { selector: 'body', mode: 'literal', value: NYC_PICKLEBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Pickleball, League, New York City' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYC_PICKLEBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycPickleballLeagues.html');

export const NYC_PICKLEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NYC_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
