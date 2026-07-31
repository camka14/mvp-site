import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_DIAMOND_GIRLS_HOME_URL = 'https://www.newyorkdiamondgirls.com/';
export const NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL = 'https://www.newyorkdiamondgirls.com/tryouts';
export const NEW_YORK_DIAMOND_GIRLS_TOURNAMENTS_URL = 'https://www.newyorkdiamondgirls.com/our-tournaments';
export const NEW_YORK_DIAMOND_GIRLS_CLINIC_URL = 'https://www.newyorkdiamondgirls.com/2026-college-skills-clinic';
export const NEW_YORK_DIAMOND_GIRLS_LOGO_SOURCE_URL = 'https://www.newyorkdiamondgirls.com/uploads/IMlJMPrd/DGLogo.jpg';

export const NEW_YORK_DIAMOND_GIRLS_ORG_DESCRIPTION =
  'New York Diamond Girls Softball is an amateur softball organization in Western New York and Southern Ontario offering softball teams, training, development, recruiting, instructional camps and clinics, and college showcase tournaments.';

export const NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '4e8352d8-dd39-4e74-832b-a78d985ed995',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-tryouts-newyorkdiamondgirls-com',
  intakeName: 'Tryouts',
  baseUrl: 'https://www.newyorkdiamondgirls.com',
  complianceStatus: 'ALLOWED',
  runId: '5a75a085-3c8f-4dc5-acb6-b644084e2876',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:04:36.135Z',
  pages: [
    { url: NEW_YORK_DIAMOND_GIRLS_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.newyorkdiamondgirls.com/announcements', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_DIAMOND_GIRLS_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_DIAMOND_GIRLS_CLINIC_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
  ],
  artifacts: {
    logoCandidate: '64c5884cc74525a3c11f81079592d4128dac924e7ee3a9a87a9bb32b929f54b9',
    pageBranding: 'dbf089629fa61a0fb2c44a8f612b1f705c01faf5fcb069bc6b040fdd1d29bb01',
    pageHtml: 'c96cfc9b44a1cc32dd4eb6c02e171b4b1c0debef91c97d9dc2515b691c527e7d',
    pageLinks: 'f28f3bb29c7c451abb806713b69c9d621479e601501f320614023f2d4754d793',
    pageMarkdown: 'f57d05c99621084c9343c26f1f676a2cec5728331f7904b2578d62b9fbd58a68',
    robots: '38bf20674e83eb9faf13acb7d5f5e67faab2d304f76d4443782be6c512b89f12',
  },
} as const;

export const NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'New York Diamond Girls Softball',
    officialActionUrl: NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
    sourceUrl: NEW_YORK_DIAMOND_GIRLS_HOME_URL,
    organizerName: 'New York Diamond Girls Softball',
    sportName: 'Softball',
    formatLabel: 'Western New York and Southern Ontario amateur softball organization',
    city: null,
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Organization programs, training, development, and recruiting',
    scheduleText:
      'The stored official pages describe softball teams, indoor and outdoor training facilities, development and recruiting programs, instructional camps and clinics, and college showcase tournaments. Current dated rows are withheld unless the stored evidence includes a complete date, time, venue, price, and official action.',
    statusText: 'Review-only club profile; incomplete or past dated rows are withheld.',
    description: NEW_YORK_DIAMOND_GIRLS_ORG_DESCRIPTION,
    tags: ['Club', 'Softball', 'Youth', 'Training'],
    warnings: [
      'The stored announcements page says the 2026-2027 tryout schedule was posted, but the official tryouts page was not captured with a complete current date, time, venue, price, and action row.',
      'The stored 2026 clinic and tournament announcements are past as of the review date and are not emitted as current events.',
      'The source names two training facilities in Cheektowaga and Depew, so no single canonical organization address is assigned.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_DIAMOND_GIRLS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NEW_YORK_DIAMOND_GIRLS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Diamond Girls Softball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_DIAMOND_GIRLS_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Diamond Girls Softball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Softball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Western New York and Southern Ontario amateur softball organization' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Organization programs, training, development, and recruiting' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official pages describe softball teams, training, development, recruiting, camps, clinics, and college showcase tournaments; incomplete or past dated rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: NEW_YORK_DIAMOND_GIRLS_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Softball, Youth, Training' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NEW_YORK_DIAMOND_GIRLS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkDiamondGirls.html');

export const NEW_YORK_DIAMOND_GIRLS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T20:04:36.135Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
