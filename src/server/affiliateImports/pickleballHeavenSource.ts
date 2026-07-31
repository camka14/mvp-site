import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PICKLEBALL_HEAVEN_HOME_URL = 'https://www.thepickleballheaven.com/';
export const PICKLEBALL_HEAVEN_TOURNAMENTS_URL = 'https://www.thepickleballheaven.com/tournaments';
export const PICKLEBALL_HEAVEN_CORPORATE_EVENTS_URL = 'https://www.thepickleballheaven.com/corporate-events';
export const PICKLEBALL_HEAVEN_BOOK_EVENT_URL = 'https://www.thepickleballheaven.com/book-event';
export const PICKLEBALL_HEAVEN_LOGO_SOURCE_URL = 'https://fzbgwtitjutjogaqkvkp.supabase.co/storage/v1/object/public/Photos/logo.png';
export const PICKLEBALL_HEAVEN_ORG_DESCRIPTION =
  "Pickleball Heaven is Long Island's indoor pickleball destination in Medford, New York, with premium courts, memberships, open play, professional coaching, tournaments, an on-site restaurant and bar, and corporate and private event hosting.";

export const PICKLEBALL_HEAVEN_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '3df41bc8-0582-4bf6-a453-b2499e4aa064',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-pickleball-tournaments-events-thepickleballheaven-com',
  intakeName: 'Pickleball Tournaments & Events',
  baseUrl: 'https://www.thepickleballheaven.com',
  complianceStatus: 'ALLOWED',
  runId: '114af377-7c85-4486-ae91-9ecf4b544224',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:56.130Z',
  pages: [
    { url: 'https://www.thepickleballheaven.com/academy', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: PICKLEBALL_HEAVEN_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/employment', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/food-and-drink', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/gift-certificate', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/invitational', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/membership', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/merch', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/mission', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/open-play', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/partnership', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/proud-partners', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/smash-and-serve', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/sponsorship', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/timeline', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: PICKLEBALL_HEAVEN_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: PICKLEBALL_HEAVEN_CORPORATE_EVENTS_URL, role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.thepickleballheaven.com/camp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: PICKLEBALL_HEAVEN_BOOK_EVENT_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const PICKLEBALL_HEAVEN_OFFICIAL_URLS = [
  PICKLEBALL_HEAVEN_HOME_URL,
  'https://www.thepickleballheaven.com/membership',
  'https://www.thepickleballheaven.com/open-play',
  'https://www.thepickleballheaven.com/academy',
  'https://www.thepickleballheaven.com/camp',
  PICKLEBALL_HEAVEN_TOURNAMENTS_URL,
  'https://www.thepickleballheaven.com/invitational',
  'https://www.thepickleballheaven.com/smash-and-serve',
  'https://www.thepickleballheaven.com/food-and-drink',
  PICKLEBALL_HEAVEN_CORPORATE_EVENTS_URL,
  PICKLEBALL_HEAVEN_BOOK_EVENT_URL,
  'https://www.thepickleballheaven.com/merch',
  'https://www.thepickleballheaven.com/gift-certificate',
  'https://www.thepickleballheaven.com/partnership',
  'https://www.thepickleballheaven.com/sponsorship',
  'https://www.thepickleballheaven.com/proud-partners',
  'https://www.thepickleballheaven.com/employment',
  'https://www.thepickleballheaven.com/mission',
  'https://www.thepickleballheaven.com/waiver',
  'https://www.thepickleballheaven.com/timeline',
  'https://www.instagram.com/thepickleballheaven',
  'https://www.google.com/maps/place/645+National+Blvd,+Medford,+NY+11763',
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Pickleball Heaven',
  officialActionUrl: PICKLEBALL_HEAVEN_HOME_URL,
  sourceUrl: PICKLEBALL_HEAVEN_HOME_URL,
  organizerName: 'Pickleball Heaven',
  sportName: 'Pickleball',
  formatLabel: 'Indoor pickleball facility, memberships, open play, coaching, tournaments, and private events',
  city: 'Medford, NY',
  venueName: 'Pickleball Heaven',
  address: '645 National Blvd, Medford, NY 11763',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing indoor pickleball facility and programs',
  scheduleText: 'The stored homepage describes unlimited memberships, open play, professional coaching, year-round youth camps and adult programs, regular local tournaments and invitationals, and an on-site restaurant and bar.',
  statusText: 'Review-only facility and club profile; current tournament, open-play, academy, camp, and membership details require the official linked pages.',
  description: PICKLEBALL_HEAVEN_ORG_DESCRIPTION,
  tags: ['Club', 'Pickleball', 'Indoor Facility', 'Tournaments', 'Medford'],
  logoUrl: PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  logoSourceUrl: PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage supports one ongoing CLUB profile and identifies Pickleball Heaven at 645 National Blvd, Medford, NY 11763.',
    'The stored tournaments listing is ALLOWED but the snapshot contains no complete dated tournament rows; the corporate-events, book-event, academy, camp, and other detail pages are UNCHECKED, so no EVENT or additional inventory is inferred.',
    'The stored first-party Pickleball Heaven favicon logo was normalized to an opaque 1024px square PNG.',
  ],
};

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'Pickleball Heaven Corporate Events & Private Court Bookings',
  officialActionUrl: PICKLEBALL_HEAVEN_BOOK_EVENT_URL,
  sourceUrl: PICKLEBALL_HEAVEN_HOME_URL,
  organizerName: 'Pickleball Heaven',
  sportName: 'Pickleball',
  formatLabel: 'Private court reservations, corporate events, team outings, and private parties',
  city: 'Medford, NY',
  venueName: 'Pickleball Heaven',
  address: '645 National Blvd, Medford, NY 11763',
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Ongoing private booking and corporate event path',
  scheduleText: 'The stored homepage says Pickleball Heaven offers private court reservations, catering, and customized event packages for corporate events, team outings, and private parties.',
  statusText: 'Review-only rental link-out; current booking availability, package details, and pricing require the official booking flow.',
  description: 'Pickleball Heaven offers private court reservations, catering, and customized event packages for corporate events, team outings, and private parties.',
  tags: ['Rental', 'Pickleball', 'Private Events', 'Corporate Events', 'Medford'],
  logoUrl: PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  logoSourceUrl: PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage supports private court reservations, catering, and customized event packages, while the official book-event path is UNCHECKED and remains outbound-only.',
    'No current availability, package price, or reservation date is stored; those fields remain unset.',
  ],
};

export const PICKLEBALL_HEAVEN_MANUAL_CANDIDATES = [clubCandidate, rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PICKLEBALL_HEAVEN_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: PICKLEBALL_HEAVEN_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Pickleball Heaven' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: PICKLEBALL_HEAVEN_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: PICKLEBALL_HEAVEN_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Pickleball Heaven' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    city: { selector: 'body', mode: 'literal', value: 'Medford, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Pickleball, Indoor Facility, Tournaments, Medford' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: PICKLEBALL_HEAVEN_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/pickleballHeaven.html');

export const PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: PICKLEBALL_HEAVEN_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
