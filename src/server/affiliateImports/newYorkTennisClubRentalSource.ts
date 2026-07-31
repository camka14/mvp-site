import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_TENNIS_CLUB_URL = 'https://advantagetennisclubs.com/new-york-tennis-club/';
export const NEW_YORK_TENNIS_CLUB_HOME_URL = 'https://advantagetennisclubs.com/';
export const NEW_YORK_TENNIS_CLUB_BOOKING_URL = 'https://advantagetennisclubs.com/book-courts/';
export const NEW_YORK_TENNIS_CLUB_COURT_RATES_URL = 'https://advantagetennisclubs.com/court-rates/';
export const NEW_YORK_TENNIS_CLUB_CALENDAR_URL = 'https://advantagetennisclubs.com/calendar/';
export const NEW_YORK_TENNIS_CLUB_MEMBERSHIP_URL = 'https://advantagetennisclubs.com/membership/';
export const NEW_YORK_TENNIS_CLUB_LOGO_SOURCE_URL = 'https://advantagetennisclubs.com/wp-content/uploads/Group-32161.png';
export const NEW_YORK_TENNIS_CLUB_ADDRESS = '3081 Harding Ave, Bronx, NY 10465';
export const NEW_YORK_TENNIS_CLUB_ORG_DESCRIPTION =
  'New York Tennis Club is a historic Bronx tennis academy and club with six clay courts, adult and junior programs, competitive junior play, and court reservations.';

export const NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'f0772090-e2a6-4fc6-bce7-d21dac49fc58',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-tennis-club-advantagetennisclubs-com',
  intakeName: 'New York Tennis Club',
  baseUrl: 'https://advantagetennisclubs.com',
  complianceStatus: 'ALLOWED',
  runId: 'a643a11c-a232-4359-bc27-04f54c4bd52b',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:59.061Z',
  pages: [
    { url: NEW_YORK_TENNIS_CLUB_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_TENNIS_CLUB_BOOKING_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_TENNIS_CLUB_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_TENNIS_CLUB_COURT_RATES_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_TENNIS_CLUB_CALENDAR_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_TENNIS_CLUB_MEMBERSHIP_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/manhattan-plaza-racquet-club/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/roosevelt-island-racquet-club/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/adult-programs/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/junior-programs/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/tennis-camps/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/junior-tournaments/', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://advantagetennisclubs.com/team/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'New York Tennis Club Court Time',
  officialActionUrl: NEW_YORK_TENNIS_CLUB_BOOKING_URL,
  sourceUrl: NEW_YORK_TENNIS_CLUB_URL,
  organizerName: 'Advantage Tennis Clubs',
  sportName: 'Tennis',
  formatLabel: 'Tennis court rental',
  city: 'Bronx, NY',
  venueName: 'New York Tennis Club',
  address: NEW_YORK_TENNIS_CLUB_ADDRESS,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Court rates 2025-2026; open 7 days a week, 7:00 AM-11:00 PM',
  scheduleText: 'The stored New York Tennis Club listing says the club is open 7 days a week from 7:00 AM-11:00 PM. Court rates for 2025-2026 are Monday-Friday $65-$125 per hour by time block and Saturday-Sunday $100-$115 per hour, with 1:00 PM-11:00 PM tournament hours on weekends.',
  priceText: 'Monday-Friday $65-$125/hour; Saturday-Sunday $100-$115/hour',
  participantOptionsText: 'Book court time through the official Book Courts page; the stored evidence does not expose live availability or booking confirmation.',
  statusText: 'Review-only court rental link-out with stored 2025-2026 rate ranges and official booking URL.',
  description: 'New York Tennis Club offers six clay courts and court reservations in Throgs Neck, Bronx. The stored listing publishes 2025-2026 hourly court-rate ranges and links to official court booking.',
  tags: ['Rental', 'Tennis', 'Court', 'Bronx', 'New York Tennis Club'],
  warnings: [
    'The stored listing publishes 2025-2026 rates and operating hours but the Book Courts page is UNCHECKED; live availability and booking confirmation are not inferred.',
    'The stored listing identifies six clay courts at 3081 Harding Ave, Bronx, NY 10465; no court-level inventory or capacity is published.',
    'Program, calendar, camp, tournament, membership, and team pages are UNCHECKED and remain withheld.',
  ],
};

export const NEW_YORK_TENNIS_CLUB_MANUAL_CANDIDATES = [rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_TENNIS_CLUB_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: NEW_YORK_TENNIS_CLUB_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Tennis Club Court Time' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_TENNIS_CLUB_BOOKING_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_TENNIS_CLUB_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Advantage Tennis Clubs' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Tennis court rental' },
    city: { selector: 'body', mode: 'literal', value: 'Bronx, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'New York Tennis Club' },
    address: { selector: 'body', mode: 'literal', value: NEW_YORK_TENNIS_CLUB_ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Court rates 2025-2026; open 7 days a week, 7:00 AM-11:00 PM' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Tennis, Court, Bronx, New York Tennis Club' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NEW_YORK_TENNIS_CLUB_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkTennisClubRental.html');

export const NEW_YORK_TENNIS_CLUB_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
