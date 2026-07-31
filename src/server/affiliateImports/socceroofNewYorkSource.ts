import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOCCEROOF_NEW_YORK_HOME_URL = 'https://www.socceroof.com/en';
export const SOCCEROOF_NEW_YORK_RENTAL_URL = 'https://www.socceroof.com/en/activity/rent-a-field/';
export const SOCCEROOF_LOGO_SOURCE_URL = 'https://www.socceroof.com/_astro/LogoHomepage.CNMOiChD_Z13smsd.svg';
export const SOCCEROOF_NEW_YORK_ORG_DESCRIPTION = 'Socceroof provides indoor soccer fields and social spaces with field rentals, leagues, pickup games, youth programs, tournaments, and private and corporate events; the stored homepage lists five New York clubs.';

export const SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '535c81a6-f19d-495c-8140-ff23eb5815a6',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-socceroof-indoor-facilities-in-new-york-and-montreal-socceroof-c',
  intakeName: 'Socceroof Indoor Facilities in New York and Montreal',
  baseUrl: 'https://www.socceroof.com',
  complianceStatus: 'ALLOWED',
  runId: '396cd6c8-3bf8-4e40-8205-cda8933964af',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:31:22.037Z',
  pages: [
    { url: SOCCEROOF_NEW_YORK_HOME_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: SOCCEROOF_NEW_YORK_RENTAL_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/clubs?state=New+York', role: 'DIRECTORY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/activity/soccer-leagues', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/activity/pickup-soccer', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/activity/soccer-youth-class', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/activity/long-term-rental', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.socceroof.com/en/activity/globe-cup', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
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

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Socceroof New York',
  officialActionUrl: SOCCEROOF_NEW_YORK_HOME_URL,
  sourceUrl: SOCCEROOF_NEW_YORK_HOME_URL,
  organizerName: 'Socceroof',
  sportName: 'Soccer',
  formatLabel: 'Indoor soccer fields, leagues, pickup games, youth programs, and social spaces',
  city: 'New York',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Indoor soccer programs and facilities',
  scheduleText: 'The stored homepage describes field rentals, leagues, pickup games, other sports, youth classes and camps, private classes, tournaments, birthdays, private events, corporate events, long-term rental, and five New York clubs.',
  statusText: 'Review-only club profile; current program schedules and club details require the official Socceroof pages.',
  description: SOCCEROOF_NEW_YORK_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Indoor Facility', 'Youth', 'Adult'],
  logoUrl: SOCCEROOF_LOGO_SOURCE_URL,
  logoSourceUrl: SOCCEROOF_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage identifies five New York clubs but does not capture their individual addresses or current schedules.',
    'The Globe Cup text references June 6-7 and is withheld as a dated event because the stored page does not provide a complete current registration row and the date is past as of 2026-07-31.',
  ],
};

const rentalCandidate = {
  listingKind: 'RENTAL' as const,
  title: 'Socceroof New York Indoor Soccer Field Rental',
  officialActionUrl: SOCCEROOF_NEW_YORK_RENTAL_URL,
  sourceUrl: SOCCEROOF_NEW_YORK_HOME_URL,
  organizerName: 'Socceroof',
  sportName: 'Soccer',
  formatLabel: 'Indoor soccer field rental',
  city: 'New York',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Indoor field rental',
  scheduleText: 'The stored homepage describes indoor field rental on exceptional pitches; the official rental detail page was discovered but not captured with current availability, price, or facility rows.',
  statusText: 'Review-only rental path; current availability and price require the official Socceroof booking flow.',
  description: 'Socceroof offers an official indoor soccer field-rental path for New York facilities; current field inventory, price, and availability remain on the official booking flow.',
  tags: ['Rental', 'Soccer', 'Indoor Facility'],
  logoUrl: SOCCEROOF_LOGO_SOURCE_URL,
  logoSourceUrl: SOCCEROOF_LOGO_SOURCE_URL,
  warnings: [
    'The official field-rental page is stored as an UNCHECKED discovery URL and was not captured with a complete price, facility address, hours, or live availability row.',
    'No specific New York club or street address is assigned to this metro-wide rental path.',
  ],
};

export const SOCCEROOF_NEW_YORK_MANUAL_CANDIDATES = [organizationCandidate, rentalCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOCCEROOF_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: SOCCEROOF_NEW_YORK_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Socceroof New York Indoor Soccer Field Rental' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOCCEROOF_NEW_YORK_RENTAL_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: SOCCEROOF_NEW_YORK_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Socceroof' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor soccer field rental' },
    city: { selector: 'body', mode: 'literal', value: 'New York' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Indoor field rental' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Soccer, Indoor Facility' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: SOCCEROOF_NEW_YORK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/socceroofNewYork.html');

export const SOCCEROOF_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
