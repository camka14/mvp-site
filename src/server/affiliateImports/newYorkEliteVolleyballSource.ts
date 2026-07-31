import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_ELITE_VOLLEYBALL_HOME_URL = 'https://www.newyorkelitevolleyball.com/';
export const NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL = 'https://www.newyorkelitevolleyball.com/page/show/2787448-tryouts';
export const NEW_YORK_ELITE_VOLLEYBALL_PROGRAMS_URL = 'https://www.newyorkelitevolleyball.com/page/show/2904514-programs';
export const NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL = 'https://www.newyorkelitevolleyball.com/page/show/4152521-camps';

export const NEW_YORK_ELITE_VOLLEYBALL_ORG_DESCRIPTION =
  'New York Elite Volleyball offers club volleyball teams, outdoor doubles, camps, clinics, and volleyball skill development with top notch coaches.';

export const NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'b80cdce4-c566-401b-a7c0-6f0e9e9769c0',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-elite-volleyball-newyorkelitevolleyball-com',
  intakeName: 'New York Elite Volleyball',
  baseUrl: 'https://www.newyorkelitevolleyball.com',
  complianceStatus: 'ALLOWED',
  runId: 'd078564e-7f0f-4265-be38-2bbc8b5d701f',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:18:14.137Z',
  pages: [
    { url: NEW_YORK_ELITE_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_ELITE_VOLLEYBALL_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    pageBranding: '91ef1348abedfc93af987fa86146aaefeb14a25b78f70a955211ee6b1677c163',
    pageHtml: '582e12f749813ec7fc5dcf541351daf55563b428d30faa6113559362782f6976',
    pageImages: '514e9829cc87fc6a01e1ae59155123f2d82970e04aa4f38572ac29f95ce3acac',
    pageLinks: '7ee1fa1f4bb4a2909e40ca17a59b56ceaac223e5046086e6f2061487e342bbeb',
    pageMarkdown: '95b702759fa4036bcf5bf569540c1b16844932ac71eb539cb6385f7d3af5bd90',
    robots: 'a4b990cecd876d29f75da02412e46ab96760af94a6dbaf9f675d5b71b3a479af',
    logoCandidates: [
      'b11fc089cedc715af1c4588667829fedfe7e3477fb5272efb36534364a73a7fd',
      '30ecb55821b6901e1cd228a4b59a6f640c079e679848272af56c5021dc5aa216',
      'e701548e4235e09005342744e5ad5310f1ad7f4a8544e47c5e7280cb9de2c43b',
    ],
  },
} as const;

export const NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'New York Elite Volleyball',
    officialActionUrl: NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL,
    sourceUrl: NEW_YORK_ELITE_VOLLEYBALL_HOME_URL,
    organizerName: 'New York Elite Volleyball',
    sportName: 'Volleyball',
    formatLabel: 'Club volleyball teams, outdoor doubles, camps, and clinics',
    city: null,
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club teams, outdoor doubles, camps, clinics, and volleyball development',
    scheduleText: 'The stored official homepage describes club volleyball teams, outdoor doubles, camps, clinics, and volleyball skill development. Current dated program rows are withheld because the linked detail pages were not captured.',
    statusText: 'Review-only club profile; current camp, fall training, and tryout details require captured detail pages.',
    description: NEW_YORK_ELITE_VOLLEYBALL_ORG_DESCRIPTION,
    tags: ['Club', 'Volleyball', 'Youth', 'Training'],
    warnings: [
      'The homepage links to 2026 Summer Camp, team tryout registration, and fall training detail pages, but those pages were not captured in the stored evidence and no dated event row is emitted.',
      'The stored homepage does not establish a canonical city or organization address; the Mid-Hudson Athletic Center appears as a linked facility/partner and is not assigned as the organization address.',
      'The stored logo candidates are a Mid-Hudson Athletic Center mark, a SportsEngine mark, and a favicon; no supportable New York Elite organization logo is assigned.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_ELITE_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NEW_YORK_ELITE_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Elite Volleyball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_ELITE_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Elite Volleyball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Club volleyball teams, outdoor doubles, camps, and clinics' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Club teams, outdoor doubles, camps, clinics, and volleyball development' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official homepage describes club volleyball teams, outdoor doubles, camps, clinics, and volleyball skill development; current dated program rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: NEW_YORK_ELITE_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Training' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NEW_YORK_ELITE_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkEliteVolleyball.html');

export const NEW_YORK_ELITE_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:18:14.137Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
