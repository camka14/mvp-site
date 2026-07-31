import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL = 'https://gothamsoccer.com/';
export const GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL = 'https://gothamsoccer.com/new-york-city';
export const GOTHAM_SOCCER_NEW_YORK_CITY_DASHBOARD_URL = 'https://app.gothamsoccer.com/gotham-new-york-city';
export const GOTHAM_SOCCER_NEW_YORK_CITY_LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/67c8bd1974923844124b1a6c/67ca0b60ecb3458546d5a154_gotham-logo-black.png';

export const GOTHAM_SOCCER_NEW_YORK_CITY_ORG_DESCRIPTION =
  'Gotham Soccer New York City is an adult recreational soccer community offering organized men\'s, women\'s, and coed leagues, pickup sessions, tournaments, standings, schedules, and player registration.';

export const GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '09b168d8-7b49-467a-a5c0-bd86a5a623d5',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-city-gothamsoccer-com',
  intakeName: 'Gotham Soccer New York City',
  baseUrl: 'https://gothamsoccer.com',
  complianceStatus: 'ALLOWED',
  runId: 'ad0cbe2a-cf97-41d4-b09b-1b22c84c9960',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:13:21.428Z',
  pages: [
    { url: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    logoCandidate: 'be775a70c65fcc04f149141d278ef068dbdaad21de1753ad975a2ba05cd8bab7',
    pageBranding: '13864010c6c270944935215b37a3120f9e44d5892f69be94e1cad666c665c621',
    pageHtml: '725bd505541ccc291869fbd20ecafe2e4b11d2e40634a5958da449baa56a5bfb',
    pageImages: '5df467dba4837b66e8ec406076dcd0575920b0d9693dcaed59cb1914a96d67fd',
    pageLinks: '3cd359684e9b9264e97acef1d7f62267777141820581b412e55565f2ca415411',
    pageMarkdown: '198779de26535006346e37c0b8c222cf4fbcb40180004aedf5cbbdab5b739469',
    robots: 'd950cf383686e200eb3843e72f307316ba4d4db1cfd2491313afd7b8f7f539f8',
  },
} as const;

export const GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Gotham Soccer New York City',
    officialActionUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL,
    sourceUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL,
    organizerName: 'Gotham Soccer',
    sportName: 'Soccer',
    formatLabel: 'Adult recreational soccer leagues',
    city: 'New York City, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'League, tournament, and pickup programs',
    scheduleText: 'The stored New York City page describes men\'s, women\'s, and coed leagues, pickup sessions, tournaments, standings, and schedules. It does not expose a dated current row in the captured evidence.',
    statusText: 'Review-only club profile; dated league and tournament rows require captured detail evidence.',
    description: GOTHAM_SOCCER_NEW_YORK_CITY_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Adult', 'League'],
    warnings: [
      'The captured listing does not include a current dated event detail row, venue, price, or schedule.',
      'The footer address is Gotham Soccer headquarters in Cincinnati, not a New York City playing venue, so no address is assigned.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Gotham Soccer New York City' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Gotham Soccer' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult recreational soccer leagues' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'League, tournament, and pickup programs' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored New York City page describes leagues, pickup sessions, tournaments, standings, and schedules; dated rows are not emitted from this capture.' },
    description: { selector: 'body', mode: 'literal', value: GOTHAM_SOCCER_NEW_YORK_CITY_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Adult, League' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/gothamSoccerNewYorkCity.html');
export const GOTHAM_SOCCER_NEW_YORK_CITY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: '2026-07-29T19:13:21.428Z', body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
