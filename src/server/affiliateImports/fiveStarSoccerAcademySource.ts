import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FIVE_STAR_SOCCER_HOME_URL = 'https://www.5starsocceracademy.com/';
export const FIVE_STAR_SOCCER_TRAINING_URL = 'https://www.5starsocceracademy.com/training';
export const FIVE_STAR_SOCCER_CAMPS_URL = 'https://www.5starsocceracademy.com/camps';
export const FIVE_STAR_SOCCER_SUMMER_URL = 'https://www.5starsocceracademy.com/summer-training';
export const FIVE_STAR_SOCCER_TRIAL_URL = 'https://forms.gle/opngJXZUeDCtR8Lg9';
export const FIVE_STAR_SOCCER_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/163ef8_8969615e48214912a0a0e12190bf1adb%7Emv2_d_2550_2538_s_4_2.png/v1/fit/w_2500,h_1330,al_c/163ef8_8969615e48214912a0a0e12190bf1adb%7Emv2_d_2550_2538_s_4_2.png';
export const FIVE_STAR_SOCCER_ORG_DESCRIPTION =
  '5 Star Soccer Academy provides professional youth soccer training in NYC for ages 3-13, with Little 5 Stars, Development, Advanced Travel, and seasonal camp programs.';

export const FIVE_STAR_SOCCER_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'a083b51e-56bb-449d-ace9-b1809642fcc4',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-youth-soccer-training-astoria-queens-5starsocceracademy-com',
  intakeName: 'Youth Soccer Training Astoria Queens',
  baseUrl: 'https://www.5starsocceracademy.com',
  complianceStatus: 'ALLOWED',
  runId: '0a516731-e735-4940-a511-ab58a6b9caf9',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:08.926Z',
  pages: [
    { url: FIVE_STAR_SOCCER_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.5starsocceracademy.com/event-details/spring-day-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.5starsocceracademy.com/event-details/spring-day-camp-2025-04-14-08-30', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.5starsocceracademy.com/event-details/vc-girls-tryout-2014-to-2017-2025-03-18-18-00', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.5starsocceracademy.com/event-details/5-star-2011-blue-vs-lic-soccer-club', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.5starsocceracademy.com/event-details/5-star-girls-blue-vs-success-academy', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const FIVE_STAR_SOCCER_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: '5 Star Soccer Academy',
    officialActionUrl: FIVE_STAR_SOCCER_TRAINING_URL,
    sourceUrl: FIVE_STAR_SOCCER_HOME_URL,
    organizerName: '5 Star Soccer Academy',
    sportName: 'Soccer',
    formatLabel: 'Professional youth soccer training, development, advanced travel, and camps',
    city: 'New York City, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Spring, Summer, Fall, and Winter youth soccer training',
    scheduleText: 'The stored official homepage describes Little 5 Stars for ages 3-5, a Development Program for ages 6-13, an Advanced Travel Program for ages 7-13, and seasonal player and goalkeeper camps for ages 5-13.',
    statusText: 'Review-only club profile; the official training, summer, camp, and free-trial links are retained as outbound action URLs while their detail pages remain unchecked.',
    description: FIVE_STAR_SOCCER_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Training', 'Camps', 'New York City'],
    logoUrl: FIVE_STAR_SOCCER_LOGO_SOURCE_URL,
    logoSourceUrl: FIVE_STAR_SOCCER_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed homepage identifies NYC youth soccer programming but does not publish a canonical street address, so no address is assigned.',
      'Training, summer, camp, and free-trial links are preserved as official outbound URLs; no complete current dated EVENT row is captured.',
      'The stored event-detail and tryout pages are UNCHECKED, and historical 2025 rows are not emitted as current events.',
      'The Advanced Travel Program describes player development, but TEAM mappings are out of scope and no team candidate is created.',
      'The stored first-party 5 Star Soccer Academy crest was normalized locally to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FIVE_STAR_SOCCER_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FIVE_STAR_SOCCER_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: '5 Star Soccer Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FIVE_STAR_SOCCER_TRAINING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FIVE_STAR_SOCCER_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: '5 Star Soccer Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Professional youth soccer training, development, advanced travel, and camps' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Spring, Summer, Fall, and Winter youth soccer training' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Training, Camps, New York City' },
    description: { selector: 'body', mode: 'literal', value: FIVE_STAR_SOCCER_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: FIVE_STAR_SOCCER_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveStarSoccerAcademy.html');

export const FIVE_STAR_SOCCER_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: FIVE_STAR_SOCCER_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
