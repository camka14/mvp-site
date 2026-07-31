import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_IMPACT_VOLLEYBALL_TRYOUT_URL = 'https://www.nycimpact.com/boys-tryout';
export const NYC_IMPACT_VOLLEYBALL_HOME_URL = 'https://www.nycimpact.com/';
export const NYC_IMPACT_VOLLEYBALL_REGISTER_URL = 'https://forms.gle/wJbztUd7CGfkTuW3A';
export const NYC_IMPACT_VOLLEYBALL_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/63830d_00a25f2d45dc407090b5940faea6c9a8~mv2.png/v1/fill/w_781,h_274,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/NYC%20Impact%20Logo.png';
export const NYC_IMPACT_VOLLEYBALL_ORG_DESCRIPTION =
  'NYC Impact is a youth volleyball club whose stored 2026-2027 USAV/GEVA boys-season page describes tryouts for 15U, 16s National, 17U National, and 18s National athletes, with registration, age-chart, membership, waiver, and tryout-fee steps.';

export const NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '3ce8995e-69d3-414d-a1d4-9ed3a9ea4fe6',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-impact-boys-volleyball-tryout-nycimpact-com',
  intakeName: 'NYC Impact Boys Volleyball Tryout',
  baseUrl: 'https://www.nycimpact.com',
  complianceStatus: 'ALLOWED',
  runId: 'a1ff2db1-05b3-4c71-abad-042a3cb82897',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:25.790Z',
  pages: [
    { url: NYC_IMPACT_VOLLEYBALL_TRYOUT_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: 'https://www.nycimpact.com/boys-season-info', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/boys-volleyball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_IMPACT_VOLLEYBALL_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/tournament-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/program', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/girls-tryouts', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/open-gym', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycimpact.com/store', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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

export const NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NYC Impact Boys Volleyball',
    officialActionUrl: NYC_IMPACT_VOLLEYBALL_REGISTER_URL,
    sourceUrl: NYC_IMPACT_VOLLEYBALL_TRYOUT_URL,
    organizerName: 'NYC Impact Volleyball Club',
    sportName: 'Volleyball',
    formatLabel: 'USAV/GEVA boys volleyball tryouts and club program for 15U-18U athletes',
    city: null,
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: '2026-2027 USAV/GEVA boys volleyball season and tryout process',
    scheduleText: 'The stored allowed tryout page lists 15U, 16s National, 17U National, and 18s National tryout groups. It gives month/day and time rows at PS20, including first, second, and make-up tryouts, but does not state a source year for each individual row.',
    statusText: 'Review-only club profile; the registration form is an outbound action link and the season, program, schedule, team, and payment detail pages require separate review.',
    description: NYC_IMPACT_VOLLEYBALL_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'USAV', 'GEVA'],
    logoUrl: NYC_IMPACT_VOLLEYBALL_LOGO_SOURCE_URL,
    logoSourceUrl: NYC_IMPACT_VOLLEYBALL_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed boys-tryout page supports an ongoing CLUB profile but does not provide a complete current dated event row with a source year and publish-ready venue address.',
      'The displayed 8/10-8/22 tryout month/day rows are withheld from scheduled EVENT output because the source does not state an individual event year; no year is inferred from the 2026-2027 season label.',
      'The Google Forms registration URL is preserved as an official outbound action link only; all other season, program, schedule, tournament, payment, and team pages are UNCHECKED and remain withheld.',
      'TEAM rows are out of scope; no team candidate is created.',
      'The stored first-party NYC Impact Volleyball wordmark was normalized locally to an opaque 1024px square PNG on a white background.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_IMPACT_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYC_IMPACT_VOLLEYBALL_TRYOUT_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Impact Boys Volleyball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_IMPACT_VOLLEYBALL_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_IMPACT_VOLLEYBALL_TRYOUT_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Impact Volleyball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'USAV/GEVA boys volleyball tryouts and club program for 15U-18U athletes' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: '2026-2027 USAV/GEVA boys volleyball season and tryout process' },
    description: { selector: 'body', mode: 'literal', value: NYC_IMPACT_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, USAV, GEVA' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycImpactVolleyball.html');

export const NYC_IMPACT_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
