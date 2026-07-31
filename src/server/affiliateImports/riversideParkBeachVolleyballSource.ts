import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const RIVERSIDE_PARK_HOME_URL = 'https://riversideparknyc.org/';
export const RIVERSIDE_PARK_COURTS_URL = 'https://riversideparknyc.org/parks/riverside-park-south-beach-volleyball-courts';
export const RIVERSIDE_PARK_PERMIT_URL = 'https://www.nycgovparks.org/permits/field-and-court/request';
export const RIVERSIDE_PARK_LOGO_SOURCE_URL = 'https://riversideparknyc.org/wp-content/uploads/2025/03/site-logo-social.png';

export const RIVERSIDE_PARK_ORG_DESCRIPTION =
  'Riverside Park Conservancy works in partnership with NYC Parks to restore, maintain, and improve Riverside Park from West 59th Street to 181st Street.';

export const RIVERSIDE_PARK_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'cfe3585b-bcc2-4bce-b4b3-3ef9fc6830e8',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-riverside-park-volleyball-riversideparknyc-org',
  intakeName: 'Riverside Park Volleyball',
  baseUrl: 'https://riversideparknyc.org',
  complianceStatus: 'ALLOWED',
  runId: 'c800b424-d471-4c29-9a14-5b5c64e7ed7a',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:04:21.208Z',
  pages: [
    { url: RIVERSIDE_PARK_HOME_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: RIVERSIDE_PARK_COURTS_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://riversideparknyc.org/sport-camp/riverside-park-volleyball', role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://riversideparknyc.org/parks/riverside-park-south-beach-volleyball-courts/', role: 'DETAIL', robotsStatus: 'ALLOWED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 40 },
    { kind: 'PAGE_BRANDING', count: 8 },
    { kind: 'PAGE_HTML', count: 8 },
    { kind: 'PAGE_IMAGES', count: 8 },
    { kind: 'PAGE_LINKS', count: 8 },
    { kind: 'PAGE_MARKDOWN', count: 8 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 8 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 8 },
    { kind: 'ROBOTS', count: 10 },
  ],
} as const;

export const RIVERSIDE_PARK_MANUAL_CANDIDATES = [
  {
    listingKind: 'RENTAL' as const,
    title: 'Riverside Park South Beach Volleyball Courts',
    officialActionUrl: RIVERSIDE_PARK_PERMIT_URL,
    sourceUrl: RIVERSIDE_PARK_COURTS_URL,
    organizerName: 'Riverside Park Conservancy',
    sportName: 'Beach Volleyball',
    formatLabel: 'Public beach volleyball courts with first-come, first-served pickup play',
    city: 'New York, NY',
    venueName: 'Riverside Park South Beach Volleyball Courts',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Public beach volleyball courts; permit required for organized use',
    scheduleText: 'The stored official court page says pickup games are first come, first served and users must bring their own nets, balls, and other equipment. Ballfield permits are required for organized leagues or gatherings of 20 or more.',
    statusText: 'Review-only public-court listing; the official page does not publish rental availability or a price.',
    description: 'Riverside Park South has beach volleyball courts for pickup play. Users must bring their own equipment; organized leagues or gatherings of 20 or more require a NYC Parks permit.',
    tags: ['Rental', 'Beach Volleyball', 'Public Courts'],
    warnings: [
      'The stored court page does not publish a price, reservation availability, or a street address; those fields remain unset.',
      'The official action URL is the NYC Parks field-and-court permit request linked by the source; it is not represented as real-time court booking.',
      'No dated EVENT candidate is created because the court page describes ongoing public use rather than a dated session.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const RIVERSIDE_PARK_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: RIVERSIDE_PARK_COURTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Riverside Park South Beach Volleyball Courts' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: RIVERSIDE_PARK_PERMIT_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: RIVERSIDE_PARK_COURTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Riverside Park Conservancy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Beach Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Public beach volleyball courts with first-come, first-served pickup play' },
    city: { selector: 'body', mode: 'literal', value: 'New York, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Riverside Park South Beach Volleyball Courts' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Public beach volleyball courts; permit required for organized use' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'Pickup games are first come, first served; users bring their own equipment; organized leagues or groups of 20 or more require a permit.' },
    description: { selector: 'body', mode: 'literal', value: 'Riverside Park South has beach volleyball courts for pickup play. Users must bring their own equipment; organized leagues or gatherings of 20 or more require a NYC Parks permit.' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Beach Volleyball, Public Courts' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: RIVERSIDE_PARK_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/riversideParkBeachVolleyball.html');

export const RIVERSIDE_PARK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: RIVERSIDE_PARK_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
