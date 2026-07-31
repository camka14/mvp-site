import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYC_BEACH_VOLLEYBALL_HOME_URL = 'https://www.nycbeachvb.com/';
export const NYC_BEACH_VOLLEYBALL_ABOUT_URL = 'https://www.nycbeachvb.com/aboutus';
export const NYC_BEACH_VOLLEYBALL_TRAINING_URL = 'https://www.nycbeachvb.com/training';
export const NYC_BEACH_VOLLEYBALL_SCHEDULE_URL = 'https://www.nycbeachvb.com/schedule';
export const NYC_BEACH_VOLLEYBALL_PRIVATE_LESSONS_URL = 'https://www.nycbeachvb.com/private-lessons';
export const NYC_BEACH_VOLLEYBALL_RECRUITING_URL = 'https://www.nycbeachvb.com/recruiting';
export const NYC_BEACH_VOLLEYBALL_LOGO_SOURCE_URL =
  'https://images.squarespace-cdn.com/content/v1/6086d43b15a77c57511045ff/5b4d9e8c-0b21-45ba-8fde-6d28510ca882/NYC%2BBEACH%2BVOLLYBALL%2BLOGO_4_DIGITAL.png?format=1500w';

export const NYC_BEACH_VOLLEYBALL_ORG_DESCRIPTION =
  'NYC Beach Volleyball Club is New York City’s beach volleyball training program, offering coaching, training, private lessons, and recruiting support.';

export const NYC_BEACH_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'bb0a260b-6a4f-49b4-8b78-83e7d58bbbd5',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-beach-volleyball-nycbeachvb-com',
  intakeName: 'NYC Beach Volleyball',
  baseUrl: 'https://www.nycbeachvb.com',
  complianceStatus: 'ALLOWED',
  runId: '8aae8b70-45ab-44f0-9d07-e11a9120be04',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:18:38.328Z',
  pages: [
    { url: NYC_BEACH_VOLLEYBALL_ABOUT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycbeachvb.com/coaches', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycbeachvb.com/contact-us', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_BEACH_VOLLEYBALL_PRIVATE_LESSONS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_BEACH_VOLLEYBALL_RECRUITING_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_BEACH_VOLLEYBALL_TRAINING_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycbeachvb.com/home', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYC_BEACH_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: NYC_BEACH_VOLLEYBALL_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    discoveredUrls: '4690a1e13f4b14bcc9cd8d85a78eb6370c6b2f25f6d1c40a77c7eb8faa06f3da',
    pageBranding: '3549762c003ee037f4567d68d216db794ac7ac9891af4edd650add1ab87d27b8',
    pageHtml: '946cd1087ea59eaa7cca3d16cefd94dd28e16894696384c5a50d08bca101db9b',
    pageImages: 'be8dd644d612ff3275812049ca172e7d5c35b61d1ecc710e65c648f9175d4611',
    pageLinks: '626bf65640f56e33528392a893b665559bd36cddd55552c4cd431e9d1f6c3295',
    pageMarkdown: '5325e2736fc70378b3c205984859ef74eec4979d6635870e26b1d6ab4a02f2b3',
    pageScreenshot: '6de73d89744636da637c290fcd99082897e970456da3a53aea0215a9b0a33f36',
    mapRequest: '09c3674b27c64ef16300ac8bd6dda6642212fed3ac6faeb0edbe482f2e27735e',
    mapResponse: '0ce9dd64bbb4d700a0e085c99e4082fe4106eb62e7ad4dba52f9b6fe65da7fe9',
    scrapeRequest: 'f9c9eedb7c58a5014b5dc646dc0a83b21df00d43af96c9bc3778ca397eb8a6da',
    scrapeResponse: 'fab2f7cfc902a6fbae098e3491a99c242dc2ae36d9a9dc2d8ba1db3e62f2ce28',
    robots: '8ad56335b2c888298bd1db488bb57ce03ee8f6bdc2d182401ccbe66b989599dc',
    logoCandidates: [
      'b18ee86c56d86a1609e01f1ed58ebe8d93a07728dd41a9be766c2ddd5a5e0c65',
      'b18ee86c56d86a1609e01f1ed58ebe8d93a07728dd41a9be766c2ddd5a5e0c65',
    ],
  },
} as const;

export const NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NYC Beach Volleyball',
    officialActionUrl: NYC_BEACH_VOLLEYBALL_TRAINING_URL,
    sourceUrl: NYC_BEACH_VOLLEYBALL_HOME_URL,
    organizerName: 'NYC Beach Volleyball Club',
    sportName: 'Beach Volleyball',
    formatLabel: 'Beach volleyball training, coaching, private lessons, and recruiting',
    city: 'New York City, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Beach volleyball training and coaching',
    scheduleText: 'The stored official homepage describes a New York City beach volleyball training program, coaching, recruiting support, and private lessons. The linked schedule and program detail pages were not captured with complete current dated rows.',
    statusText: 'Review-only club profile; current schedule and program dates require complete captured detail rows.',
    description: NYC_BEACH_VOLLEYBALL_ORG_DESCRIPTION,
    tags: ['Club', 'Beach Volleyball', 'Training', 'Youth'],
    warnings: [
      'The stored homepage links to training, private lessons, recruiting, and a schedule page, but no complete current date, time, venue, price, and action row is present in the captured evidence; dated rows are withheld.',
      'The source identifies NYC/New York City but does not provide a canonical street address or facility in the stored evidence, so no address is assigned.',
      'The captured highlights are explicitly from previous seasons and are not emitted as current events or teams.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYC_BEACH_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYC_BEACH_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Beach Volleyball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYC_BEACH_VOLLEYBALL_TRAINING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYC_BEACH_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Beach Volleyball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Beach Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Beach volleyball training, coaching, private lessons, and recruiting' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Beach volleyball training and coaching' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official homepage describes a New York City beach volleyball training program, coaching, recruiting support, and private lessons; current dated rows are withheld.' },
    description: { selector: 'body', mode: 'literal', value: NYC_BEACH_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Beach Volleyball, Training, Youth' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: NYC_BEACH_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycBeachVolleyball.html');

export const NYC_BEACH_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:18:38.328Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
