import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FORT_GREENE_TENNIS_HOME_URL = 'https://www.fortgreenetennis.org/';
export const FORT_GREENE_TENNIS_EVENTS_URL = 'https://www.fortgreenetennis.org/events';
export const FORT_GREENE_TENNIS_LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/56bcd2eae707eb87a6e361e6/d60d9e19-ae34-427e-93a8-c7bcc6c8d50e/fgta-logo_green.png?format=1500w';

export const FORT_GREENE_TENNIS_ORG_DESCRIPTION =
  'Fort Greene Tennis Association is a group of enthusiastic tennis players and fans that work together to improve the courts, organize tennis events, and support a social environment in Fort Greene Park.';

export const FORT_GREENE_TENNIS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7ac9e2ac-7541-463a-98c1-9144f8df5e18',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-events-fortgreenetennis-org',
  intakeName: 'Events',
  baseUrl: 'https://www.fortgreenetennis.org',
  complianceStatus: 'ALLOWED',
  runId: '23be8f6e-13a9-4b72-8152-86dca3cf168f',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:55.688Z',
  pages: [
    { url: FORT_GREENE_TENNIS_EVENTS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.fortgreenetennis.org/events/2025/singles-tournament-hga8c', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.fortgreenetennis.org/events/2025/doubles-tournament-5ndw2', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.fortgreenetennis.org/events/2025/ladder-tournament-3l99w', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.fortgreenetennis.org/payments/singles-tournament-2026-ypfyk', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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

const VENUE = 'Fort Greene Tennis Courts';
const ADDRESS = '136 Dekalb Ave NY, 11217 United States';
const SPORT = 'Tennis';

export const FORT_GREENE_TENNIS_MANUAL_CANDIDATES = [
  {
    listingKind: 'EVENT' as const,
    title: 'Singles Tournament 2026',
    officialActionUrl: 'https://www.fortgreenetennis.org/events/2025/singles-tournament-hga8c',
    sourceUrl: FORT_GREENE_TENNIS_EVENTS_URL,
    organizerName: 'Fort Greene Tennis Association',
    sportName: SPORT,
    formatLabel: 'Tennis tournament',
    city: 'Brooklyn, NY',
    venueName: VENUE,
    address: ADDRESS,
    startsAt: '2026-07-25T08:00:00-04:00',
    endsAt: '2026-08-02T17:00:00-04:00',
    timeZone: 'America/New_York',
    scheduleText: 'Saturday, July 25, 2026 at 8:00 AM through Sunday, August 2, 2026 at 5:00 PM.',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing Jul 25-Aug 2, 2026',
    statusText: 'Ongoing as of 2026-07-31; official registration link is stored but its registration page is unchecked.',
    registrationDeadlineText: null,
    description: 'The annual FGTA Open will be held across two weekends with A, B, and C draws. The stored listing says registration opens Wednesday, July 15 at 12pm.',
    tags: ['Event', 'Tennis', 'Tournament', 'Brooklyn'],
    warnings: [
      'The event listing is ALLOWED and supplies complete date, time, venue, and address evidence; the event detail and registration pages are UNCHECKED.',
      'No registration deadline is inferred from the registration opening statement.',
    ],
  },
  {
    listingKind: 'EVENT' as const,
    title: 'Doubles Tournament 2026',
    officialActionUrl: 'https://www.fortgreenetennis.org/events/2025/doubles-tournament-5ndw2',
    sourceUrl: FORT_GREENE_TENNIS_EVENTS_URL,
    organizerName: 'Fort Greene Tennis Association',
    sportName: SPORT,
    formatLabel: 'Tennis tournament',
    city: 'Brooklyn, NY',
    venueName: VENUE,
    address: ADDRESS,
    startsAt: '2026-09-19T08:00:00-04:00',
    endsAt: '2026-09-20T17:00:00-04:00',
    timeZone: 'America/New_York',
    scheduleText: 'Saturday, September 19, 2026 at 8:00 AM through Sunday, September 20, 2026 at 5:00 PM.',
    dateDisplayMode: 'SCHEDULED' as const,
    dateDisplayText: 'Sep 19-20, 2026',
    statusText: 'Scheduled future event; official event detail page is unchecked.',
    description: null,
    tags: ['Event', 'Tennis', 'Tournament', 'Brooklyn'],
    warnings: [
      'The event listing is ALLOWED and supplies complete date, time, venue, and address evidence; the event detail page is UNCHECKED.',
    ],
  },
  {
    listingKind: 'EVENT' as const,
    title: 'Ladder Tournament 2026',
    officialActionUrl: 'https://www.fortgreenetennis.org/events/2025/ladder-tournament-3l99w',
    sourceUrl: FORT_GREENE_TENNIS_EVENTS_URL,
    organizerName: 'Fort Greene Tennis Association',
    sportName: SPORT,
    formatLabel: 'Tennis tournament',
    city: 'Brooklyn, NY',
    venueName: VENUE,
    address: ADDRESS,
    startsAt: '2026-10-03T08:00:00-04:00',
    endsAt: '2026-10-04T17:00:00-04:00',
    timeZone: 'America/New_York',
    scheduleText: 'Saturday, October 3, 2026 at 8:00 AM through Sunday, October 4, 2026 at 5:00 PM.',
    dateDisplayMode: 'SCHEDULED' as const,
    dateDisplayText: 'Oct 3-4, 2026',
    statusText: 'Scheduled future event; official event detail page is unchecked.',
    description: 'Top ladder players face off in the season end championships.',
    tags: ['Event', 'Tennis', 'Tournament', 'Brooklyn'],
    warnings: [
      'The event listing is ALLOWED and supplies complete date, time, venue, and address evidence; the event detail page is UNCHECKED.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FORT_GREENE_TENNIS_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: FORT_GREENE_TENNIS_EVENTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Fort Greene Tennis Association stored current and future event rows' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FORT_GREENE_TENNIS_EVENTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FORT_GREENE_TENNIS_EVENTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Fort Greene Tennis Association' },
    sportName: { selector: 'body', mode: 'literal', value: SPORT },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Tennis tournament' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn, NY' },
    venueName: { selector: 'body', mode: 'literal', value: VENUE },
    address: { selector: 'body', mode: 'literal', value: ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Tennis, Tournament, Brooklyn' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: FORT_GREENE_TENNIS_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fortGreeneTennisEvents.html');

export const FORT_GREENE_TENNIS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: FORT_GREENE_TENNIS_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
