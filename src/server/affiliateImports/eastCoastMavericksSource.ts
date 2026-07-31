import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const EAST_COAST_MAVERICKS_HOME_URL = 'https://ecmavericksbaseball.com/';
export const EAST_COAST_MAVERICKS_CLINICS_URL = 'https://ecmavericksbaseball.com/camps%2Fclinics';
export const EAST_COAST_MAVERICKS_MINI_MAVERICKS_URL = 'https://ecmavericksbaseball.com/mini-mavericks-program';
export const EAST_COAST_MAVERICKS_ABOUT_URL = 'https://ecmavericksbaseball.com/about-us';
export const EAST_COAST_MAVERICKS_TEAMS_URL = 'https://ecmavericksbaseball.com/teams';
export const EAST_COAST_MAVERICKS_CONTACT_URL = 'https://ecmavericksbaseball.com/contact-us';
export const EAST_COAST_MAVERICKS_FACEBOOK_URL = 'https://www.facebook.com/1394240350629243';
export const EAST_COAST_MAVERICKS_INSTAGRAM_URL = 'https://www.instagram.com/eastcoast__mavericks';
export const EAST_COAST_MAVERICKS_REGISTRATION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScoygjYGMeTRsnPECkFrrZEpX-eh7ZP0jIo3cth9NMcNZk50w/viewform?usp=publish-editor';
export const EAST_COAST_MAVERICKS_LOGO_SOURCE_URL = 'https://img1.wsimg.com/isteam/ip/ba04e221-6913-4836-b825-2e40a555b765/Newlogo.jpeg/:/rs=h:101,cg:true,m/qt=q:95';
export const EAST_COAST_MAVERICKS_ORG_DESCRIPTION =
  'Mavericks Baseball is a youth baseball organization offering professional instruction, clinics, camps, competition, and player development in the Yorktown Heights, New York area.';

export const EAST_COAST_MAVERICKS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ad68fca3-adff-4930-a3bb-3245cb64319f',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-eastcoast-mavericks-ecmavericksbaseball-com',
  intakeName: 'EASTCOAST MAVERICKS',
  baseUrl: 'https://ecmavericksbaseball.com',
  complianceStatus: 'ALLOWED',
  runId: 'eb1a6da9-afb3-4696-8102-a55d80e6c54b',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:48.092Z',
  pages: [
    { url: EAST_COAST_MAVERICKS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: EAST_COAST_MAVERICKS_CLINICS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: EAST_COAST_MAVERICKS_MINI_MAVERICKS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: EAST_COAST_MAVERICKS_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: EAST_COAST_MAVERICKS_TEAMS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: EAST_COAST_MAVERICKS_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const EAST_COAST_MAVERICKS_OFFICIAL_URLS = [
  EAST_COAST_MAVERICKS_HOME_URL,
  EAST_COAST_MAVERICKS_CLINICS_URL,
  EAST_COAST_MAVERICKS_MINI_MAVERICKS_URL,
  EAST_COAST_MAVERICKS_ABOUT_URL,
  EAST_COAST_MAVERICKS_TEAMS_URL,
  EAST_COAST_MAVERICKS_CONTACT_URL,
  EAST_COAST_MAVERICKS_FACEBOOK_URL,
  EAST_COAST_MAVERICKS_INSTAGRAM_URL,
  EAST_COAST_MAVERICKS_REGISTRATION_URL,
] as const;

const manualCandidates = [
  {
    listingKind: 'CLUB' as const,
    title: 'Mavericks Baseball',
    officialActionUrl: EAST_COAST_MAVERICKS_HOME_URL,
    sourceUrl: EAST_COAST_MAVERICKS_HOME_URL,
    organizerName: 'East Coast Mavericks',
    sportName: 'Baseball',
    formatLabel: 'Youth baseball instruction, clinics, camps, competition, and player development',
    city: 'Yorktown Heights, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round youth baseball organization and program information',
    scheduleText: 'The stored allowed homepage presents Mavericks Baseball with youth clinics, player development, competition, and a Mini Mavericks tee-ball program. Linked program, team, and roster pages remain unchecked.',
    statusText: 'Review-only club profile; linked program, team, roster, and registration details require the official pages.',
    description: EAST_COAST_MAVERICKS_ORG_DESCRIPTION,
    tags: ['Club', 'Baseball', 'Youth', 'Clinics'],
    logoUrl: EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
    logoSourceUrl: EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
    warnings: [
      'The allowed homepage identifies the organization and Yorktown Heights program location but does not establish a canonical organization street address.',
      'Teams, rosters, camps/clinics, Mini Mavericks, about, coaches, and contact pages are UNCHECKED; TEAM rows are withheld.',
      'The stored first-party Mavericks Baseball logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
  {
    listingKind: 'EVENT' as const,
    title: 'Mavericks Summer Baseball Clinic 2026 - Session 4',
    officialActionUrl: EAST_COAST_MAVERICKS_REGISTRATION_URL,
    sourceUrl: EAST_COAST_MAVERICKS_HOME_URL,
    organizerName: 'East Coast Mavericks',
    sportName: 'Baseball',
    formatLabel: 'Full-day youth baseball clinic with instruction, drills, competitions, and controlled scrimmages',
    city: 'Yorktown Heights, NY',
    venueName: 'Navajo Fields',
    address: '3000 Navajo Street, Yorktown Heights, NY',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'July 27 - July 31, 2026 (Session 4; ongoing at review)',
    scheduleText: 'The stored allowed homepage lists Summer Baseball Clinic 2026 Session 4 as July 27 - July 31 at Navajo Fields, 3000 Navajo Street, Yorktown Heights, NY. The page describes full-day instruction, drills, competitions, controlled scrimmages, daily prizes, weekly awards, performance progress reports, and professional instruction; no time is published.',
    statusText: 'Review-only ongoing clinic candidate; no start time is inferred from the source.',
    description: 'Mavericks Summer Baseball Clinic 2026 Session 4 for players ages 8u-12u.',
    tags: ['Event', 'Baseball', 'Clinic', 'Youth', '2026'],
    logoUrl: EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
    logoSourceUrl: EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
    warnings: [
      'The source publishes the 2026 session date range and address but no time; no time is inferred.',
      'The August 10-14 Mini Mavericks dates omit a year and are withheld rather than assigned to 2026.',
      'The session start is represented as ONGOING with no timestamp because it is in progress at review; no future start is invented.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const EAST_COAST_MAVERICKS_MANUAL_CANDIDATES = manualCandidates;

export const EAST_COAST_MAVERICKS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: EAST_COAST_MAVERICKS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Mavericks Baseball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: EAST_COAST_MAVERICKS_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: EAST_COAST_MAVERICKS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'East Coast Mavericks' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth baseball instruction, clinics, camps, competition, and player development' },
    city: { selector: 'body', mode: 'literal', value: 'Yorktown Heights, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round youth baseball organization and program information' },
    description: { selector: 'body', mode: 'literal', value: EAST_COAST_MAVERICKS_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Youth, Clinics' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: EAST_COAST_MAVERICKS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/eastCoastMavericks.html');

export const EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: EAST_COAST_MAVERICKS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
