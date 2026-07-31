import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL = 'https://www.foxsoccer.academy/';
export const FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL = 'https://www.foxsoccer.academy/new-york-tryouts';
export const FOX_SOCCER_ACADEMY_NEW_YORK_PROGRAMS_URL = 'https://www.foxsoccer.academy/youth-academy-programs-ny';
export const FOX_SOCCER_ACADEMY_NEW_YORK_LOGO_SOURCE_URL =
  'https://static.wixstatic.com/media/298bfc_0d125b762f98482ea978f51d2c8c9306~mv2_d_1336_1598_s_2.png';

export const FOX_SOCCER_ACADEMY_NEW_YORK_ORG_DESCRIPTION =
  'Fox Soccer Academy New York is a soccer club offering progressive academy development, competitive youth programs, and tryout opportunities for the 2026/2027 season. The stored official page describes EDP, Pre-ECNL, ECNL Regional League, NAL, and youth academy pathways.';

export const FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '756a60fa-98d0-4420-8325-70a10a85aa93',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-fox-soccer-academy-new-york-foxsoccer-academy',
  intakeName: 'Fox Soccer Academy New York',
  baseUrl: 'https://www.foxsoccer.academy',
  complianceStatus: 'ALLOWED',
  runId: '0c286431-9533-410b-9029-59fe46ff6331',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:12:01.005Z',
  pages: [
    { url: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: FOX_SOCCER_ACADEMY_NEW_YORK_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    logoCandidate: '0cddfd9ed369567bed3a7ac5fa0bfa2f97cbabeeaa1cb587dac39aa89d2c7ffb',
    pageBranding: '0354efc94e1f8e561434d2d19bffa85cd720d8061b3df48abf444126e0544121',
    pageHtml: 'e8e49762bb4b39d1181059620ee22c9bf0bd696360bf05368fbb43d52d3b5f17',
    pageLinks: '3439a59f1ac7cbb1fd8cbf4dfadd581fbad94753423aee6ebb8f813e8cd93770',
    pageMarkdown: 'c97668e3f5ecf73ed68b32502be053393b11fb9d3e4803cb0a00a9fbf8fee8e9',
    robots: 'd384bd419374f414f1b441efe693d66d93a4666ffc2276acd667228cf141f022',
  },
} as const;

export const FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Fox Soccer Academy New York',
    officialActionUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL,
    sourceUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL,
    organizerName: 'Fox Soccer Academy New York',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer academy and club',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Academy programs and tryout information',
    scheduleText:
      'The stored official page describes 2026/2027 academy tryouts, progressive soccer programs, and official registration paths. The displayed June tryout dates do not include a year and are withheld from event output.',
    statusText: 'Review-only club profile; ambiguous tryout dates are withheld.',
    description: FOX_SOCCER_ACADEMY_NEW_YORK_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Academy'],
    warnings: [
      'The page labels the program New York but also lists separate New York State locations; no single facility address is assigned to the organization.',
      'Displayed June tryout dates have no source-provided year and are not emitted as scheduled events.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Fox Soccer Academy New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Fox Soccer Academy New York' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth soccer academy and club' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Academy programs and tryout information' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'The stored official page describes 2026/2027 academy tryouts and progressive soccer programs. Ambiguous June dates are withheld.' },
    description: { selector: 'body', mode: 'literal', value: FOX_SOCCER_ACADEMY_NEW_YORK_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Academy' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/foxSoccerAcademyNewYorkTryouts.html');

export const FOX_SOCCER_ACADEMY_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:12:01.005Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
