import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_SCORPIONS_ACADEMY_URL = 'https://www.newyorkscorpions.com/program/scorpions-academy/23958';
export const NEW_YORK_SCORPIONS_HOME_URL = 'https://www.newyorkscorpions.com/';
export const NEW_YORK_SCORPIONS_TRYOUTS_URL = 'https://www.newyorkscorpions.com/program/scorpions-tryouts/23665';
export const NEW_YORK_SCORPIONS_MISSION_URL = 'https://www.newyorkscorpions.com/about/our-mission/105621';
export const NEW_YORK_SCORPIONS_DEVELOPMENT_URL = 'https://www.newyorkscorpions.com/about/development/105639';
export const NEW_YORK_SCORPIONS_INSTAGRAM_URL = 'https://www.instagram.com/newyorkscorpions';
export const NEW_YORK_SCORPIONS_FACEBOOK_URL = 'https://www.facebook.com/newyorkscorpions';
export const NEW_YORK_SCORPIONS_TIKTOK_URL = 'https://www.tiktok.com/@newyorkscorpions';
export const NEW_YORK_SCORPIONS_YOUTUBE_URL = 'https://www.youtube.com/@NewYorkScorpions';
export const NEW_YORK_SCORPIONS_LOGO_SOURCE_URL = 'https://crossbar.s3.amazonaws.com/organizations/2396/uploads/ac448d36-4f55-4f21-bedf-7abc3d6ca75c.png?versionId=C2Bx8PYknqqW6e3hJyy87svfVCoyd4N8';
export const NEW_YORK_SCORPIONS_ORG_DESCRIPTION =
  'New York Scorpions Academy is a foundational, growth-focused youth baseball program for typically 8U-13U players. The stored allowed program page describes year-round training, the Scorpion’s Way character-and-development focus, 2026 season timelines, and multiple outdoor and indoor practice locations.';

export const NEW_YORK_SCORPIONS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '0184d532-1c5b-431c-a62f-f90b0582ebbe',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-scorpions-academy-newyorkscorpions-com',
  intakeName: 'Scorpions Academy',
  baseUrl: 'https://www.newyorkscorpions.com',
  complianceStatus: 'ALLOWED',
  runId: 'd1344a0f-e4c0-41f9-ac6d-e1140d887136',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:33.770Z',
  pages: [
    { url: NEW_YORK_SCORPIONS_ACADEMY_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_SCORPIONS_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_SCORPIONS_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_SCORPIONS_MISSION_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_SCORPIONS_DEVELOPMENT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/parent-resources/player-programs-academy/106168', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/parent-resources/scorpions-fees-payment-info/106170', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/parent-resources/player-programs-showcase/106162', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/events/2026-scorpions-hoodie-jogger-pre-order/151538', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkscorpions.com/events/2026-cooperstown-fundraiser/151851', role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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

export const NEW_YORK_SCORPIONS_OFFICIAL_URLS = [
  NEW_YORK_SCORPIONS_ACADEMY_URL,
  NEW_YORK_SCORPIONS_HOME_URL,
  NEW_YORK_SCORPIONS_TRYOUTS_URL,
  NEW_YORK_SCORPIONS_MISSION_URL,
  NEW_YORK_SCORPIONS_DEVELOPMENT_URL,
  'https://www.newyorkscorpions.com/about/faq/106050',
  'https://www.newyorkscorpions.com/schedule',
  'https://www.newyorkscorpions.com/parent-resources/player-programs-showcase/106162',
  'https://www.newyorkscorpions.com/parent-resources/player-programs-academy/106168',
  'https://www.newyorkscorpions.com/parent-resources/scorpions-fees-payment-info/106170',
  NEW_YORK_SCORPIONS_INSTAGRAM_URL,
  NEW_YORK_SCORPIONS_FACEBOOK_URL,
  NEW_YORK_SCORPIONS_TIKTOK_URL,
  NEW_YORK_SCORPIONS_YOUTUBE_URL,
] as const;

const academyCandidate = {
  listingKind: 'CLUB' as const,
  title: 'New York Scorpions Academy',
  officialActionUrl: NEW_YORK_SCORPIONS_ACADEMY_URL,
  sourceUrl: NEW_YORK_SCORPIONS_ACADEMY_URL,
  organizerName: 'New York Scorpions',
  sportName: 'Baseball',
  formatLabel: '8U-13U youth baseball academy with year-round training, practices, and player development',
  city: null,
  venueName: 'Wantagh Park; Cantiague Park; Eisenhower Park; LI Sports Dome; Mayhem Practice Facility; Sports Alley; Baseball Plus',
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026 Academy season timeline and year-round player-development program',
  scheduleText: 'The stored allowed Academy page describes 2026 tryouts and team selections in August and October/November; winter workouts and athletic training in January-March; spring practices, a 5- or 10-game season, and tournaments in April-June; and summer practices, an 8- or 16-game season, and tournaments in July-August. The page lists outdoor locations at Wantagh Park, Cantiague Park, Eisenhower Park, and local school fields, plus indoor facilities at LI Sports Dome, Mayhem Practice Facility, Sports Alley, and Baseball Plus.',
  statusText: 'Review-only academy profile; the stored page says registrations are not currently being accepted. Current tryout, fee, schedule, and program details require the official linked pages.',
  description: NEW_YORK_SCORPIONS_ORG_DESCRIPTION,
  tags: ['Club', 'Baseball', 'Youth', 'Academy', 'Player Development'],
  logoUrl: NEW_YORK_SCORPIONS_LOGO_SOURCE_URL,
  logoSourceUrl: NEW_YORK_SCORPIONS_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED Academy page supports one ongoing CLUB profile with month-range 2026 season information but no complete dated event rows.',
    'The page names outdoor parks and indoor facilities but publishes no canonical street address or city for those locations; no coordinates are inferred.',
    'Registration, fee, schedule, tryout, team, showcase, and player-program pages are UNCHECKED; no EVENT, TEAM, or RENTAL candidate is created.',
    'The stored first-party New York Scorpions mark was normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const NEW_YORK_SCORPIONS_MANUAL_CANDIDATES = [academyCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_SCORPIONS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NEW_YORK_SCORPIONS_ACADEMY_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Scorpions Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_SCORPIONS_ACADEMY_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_SCORPIONS_ACADEMY_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Scorpions' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    formatLabel: { selector: 'body', mode: 'literal', value: '8U-13U youth baseball academy with year-round training, practices, and player development' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: '2026 Academy season timeline and year-round player-development program' },
    description: { selector: 'body', mode: 'literal', value: NEW_YORK_SCORPIONS_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Youth, Academy, Player Development' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NEW_YORK_SCORPIONS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkScorpionsAcademy.html');

export const NEW_YORK_SCORPIONS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NEW_YORK_SCORPIONS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
