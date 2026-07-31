import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PROSPECT_PARK_TENNIS_CENTER_URL = 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center';
export const PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL = 'https://prospectpark.aptussoft.com/member';
export const PROSPECT_PARK_TENNIS_CENTER_SIGNUP_URL = 'https://prospectpark.aptussoft.com/Member/Aptus/frmguestsignup';
export const PROSPECT_PARK_TENNIS_CENTER_LOGO_SOURCE_URL = 'https://www.prospectpark.org/wp-content/uploads/2022/01/PPA_LOGO_BLK.jpg';

export const PROSPECT_PARK_TENNIS_CENTER_ORG_DESCRIPTION =
  'Prospect Park Tennis Center is a Brooklyn tennis destination with year-round day and evening court access, hard and clay courts, a seasonal tennis bubble, court bookings, programs, lessons, and leagues for all levels and ages.';

export const PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '668c5cac-3fdd-45f4-9c00-3aa6e6a8e08d',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-prospect-park-tennis-center-prospectpark-org',
  intakeName: 'Prospect Park Tennis Center',
  baseUrl: 'https://www.prospectpark.org',
  complianceStatus: 'ALLOWED',
  runId: '15694515-9357-4bad-b801-c2d2c9c0203c',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:55:43.140Z',
  pages: [
    { url: PROSPECT_PARK_TENNIS_CENTER_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/outdoor-tennis-information', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/tennis-permits', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/evening-adult-singles-league', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/adult-group-classes', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/book-a-lesson', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: PROSPECT_PARK_TENNIS_CENTER_SIGNUP_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

export const PROSPECT_PARK_TENNIS_CENTER_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'Prospect Park Tennis Center Court Rentals',
    officialActionUrl: PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL,
    sourceUrl: PROSPECT_PARK_TENNIS_CENTER_URL,
    organizerName: 'Prospect Park Tennis Center',
    sportName: 'Tennis',
    formatLabel: 'Indoor and outdoor tennis court rental',
    city: 'Brooklyn, NY',
    venueName: 'Prospect Park Tennis Center',
    address: null,
    timeZone: 'America/New_York',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round court bookings',
    scheduleText: 'Daily hours are 6:00 AM-11:00 PM. The page lists an indoor season from October 20-May 3 and an outdoor season from May 17-October 4; courts can be booked one week in advance.',
    priceText: null,
    statusText: 'Review-only court rental link-out; live availability and public pricing are not exposed in the stored listing.',
    description: PROSPECT_PARK_TENNIS_CENTER_ORG_DESCRIPTION,
    participantOptionsText: 'Book a court through the official Aptus platform; outdoor day play requires an NYC Parks Department permit.',
    tags: ['Rental', 'Tennis', 'Court', 'Brooklyn'],
    warnings: [
      'The stored page does not publish a public court price or real-time availability; those details remain in the official booking flow.',
      'The allowed page does not state a canonical street address; the location is retained as Brooklyn, NY without an invented address.',
      'League, class, lesson, youth-program, and tournament detail pages are UNCHECKED and remain withheld.',
      'The stored logo candidates are Prospect Park Alliance umbrella marks rather than a clearly Tennis Center-specific logo; logo disposition is MANUAL_REVIEW.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PROSPECT_PARK_TENNIS_CENTER_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: PROSPECT_PARK_TENNIS_CENTER_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Prospect Park Tennis Center Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: PROSPECT_PARK_TENNIS_CENTER_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Prospect Park Tennis Center' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor and outdoor tennis court rental' },
    city: { selector: 'body', mode: 'literal', value: 'Brooklyn, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round court bookings' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'Daily hours are 6:00 AM-11:00 PM; courts can be booked one week in advance.' },
    description: { selector: 'body', mode: 'literal', value: PROSPECT_PARK_TENNIS_CENTER_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Tennis, Court, Brooklyn' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: PROSPECT_PARK_TENNIS_CENTER_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/prospectParkTennisCenter.html');

export const PROSPECT_PARK_TENNIS_CENTER_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
