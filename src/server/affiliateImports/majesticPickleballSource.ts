import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const MAJESTIC_PICKLEBALL_HOME_URL = 'https://majesticpickleball.com/';
export const MAJESTIC_PICKLEBALL_BOOK_LESSON_URL = 'https://majesticpickleball.com/book-lesson';
export const MAJESTIC_PICKLEBALL_APPOINTMENTS_URL = 'https://majesticpickleball.com/appointments-3';
export const MAJESTIC_PICKLEBALL_BOOK_EVENT_URL = 'https://majesticpickleball.com/bookevent';
export const MAJESTIC_PICKLEBALL_STORE_URL = 'https://majesticpickleball.com/store';
export const MAJESTIC_PICKLEBALL_INSTAGRAM_URL = 'https://www.instagram.com/majesticpickleballinc/';
export const MAJESTIC_PICKLEBALL_REGALIA_URL = 'https://regaliapickleball.com/';
export const MAJESTIC_PICKLEBALL_LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/669807fd5d9ef54aa09a68b6/7f37cf74-d72d-45b6-8578-0a482019e7f3/New+Logo.png?format=1500w';
export const MAJESTIC_PICKLEBALL_ORG_DESCRIPTION =
  'Majestic Pickleball is a female-run pickleball coaching service founded by Breanna Meertins. The stored homepage describes consultations, individual and group lessons, lesson packages, and special-event pickleball lessons and mini-games for players of all levels and ages.';

export const MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '27d6fcba-6ed8-4775-a8e4-0d2479810505',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-majestic-pickleball-majesticpickleball-com',
  intakeName: 'Majestic Pickleball',
  baseUrl: 'https://majesticpickleball.com',
  complianceStatus: 'ALLOWED',
  runId: '7b3cfe42-f28f-4f18-89ab-911a3f5656a2',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:09:10.153Z',
  pages: [
    { url: MAJESTIC_PICKLEBALL_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: MAJESTIC_PICKLEBALL_APPOINTMENTS_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: MAJESTIC_PICKLEBALL_STORE_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/about', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/store/apparel', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/store/mens-pro-wear', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/store/p/majestic-womens-performance-tee', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/store/p/majestic-womens-performance-tee-ty3bm', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://majesticpickleball.com/store/womens-performance-wear', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: MAJESTIC_PICKLEBALL_BOOK_EVENT_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: MAJESTIC_PICKLEBALL_BOOK_LESSON_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
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

export const MAJESTIC_PICKLEBALL_OFFICIAL_URLS = [
  MAJESTIC_PICKLEBALL_HOME_URL,
  MAJESTIC_PICKLEBALL_BOOK_LESSON_URL,
  MAJESTIC_PICKLEBALL_APPOINTMENTS_URL,
  MAJESTIC_PICKLEBALL_BOOK_EVENT_URL,
  MAJESTIC_PICKLEBALL_STORE_URL,
  MAJESTIC_PICKLEBALL_INSTAGRAM_URL,
  MAJESTIC_PICKLEBALL_REGALIA_URL,
] as const;

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Majestic Pickleball',
  officialActionUrl: MAJESTIC_PICKLEBALL_HOME_URL,
  sourceUrl: MAJESTIC_PICKLEBALL_HOME_URL,
  organizerName: 'Majestic Pickleball',
  sportName: 'Pickleball',
  formatLabel: 'Pickleball coaching, lessons, group sessions, lesson packages, and special events',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Year-round pickleball coaching and lesson services',
  scheduleText: 'The stored homepage describes free consultations, individual lessons, group lessons for 2-4 adults, lesson packages, and special events with a pickleball lesson and mini-game. It does not publish current dates, times, prices, or a location.',
  statusText: 'Review-only coaching profile; current lesson, appointment, special-event, and location details require the official linked booking pages.',
  description: MAJESTIC_PICKLEBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Pickleball', 'Coaching', 'Lessons'],
  logoUrl: MAJESTIC_PICKLEBALL_LOGO_SOURCE_URL,
  logoSourceUrl: MAJESTIC_PICKLEBALL_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED homepage supports one ongoing CLUB profile only; no current dated EVENT or facility RENTAL row is published in the allowed evidence.',
    'The book-lesson, bookevent, appointments, store, and about pages are UNCHECKED and remain outbound-only; no lesson dates, prices, venue, or address are inferred.',
    'The stored first-party Majestic Pickleball logo candidate was normalized to an opaque 1024px square PNG without changing the mark.',
  ],
} satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

export const MAJESTIC_PICKLEBALL_MANUAL_CANDIDATES = [clubCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const MAJESTIC_PICKLEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: MAJESTIC_PICKLEBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Majestic Pickleball' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: MAJESTIC_PICKLEBALL_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: MAJESTIC_PICKLEBALL_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Majestic Pickleball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Pickleball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Pickleball coaching, lessons, group sessions, lesson packages, and special events' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Year-round pickleball coaching and lesson services' },
    description: { selector: 'body', mode: 'literal', value: MAJESTIC_PICKLEBALL_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Pickleball, Coaching, Lessons' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: MAJESTIC_PICKLEBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/majesticPickleball.html');

export const MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
