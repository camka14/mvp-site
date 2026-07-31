import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FIVE_ONE_SIX_ELITE_HOME_URL = 'https://www.516elitevolleyball.com/';
export const FIVE_ONE_SIX_ELITE_CLUB_INFO_URL = 'https://www.516elitevolleyball.com/club-info';
export const FIVE_ONE_SIX_ELITE_TRYOUTS_URL = 'https://www.516elitevolleyball.com/clubtryouts';
export const FIVE_ONE_SIX_ELITE_SUMMER_URL = 'https://www.516elitevolleyball.com/summer-indoor';
export const FIVE_ONE_SIX_ELITE_ABOUT_URL = 'https://www.516elitevolleyball.com/about-us';
export const FIVE_ONE_SIX_ELITE_BEACH_URL = 'https://www.516elitevolleyball.com/beachvolleyball';
export const FIVE_ONE_SIX_ELITE_CONTACT_URL = 'https://www.516elitevolleyball.com/contact';
export const FIVE_ONE_SIX_ELITE_INSTAGRAM_URL = 'https://www.instagram.com/516elitevolleyball';
export const FIVE_ONE_SIX_ELITE_FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61562004621687';
export const FIVE_ONE_SIX_ELITE_TIKTOK_URL = 'https://www.tiktok.com/@516elitevolleyball';
export const FIVE_ONE_SIX_ELITE_PAYMENT_URL = 'https://buy.stripe.com/7sI8xJgUI2wB4bC000';
export const FIVE_ONE_SIX_ELITE_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/03dc13_bf3475015e2a41d39821ef7ed685b7c4~mv2.jpg/v1/fill/w_1170,h_1093,al_c/03dc13_bf3475015e2a41d39821ef7ed685b7c4~mv2.jpg';
export const FIVE_ONE_SIX_ELITE_ORG_DESCRIPTION =
  '516 Elite Volleyball is a Nassau County, Long Island, NY juniors volleyball program with practice locations in the Syosset area. The stored homepage describes a competitive 11U-17U juniors club, year-round clinics, camps, private lessons, and USA Volleyball, GEVA, and AAU affiliations.';

export const FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'f7e99805-40b3-4be1-9de5-c7ff5579c004',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-516-elite-volleyball-home-516elitevolleyball-com',
  intakeName: '516 Elite Volleyball',
  baseUrl: 'https://www.516elitevolleyball.com',
  complianceStatus: 'ALLOWED',
  runId: 'c2f32c8b-b7e5-4e78-b45c-ff4f903d7e08',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:22.157Z',
  pages: [
    { url: FIVE_ONE_SIX_ELITE_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: FIVE_ONE_SIX_ELITE_CLUB_INFO_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: FIVE_ONE_SIX_ELITE_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: FIVE_ONE_SIX_ELITE_SUMMER_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: FIVE_ONE_SIX_ELITE_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: FIVE_ONE_SIX_ELITE_BEACH_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: FIVE_ONE_SIX_ELITE_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/freeclinic', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/middleschoolclinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/category/all-products', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/12black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/12ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/13black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/13ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/13white', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/13regional1', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/13regional2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/14black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/14ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/14white', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/14silver', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/15black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/15ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/15white', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/15silver', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/15pearl', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/16black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/16ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/17ruby', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/17black', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/commitment', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/offerdecision', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.516elitevolleyball.com/product-page/black-hoodie', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const FIVE_ONE_SIX_ELITE_OFFICIAL_URLS = [
  FIVE_ONE_SIX_ELITE_HOME_URL,
  FIVE_ONE_SIX_ELITE_CLUB_INFO_URL,
  FIVE_ONE_SIX_ELITE_TRYOUTS_URL,
  FIVE_ONE_SIX_ELITE_SUMMER_URL,
  FIVE_ONE_SIX_ELITE_ABOUT_URL,
  FIVE_ONE_SIX_ELITE_BEACH_URL,
  FIVE_ONE_SIX_ELITE_CONTACT_URL,
  FIVE_ONE_SIX_ELITE_PAYMENT_URL,
  FIVE_ONE_SIX_ELITE_INSTAGRAM_URL,
  FIVE_ONE_SIX_ELITE_FACEBOOK_URL,
  FIVE_ONE_SIX_ELITE_TIKTOK_URL,
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: '516 Elite Volleyball',
  officialActionUrl: FIVE_ONE_SIX_ELITE_HOME_URL,
  sourceUrl: FIVE_ONE_SIX_ELITE_HOME_URL,
  organizerName: '516 Elite Volleyball',
  sportName: 'Volleyball',
  formatLabel: '11U-17U competitive juniors club, year-round clinics, camps, and private lessons',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026-2027 juniors club tryout registration and year-round volleyball programs',
  scheduleText: 'The stored homepage says 2026-2027 club tryout details and registration are open, 2026 summer indoor programs are open for registration, and the program offers a competitive 11U-17U juniors club plus year-round clinics, camps, and private lessons. It describes Nassau County on Long Island, NY with practice locations in the Syosset area but gives no street address or current schedule rows.',
  statusText: 'Review-only volleyball club profile; current tryout, summer-program, team, practice, location, and fee details require the official linked pages.',
  description: FIVE_ONE_SIX_ELITE_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Youth', 'Juniors', 'USA Volleyball', 'GEVA', 'AAU'],
  logoUrl: FIVE_ONE_SIX_ELITE_LOGO_SOURCE_URL,
  logoSourceUrl: FIVE_ONE_SIX_ELITE_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile; 2026-2027 tryout and 2026 summer-program statements do not include complete dated event rows.',
    'Team, club-info, tryout, summer, clinic, practice, product, and contact pages are UNCHECKED; no EVENT, TEAM, price, street address, or current venue row is inferred.',
    'The stored first-party FiveOneSix Elite Volleyball wordmark was normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const FIVE_ONE_SIX_ELITE_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FIVE_ONE_SIX_ELITE_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FIVE_ONE_SIX_ELITE_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: '516 Elite Volleyball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FIVE_ONE_SIX_ELITE_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FIVE_ONE_SIX_ELITE_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: '516 Elite Volleyball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: '11U-17U competitive juniors club, year-round clinics, camps, and private lessons' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: '2026-2027 juniors club tryout registration and year-round volleyball programs' },
    description: { selector: 'body', mode: 'literal', value: FIVE_ONE_SIX_ELITE_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Juniors, USA Volleyball, GEVA, AAU' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: FIVE_ONE_SIX_ELITE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveOneSixEliteVolleyball.html');

export const FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
