import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NORTHWELL_ICE_CENTER_HOCKEY_URL = 'https://northwellhealthicecenter.com/hockey';
export const NORTHWELL_ICE_CENTER_HOME_URL = 'https://northwellhealthicecenter.com/';
export const NORTHWELL_ICE_CENTER_GIRLS_ELITE_URL = 'https://northwellhealthicecenter.com/girlselite';
export const NORTHWELL_ICE_CENTER_HOUSE_PROGRAMS_URL = 'https://northwellhealthicecenter.com/hockeyprograms';
export const NORTHWELL_ICE_CENTER_ADULT_LEAGUE_URL = 'https://northwellhealthicecenter.com/adultleague';
export const NORTHWELL_ICE_CENTER_CLINICS_URL = 'https://northwellhealthicecenter.com/clinics';
export const NORTHWELL_ICE_CENTER_LOGO_SOURCE_URL = 'https://northwellhealthicecenter.com/logo_images/white_logo.png';
export const NORTHWELL_ICE_CENTER_ORG_DESCRIPTION =
  'Northwell Health Ice Center is a Long Island hockey destination with youth house programs, elite girls hockey, adult recreation hockey, skills clinics, and coaching and training opportunities.';

export const NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '575d4d07-1a6a-47a3-a574-1a2891175f58',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-hockey-northwellhealthicecenter-com',
  intakeName: 'Hockey',
  baseUrl: 'https://northwellhealthicecenter.com',
  complianceStatus: 'ALLOWED',
  runId: 'e263e77d-93a1-437d-90a3-78f138c4d5be',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:54.762Z',
  pages: [
    { url: NORTHWELL_ICE_CENTER_HOCKEY_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NORTHWELL_ICE_CENTER_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NORTHWELL_ICE_CENTER_GIRLS_ELITE_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NORTHWELL_ICE_CENTER_HOUSE_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NORTHWELL_ICE_CENTER_ADULT_LEAGUE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NORTHWELL_ICE_CENTER_CLINICS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const NORTHWELL_ICE_CENTER_OFFICIAL_URLS = [
  NORTHWELL_ICE_CENTER_HOME_URL,
  NORTHWELL_ICE_CENTER_HOCKEY_URL,
  NORTHWELL_ICE_CENTER_GIRLS_ELITE_URL,
  NORTHWELL_ICE_CENTER_HOUSE_PROGRAMS_URL,
  NORTHWELL_ICE_CENTER_ADULT_LEAGUE_URL,
  NORTHWELL_ICE_CENTER_CLINICS_URL,
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Northwell Health Ice Center',
  officialActionUrl: NORTHWELL_ICE_CENTER_HOCKEY_URL,
  sourceUrl: NORTHWELL_ICE_CENTER_HOCKEY_URL,
  organizerName: 'Northwell Health Ice Center',
  sportName: 'Ice Hockey',
  formatLabel: 'Youth house hockey, elite girls hockey, adult recreation league, clinics, and hockey training',
  city: 'Long Island, NY',
  venueName: 'Northwell Health Ice Center',
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Year-round hockey programs and clinics',
  scheduleText: 'The stored allowed Hockey page describes youth house programs for players ages 5-13 with weekly clinics, Islanders Elite Girls Hockey from 10U to 19U, PAL Jr. Islanders travel hockey from mites to juniors, skills and specialty clinics, and an adult recreation league for ages 18 and over with an 8-game season plus playoffs.',
  statusText: 'Review-only hockey facility and program profile; current clinic, league, registration, and rental inventory requires the official linked pages.',
  description: NORTHWELL_ICE_CENTER_ORG_DESCRIPTION,
  tags: ['Club', 'Ice Hockey', 'Youth', 'Adult League', 'Clinics'],
  logoUrl: NORTHWELL_ICE_CENTER_LOGO_SOURCE_URL,
  logoSourceUrl: NORTHWELL_ICE_CENTER_LOGO_SOURCE_URL,
  warnings: [
    'The allowed page identifies Long Island as the destination but does not publish a canonical street address; address remains unset.',
    'Girls Elite, youth house, adult league, clinics, and homepage pages are UNCHECKED; no current EVENT or RENTAL candidate is inferred.',
    'The stored first-party white Northwell Health Ice Center logo was normalized to an opaque 1024px PNG on a dark background without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const NORTHWELL_ICE_CENTER_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NORTHWELL_ICE_CENTER_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NORTHWELL_ICE_CENTER_HOCKEY_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Northwell Health Ice Center' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NORTHWELL_ICE_CENTER_HOCKEY_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NORTHWELL_ICE_CENTER_HOCKEY_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Northwell Health Ice Center' },
    sportName: { selector: 'body', mode: 'literal', value: 'Ice Hockey' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth house hockey, elite girls hockey, adult recreation league, clinics, and hockey training' },
    city: { selector: 'body', mode: 'literal', value: 'Long Island, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Northwell Health Ice Center' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round hockey programs and clinics' },
    description: { selector: 'body', mode: 'literal', value: NORTHWELL_ICE_CENTER_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Ice Hockey, Youth, Adult League, Clinics' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NORTHWELL_ICE_CENTER_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/northwellHealthIceCenter.html');

export const NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
