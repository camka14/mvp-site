import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const THE_PROGRAM_NYC_HOME_URL = 'https://www.theprogramnyc.com/';
export const THE_PROGRAM_NYC_MEMBERSHIP_URL = 'https://www.theprogramnyc.com/membership';
export const THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL = 'https://www.theprogramnyc.com/membership/youth';
export const THE_PROGRAM_NYC_ADULT_MEMBERSHIP_URL = 'https://www.theprogramnyc.com/membership/adult';
export const THE_PROGRAM_NYC_RENTALS_URL = 'https://www.theprogramnyc.com/rentals';
export const THE_PROGRAM_NYC_LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/6650b1cfa592e430714a9c29/6650b1cfa592e430714a9c57_The_Program_Logo-05.svg';
export const THE_PROGRAM_NYC_ORG_DESCRIPTION =
  'The Program NYC is a 12,500-square-foot basketball training facility in Greenpoint, Brooklyn, with a regulation hardwood court, elite weight and performance room, recovery suite, youth and adult memberships, and high-level athlete development.';

export const THE_PROGRAM_NYC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ab53d52b-b7e8-48a6-8be0-4095ef32bf36',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-the-program-nyc-theprogramnyc-com',
  intakeName: 'The Program NYC',
  baseUrl: 'https://www.theprogramnyc.com',
  complianceStatus: 'ALLOWED',
  runId: '45af2e4a-4e00-4145-b22d-41f96770cf79',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:57.915Z',
  pages: [
    { url: THE_PROGRAM_NYC_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.theprogramnyc.com/donate', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_PROGRAM_NYC_MEMBERSHIP_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_PROGRAM_NYC_ADULT_MEMBERSHIP_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/private-training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/team', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/the-foundation', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/apply-for-financial-aid', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/apply-now', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/learn-more', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/north', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/the-sam-hunt-experience', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/old/camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/2024-hamptons-skills-clinic', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/2024-liu-brooklyn-skills-clinic', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/2024-riverdale-fall-program-recap', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/2025-girls-basketball-celebration-clinic', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/2025-hamptons-skills-camp-recap', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/previous-programs/opening-night', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/the-program-classic/vol-1', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/the-program-classic/vol-2', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/programs/holiday-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.theprogramnyc.com/old/rent-the-space', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: THE_PROGRAM_NYC_RENTALS_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const THE_PROGRAM_NYC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'The Program NYC',
    officialActionUrl: THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL,
    sourceUrl: THE_PROGRAM_NYC_HOME_URL,
    organizerName: 'The Program NYC',
    sportName: 'Basketball',
    formatLabel: 'Elite youth and adult basketball training and athlete performance facility',
    city: 'Greenpoint, Brooklyn, NY',
    venueName: 'The Program NYC',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Seasonal and annual youth and adult memberships',
    scheduleText: 'The stored official homepage describes seasonal and annual youth and adult memberships at a 12,500-square-foot Greenpoint facility with a regulation hardwood court, weight and performance room, and recovery suite.',
    statusText: 'Review-only club/facility profile; membership, schedule, private-training, and rental detail pages remain unchecked.',
    description: THE_PROGRAM_NYC_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Training', 'Youth', 'Adult', 'Facility'],
    logoUrl: THE_PROGRAM_NYC_LOGO_SOURCE_URL,
    logoSourceUrl: THE_PROGRAM_NYC_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage supports an ongoing CLUB profile but does not publish a canonical street address, so no address is assigned.',
      'Membership, private-training, schedule, and rental pages are UNCHECKED; no current EVENT or RENTAL candidate is inferred.',
      'Historical 2024/2025 program and clinic URLs are withheld as unchecked and are not treated as current events.',
      'The /team page is UNCHECKED and TEAM mappings are out of scope; no team candidate is created.',
      'The stored first-party The Program logo candidate was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const THE_PROGRAM_NYC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: THE_PROGRAM_NYC_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'The Program NYC' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: THE_PROGRAM_NYC_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'The Program NYC' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Elite youth and adult basketball training and athlete performance facility' },
    city: { selector: 'body', mode: 'literal', value: 'Greenpoint, Brooklyn, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'The Program NYC' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Seasonal and annual youth and adult memberships' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Training, Youth, Adult, Facility' },
    description: { selector: 'body', mode: 'literal', value: THE_PROGRAM_NYC_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: THE_PROGRAM_NYC_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/theProgramNyc.html');

export const THE_PROGRAM_NYC_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: THE_PROGRAM_NYC_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
