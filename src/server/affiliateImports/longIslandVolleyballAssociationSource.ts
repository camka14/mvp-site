import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const LONG_ISLAND_VOLLEYBALL_HOME_URL = 'https://longislandvolleyball.com/';
export const LONG_ISLAND_VOLLEYBALL_CEDAR_URL = 'https://longislandvolleyball.com/cedar-beach/';
export const LONG_ISLAND_VOLLEYBALL_JUNIORS_URL = 'https://longislandvolleyball.com/juniors/';
export const LONG_ISLAND_VOLLEYBALL_CEDAR_SCHEDULE_URL = 'https://longislandvolleyball.com/cedar-schedule/';
export const LONG_ISLAND_VOLLEYBALL_CALENDAR_URL = 'https://longislandvolleyball.com/calendar/';
export const LONG_ISLAND_VOLLEYBALL_CONTACT_URL = 'https://longislandvolleyball.com/contact-us/';
export const LONG_ISLAND_VOLLEYBALL_FACEBOOK_URL = 'https://www.facebook.com/LongIslandVolleyballAssociation/';
export const LONG_ISLAND_VOLLEYBALL_INSTAGRAM_URL = 'https://www.instagram.com/livaupdate/';
export const LONG_ISLAND_VOLLEYBALL_LOGO_SOURCE_URL = 'https://liva.nyc3.digitaloceanspaces.com/wp-content/uploads/2023/10/16233733/logo_dark2.svg';
export const LONG_ISLAND_VOLLEYBALL_ORG_DESCRIPTION =
  'Long Island Volleyball Association (LIVA) is an adult and youth volleyball program founded in 1998. The stored homepage describes recreational and competitive leagues, 4s and juniors programs, structured scheduling, Cedar Beach registration, and a community-focused volleyball experience.';

export const LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '1b19742e-069b-4683-b81b-212061a05d3d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-long-island-volleyball-longislandvolleyball-com',
  intakeName: 'Long Island Volleyball',
  baseUrl: 'https://longislandvolleyball.com',
  complianceStatus: 'ALLOWED',
  runId: 'b0280a90-39d6-4e03-9b4f-5b558a2442bc',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:51.482Z',
  pages: [
    { url: LONG_ISLAND_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: LONG_ISLAND_VOLLEYBALL_CEDAR_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: LONG_ISLAND_VOLLEYBALL_JUNIORS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: LONG_ISLAND_VOLLEYBALL_CEDAR_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: LONG_ISLAND_VOLLEYBALL_CALENDAR_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: LONG_ISLAND_VOLLEYBALL_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://longislandvolleyball.com/cedar-beach-court-map/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://longislandvolleyball.com/cedar-beach-directions/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://longislandvolleyball.com/individual-signup', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://longislandvolleyball.com/leagues/cedar-beach-2026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://longislandvolleyball.com/tournaments', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const LONG_ISLAND_VOLLEYBALL_OFFICIAL_URLS = [
  LONG_ISLAND_VOLLEYBALL_HOME_URL,
  LONG_ISLAND_VOLLEYBALL_CEDAR_URL,
  LONG_ISLAND_VOLLEYBALL_JUNIORS_URL,
  LONG_ISLAND_VOLLEYBALL_CEDAR_SCHEDULE_URL,
  LONG_ISLAND_VOLLEYBALL_CALENDAR_URL,
  LONG_ISLAND_VOLLEYBALL_CONTACT_URL,
  'https://longislandvolleyball.com/cedar-beach-court-map/',
  'https://longislandvolleyball.com/cedar-beach-directions/',
  'https://longislandvolleyball.com/individual-signup',
  'https://longislandvolleyball.com/leagues/cedar-beach-2026',
  'https://longislandvolleyball.com/tournaments',
  LONG_ISLAND_VOLLEYBALL_FACEBOOK_URL,
  'https://twitter.com/livaupdate',
  LONG_ISLAND_VOLLEYBALL_INSTAGRAM_URL,
  'https://northbeachli.com/',
  'https://northbeachli.com/open-play/',
  'https://northbeachli.com/adult-tournament/',
  'https://northbeachli.com/parties/',
  'https://northbeachli.com/juniors-club/',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Long Island Volleyball Association',
  officialActionUrl: LONG_ISLAND_VOLLEYBALL_HOME_URL,
  sourceUrl: LONG_ISLAND_VOLLEYBALL_HOME_URL,
  organizerName: 'Long Island Volleyball Association',
  sportName: 'Volleyball',
  formatLabel: 'Adult recreational and competitive leagues, 4s, beach volleyball, and juniors programs',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026 leagues live with year-round adult and youth volleyball programming',
  scheduleText: 'The stored homepage says 2026 leagues are live, invites registration at Cedar Beach, and describes recreational and competitive leagues, 4s, juniors programs, structured scheduling, and beach volleyball. Calendar, league, schedule, court-map, directions, and registration pages are UNCHECKED.',
  statusText: 'Review-only volleyball organization profile; current league dates, schedules, Cedar Beach details, registration, and pricing require the official linked pages.',
  description: LONG_ISLAND_VOLLEYBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Adult', 'Youth', 'Beach', 'Leagues'],
  logoUrl: LONG_ISLAND_VOLLEYBALL_LOGO_SOURCE_URL,
  logoSourceUrl: LONG_ISLAND_VOLLEYBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile and says 2026 leagues are live but does not publish complete current dated event rows.',
    'Cedar Beach, calendar, league, schedule, court-map, directions, registration, and juniors pages are UNCHECKED; no EVENT or RENTAL candidate, venue, address, or price is inferred.',
    'The stored first-party LIVA logo was rendered from the official SVG and normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const LONG_ISLAND_VOLLEYBALL_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const LONG_ISLAND_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: LONG_ISLAND_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Long Island Volleyball Association' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: LONG_ISLAND_VOLLEYBALL_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: LONG_ISLAND_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Long Island Volleyball Association' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult recreational and competitive leagues, 4s, beach volleyball, and juniors programs' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: '2026 leagues live with year-round adult and youth volleyball programming' },
    description: { selector: 'body', mode: 'literal', value: LONG_ISLAND_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Adult, Youth, Beach, Leagues' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: LONG_ISLAND_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/longIslandVolleyballAssociation.html');

export const LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
