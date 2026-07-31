import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const HARVEY_HOCKEY_CAMP_URL = 'https://www.harveyschool.org/harvey-summer-camp/hockey-camp';
export const HARVEY_SCHOOL_HOME_URL = 'https://www.harveyschool.org/';
export const HARVEY_HOCKEY_CAMP_REGISTRATION_URL = 'https://harveycavaliercamp.campmanagement.com/p/request_for_info_m.php?action=enroll';
export const HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL = 'https://www.harveyschool.org/uploaded/favicon.ico';
export const HARVEY_HOCKEY_CAMP_ORG_DESCRIPTION =
  'The Colton Orr Harvey Hockey Summer Camp is a hockey development experience for players ages 8-16 at all skill levels, with on-ice skill development, off-ice training, strength and conditioning, team-building, classroom education, and NHL guest appearances.';

export const HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '36f8beb8-27b8-4a7e-8e9a-e944d3159633',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-hockey-camp-harveyschool-org',
  intakeName: 'Hockey Camp',
  baseUrl: 'https://www.harveyschool.org',
  complianceStatus: 'ALLOWED',
  runId: 'c3adc29f-c5dc-4453-a6d9-b5c170adf021',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:53.454Z',
  pages: [
    { url: HARVEY_HOCKEY_CAMP_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: HARVEY_SCHOOL_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.harveyschool.org/harvey-summer-camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.harveyschool.org/about-harvey/facilities-rental', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: HARVEY_HOCKEY_CAMP_REGISTRATION_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const HARVEY_HOCKEY_CAMP_OFFICIAL_URLS = [
  HARVEY_HOCKEY_CAMP_URL,
  HARVEY_SCHOOL_HOME_URL,
  HARVEY_HOCKEY_CAMP_REGISTRATION_URL,
  'https://www.harveyschool.org/harvey-summer-camp',
  'https://www.harveyschool.org/athletics/evarts-rink',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Colton Orr Harvey Hockey Summer Camp',
  officialActionUrl: HARVEY_HOCKEY_CAMP_URL,
  sourceUrl: HARVEY_HOCKEY_CAMP_URL,
  organizerName: 'The Harvey School',
  sportName: 'Ice Hockey',
  formatLabel: 'Youth hockey development camp with on-ice and off-ice training',
  city: 'Katonah, NY',
  venueName: 'The Harvey School',
  address: '260 Jay St, Katonah, NY 10536',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Review-only Harvey Hockey Summer Camp program',
  scheduleText: 'The stored ALLOWED page describes a hockey development experience for ages 8-16 at all skill levels, with skating, stickhandling, game awareness, daily on-ice training, off-ice skill work, strength and conditioning, team-building, and classroom education.',
  statusText: 'Review-only hockey camp profile; current registration details require the official outbound registration flow.',
  description: HARVEY_HOCKEY_CAMP_ORG_DESCRIPTION,
  tags: ['Club', 'Ice Hockey', 'Youth', 'Camp', 'Katonah'],
  logoUrl: HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  logoSourceUrl: HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED hockey camp page identifies The Harvey School and the school address at 260 Jay St, Katonah, NY 10536.',
    'The parent summer-camp page, rink, school, and registration pages are UNCHECKED; no additional camp or facility inventory is inferred.',
    'Only a favicon-level Harvey School branding candidate is stored; no suitable organization logo is assigned and logo disposition is MANUAL_REVIEW.',
  ],
};

const eventCandidate = {
  listingKind: 'EVENT' as const,
  title: 'Colton Orr Harvey Hockey Summer Camp 2026',
  officialActionUrl: HARVEY_HOCKEY_CAMP_REGISTRATION_URL,
  sourceUrl: HARVEY_HOCKEY_CAMP_URL,
  organizerName: 'The Harvey School',
  sportName: 'Ice Hockey',
  formatLabel: 'Five-day hockey development camp with daily on-ice training, off-ice work, and team activities',
  city: 'Katonah, NY',
  venueName: 'The Harvey School',
  address: '260 Jay St, Katonah, NY 10536',
  startsAt: '2026-07-27T08:30:00-04:00',
  endsAt: '2026-08-07T15:30:00-04:00',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Weeks of July 27 and August 3, 2026, Monday-Friday, 8:30 a.m.-3:30 p.m.',
  scheduleText: 'The stored page lists the weeks of July 27, 2026 and August 3, 2026, Monday through Friday from 8:30 a.m. to 3:30 p.m., with weekly options available.',
  ageGroup: 'Ages 8-16',
  priceText: '$800 cash weekly rate; $824 credit-card weekly rate',
  statusText: 'Ongoing at review; the stored page directs families to the official Harvey Cavalier Camp registration flow.',
  description: 'The Colton Orr Harvey Hockey Summer Camp provides hockey training for ages 8-16 during the weeks of July 27 and August 3, 2026, with daily on-ice sessions, off-ice work, team activities, lunch, and a jersey included in registration.',
  tags: ['Event', 'Ice Hockey', 'Youth', 'Camp', 'Katonah'],
  logoUrl: HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  logoSourceUrl: HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  warnings: [
    'The stored page publishes the two 2026 camp weeks, daily hours, ages, weekly options, and cash/credit-card rates; no other dates or daily inventory is inferred.',
    'The official registration flow is UNCHECKED and remains outbound-only.',
    'Only a favicon-level Harvey School branding candidate is stored; logo disposition is MANUAL_REVIEW.',
  ],
};

export const HARVEY_HOCKEY_CAMP_MANUAL_CANDIDATES = [clubCandidate, eventCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const HARVEY_HOCKEY_CAMP_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HARVEY_HOCKEY_CAMP_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Colton Orr Harvey Hockey Summer Camp 2026' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HARVEY_HOCKEY_CAMP_REGISTRATION_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: HARVEY_HOCKEY_CAMP_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'The Harvey School' },
    sportName: { selector: 'body', mode: 'literal', value: 'Ice Hockey' },
    city: { selector: 'body', mode: 'literal', value: 'Katonah, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Ice Hockey, Youth, Camp, Katonah' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: HARVEY_HOCKEY_CAMP_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/harveyHockeyCamp.html');

export const HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
