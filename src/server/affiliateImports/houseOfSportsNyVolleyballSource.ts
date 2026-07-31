import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const HOUSE_OF_SPORTS_NY_HOME_URL = 'https://www.houseofsportsny.com/';
export const HOUSE_OF_SPORTS_NY_TRYOUT_URL = 'https://www.houseofsportsny.com/page/show/8542909-club-volleyball-tryout-registration';
export const HOUSE_OF_SPORTS_NY_CLUB_VOLLEYBALL_URL = 'https://www.houseofsportsny.com/page/show/5425826-club-volleyball';
export const HOUSE_OF_SPORTS_NY_SUMMER_CAMPS_URL = 'https://www.houseofsportsny.com/page/show/7056473-volleyball-summer-camps';
export const HOUSE_OF_SPORTS_NY_WINTER_CAMPS_URL = 'https://www.houseofsportsny.com/page/show/8866512-volleyball-winter-camps';
export const HOUSE_OF_SPORTS_NY_VOLLEYBALL_URL = 'https://www.houseofsportsny.com/page/show/5480736-volleyball';
export const HOUSE_OF_SPORTS_NY_LOGO_SOURCE_URL = 'https://www.houseofsportsny.com/logo_images/white_logo.png';
export const HOUSE_OF_SPORTS_NY_ORG_DESCRIPTION =
  'House of Sports NY offers a girls club volleyball program with 2026-2027 regional and extended-season national team tryouts. The stored registration page describes a development-focused club program, GEVA membership requirements, and age-specific tryout registration links.';

export const HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '580c1702-77d0-4bd1-b15a-e41bfce148cd',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-club-volleyball-tryout-registration-houseofsportsny-com',
  intakeName: 'Club Volleyball Tryout Registration',
  baseUrl: 'https://www.houseofsportsny.com',
  complianceStatus: 'ALLOWED',
  runId: '331f8261-d71b-4bb6-80e3-9665f6cd8664',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:30.916Z',
  pages: [
    { url: HOUSE_OF_SPORTS_NY_TRYOUT_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: HOUSE_OF_SPORTS_NY_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: HOUSE_OF_SPORTS_NY_CLUB_VOLLEYBALL_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: HOUSE_OF_SPORTS_NY_VOLLEYBALL_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: HOUSE_OF_SPORTS_NY_SUMMER_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: HOUSE_OF_SPORTS_NY_WINTER_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.houseofsportsny.com/page/show/8519242-tryout-faq-s', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 1 },
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

export const HOUSE_OF_SPORTS_NY_OFFICIAL_URLS = [
  HOUSE_OF_SPORTS_NY_HOME_URL,
  HOUSE_OF_SPORTS_NY_TRYOUT_URL,
  HOUSE_OF_SPORTS_NY_CLUB_VOLLEYBALL_URL,
  HOUSE_OF_SPORTS_NY_VOLLEYBALL_URL,
  HOUSE_OF_SPORTS_NY_SUMMER_CAMPS_URL,
  HOUSE_OF_SPORTS_NY_WINTER_CAMPS_URL,
  'https://cdn4.sportngin.com/attachments/document/a6c3-3412601/Tryout_Checklist_2026.docx',
  'https://www.geva.org/registration',
  'https://cdn4.sportngin.com/attachments/document/3c96-3188990/GEVA_Medical_Release_Form.pdf',
  'https://cdn1.sportngin.com/attachments/document/65f2-3510624/2026-2027_Age_Definition_Chart_-_Sheet1.pdf',
  'https://cdn3.sportngin.com/attachments/document/a30b-3188989/Athlete_Rubric.pdf',
  'https://apps.daysmartrecreation.com/dash/x/#/online/house/programs/67/level?facility_ids=1&season_id=908',
  'https://www.houseofsportsny.com/page/show/8519242-tryout-faq-s',
] as const;

type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

const regionalTryouts = [
  { age: '12U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14054', start: '09:00', end: '10:30' },
  { age: '13U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14077', start: '09:00', end: '10:30' },
  { age: '14U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14078', start: '10:30', end: '12:00' },
  { age: '15U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14080', start: '12:30', end: '14:00' },
  { age: '16U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14082', start: '14:30', end: '16:00' },
  { age: '17U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14084', start: '14:30', end: '16:00' },
  { age: '18U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14086', start: '14:30', end: '16:00' },
];

const nationalTryouts = [
  { age: '14U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14079', start: '16:30', end: '18:00' },
  { age: '15U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14081', start: '16:30', end: '18:00' },
  { age: '16U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14083', start: '16:30', end: '18:00' },
  { age: '17U', url: 'https://apps.daysmartrecreation.com/dash/x/#/online/house/teams/14085', start: '16:30', end: '18:00' },
];

const buildTryout = (
  division: 'Regional Team' | 'Extended Season National Team',
  age: string,
  officialActionUrl: string,
  date: '2026-08-23' | '2026-08-30',
  start: string,
  end: string,
): ManualCandidate => {
  const callback = date === '2026-08-30';
  const dateText = callback ? 'August 30, 2026' : 'August 23, 2026';
  const startIso = `${date}T${start}:00-04:00`;
  const endIso = `${date}T${end}:00-04:00`;
  return {
    listingKind: 'EVENT',
    title: `House of Sports NY ${age} ${division} Tryout${callback ? ' (Call Back Only)' : ''}`,
    officialActionUrl,
    sourceUrl: HOUSE_OF_SPORTS_NY_TRYOUT_URL,
    organizerName: 'House of Sports NY',
    sportName: 'Volleyball',
    formatLabel: `${age} ${division.toLowerCase()} club volleyball tryout`,
    city: null,
    venueName: null,
    address: null,
    startsAt: startIso,
    endsAt: endIso,
    timeZone: 'America/New_York',
    scheduleText: `${dateText}, ${start}-${end} local time as published on the stored registration page; ${callback ? 'call back only' : 'mandatory'} tryout.`,
    dateDisplayMode: 'SCHEDULED',
    dateDisplayText: dateText,
    ageGroup: age,
    divisionText: division,
    statusText: callback ? 'Review-only call-back tryout row; official registration details remain on the outbound House of Sports NY page.' : 'Review-only mandatory tryout row; official registration details remain on the outbound House of Sports NY page.',
    description: HOUSE_OF_SPORTS_NY_ORG_DESCRIPTION,
    tags: ['Event', 'Volleyball', 'Tryout', age, division.replace(' Team', '')],
    warnings: [
      'The stored allowed registration page publishes the 2026 date and time row but no venue or street address; location remains unset.',
      callback ? 'The source labels this August 30 row CALL BACK ONLY.' : 'The source labels this August 23 row MANDATORY.',
      'Mapping remains review-only; the team registration URLs are preserved as official outbound actions and no TEAM candidate is created.',
    ],
  };
};

const manualCandidates: ManualCandidate[] = [
  ...regionalTryouts.flatMap((tryout) => [
    buildTryout('Regional Team', tryout.age, tryout.url, '2026-08-23', tryout.start, tryout.end),
    buildTryout('Regional Team', tryout.age, tryout.url, '2026-08-30', tryout.start, tryout.end),
  ]),
  ...nationalTryouts.flatMap((tryout) => [
    buildTryout('Extended Season National Team', tryout.age, tryout.url, '2026-08-23', tryout.start, tryout.end),
    buildTryout('Extended Season National Team', tryout.age, tryout.url, '2026-08-30', tryout.start, tryout.end),
  ]),
];

export const HOUSE_OF_SPORTS_NY_MANUAL_CANDIDATES = manualCandidates;

export const HOUSE_OF_SPORTS_NY_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOUSE_OF_SPORTS_NY_TRYOUT_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'House of Sports NY Volleyball Tryouts' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOUSE_OF_SPORTS_NY_TRYOUT_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: HOUSE_OF_SPORTS_NY_TRYOUT_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'House of Sports NY' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'August 23 and August 30, 2026 tryout dates' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Volleyball, Tryout' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/houseOfSportsNyVolleyball.html');

export const HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
