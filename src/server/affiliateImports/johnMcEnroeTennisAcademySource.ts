import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const JMTA_HOME_URL = 'https://www.johnmcenroetennisacademy.com/';
export const JMTA_LOGO_SOURCE_URL = 'https://www.johnmcenroetennisacademy.com/images/JMTA.png';
export const JMTA_ORG_DESCRIPTION = 'John McEnroe Tennis Academy (JMTA), launched in 2010 by John McEnroe in partnership with SPORTIME Clubs, develops junior tennis players of all ages and levels through technical, tactical, athletic, academic, and off-court support.';

export const JMTA_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '150c930c-ce11-4413-80f3-52e8137a3204',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-john-mcenroe-tennis-academy-johnmcenroetennisacademy-com',
  intakeName: 'John McEnroe Tennis Academy',
  baseUrl: 'https://www.johnmcenroetennisacademy.com',
  complianceStatus: 'ALLOWED',
  runId: '23385d65-e76d-4630-8eb7-902ff9088f99',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:47.919Z',
  pages: [
    { url: JMTA_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.johnmcenroetennisacademy.com/Events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.johnmcenroetennisacademy.com/Tournaments', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.johnmcenroetennisacademy.com/explore/jmtacamp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.johnmcenroetennisacademy.com/JMTA/Locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.johnmcenroetennisacademy.com/JMTA/Staff', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.sportimecamps.com/jmta', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const JMTA_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'John McEnroe Tennis Academy (JMTA)',
    officialActionUrl: JMTA_HOME_URL,
    sourceUrl: JMTA_HOME_URL,
    organizerName: 'John McEnroe Tennis Academy',
    sportName: 'Tennis',
    formatLabel: 'Junior tennis development, training camps, athletic development, and college-navigation support',
    city: 'New York, NY',
    venueName: 'Five NYC, Long Island, and Westchester locations',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing JMTA junior tennis development',
    scheduleText: 'The stored homepage says JMTA offers five locations in NYC, Long Island, and Westchester, with junior development for all ages and levels, technical and tactical coaching, strength/agility and mental-toughness training, and college-navigation support.',
    statusText: 'Review-only academy profile; current location, camp, tournament, and registration details require separate review.',
    description: JMTA_ORG_DESCRIPTION,
    tags: ['Club', 'Tennis', 'Youth', 'Academy', 'New York'],
    warnings: [
      'The stored allowed homepage does not provide a complete current dated event row, so no EVENT candidate is created.',
      'The stored camp, event, tournament, location, staff, and registration pages are UNCHECKED; no additional EVENT, RENTAL, or TEAM candidate is inferred.',
      'The stored first-party JMTA logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const JMTA_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: JMTA_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'John McEnroe Tennis Academy (JMTA)' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: JMTA_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: JMTA_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'John McEnroe Tennis Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Tennis, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: JMTA_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/johnMcEnroeTennisAcademy.html');

export const JMTA_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: JMTA_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
