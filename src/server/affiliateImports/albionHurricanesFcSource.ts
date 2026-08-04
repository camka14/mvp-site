import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ALBION_HURRICANES_HOME_URL = 'https://www.albionhurricanes.org/';
export const ALBION_HURRICANES_REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0xODAxLTE3Nzg4NTc3ODF8QjJPc0dpWmI4SEUrUHFtaUhObjVvRVFWNE9HenZGWWtHVC9TMmF6djV3RT0=&program_id=87909';
export const ALBION_HURRICANES_LOGO_SOURCE_URL = 'https://irp.cdn-website.com/efc7d580/dms3rep/multi/opt/AHFC+Logo-1920w.png';
export const ALBION_HURRICANES_ORG_DESCRIPTION =
  'Albion Hurricanes FC is a Houston-area youth soccer club for boys and girls ages 6-19, with recreational, competitive, and elite pathways, year-round training, college recruitment support, and multiple Greater Houston locations.';

export const ALBION_HURRICANES_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '6a552141-1c45-434f-90a8-3098627b9ac7',
  intakeSourceKey: 'houston-texas-metropolitan-area-albion-hurricanes-fc-youth-soccer-club-in-houston-tx-albionhurricane',
  intakeName: 'Albion Hurricanes FC Youth Soccer Club in Houston, TX',
  baseUrl: ALBION_HURRICANES_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '0486a3b6-7a79-4f15-afd2-7893e798cb78',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-31T22:15:05.206Z',
  pages: [
    { url: ALBION_HURRICANES_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.albionhurricanes.org/registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.albionhurricanes.org/news---events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.albionhurricanes.org/tournaments', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.albionhurricanes.org/canes-soccer-camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.albionhurricanes.org/facilities', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const ALBION_HURRICANES_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Albion Hurricanes FC',
    officialActionUrl: ALBION_HURRICANES_REGISTRATION_URL,
    sourceUrl: ALBION_HURRICANES_HOME_URL,
    organizerName: 'Albion Hurricanes FC',
    sportName: 'Soccer',
    formatLabel: 'Youth recreational, competitive, and elite soccer club',
    city: 'Houston, TX',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round Albion Hurricanes FC youth soccer programs',
    scheduleText: 'The stored homepage describes year-round training and pathways across multiple Greater Houston locations, including Katy, Cypress, Sugar Land, and Beaumont.',
    participantOptionsText: 'Boys and girls ages 6-19 can enter recreational, competitive, elite, ECNL/RL, goalkeeper, academy, and college-bound pathways; all players must register for team placement consideration.',
    priceText: 'The stored homepage states registration is free; program-specific fees are not published on the allowed page.',
    statusText: 'Review-only ongoing soccer club profile; the stored 2026 Spring Season remainder is not emitted as a dated event because it is past at review time.',
    description: ALBION_HURRICANES_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Recreational', 'Competitive', 'Elite', 'Houston'],
    tagText: 'Club, Soccer, Youth, Recreational, Competitive, Elite, Houston',
    warnings: [
      'The stored ALLOWED Albion Hurricanes FC homepage supports an ongoing Houston-area youth soccer club profile for boys and girls ages 6-19.',
      'The allowed homepage says Albion serves multiple Greater Houston locations, including Katy, Cypress, Sugar Land, and Beaumont, but does not publish a canonical street address; no facility address is inferred.',
      'The stored 2026 Spring Season remainder is past at review time. Registration, tryout, camp, tournament, facility, and other detail pages are UNCHECKED and no dated EVENT, RENTAL, or TEAM candidate is created.',
      'The stored first-party AHFC crest from the page branding candidate was normalized to an opaque 1024px square PNG without changing the mark.',
    ],
    logoUrl: ALBION_HURRICANES_LOGO_SOURCE_URL,
    logoSourceUrl: ALBION_HURRICANES_LOGO_SOURCE_URL,
    logoOriginalName: 'albion-hurricanes-fc-logo.png',
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ALBION_HURRICANES_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ALBION_HURRICANES_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Albion Hurricanes FC' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ALBION_HURRICANES_REGISTRATION_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ALBION_HURRICANES_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Albion Hurricanes FC' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth recreational, competitive, and elite soccer club' },
    city: { selector: 'body', mode: 'literal', value: 'Houston, TX' },
    ageGroup: { selector: 'body', mode: 'literal', value: 'Boys and girls ages 6-19' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round Albion Hurricanes FC youth soccer programs' },
    description: { selector: 'body', mode: 'literal', value: ALBION_HURRICANES_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Recreational, Competitive, Elite, Houston' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: ALBION_HURRICANES_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/albionHurricanesFc.html');

export const ALBION_HURRICANES_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: ALBION_HURRICANES_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
