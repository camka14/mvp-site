import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const YORK_COLLEGE_RENTAL_FORM_URL = 'https://yorkathletics.com/sb_output.aspx?form=6';
export const YORK_COLLEGE_FACILITIES_URL = 'https://yorkathletics.com/facilities';
export const YORK_COLLEGE_HOME_URL = 'https://yorkathletics.com/';
export const YORK_COLLEGE_LOGO_SOURCE_URL = 'https://yorkathletics.com/images/logos/site/site.png';

export const YORK_COLLEGE_ORG_DESCRIPTION =
  'York College Athletics accepts applications for athletic facility rentals, including gymnasium, swimming pool, tennis courts, field, track, classroom, and other campus spaces.';

export const YORK_COLLEGE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ce80b2fb-f4e0-427c-b20b-145ff74e383a',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-application-for-athletic-facility-rental-yorkathletics-com',
  intakeName: 'Application for Athletic Facility Rental',
  baseUrl: YORK_COLLEGE_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: 'b30cad55-8b75-4ae0-a47a-5a9866bd0461',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:02.789Z',
  pages: [
    { url: YORK_COLLEGE_RENTAL_FORM_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: YORK_COLLEGE_FACILITIES_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: YORK_COLLEGE_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://yorkathletics.com/sb_output.aspx?form=83', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://yorkathletics.com/sports/2007/10/4/facilities.aspx', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
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

export const YORK_COLLEGE_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'York College Athletic Facility Rental Application',
    officialActionUrl: YORK_COLLEGE_RENTAL_FORM_URL,
    sourceUrl: YORK_COLLEGE_RENTAL_FORM_URL,
    organizerName: 'York College Athletics',
    sportName: 'Multi-sport',
    formatLabel: 'Athletic facility rental application',
    city: 'New York metropolitan area',
    venueName: 'York College athletic facilities',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Rental applications accepted year-round; submit at least four weeks before the requested date',
    scheduleText: 'The stored allowed form requests rental dates and start/end times and asks applicants to select from gymnasium, pool, tennis courts, field, track, classroom, and other athletic spaces.',
    priceText: null,
    participantOptionsText: 'Applicants select requested facilities and provide participant ages, participant count, spectator count, setup/breakdown time, and event type.',
    statusText: 'Review-only rental application link-out; price, availability, exact facility assignment, and requested-date approval are handled by York College Athletics.',
    description: YORK_COLLEGE_ORG_DESCRIPTION,
    tags: ['Rental', 'Multi-sport', 'Facility', 'New York'],
    logoUrl: YORK_COLLEGE_LOGO_SOURCE_URL,
    logoSourceUrl: YORK_COLLEGE_LOGO_SOURCE_URL,
    warnings: [
      'The stored allowed form supports athletic-facility rental applications and a four-week lead-time instruction, but does not publish price, live availability, a canonical street address, or approved rental dates.',
      'The stored facilities, directions, campus-event, homepage, and other detail pages are UNCHECKED and remain withheld.',
      'This is an application link-out rather than a fixed event or confirmed booking; no EVENT candidate is created.',
      'The stored first-party York College Athletics Cardinals logo was normalized to an opaque 1024px square PNG without changing the mark.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const YORK_COLLEGE_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: YORK_COLLEGE_RENTAL_FORM_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'York College Athletic Facility Rental Application' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: YORK_COLLEGE_RENTAL_FORM_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: YORK_COLLEGE_RENTAL_FORM_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'York College Athletics' },
    sportName: { selector: 'body', mode: 'literal', value: 'Multi-sport' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Athletic facility rental application' },
    city: { selector: 'body', mode: 'literal', value: 'New York metropolitan area' },
    venueName: { selector: 'body', mode: 'literal', value: 'York College athletic facilities' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Rental applications accepted year-round; submit at least four weeks before the requested date' },
    description: { selector: 'body', mode: 'literal', value: YORK_COLLEGE_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Multi-sport, Facility, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: YORK_COLLEGE_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/yorkCollegeAthleticFacilityRental.html');

export const YORK_COLLEGE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: YORK_COLLEGE_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
