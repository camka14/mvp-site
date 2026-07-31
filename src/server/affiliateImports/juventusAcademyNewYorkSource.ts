import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const JUVENTUS_ACADEMY_NY_HOME_URL = 'https://juventusny.com/';
export const JUVENTUS_ACADEMY_NY_BOOKINGS_URL = 'https://juventusnewyork.leagueapps.com/bookings';
export const JUVENTUS_ACADEMY_NY_LOGO_SOURCE_URL = 'https://juventusny.com/wp-content/uploads/bb-plugin/cache/logo_white-panorama-7d767810bac67be9e52c02c53f00e465-ylqijh7s91gd.png';
export const JUVENTUS_ACADEMY_NY_ORG_DESCRIPTION =
  'Juventus Academy New York provides soccer programs for all skill levels, from competitive travel soccer and pre-academy development to after-school programming, summer clinics, goalkeeping, and private lessons.';

export const JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '57ac3076-df63-4415-ab46-8480662d944b',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-juventus-academy-ny-home-juventusny-com',
  intakeName: 'Juventus Academy NY: Home',
  baseUrl: 'https://juventusny.com',
  complianceStatus: 'ALLOWED',
  runId: 'a47c3e4f-64ab-42a8-9dec-9707144b4995',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:18.991Z',
  pages: [
    { url: JUVENTUS_ACADEMY_NY_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://juventusny.com/programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/summer-clinics', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/ny-winter-tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/international-travel-program', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: JUVENTUS_ACADEMY_NY_BOOKINGS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/competitive-travel', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/recreational', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/afterschool', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/goalkeeping-2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/pro-training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://juventusny.com/european-experience-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Juventus Academy New York',
    officialActionUrl: JUVENTUS_ACADEMY_NY_BOOKINGS_URL,
    sourceUrl: JUVENTUS_ACADEMY_NY_HOME_URL,
    organizerName: 'Juventus Academy New York',
    sportName: 'Soccer',
    formatLabel: 'Travel academy, pre-academy, after-school, clinics, goalkeeping, and private soccer training',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing New York soccer academy programs',
    scheduleText: 'The stored allowed homepage lists travel academy, pre-academy, after-school, summer clinics, goalkeeping, and private-lesson programs for players of all skill levels.',
    statusText: 'Review-only club profile; program, registration, facility, and European-experience detail pages require separate review.',
    description: JUVENTUS_ACADEMY_NY_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Academy', 'New York'],
    logoUrl: JUVENTUS_ACADEMY_NY_LOGO_SOURCE_URL,
    logoSourceUrl: JUVENTUS_ACADEMY_NY_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage supports an evergreen CLUB profile but does not provide a complete current dated local event row.',
      'The Spring 2027 European Soccer Experience teaser is linked to an UNCHECKED detail page and its stored date text is internally inconsistent; no EVENT candidate is inferred.',
      'Program, registration, winter-tournament, international-travel, and facility detail pages are UNCHECKED and remain withheld.',
      'TEAM rows are out of scope; no team candidate is created.',
      'The stored first-party white Juventus Academy New York logo was normalized locally to an opaque 1024px square PNG on a dark background.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const JUVENTUS_ACADEMY_NY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: JUVENTUS_ACADEMY_NY_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Juventus Academy New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: JUVENTUS_ACADEMY_NY_BOOKINGS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: JUVENTUS_ACADEMY_NY_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Juventus Academy New York' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Travel academy, pre-academy, after-school, clinics, goalkeeping, and private soccer training' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing New York soccer academy programs' },
    description: { selector: 'body', mode: 'literal', value: JUVENTUS_ACADEMY_NY_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: JUVENTUS_ACADEMY_NY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/juventusAcademyNewYork.html');

export const JUVENTUS_ACADEMY_NY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
