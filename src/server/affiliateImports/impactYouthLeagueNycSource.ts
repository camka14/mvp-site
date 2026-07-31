import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const IMPACT_YOUTH_LEAGUE_NYC_HOME_URL = 'https://www.impactyouthleaguenyc.com/';
export const IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL = 'https://impactyouthleaguenyc.fastbreakcompete.ai/events';
export const IMPACT_YOUTH_LEAGUE_NYC_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/8bc4f6_e01668bc662d49eea174294d2c7235eb~mv2.jpg/v1/fill/w_196,h_90,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Impact%20-%20White%20Logo.jpg';
export const IMPACT_YOUTH_LEAGUE_NYC_ORG_DESCRIPTION =
  'The Impact Youth League is a nonprofit organization devoted to improving kids\' basketball skills and providing a welcoming platform for them to showcase their talents. Over the last 30 years, Impact has fostered more than 25,000 kids throughout Queens, New York. It has expanded to Manhattan, Brooklyn and New Jersey to continue sharing its principles throughout the community.';

export const IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '62212f5c-38ef-4762-a3a0-3087fa8d56d6',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-impact-youth-league-impactyouthleaguenyc-com',
  intakeName: 'Impact Youth League',
  baseUrl: 'https://www.impactyouthleaguenyc.com',
  complianceStatus: 'ALLOWED',
  runId: '3deaec93-6e7e-4350-afc4-02b33dc0d25e',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:19.752Z',
  pages: [
    { url: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.impactyouthleaguenyc.com/3v3registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.impactyouthleaguenyc.com/payment-request-page', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.impactyouthleaguenyc.com/contact-4', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.impactyouthleaguenyc.com/team-3', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.impactyouthleaguenyc.com/3v3tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.impactyouthleaguenyc.com/event-details/free-clinics-summer-league-2024-06-01-09-00', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
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

export const IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Impact Youth League NYC',
    officialActionUrl: IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL,
    sourceUrl: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL,
    organizerName: 'Impact Youth League NYC',
    sportName: 'Basketball',
    formatLabel: 'Youth basketball clinics and competitive league play',
    city: 'New York, NY',
    venueName: 'Morningside Basketball Courts',
    address: 'W 118th Street and Morningside Avenue, New York, NY 10027',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing NYC & NJ youth basketball development and league programs',
    scheduleText: 'The stored allowed homepage describes Saturday basketball clinics, competitive 10-12 game youth league play, and All-Star programming. Its summer location is Morningside Basketball Courts at W 118th Street and Morningside Avenue in New York, NY 10027.',
    statusText: 'Review-only club profile; the official schedule, registration, contact, and program detail pages require separate review.',
    description: IMPACT_YOUTH_LEAGUE_NYC_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Youth', 'League', 'New York'],
    logoUrl: IMPACT_YOUTH_LEAGUE_NYC_LOGO_SOURCE_URL,
    logoSourceUrl: IMPACT_YOUTH_LEAGUE_NYC_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage supports an evergreen CLUB profile but does not provide a complete current dated event row.',
      'The stored June 2026 free-clinic dates and June 27, 2026 summer-league start were past as of 2026-07-31; no stale EVENT candidate is inferred.',
      'The schedule, registration, contact, team, tournament, and event-detail pages are UNCHECKED and remain withheld.',
      'TEAM rows are out of scope; no team candidate is created.',
      'The stored first-party Impact wordmark candidate was normalized locally to an opaque 1024px square PNG on a dark background.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const IMPACT_YOUTH_LEAGUE_NYC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Impact Youth League NYC' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Impact Youth League NYC' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth basketball clinics and competitive league play' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing NYC & NJ youth basketball development and league programs' },
    description: { selector: 'body', mode: 'literal', value: IMPACT_YOUTH_LEAGUE_NYC_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Youth, League, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/impactYouthLeagueNyc.html');

export const IMPACT_YOUTH_LEAGUE_NYC_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
