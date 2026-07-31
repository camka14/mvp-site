import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PRODIGY_VOLLEYBALL_HOME_URL = 'https://www.prodigyvb.com/';
export const PRODIGY_VOLLEYBALL_SUMMER_URL = 'https://www.prodigyvb.com/summer';
export const PRODIGY_VOLLEYBALL_TRYOUTS_URL = 'https://www.prodigyvb.com/tryouts';
export const PRODIGY_VOLLEYBALL_PROGRAMS_URL = 'https://www.prodigyvb.com/page/show/8542638-programs';
export const PRODIGY_VOLLEYBALL_CAMPS_URL = 'https://www.prodigyvb.com/page/show/8545061-camps-clinics';
export const PRODIGY_VOLLEYBALL_SCHEDULE_URL = 'https://www.prodigyvb.com/page/show/8540209-schedule';
export const PRODIGY_VOLLEYBALL_LOCATIONS_URL = 'https://www.prodigyvb.com/page/show/8601339-locations';
export const PRODIGY_VOLLEYBALL_ADULT_PROGRAMS_URL = 'https://www.prodigyvb.com/page/show/9217695-adult-programs';
export const PRODIGY_VOLLEYBALL_CONTACT_URL = 'https://www.prodigyvb.com/page/show/8543049-contact-us';
export const PRODIGY_VOLLEYBALL_FACEBOOK_URL = 'https://www.facebook.com/prodigyvbacademy/';
export const PRODIGY_VOLLEYBALL_INSTAGRAM_URL = 'https://www.instagram.com/prodigyvbacademy?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==';
export const PRODIGY_VOLLEYBALL_LOGO_SOURCE_URL = 'https://cdn2.sportngin.com/attachments/logo_graphic/34ef-205436411/prodigy_logo_vertical_3_medium.png';
export const PRODIGY_VOLLEYBALL_ORG_DESCRIPTION =
  'Prodigy Volleyball Academy is a Westchester volleyball training academy founded by Diane Swertfager, Stacey Pittman, and Maribeth Powers. The stored homepage describes girls and boys club volleyball, youth training, and a kids-first, character-first coaching approach for athletes of all skill levels.';

export const PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7af705c5-abfe-4ac0-bbdf-2d610ab0d74f',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-prodigy-volleyball-academy-prodigyvb-com',
  intakeName: 'Prodigy Volleyball Academy',
  baseUrl: 'https://www.prodigyvb.com',
  complianceStatus: 'ALLOWED',
  runId: '08d32120-f818-4eb0-9c0f-3053964da7ad',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:14.870Z',
  pages: [
    { url: PRODIGY_VOLLEYBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: PRODIGY_VOLLEYBALL_SUMMER_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_LOCATIONS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/9438994-locations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543050-tournament-locations', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543022-practice-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543038-practice-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8575576-tournament-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8575578-practice-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/9032344-summer-league-', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_ADULT_PROGRAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8540205-why-prodigy-volleyball-academy', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8540206-what-is-club-volleyball-', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8540207-block-monsters-k-5-', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542931-coaches-and-staff', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542936-testimonials', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542939-sponsors', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542940-frequently-asked-questions', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542949-co-ed-rec-volleyball-jrs-and-adults-', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542950-open-play', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542953-beach-grass', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542954-mental-training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542955-nutrition-training', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542964-strength-and-conditioning', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8542984-girls-travel', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543019-season-fees', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543026-age-definition-chart', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543029-boys-travel', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543036-season-fees', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543041-age-definition-chart', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543042-recruiting', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543044-player-consultation', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543045-college-showcases', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543046-committed-players', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543048-alumni', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: PRODIGY_VOLLEYBALL_CONTACT_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543052-resources', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543054-forms', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8543055-associations', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8545001-code-of-conduct', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8545030-about', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8545049-beach', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8545050-grass', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prodigyvb.com/page/show/8545005-handbook', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

export const PRODIGY_VOLLEYBALL_OFFICIAL_URLS = [
  PRODIGY_VOLLEYBALL_HOME_URL,
  PRODIGY_VOLLEYBALL_SUMMER_URL,
  PRODIGY_VOLLEYBALL_TRYOUTS_URL,
  PRODIGY_VOLLEYBALL_PROGRAMS_URL,
  PRODIGY_VOLLEYBALL_CAMPS_URL,
  PRODIGY_VOLLEYBALL_SCHEDULE_URL,
  PRODIGY_VOLLEYBALL_LOCATIONS_URL,
  PRODIGY_VOLLEYBALL_ADULT_PROGRAMS_URL,
  PRODIGY_VOLLEYBALL_CONTACT_URL,
  PRODIGY_VOLLEYBALL_FACEBOOK_URL,
  PRODIGY_VOLLEYBALL_INSTAGRAM_URL,
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Prodigy Volleyball Academy',
  officialActionUrl: PRODIGY_VOLLEYBALL_HOME_URL,
  sourceUrl: PRODIGY_VOLLEYBALL_HOME_URL,
  organizerName: 'Prodigy Volleyball Academy',
  sportName: 'Volleyball',
  formatLabel: 'Girls and boys club volleyball, youth training, camps, clinics, and athlete development',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing Westchester volleyball training and club programs',
  scheduleText: 'The stored homepage describes girls club, boys club, camps and clinics, tryouts, and volleyball training for athletes of all skill levels. It does not publish current dated program rows, times, prices, or a location on the allowed page.',
  statusText: 'Review-only volleyball academy profile; current tryout, camp, schedule, location, fee, and program details require the official linked pages.',
  description: PRODIGY_VOLLEYBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Youth', 'Girls', 'Boys', 'Training'],
  logoUrl: PRODIGY_VOLLEYBALL_LOGO_SOURCE_URL,
  logoSourceUrl: PRODIGY_VOLLEYBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile only; current tryout, camp, league, practice, tournament, and program rows are on UNCHECKED pages.',
    'Locations, season fees, and registration paths are UNCHECKED; no city, venue, address, date, time, or price is inferred.',
    'The stored first-party Prodigy Volleyball Academy wordmark was normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const PRODIGY_VOLLEYBALL_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PRODIGY_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: PRODIGY_VOLLEYBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Prodigy Volleyball Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: PRODIGY_VOLLEYBALL_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: PRODIGY_VOLLEYBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Prodigy Volleyball Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Girls and boys club volleyball, youth training, camps, clinics, and athlete development' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Ongoing Westchester volleyball training and club programs' },
    description: { selector: 'body', mode: 'literal', value: PRODIGY_VOLLEYBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Volleyball, Youth, Girls, Boys, Training' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: PRODIGY_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/prodigyVolleyballAcademy.html');

export const PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
