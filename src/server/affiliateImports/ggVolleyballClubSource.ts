import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const GG_VOLLEYBALL_TRYOUTS_URL = 'https://www.ggvolleyballclub.com/tryouts';
export const GG_VOLLEYBALL_LOGO_SOURCE_URL = 'https://cdn2.sportngin.com/attachments/logo_graphic/62a9-211412358/20240512_223320_medium.png';
export const GG_VOLLEYBALL_REGISTER_URL = 'https://form.jotform.com/251944462398468';
export const GG_VOLLEYBALL_TRAVEL_TRYOUT_URL = 'https://www.jotform.com/build/252224663028453';
export const GG_VOLLEYBALL_ORG_DESCRIPTION =
  'G&G Volleyball Club is a South Brooklyn youth volleyball club offering professionally coached development, GEVA/USAV competition, recruiting support for 15U+ athletes, and year-round training and competition.';

export const GG_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '3aae373c-5042-4f09-a552-39374bf6a76c',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-tryouts-ggvolleyballclub-com',
  intakeName: 'Tryouts',
  baseUrl: 'https://www.ggvolleyballclub.com',
  complianceStatus: 'ALLOWED',
  runId: '27f3e511-52b2-404a-89e7-e6f04f5c9dca',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:53.535Z',
  pages: [
    { url: GG_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const GG_VOLLEYBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'G&G Volleyball Club',
    officialActionUrl: GG_VOLLEYBALL_REGISTER_URL,
    sourceUrl: GG_VOLLEYBALL_TRYOUTS_URL,
    organizerName: 'G&G Volleyball Club',
    sportName: 'Volleyball',
    formatLabel: 'South Brooklyn youth volleyball club tryouts and training',
    city: 'Brooklyn, NY',
    venueName: 'East Midwood Jewish Center',
    address: '1625 Ocean Ave, Brooklyn, NY 11230',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round volleyball club tryout and training program',
    scheduleText: 'Single practice tryout sessions are listed on Tuesdays for Beginners at 6:30 PM and Intermediate athletes at 5:00 PM, and on Sundays for Beginners at 4:30 PM and Intermediate/Advanced athletes at 3:00 PM at East Midwood Jewish Center, 1625 Ocean Ave, Brooklyn, NY 11230.',
    statusText: 'Review-only club profile; the official registration paths are retained as outbound action URLs. The stored page does not provide a source year for its month/day travel-tryout references.',
    description: GG_VOLLEYBALL_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'Tryouts', 'Brooklyn', 'GEVA', 'USAV'],
    logoUrl: GG_VOLLEYBALL_LOGO_SOURCE_URL,
    logoSourceUrl: GG_VOLLEYBALL_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed tryout page supports an ongoing CLUB profile and recurring practice-session schedule but does not provide a complete current dated EVENT row with an individual source year.',
      'The page references August 11 and August 16 travel-team tryout dates without an individual source year and with inconsistent age/session wording; no EVENT date is inferred.',
      'The official Jotform registration links are preserved as outbound action URLs; no unchecked detail page is requested or retried.',
      'TEAM rows are out of scope; no team candidate is created despite the page discussing team placement and travel teams.',
      'The stored first-party G&G Volleyball Club wordmark candidate was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const GG_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: GG_VOLLEYBALL_TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'G&G Volleyball Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: GG_VOLLEYBALL_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: GG_VOLLEYBALL_TRYOUTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'G&G Volleyball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'South Brooklyn youth volleyball club tryouts and training' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'East Midwood Jewish Center' },
    address: { selector: 'body', mode: 'literal', value: '1625 Ocean Ave, Brooklyn, NY 11230' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round volleyball club tryout and training program' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Tryouts, Brooklyn, GEVA, USAV' },
    description: { selector: 'body', mode: 'literal', value: GG_VOLLEYBALL_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: GG_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/ggVolleyballClub.html');

export const GG_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: GG_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
