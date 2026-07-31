import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CROSS_COURT_PICKLEBALL_HOME_URL = 'https://cc-pickleball.com/';
export const CROSS_COURT_PICKLEBALL_MEMBERSHIPS_URL = 'https://cc-pickleball.com/memberships/';
export const CROSS_COURT_PICKLEBALL_SCHEDULED_PLAY_URL = 'https://cc-pickleball.com/scheduled-play/';
export const CROSS_COURT_PICKLEBALL_COMPETITION_URL = 'https://cc-pickleball.com/competition/';
export const CROSS_COURT_PICKLEBALL_LEAGUES_URL = 'https://cc-pickleball.com/competition/leagues/';
export const CROSS_COURT_PICKLEBALL_TOURNAMENTS_URL = 'https://cc-pickleball.com/competition/tournaments/';
export const CROSS_COURT_PICKLEBALL_LEARN_URL = 'https://cc-pickleball.com/learn/';
export const CROSS_COURT_PICKLEBALL_LESSONS_URL = 'https://cc-pickleball.com/learn/lessons/';
export const CROSS_COURT_PICKLEBALL_CLINICS_URL = 'https://cc-pickleball.com/learn/clinics/';
export const CROSS_COURT_PICKLEBALL_CAMPS_URL = 'https://cc-pickleball.com/learn/camps/';
export const CROSS_COURT_PICKLEBALL_TEACHING_PROS_URL = 'https://cc-pickleball.com/learn/teaching-pros/';
export const CROSS_COURT_PICKLEBALL_RENTAL_URL = 'https://cc-pickleball.com/court-rental/';
export const CROSS_COURT_PICKLEBALL_GROUP_RENTAL_URL = 'https://cc-pickleball.com/court-rental/group-rental/';
export const CROSS_COURT_PICKLEBALL_CORPORATE_RENTAL_URL = 'https://cc-pickleball.com/court-rental/corporate-parties/';
export const CROSS_COURT_PICKLEBALL_JUNIOR_PLAYERS_URL = 'https://cc-pickleball.com/junior-players/';
export const CROSS_COURT_PICKLEBALL_FACILITY_URL = 'https://cc-pickleball.com/our-facility/';
export const CROSS_COURT_PICKLEBALL_101_URL = 'https://cc-pickleball.com/pickleball-101/';
export const CROSS_COURT_PICKLEBALL_BOOKING_URL = 'https://app.courtreserve.com/Online/Portal/Index/8333';
export const CROSS_COURT_PICKLEBALL_FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100084971573042';
export const CROSS_COURT_PICKLEBALL_INSTAGRAM_URL = 'https://www.instagram.com/crosscourt_pickleball/';
export const CROSS_COURT_PICKLEBALL_LOGO_SOURCE_URL = 'https://cc-pickleball.com/uploads/ccpb-logo-new.png';
export const CROSS_COURT_PICKLEBALL_ORG_DESCRIPTION =
  'Cross Court Pickleball is a dedicated indoor pickleball facility in Westchester County, New York, offering competitive open play, instruction, adult and junior clinics, and social play for players of all ages and abilities.';

export const CROSS_COURT_PICKLEBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'c162453e-0801-4753-944a-46ddbf7ebedb',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-cross-court-pickleball-cc-pickleball-com',
  intakeName: 'Cross Court Pickleball',
  baseUrl: 'https://cc-pickleball.com',
  complianceStatus: 'ALLOWED',
  runId: 'f9dbc9b7-945f-4ab3-9dc0-c76c3210829f',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:08:33.192Z',
  pages: [
    { url: CROSS_COURT_PICKLEBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: CROSS_COURT_PICKLEBALL_COMPETITION_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_LEAGUES_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_SCHEDULED_PLAY_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_GROUP_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: CROSS_COURT_PICKLEBALL_CORPORATE_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const CROSS_COURT_PICKLEBALL_OFFICIAL_URLS = [
  CROSS_COURT_PICKLEBALL_HOME_URL,
  CROSS_COURT_PICKLEBALL_MEMBERSHIPS_URL,
  CROSS_COURT_PICKLEBALL_SCHEDULED_PLAY_URL,
  CROSS_COURT_PICKLEBALL_COMPETITION_URL,
  CROSS_COURT_PICKLEBALL_LEAGUES_URL,
  CROSS_COURT_PICKLEBALL_TOURNAMENTS_URL,
  CROSS_COURT_PICKLEBALL_LEARN_URL,
  CROSS_COURT_PICKLEBALL_LESSONS_URL,
  CROSS_COURT_PICKLEBALL_CLINICS_URL,
  CROSS_COURT_PICKLEBALL_CAMPS_URL,
  CROSS_COURT_PICKLEBALL_TEACHING_PROS_URL,
  CROSS_COURT_PICKLEBALL_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_GROUP_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_CORPORATE_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_JUNIOR_PLAYERS_URL,
  CROSS_COURT_PICKLEBALL_FACILITY_URL,
  CROSS_COURT_PICKLEBALL_101_URL,
  CROSS_COURT_PICKLEBALL_BOOKING_URL,
  CROSS_COURT_PICKLEBALL_FACEBOOK_URL,
  CROSS_COURT_PICKLEBALL_INSTAGRAM_URL,
] as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Cross Court Pickleball',
  officialActionUrl: CROSS_COURT_PICKLEBALL_HOME_URL,
  sourceUrl: CROSS_COURT_PICKLEBALL_HOME_URL,
  organizerName: 'Cross Court Pickleball',
  sportName: 'Pickleball',
  formatLabel: 'Indoor pickleball facility with open play, instruction, clinics, camps, and social play',
  city: 'Westchester County, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Year-round indoor pickleball programming',
  scheduleText: 'The stored allowed homepage describes competitive open play, beginner-to-advanced instruction, adult and junior clinics, and social play for players of all ages and abilities. It states that memberships are required for programs and play.',
  statusText: 'Review-only indoor pickleball club profile; current program dates, court availability, and rental inventory require the official linked pages.',
  description: CROSS_COURT_PICKLEBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Pickleball', 'Indoor', 'Open Play', 'Clinics'],
  logoUrl: CROSS_COURT_PICKLEBALL_LOGO_SOURCE_URL,
  logoSourceUrl: CROSS_COURT_PICKLEBALL_LOGO_SOURCE_URL,
  warnings: [
    'The allowed homepage describes a Westchester County facility but does not publish a canonical street address; address remains unset.',
    'Competition, scheduled-play, memberships, lessons, clinics, camps, facility, and rental pages are UNCHECKED; no EVENT or RENTAL candidate is created from URL-only evidence.',
    'The stored first-party Cross Court Pickleball logo candidate was normalized locally to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const CROSS_COURT_PICKLEBALL_MANUAL_CANDIDATES = [organizationCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CROSS_COURT_PICKLEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: CROSS_COURT_PICKLEBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Cross Court Pickleball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: CROSS_COURT_PICKLEBALL_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: CROSS_COURT_PICKLEBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Cross Court Pickleball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor pickleball facility with open play, instruction, clinics, camps, and social play' },
    city: { selector: 'body', mode: 'literal', value: 'Westchester County, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round indoor pickleball programming' },
    statusText: { selector: 'body', mode: 'literal', value: 'Review-only indoor pickleball club profile; current program dates, court availability, and rental inventory require the official linked pages.' },
    description: { selector: 'body', mode: 'literal', value: CROSS_COURT_PICKLEBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Pickleball, Indoor, Open Play, Clinics' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: CROSS_COURT_PICKLEBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/crossCourtPickleball.html');

export const CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: CROSS_COURT_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
