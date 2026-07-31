import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ESCALADES_BASKETBALL_CLUB_HOME_URL = 'https://www.escaladesnyc.org/';
export const ESCALADES_BASKETBALL_CLUB_REGISTER_URL = 'https://www.escaladesnyc.org/register';
export const ESCALADES_BASKETBALL_CLUB_LOGO_SOURCE_URL = 'https://crossbar.s3.amazonaws.com/organizations/486/uploads/ec4490ee-e5c0-4cc6-9175-12c5689aec0b.png?versionId=X8fp4PR1v9UWki0WTZE6OGLqGLKz2qAi';
export const ESCALADES_BASKETBALL_CLUB_ORG_DESCRIPTION =
  'Escalades Basketball Club is an AAU basketball organization in New York City providing competitive boys and girls teams and skills-development clinics for players ages 8 to 17. Its practices and clinics are located across Manhattan, including the Upper East and West Sides, Midtown, and West Harlem.';

export const ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'f23e92b4-bf87-477c-b426-4fce36ff1908',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-escalades-basketball-club-escaladesnyc-org',
  intakeName: 'Escalades Basketball Club',
  baseUrl: 'https://www.escaladesnyc.org',
  complianceStatus: 'ALLOWED',
  runId: 'faa0f1a8-3ce4-4964-85d4-5d0534ec1ade',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:24.824Z',
  pages: [
    { url: ESCALADES_BASKETBALL_CLUB_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.escaladesnyc.org/program/spring-season-2026/29927', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: ESCALADES_BASKETBALL_CLUB_REGISTER_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.escaladesnyc.org/signup', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.escaladesnyc.org/about/our-team/75712', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.escaladesnyc.org/about/updates-and-announcements/45535', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.escaladesnyc.org/refund-policies', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.escaladesnyc.org/parent-resources/apparel-store/9976', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
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

export const ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Escalades Basketball Club',
    officialActionUrl: ESCALADES_BASKETBALL_CLUB_REGISTER_URL,
    sourceUrl: ESCALADES_BASKETBALL_CLUB_HOME_URL,
    organizerName: 'Escalades Basketball Club',
    sportName: 'Basketball',
    formatLabel: 'AAU basketball teams and skills-development clinics for boys and girls ages 8 to 17',
    city: 'Manhattan, NY',
    venueName: null,
    address: 'Manhattan, NY 10065',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing Manhattan youth basketball teams and skills-development clinics',
    scheduleText: 'The stored allowed homepage describes multiple weekly practice and clinic opportunities across Manhattan, including the Upper East and West Sides, Midtown, and West Harlem.',
    statusText: 'Review-only club profile; the registration, program, schedule, team, and announcement pages require separate review.',
    description: ESCALADES_BASKETBALL_CLUB_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'AAU', 'Youth', 'Manhattan'],
    warnings: [
      'The stored allowed homepage supports an evergreen CLUB profile but does not provide a complete current dated event row.',
      'The Spring Season - 2026 program link is UNCHECKED and its season is past as of 2026-07-31; no EVENT candidate is inferred.',
      'Registration, signup, schedule, team, announcement, policy, and program detail pages are UNCHECKED and remain withheld; the apparel-store path is not mapped as a facility RENTAL.',
      'TEAM rows are out of scope; no team candidate is created.',
      'Stored page branding exposes official logo URLs but no stored binary logo candidate; logo disposition is MANUAL_REVIEW.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ESCALADES_BASKETBALL_CLUB_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ESCALADES_BASKETBALL_CLUB_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Escalades Basketball Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ESCALADES_BASKETBALL_CLUB_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ESCALADES_BASKETBALL_CLUB_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Escalades Basketball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'AAU basketball teams and skills-development clinics for boys and girls ages 8 to 17' },
    city: { selector: 'body', mode: 'literal', value: 'Manhattan, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing Manhattan youth basketball teams and skills-development clinics' },
    description: { selector: 'body', mode: 'literal', value: ESCALADES_BASKETBALL_CLUB_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, AAU, Youth, Manhattan' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/escaladesBasketballClub.html');

export const ESCALADES_BASKETBALL_CLUB_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
