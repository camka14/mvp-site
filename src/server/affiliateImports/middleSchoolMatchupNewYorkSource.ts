import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const MSM_NEW_YORK_HOME_URL = 'https://www.middleschoolmatchup.com/newyork';
export const MSM_HOME_URL = 'https://www.middleschoolmatchup.com/';
export const MSM_NEW_YORK_PREREGISTER_URL = 'https://middleschoolmatchup.formstack.com/forms/msm_newyork_vip';
export const MSM_ORG_DESCRIPTION =
  'Middle School Matchup organizes middle-school baseball championships in which players are aligned by school and grade and form temporary teams for a weekend of play. The stored New York page describes Summer 2026 play in New York area fields.';

export const MSM_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '021bd253-be2a-4b02-b9f9-2993363b0c24',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-msm-newyork-registration-baseball-middleschoolmatchup-com',
  intakeName: 'MSM New York Registration Baseball',
  baseUrl: 'https://www.middleschoolmatchup.com',
  complianceStatus: 'ALLOWED',
  runId: '6789ddb7-6fbb-49fe-8f61-715051b949e6',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:51.385Z',
  pages: [
    { url: MSM_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/newyork-pre-registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/atlanta-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/austin', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dallas', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dallas-football', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dallas-softball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dfwwest-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dfwwest-football', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/dfwwest-softball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/fans', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-football', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-golf', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-soccer-2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-softball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/kansascity-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/lasvegas-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/lubbock', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/orlando-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/sanantonio', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/socal', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/south-jersey', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/southflorida-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/southflorida-softball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/sponsors', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/tampa-baseball', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/westtexas', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: MSM_NEW_YORK_HOME_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.middleschoolmatchup.com/dallas-freshmantournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/houston-freshman-tournament-2', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/sanantonio-freshman-tournament', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/privacy-policy-2', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.middleschoolmatchup.com/terms-conditions', role: 'POLICY', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const MSM_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Middle School Matchup New York',
    officialActionUrl: MSM_NEW_YORK_PREREGISTER_URL,
    sourceUrl: MSM_NEW_YORK_HOME_URL,
    organizerName: 'Middle School Matchup',
    sportName: 'Baseball',
    formatLabel: 'Middle school baseball championships',
    city: 'New York Area',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Summer 2026',
    scheduleText: 'The stored allowed New York page lists Summer 2026 middle-school baseball championships in New York area fields and says games are played during the day.',
    statusText: 'Review-only club profile; the official pre-registration link is retained as an outbound action URL, while exact dates, fields, prices, and registration detail remain unavailable in the stored allowed listing.',
    description: MSM_ORG_DESCRIPTION,
    tags: ['Club', 'Baseball', 'Middle School', 'Youth', 'New York'],
    warnings: [
      'The stored allowed New York listing provides a Summer 2026 season and broad New York area location but no exact event date, field, price, capacity, or start time; no EVENT candidate is inferred.',
      'The official Formstack pre-registration URL is preserved as an outbound action link only; the linked registration/detail pages are not captured for this intake.',
      'The two stored image candidates are a baseball photograph and a generic baseball image rather than a clearly identified MSM brand mark, so logo disposition is MANUAL_REVIEW.',
      'The program forms temporary teams by school and grade, but TEAM mappings are out of scope and no TEAM candidate is created.',
      'Other location, tournament, policy, and registration pages are UNCHECKED and remain withheld.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const MSM_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: MSM_NEW_YORK_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Middle School Matchup New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: MSM_NEW_YORK_PREREGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: MSM_NEW_YORK_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Middle School Matchup' },
    sportName: { selector: 'body', mode: 'literal', value: 'Baseball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Middle school baseball championships' },
    city: { selector: 'body', mode: 'literal', value: 'New York Area' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Summer 2026' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Baseball, Middle School, Youth, New York' },
    description: { selector: 'body', mode: 'literal', value: MSM_ORG_DESCRIPTION },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: MSM_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/middleSchoolMatchupNewYork.html');

export const MSM_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: MSM_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
