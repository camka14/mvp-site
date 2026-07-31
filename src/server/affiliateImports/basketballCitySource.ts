import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const BASKETBALL_CITY_HOME_URL = 'https://basketballcity.com/';
export const BASKETBALL_CITY_RENTAL_URL = 'https://basketballcity.com/court-rentals/';
export const BASKETBALL_CITY_LOGO_SOURCE_URL = 'https://basketballcity.com/wp-content/themes/emagid/assets/img/Logo.png';
export const BASKETBALL_CITY_DESCRIPTION = "Basketball City is an NYC sports and entertainment facility with seven air-conditioned basketball courts, locker rooms, a VIP mezzanine, parking, an East River deck, league play, private rentals, and special events.";

export const BASKETBALL_CITY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7d996d03-f138-476c-a4c1-cdebae35eb9c',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-youth-development-program-basketballcity-com',
  intakeName: 'Basketball City Youth Development Program',
  baseUrl: 'https://basketballcity.com',
  complianceStatus: 'ALLOWED',
  runId: '5a1e01d2-e2e9-4d14-8f42-fca712338ae4',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:33.829Z',
  pages: [
    { url: BASKETBALL_CITY_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://basketballcity.com/youth-league/youth-development-program', role: 'LISTING', robotsStatus: 'ALLOWED' },
  ],
  artifactKinds: [
    { kind: 'LOGO_CANDIDATE', count: 5 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 2 },
  ],
} as const;

export const BASKETBALL_CITY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Basketball City',
    officialActionUrl: BASKETBALL_CITY_HOME_URL,
    sourceUrl: BASKETBALL_CITY_HOME_URL,
    organizerName: 'Basketball City',
    sportName: 'Basketball',
    formatLabel: 'Basketball facility, league play, youth programs, private rentals, and special events',
    city: 'New York, NY',
    venueName: 'Basketball City',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing NYC basketball facility and programs',
    scheduleText: 'The stored homepage describes seven air-conditioned courts, league play, youth-program links, private rentals, special events, and a facility deck overlooking the East River, Brooklyn Bridge, Manhattan Bridge, Statue of Liberty, and downtown Brooklyn and Manhattan.',
    statusText: 'Review-only facility and club profile; current youth-program and special-event detail pages require separate review.',
    description: BASKETBALL_CITY_DESCRIPTION,
    tags: ['Club', 'Basketball', 'Facility', 'New York'],
    warnings: [
      'The stored allowed homepage does not provide a complete current dated event row, so no EVENT candidate is created from the news and events teasers.',
      'The stored youth-development listing is allowed, but current program registration details remain outside this homepage-only package.',
      'The stored first-party Basketball City logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
  {
    listingKind: 'RENTAL' as const,
    title: 'Basketball City Court Rentals',
    officialActionUrl: BASKETBALL_CITY_RENTAL_URL,
    sourceUrl: BASKETBALL_CITY_HOME_URL,
    organizerName: 'Basketball City',
    sportName: 'Basketball',
    formatLabel: 'Hourly group court rentals and custom full-facility rentals',
    city: 'New York, NY',
    venueName: 'Basketball City',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing court-rental availability',
    scheduleText: 'The allowed homepage states that hourly group rentals are available Monday–Thursday evenings from 5 PM–10 PM, with seven full hardwood courts, locker rooms, seating, basketballs, and showers; referees and scorekeepers can be provided, and custom full-facility, private-tournament, and special-event rentals are discussed by contact.',
    statusText: 'Review-only rental link-out; current availability, booking form, pricing, and exact facility address require the unchecked court-rentals page.',
    description: 'Basketball City offers court rentals for corporate outings, friends, private tournaments, and special events.',
    tags: ['Rental', 'Basketball', 'Court', 'New York'],
    warnings: [
      'The official rental URL is an outbound link from the allowed homepage; its detail page was not part of the stored allowed capture.',
      'The stored homepage provides hours and facility features but no public price, live availability, or exact street address.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const BASKETBALL_CITY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: BASKETBALL_CITY_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Basketball City' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BASKETBALL_CITY_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: BASKETBALL_CITY_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Basketball City' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Basketball, Facility, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: BASKETBALL_CITY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/basketballCity.html');

export const BASKETBALL_CITY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: BASKETBALL_CITY_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
