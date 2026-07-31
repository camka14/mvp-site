import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEVER_TOO_LATE_HOME_URL = 'https://nevertoolate.com/';
export const NEVER_TOO_LATE_WEEKEND_CAMPS_URL = 'https://nevertoolate.com/weekend-camps/never-too-late-weekend-camps/';
export const NEVER_TOO_LATE_NYC_PROGRAM_URL = 'https://nevertoolate.com/weekend-camps/never-too-late-basketball-weekly-practice-programs/never-too-late-basketball-weekly-practice-programs-new-york-city/';
export const NEVER_TOO_LATE_SANTA_BARBARA_URL = 'https://nevertoolate.com/product/santa-barbara-ca-fall-oct-23-25-2026/';
export const NEVER_TOO_LATE_NORTH_ADAMS_URL = 'https://nevertoolate.com/product/north-adams-ma-november-6-8-2026/';
export const NEVER_TOO_LATE_LOGO_SOURCE_URL = 'https://nevertoolate.com/wp-content/uploads/2014/03/NTLlogo-1.png';
export const NEVER_TOO_LATE_ORG_DESCRIPTION =
  'Never Too Late® Basketball was formed in 1992 by Steve Bzomowski and provides basketball training, instruction, coaching, weekly practice programs, weekend camps, private camps, clinics, and corporate team-building programs for adult recreational players and youth parent/kid clinics.';

export const NEVER_TOO_LATE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '45a5d9c2-181b-47ed-bbef-9ace27b85fe8',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-never-too-late-basketball-nevertoolate-com',
  intakeName: 'Never Too Late Basketball',
  baseUrl: NEVER_TOO_LATE_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: '161a28fb-ecde-4b53-996e-f58b20d289b9',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:14.703Z',
  pages: [
    { url: NEVER_TOO_LATE_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://nevertoolate.com/about-us/coaches', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEVER_TOO_LATE_WEEKEND_CAMPS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEVER_TOO_LATE_NYC_PROGRAM_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEVER_TOO_LATE_SANTA_BARBARA_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEVER_TOO_LATE_NORTH_ADAMS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://nevertoolate.com/events/my-bookings', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 4 },
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

export const NEVER_TOO_LATE_OFFICIAL_URLS = [
  NEVER_TOO_LATE_HOME_URL,
  NEVER_TOO_LATE_WEEKEND_CAMPS_URL,
  NEVER_TOO_LATE_NYC_PROGRAM_URL,
  NEVER_TOO_LATE_SANTA_BARBARA_URL,
  NEVER_TOO_LATE_NORTH_ADAMS_URL,
  'https://nevertoolate.com/weekend-camps/never-too-late-basketball-weekly-practice-programs/custom-clinics/',
  'https://nevertoolate.com/about-us/coaches/',
  'https://nevertoolate.com/contact/',
  'https://instagram.com/nevertoolatebasketball',
  'https://twitter.com/NTLHoops',
  'https://www.facebook.com/pages/Never-Too-Late-Basketball/296492291835?ref=ts',
  'http://www.linkedin.com/pub/steve-bzomowski/5/393/132',
] as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Never Too Late Basketball',
  officialActionUrl: NEVER_TOO_LATE_HOME_URL,
  sourceUrl: NEVER_TOO_LATE_HOME_URL,
  organizerName: 'Never Too Late Basketball',
  sportName: 'Basketball',
  formatLabel: 'Adult recreational basketball training, weekly practice programs, weekend camps, clinics, and corporate team building',
  city: 'New York City, NY',
  venueName: null,
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing basketball training and practice programs',
  scheduleText: 'The stored homepage describes weekly practice programs in Boston, New York City, San Francisco, and Chicago, weekend camps, private camps, clinics, and corporate team-building programs. Its NYC program is described as skills and scrimmage clinics, shooting clinics, and coached scrimmages in Greenwich Village and downtown Brooklyn.',
  statusText: 'Review-only club and program profile; current weekly clinic schedules, locations, and registration require the official linked pages.',
  description: NEVER_TOO_LATE_ORG_DESCRIPTION,
  tags: ['Club', 'Basketball', 'Adult', 'Clinics', 'New York City'],
  logoUrl: NEVER_TOO_LATE_LOGO_SOURCE_URL,
  logoSourceUrl: NEVER_TOO_LATE_LOGO_SOURCE_URL,
  warnings: [
    'The stored allowed homepage supports an ongoing basketball club/program profile and describes the New York City practice program, but no canonical street address is published.',
    'The weekly practice, coaches, account, booking, and other detail pages are UNCHECKED; current NYC clinic availability and rental inventory are not inferred.',
    'The stored first-party Never Too Late Basketball logo was normalized to an opaque 1024px square PNG.',
  ],
};

const eventCandidate = (params: {
  title: string;
  officialActionUrl: string;
  startsAt: string;
  timeZone: string;
  dateDisplayText: string;
  city: string;
  description: string;
  tags: string[];
}) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: NEVER_TOO_LATE_HOME_URL,
  organizerName: 'Never Too Late Basketball',
  sportName: 'Basketball',
  formatLabel: 'Weekend adult basketball camp',
  city: params.city,
  venueName: null,
  address: null,
  startsAt: params.startsAt,
  timeZone: params.timeZone,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: `${params.dateDisplayText}. The stored homepage lists a $695.00 weekend camp with basketball practice and play; it does not publish a daily start or end time.`,
  priceText: '$695.00',
  statusText: 'Future dated row from the allowed Never Too Late homepage; registration is directed to the official outbound product URL.',
  description: params.description,
  tags: params.tags,
  logoUrl: NEVER_TOO_LATE_LOGO_SOURCE_URL,
  logoSourceUrl: NEVER_TOO_LATE_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage publishes the date range and $695.00 price but no daily time or specific venue address; no time, venue, or address is inferred.',
    'The official product page is retained as an outbound action URL but was not captured and remains UNCHECKED.',
  ],
});

export const NEVER_TOO_LATE_MANUAL_CANDIDATES = [
  organizationCandidate,
  eventCandidate({
    title: 'Never Too Late Basketball Weekend Camp — Santa Barbara, CA (Fall)',
    officialActionUrl: NEVER_TOO_LATE_SANTA_BARBARA_URL,
    startsAt: '2026-10-23T00:00:00-07:00',
    timeZone: 'America/Los_Angeles',
    dateDisplayText: 'October 23-25, 2026',
    city: 'Santa Barbara, CA',
    description: 'The stored homepage lists a fall Santa Barbara, California weekend basketball camp for October 23-25, 2026 at $695.00.',
    tags: ['Event', 'Basketball', 'Camp', 'Adult', 'Santa Barbara'],
  }),
  eventCandidate({
    title: 'Never Too Late Basketball Weekend Camp — North Adams, MA (Berkshires)',
    officialActionUrl: NEVER_TOO_LATE_NORTH_ADAMS_URL,
    startsAt: '2026-11-06T00:00:00-05:00',
    timeZone: 'America/New_York',
    dateDisplayText: 'November 6-8, 2026',
    city: 'North Adams, MA',
    description: 'The stored homepage lists a North Adams, Massachusetts (Berkshires) weekend basketball camp for November 6-8, 2026 at $695.00.',
    tags: ['Event', 'Basketball', 'Camp', 'Adult', 'North Adams'],
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEVER_TOO_LATE_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NEVER_TOO_LATE_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Never Too Late Basketball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEVER_TOO_LATE_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEVER_TOO_LATE_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Never Too Late Basketball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Basketball, Camp, Adult' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: NEVER_TOO_LATE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/neverTooLateBasketball.html');

export const NEVER_TOO_LATE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NEVER_TOO_LATE_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
