import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_STARS_HOCKEY_HOME_URL = 'https://www.newyorkstarshockey.com/';
export const NEW_YORK_STARS_HOCKEY_REGISTRATION_URL = 'https://www.newyorkstarshockey.com/register';
export const NEW_YORK_STARS_HOCKEY_SKILLS_URL = 'https://www.newyorkstarshockey.com/registration/66915';
export const NEW_YORK_STARS_HOCKEY_HOUSE_LEAGUE_URL = 'https://www.newyorkstarshockey.com/leagues/prestige-stars-house-league/18071';
export const NEW_YORK_STARS_HOCKEY_ABOUT_URL = 'https://www.newyorkstarshockey.com/about/about-us/74624';
export const NEW_YORK_STARS_HOCKEY_CONTACT_URL = 'https://www.newyorkstarshockey.com/about/contacts/128100';
export const NEW_YORK_STARS_HOCKEY_SCHEDULE_URL = 'https://www.newyorkstarshockey.com/schedule';
export const NEW_YORK_STARS_HOCKEY_INSTAGRAM_URL = 'https://www.instagram.com/NewYorkStarsHockeyClub';
export const NEW_YORK_STARS_HOCKEY_LOGO_SOURCE_URL = 'https://crossbar.s3.amazonaws.com/organizations/1760/uploads/c6e11654-674f-4707-9f7b-b4c14eee80f6.png?versionId=8OWnYZH83lAqtjrrG2YQrvaPldwM5sgd';
export const NEW_YORK_STARS_HOCKEY_ORG_DESCRIPTION =
  'New York Stars Hockey is a premier youth ice hockey organization in Brooklyn, NY. The stored homepage describes Prestige Hockey Skills, a Prestige Stars House League, youth teams, and Greater New York Stars hockey programming.';

export const NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'bce99276-fd32-4050-980c-3748f698ac2d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-stars-hockey-newyorkstarshockey-com',
  intakeName: 'New York Stars Hockey',
  baseUrl: 'https://www.newyorkstarshockey.com',
  complianceStatus: 'ALLOWED',
  runId: 'ca50c6ed-3af7-4a7d-8edc-fef2ff064774',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:27.720Z',
  pages: [
    { url: NEW_YORK_STARS_HOCKEY_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_STARS_HOCKEY_REGISTRATION_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_STARS_HOCKEY_SKILLS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_STARS_HOCKEY_HOUSE_LEAGUE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_STARS_HOCKEY_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_STARS_HOCKEY_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_STARS_HOCKEY_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/about/greater-new-york-city-ice-hockey-league-alumni-page/79929', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/news/gny-alumni-event/24407', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/news/house-league-summer-info-is-here/26441', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/builder/link/program/18071', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/builder/link/program/30104', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/refund-policies', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkstarshockey.com/signup', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
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

export const NEW_YORK_STARS_HOCKEY_OFFICIAL_URLS = [
  NEW_YORK_STARS_HOCKEY_HOME_URL,
  NEW_YORK_STARS_HOCKEY_REGISTRATION_URL,
  NEW_YORK_STARS_HOCKEY_SKILLS_URL,
  NEW_YORK_STARS_HOCKEY_HOUSE_LEAGUE_URL,
  NEW_YORK_STARS_HOCKEY_ABOUT_URL,
  NEW_YORK_STARS_HOCKEY_CONTACT_URL,
  NEW_YORK_STARS_HOCKEY_SCHEDULE_URL,
  NEW_YORK_STARS_HOCKEY_INSTAGRAM_URL,
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'New York Stars Hockey',
  officialActionUrl: NEW_YORK_STARS_HOCKEY_HOME_URL,
  sourceUrl: NEW_YORK_STARS_HOCKEY_HOME_URL,
  organizerName: 'New York Stars Hockey',
  sportName: 'Ice Hockey',
  formatLabel: 'Youth ice hockey organization, Prestige Hockey Skills, and Prestige Stars House League',
  city: 'Brooklyn, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing youth ice hockey programs and house-league offerings',
  scheduleText: 'The stored homepage describes Prestige Hockey Skills and the Prestige Stars House League. It also shows 8/29 and 8/30 youth-team schedule rows at Richard J. Codey Arena, but the rows omit a year and are withheld from dated EVENT output.',
  statusText: 'Review-only youth hockey organization profile; current registration, schedule, program, team, and venue details require the official linked pages.',
  description: NEW_YORK_STARS_HOCKEY_ORG_DESCRIPTION,
  tags: ['Club', 'Ice Hockey', 'Youth', 'House League', 'Skills'],
  logoUrl: NEW_YORK_STARS_HOCKEY_LOGO_SOURCE_URL,
  logoSourceUrl: NEW_YORK_STARS_HOCKEY_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile for a Brooklyn youth hockey organization.',
    'The homepage 8/29-8/30 schedule rows omit a year; no year is inferred and no dated EVENT candidate is created. Schedule, registration, team, league, and program pages are UNCHECKED.',
    'The stored first-party Stars logo was normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const NEW_YORK_STARS_HOCKEY_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_STARS_HOCKEY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NEW_YORK_STARS_HOCKEY_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Stars Hockey' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_STARS_HOCKEY_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_STARS_HOCKEY_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Stars Hockey' },
    sportName: { selector: 'body', mode: 'literal', value: 'Ice Hockey' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth ice hockey organization, Prestige Hockey Skills, and Prestige Stars House League' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing youth ice hockey programs and house-league offerings' },
    description: { selector: 'body', mode: 'literal', value: NEW_YORK_STARS_HOCKEY_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Ice Hockey, Youth, House League, Skills' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NEW_YORK_STARS_HOCKEY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkStarsHockey.html');

export const NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
