import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_FOOTY_HOME_URL = 'https://www.nycfooty.com/';
export const NYC_FOOTY_ABOUT_URL = 'https://www.nycfooty.com/about';
export const NYC_FOOTY_REGISTER_URL = 'https://www.nycfooty.com/register-for-leagues';
export const NYC_FOOTY_CALENDAR_URL = 'https://www.nycfooty.com/calendar';
export const NYC_FOOTY_PRICING_URL = 'https://www.nycfooty.com/pricing';
export const NYC_FOOTY_UPCOMING_EVENTS_URL = 'https://www.nycfooty.com/upcoming-events';
export const NYC_FOOTY_ALL_CURRENT_LEAGUES_URL = 'https://www.nycfooty.com/all-current-leagues';
export const NYC_FOOTY_LOGO_SOURCE_URL =
  'https://images.squarespace-cdn.com/content/v1/5af1f41c96e76f0fffa9a9be/431c0670-bce0-41c6-8b41-6436f8b4fa83/NYC-Footy_Final-Logo_With-Text_2022_Shrunk_White.png?format=1500w';

export const NYC_FOOTY_ORG_DESCRIPTION =
  'Founded in 2010, NYC Footy is an adult recreational soccer league offering beginner through advanced coed and mixed leagues across New York City and Westchester.';

export const NYC_FOOTY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '2ebbf184-937c-4637-a414-ce45abe31ec4',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-footy-nycfooty-com',
  intakeName: 'NYC Footy',
  baseUrl: 'https://www.nycfooty.com',
  complianceStatus: 'ALLOWED',
  runId: 'aada2f6f-c390-4f66-b061-a372b7e78cfd',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:19:41.579Z',
  pages: [
    { url: NYC_FOOTY_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/astoria-lic', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/bed-stuy-bushwick-greenpoint-williamsburg', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/brooklyn-heights-downtown-brooklyn-red-hook', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_FOOTY_CALENDAR_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/chelsea-west-village', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/clinton-hill-crown-heights-fort-greene', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/custom-soccer-experiences-for-brands-and-companies', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/dewitt-clinton-park', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/footy-fuchs-fest', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/for-companies', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/interactive-field-map', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/jobs-and-career-opportunities', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/lower-east-side-les-soho', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/lower-manhattan-side-tribeca-west-village', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/manhattan-midtown-east-st-vartan', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/media-relations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/midtown-east', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/midtown-west', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/nyc-footy-bar-partners', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/park-slope-prospect-park-prospect-heigths', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/partner-with-us', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_FOOTY_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.nycfooty.com/50-50-flip-female-majority-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/bronx-nyc-soccer-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/corporate-soccer-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/incident-and-league-disruptions', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/indoor-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/league-rules', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/manhattan-nyc-soccer-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/queens-nyc-soccer-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/tournaments', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/upcoming-events', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/promotional-calendar-and-discount-programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycfooty.com/register-for-leagues', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: NYC_FOOTY_ALL_CURRENT_LEAGUES_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    discoveredUrls: '704e2dbfd8d9f2bf35583c11b0ca5964f5f26d0c63f791487274957477bd3cfd',
    pageBranding: '7bd539fa645e13a28b6cc8df5735ea3f2e5769406832bdc9eb31cece86106634',
    pageHtml: 'b44fea096108d1999769e17220cd4ea35bbeacfeee2147e911c92d6196f04ac9',
    pageImages: '3b3713d03d2da8fc6f5df1ed9a541d46c097f28605965d16ad87bb88a4647eaf',
    pageLinks: 'abed7b5dd7e8fb0925ee4dec65fce3e678b75dd908b22de64bd3306a6bc2d087',
    pageMarkdown: 'fecd965433d9bec7b0acbbcff5d4ad54d063102b5a4137af5fe34a3c8efdba22',
    mapRequest: '981dc3f98947e563cd2a0acadc2564d5d9ca284081fffa4db221e95ac94a4295',
    mapResponse: 'dfb2ab893345921893e94d42f829b9d6ae2b21538545f787350ae49e27030a33',
    scrapeRequest: 'aaa74a58edc8f8c1f9bfbd7427ea4aa47d07a5c8e1e978e5ad6756f114b0c12f',
    scrapeResponse: '35b9d974a2a54ca2d950588c43e41783145f572f8a387cbce550ad85b49a2e04',
    robots: 'a583ab278222ed5160716823f0d65cc210b091d27cc4a4591ac131b032025828',
    logoCandidates: {
      primary: 'dc563d4d5bce2935d47476fdf3dd6be898a4afb7a891766612724fad69759ca7',
      navigation: 'c64c7298d5069fbfcf430a95ec5803cf86096243234226166319e12110e4d1c8',
      sponsorJdSports: '1baec46eff9e7fed0d7c993317218b6601c0272ce505a7862aae46a38a778611',
      sponsorWagyuLabs: 'af0f5e87368f42eee71aa6dea8c816bf5935c57c3f85458ce729354673bf07bb',
      sponsorMackWeldon: '3505888d9e83f4d7026acce180382aef3332c11d61707bd377b8e9a8a463706d',
    },
  },
} as const;

export const NYC_FOOTY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NYC Footy',
    officialActionUrl: NYC_FOOTY_REGISTER_URL,
    sourceUrl: NYC_FOOTY_HOME_URL,
    organizerName: 'NYC Footy',
    sportName: 'Soccer',
    formatLabel: 'Adult recreational coed and mixed soccer leagues for beginner through advanced players',
    city: 'New York City metro area',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Adult recreational soccer leagues',
    scheduleText: 'The stored official homepage describes beginner through advanced coed and mixed leagues in the Bronx, Brooklyn, Manhattan, Queens, and Westchester, with fall registration open and individual, group, and full-team registration options.',
    statusText: 'Review-only league organization profile; current season dates and venue rows require complete captured registration details.',
    description: NYC_FOOTY_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Adult', 'League'],
    warnings: [
      'The homepage says Fall Registration is Open and lists featured Summer 2026 leagues, but the stored capture does not provide complete current date, time, venue, and price rows for safe EVENT creation.',
      'NYC Footy operates across multiple boroughs and Westchester; no single canonical organization address is assigned.',
      'The stored all-current-leagues path is marked RENTAL in intake discovery, but its page was not captured with a rental booking flow; no RENTAL candidate is created.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_FOOTY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYC_FOOTY_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Footy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_FOOTY_REGISTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_FOOTY_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Footy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Adult recreational coed and mixed soccer leagues for beginner through advanced players' },
    city: { selector: 'body', mode: 'literal', value: 'New York City metro area' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Adult recreational soccer leagues' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official homepage describes beginner through advanced coed and mixed leagues across New York City and Westchester; current dated rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: NYC_FOOTY_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Adult, League' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NYC_FOOTY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycFooty.html');

export const NYC_FOOTY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:19:41.579Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
