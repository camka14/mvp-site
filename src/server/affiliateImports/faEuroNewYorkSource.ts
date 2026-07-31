import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FA_EURO_NEW_YORK_HOME_URL = 'https://www.faeuro.com/';
export const FA_EURO_NEW_YORK_TRYOUTS_URL = 'https://www.faeuro.com/tryouts';
export const FA_EURO_NEW_YORK_SEASON_URL = 'https://www.faeuro.com/events/2026-27-season-registration';
export const FA_EURO_NEW_YORK_CUP_URL = 'https://www.faeuro.com/events/2026-nyc-cup-late-registration';
export const FA_EURO_NEW_YORK_CAMP_URL = 'https://www.faeuro.com/events/summer-goalkeeper-camp-2026';
export const FA_EURO_NEW_YORK_LOGO_SOURCE_URL =
  'https://static.wixstatic.com/media/a37098_53d4e9d33b2948109b03938828816de9%7Emv2_d_3394_4953_s_4_2.png/v1/fit/w_2500,h_1330,al_c/a37098_53d4e9d33b2948109b03938828816de9%7Emv2_d_3394_4953_s_4_2.png';

export const FA_EURO_NEW_YORK_ORG_DESCRIPTION =
  'FA Euro New York is a New York soccer club offering elite development programs, competitive league teams, coaching, and pathways for ambitious players. The stored official tryouts page identifies Brooklyn and Staten Island as the club\'s New York service area and describes its MLS NEXT and other competitive programs.';

export const FA_EURO_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '6b21bb63-817b-4c02-bcbb-27e8bfb8649c',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-boys-soccer-tryouts-faeuro-com',
  intakeName: 'Boys Soccer Tryouts',
  baseUrl: 'https://www.faeuro.com',
  complianceStatus: 'ALLOWED',
  runId: '4160a98f-6f8c-4efe-b152-648269d93610',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:09:34.465Z',
  pages: [
    { url: FA_EURO_NEW_YORK_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: FA_EURO_NEW_YORK_SEASON_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: FA_EURO_NEW_YORK_CUP_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: FA_EURO_NEW_YORK_CAMP_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    discoveredUrls: '20d718a2c4cb9d75bf5ffd6c8c4c49ec32714ffaae2d9da2ee2400ecfb2d67c0',
    logoCandidate: 'beb5c6f91daf4d9cc7f1d3aa675b235b22ad0ef9b028537355885c50780755af',
    pageBranding: '3e82c2730d84bd1a4bc641d5492b41a25485e62d42a5f5f228339b1624a5576c',
    pageHtml: 'ab4afc0510a55d2cce945bc8c60ac37f1bc4ad3ac3b66ab1fb3a05c98c9115fd',
    pageImages: '0a8b177201be78f293653812f868c9863cb2ab6cb22583a0275e69f56933ab23',
    pageLinks: '5026deec75c99d209f72d8b9bd3ffc9dfc20a923d208b82188a42ea59a6f61d9',
    pageMarkdown: '18655a9064296ba13d298aec6abc67d3759a3f4005d993a0899f5df7e6f7b791',
    robots: 'fd6b76d89f273c593f4a616cf45e52cecc491fb5271167decf0eb4323c3176db',
  },
} as const;

export const FA_EURO_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'FA Euro New York',
    officialActionUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
    sourceUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
    organizerName: 'FA Euro New York',
    sportName: 'Soccer',
    formatLabel: 'New York youth soccer club',
    city: 'Brooklyn and Staten Island, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club programs and tryout information',
    scheduleText:
      'The stored official tryouts page describes elite development programs, competitive league teams, and a tryout request form. Current dated tryout details are not emitted because the captured page does not provide a complete current date, time, venue, and registration row.',
    statusText: 'Review-only club profile; dated program rows remain withheld.',
    description: FA_EURO_NEW_YORK_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'MLS NEXT'],
    warnings: [
      'The intake run is PARTIAL and captured rendered content only for the official tryouts page; linked event detail pages were not captured as page evidence.',
      'The stored page identifies Brooklyn and Staten Island but does not publish one canonical street address, so no address or coordinates are inferred.',
      'The July 27-29, 2026 goalkeeper camp is past as of the review date and is withheld.',
      'The 2026/27 season registration surface is a registration page rather than a standalone event and is withheld from event output.',
      'The 2026 NYC Cup listing says date and time are TBD and is withheld.',
      'No TEAM candidate is created; roster-level team rows are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FA_EURO_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'FA Euro New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FA_EURO_NEW_YORK_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FA_EURO_NEW_YORK_TRYOUTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'FA Euro New York' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'New York youth soccer club' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn and Staten Island, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Club programs and tryout information' },
    scheduleText: {
      selector: 'body',
      mode: 'literal',
      value: 'The stored official tryouts page describes elite development programs, competitive league teams, and a tryout request form. Current dated tryout details remain withheld.',
    },
    description: { selector: 'body', mode: 'literal', value: FA_EURO_NEW_YORK_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, MLS NEXT' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: FA_EURO_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(
  process.cwd(),
  'src/server/affiliateImports/fixtures/faEuroNewYorkTryouts.html',
);

export const FA_EURO_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:09:34.465Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
