import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PRO_SKILLS_NYC_HOME_URL = 'https://proskillsbasketball.com/';
export const PRO_SKILLS_NYC_TEAMS_URL = 'https://proskillsbasketball.com/new-york-city/teams/';
export const PRO_SKILLS_NYC_REGISTER_URL = 'https://proskillsbasketball.com/register/';
export const PRO_SKILLS_NYC_LOGO_SOURCE_URL = 'https://proskillsbasketball.com/wp-content/uploads/2021/10/proskills_logo_web_2x.png';

export const PRO_SKILLS_NYC_ORG_DESCRIPTION =
  'Pro Skills Basketball New York City is a youth basketball club whose experienced coaches develop players for the next level while teaching basketball, life, and success skills.';

export const PRO_SKILLS_NYC_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '0000a3f3-db6b-4a50-92a1-8e7e1fc058e7',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-city-club-teams-proskillsbasketball-com',
  intakeName: 'New York City Club Teams',
  baseUrl: 'https://proskillsbasketball.com',
  complianceStatus: 'ALLOWED',
  runId: '167ecacd-32c0-472f-98d0-8915ef69667f',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:01:10.069Z',
  pages: [
    { url: PRO_SKILLS_NYC_TEAMS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://proskillsbasketball.com/about/our-team/city-directors', role: 'DIRECTORY', robotsStatus: 'UNCHECKED' },
    { url: PRO_SKILLS_NYC_REGISTER_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://proskillsbasketball.com/locations/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://proskillsbasketball.com/camps/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://proskillsbasketball.com/clinics/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const PRO_SKILLS_NYC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Pro Skills Basketball New York City',
    officialActionUrl: PRO_SKILLS_NYC_TEAMS_URL,
    sourceUrl: PRO_SKILLS_NYC_TEAMS_URL,
    organizerName: 'Pro Skills Basketball',
    sportName: 'Basketball',
    formatLabel: 'Youth basketball club teams and player development',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing New York City basketball club programs',
    scheduleText: 'The stored official NYC team listing describes club basketball teams, experienced coaching, player development, and life-skills instruction in New York City.',
    statusText: 'Review-only club profile; current NYC tryout dates, venues, prices, and registration rows require the unchecked registration and city-detail pages.',
    description: PRO_SKILLS_NYC_ORG_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Youth', 'New York'],
    logoUrl: PRO_SKILLS_NYC_LOGO_SOURCE_URL,
    logoSourceUrl: PRO_SKILLS_NYC_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed NYC listing supports an ongoing club profile but its tryout catalog contains other city rows and no complete current NYC date, time, venue, price, and registration row; no EVENT candidate is created.',
      'The stored city-director, registration, locations, camps, and clinics pages are UNCHECKED and remain withheld.',
      'Team and roster details are intentionally not mapped because TEAM mappings are out of scope.',
      'The stored first-party Pro Skills Basketball crest was normalized onto a dark opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PRO_SKILLS_NYC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: PRO_SKILLS_NYC_TEAMS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Pro Skills Basketball New York City' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: PRO_SKILLS_NYC_TEAMS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: PRO_SKILLS_NYC_TEAMS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Pro Skills Basketball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth basketball club teams and player development' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing New York City basketball club programs' },
    description: { selector: 'body', mode: 'literal', value: PRO_SKILLS_NYC_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Youth, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: PRO_SKILLS_NYC_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/proSkillsBasketballNewYorkCity.html');

export const PRO_SKILLS_NYC_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: PRO_SKILLS_NYC_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
