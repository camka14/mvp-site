import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ATLANTIC_VOLLEYBALL_HOME_URL = 'https://atlanticvba.com/';
export const ATLANTIC_VOLLEYBALL_TEAMS_URL = 'https://atlanticvba.com/club/46209';
export const ATLANTIC_VOLLEYBALL_ABOUT_URL = 'https://atlanticvba.com/club/aboutus';
export const ATLANTIC_VOLLEYBALL_PROGRAMS_URL = 'https://atlanticvba.com/club/whatweoffer';
export const ATLANTIC_VOLLEYBALL_FACILITIES_URL = 'https://atlanticvba.com/club/facilities';
export const ATLANTIC_VOLLEYBALL_TRYOUTS_URL = 'https://atlanticvba.com/club/tryouts';
export const ATLANTIC_VOLLEYBALL_SPRING_CLINICS_URL = 'https://atlanticvba.com/club/springclinics';
export const ATLANTIC_VOLLEYBALL_FALL_CLINICS_URL = 'https://atlanticvba.com/club/fallclinics';
export const ATLANTIC_VOLLEYBALL_ADULT_CLINIC_URL = 'https://atlanticvba.com/club/adultwomensclinic';
export const ATLANTIC_VOLLEYBALL_NEWS_URL = 'https://atlanticvba.com/club/clubnews';
export const ATLANTIC_VOLLEYBALL_CONTACT_URL = 'https://atlanticvba.com/club/contact';
export const ATLANTIC_VOLLEYBALL_STORE_URL = 'https://buoy4.com/pages/ava-atlantic-volleyball-academy';
export const ATLANTIC_VOLLEYBALL_INSTAGRAM_URL = 'https://www.instagram.com/atlantic.volleyball.academy/';
export const ATLANTIC_VOLLEYBALL_FACEBOOK_URL = 'https://www.facebook.com/AtlanticVolleyball/';
export const ATLANTIC_VOLLEYBALL_LOGO_SOURCE_URL = 'https://ssprodst.blob.core.windows.net/logos/352/67fd3347-f580-4e0c-9d45-a6a3bdb6313f-05-19-2025-07-35-14-396.png';
export const ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION =
  'Atlantic Volleyball Academy (AVA) is a premiere indoor volleyball program based on Long Island, NY for youth players through eighteen years of age.';

export const ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '4ad229d3-d60d-49d1-aba0-c300de5ad765',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-atlantic-volleyball-academy-atlanticvba-com',
  intakeName: 'Atlantic Volleyball Academy',
  baseUrl: 'https://atlanticvba.com',
  complianceStatus: 'ALLOWED',
  runId: '7dc35ec8-2aa4-4d55-b505-312d53c5b0f0',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:37.314Z',
  pages: [
    { url: ATLANTIC_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: ATLANTIC_VOLLEYBALL_TEAMS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_PROGRAMS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_FACILITIES_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_SPRING_CLINICS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_FALL_CLINICS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_ADULT_CLINIC_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: ATLANTIC_VOLLEYBALL_NEWS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://atlanticvba.com/terms-and-conditions', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://atlanticvba.com/privacy-policy', role: 'POLICY', robotsStatus: 'UNCHECKED' },
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

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Atlantic Volleyball Academy',
  officialActionUrl: ATLANTIC_VOLLEYBALL_HOME_URL,
  sourceUrl: ATLANTIC_VOLLEYBALL_HOME_URL,
  organizerName: 'Atlantic Volleyball Academy (AVA)',
  sportName: 'Volleyball',
  formatLabel: 'Indoor youth volleyball program, 2026 teams, summer clinics, and tryouts',
  city: 'Long Island, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026 teams and seasonal volleyball clinics',
  scheduleText: 'The stored allowed homepage links to 2026 Teams, Summer Clinics, an Adult Women’s Clinic, upcoming clinics, tryouts, facilities, and AVA programs, but does not capture complete current dated rows.',
  statusText: 'Review-only club profile; linked program, clinic, tryout, and team pages remain unchecked.',
  description: ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Youth', 'Academy', 'Clinics', 'Long Island'],
  logoUrl: ATLANTIC_VOLLEYBALL_LOGO_SOURCE_URL,
  logoSourceUrl: ATLANTIC_VOLLEYBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed homepage identifies Atlantic Volleyball Academy as an indoor youth volleyball program based on Long Island, NY, but does not publish a canonical street address.',
    'The official 2026 teams, clinic, tryout, facilities, and program links are retained as outbound URLs; their linked pages are UNCHECKED and no complete current dated EVENT or RENTAL row is captured.',
    'The homepage exposes a 2026 Teams link, but TEAM mappings are out of scope and no team candidate is created.',
    'The stored first-party AVA logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
  ],
};

export const ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES = [organizationCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ATLANTIC_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ATLANTIC_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Atlantic Volleyball Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ATLANTIC_VOLLEYBALL_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ATLANTIC_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Atlantic Volleyball Academy (AVA)' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor youth volleyball program, 2026 teams, summer clinics, and tryouts' },
    city: { selector: 'body', mode: 'literal', value: 'Long Island, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: '2026 teams and seasonal volleyball clinics' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Academy, Clinics, Long Island' },
    description: { selector: 'body', mode: 'literal', value: ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: ATLANTIC_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/atlanticVolleyballAcademy.html');

export const ATLANTIC_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
