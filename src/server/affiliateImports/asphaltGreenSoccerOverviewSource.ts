import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ASPHALT_GREEN_HOME_URL = 'https://www.asphaltgreen.org/';
export const ASPHALT_GREEN_SOCCER_URL = 'https://www.asphaltgreen.org/sports/soccer';
export const ASPHALT_GREEN_AGSC_LOGO_URL = 'https://www.asphaltgreen.org/wp-content/uploads/2025/02/AGSC_Logo-A-Brand-Green.svg';
export const ASPHALT_GREEN_AGSC_DESCRIPTION = 'Asphalt Green Soccer serves New York City families through youth soccer classes, clinics, leagues, private lessons, and competitive club development. The stored soccer overview describes programs for children from 18 months through experienced youth players and emphasizes inclusive, supportive development.';

export const ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7321341b-96e2-42e3-8d0c-9b33f480ed0b',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-soccer-overview-asphaltgreen-org',
  intakeName: 'New York Soccer Overview',
  baseUrl: 'https://www.asphaltgreen.org',
  complianceStatus: 'ALLOWED',
  runId: 'e96e90ff-70a6-4271-80e4-33fbb469ee15',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:33:09.174Z',
  pages: [
    { url: ASPHALT_GREEN_SOCCER_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.asphaltgreen.org/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.asphaltgreen.org/teams/agsc/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.asphaltgreen.org/rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://account.asphaltgreen.org/s/tryout/a5zUX00000GXYeZYAX/agsc-202627-tryouts?source=AG%20Website%20Soccer%20Overview', role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
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

export const ASPHALT_GREEN_SOCCER_OVERVIEW_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Asphalt Green Soccer Club (AGSC)',
    officialActionUrl: ASPHALT_GREEN_SOCCER_URL,
    sourceUrl: ASPHALT_GREEN_SOCCER_URL,
    organizerName: 'Asphalt Green Soccer Club',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer classes, clinics, leagues, lessons, and competitive club development',
    city: 'New York, NY',
    venueName: null,
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing youth soccer programming and club development',
    scheduleText: 'The stored soccer overview describes classes, clinics, youth leagues, private lessons, and competitive club development across New York City, with programs for children from 18 months and up.',
    statusText: 'Review-only club profile; current registration and tryout rows require their stored detail pages to be reviewed separately.',
    description: ASPHALT_GREEN_AGSC_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Training', 'New York'],
    warnings: [
      'The stored allowed overview does not provide a complete current date, venue, price, capacity, or registration row for a specific event, so no EVENT candidate is created.',
      'The stored overview links to AGSC tryouts, classes, leagues, private lessons, rentals, and team pages, but those detail pages are UNCHECKED and remain withheld.',
      'The stored first-party AGSC logo candidate was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ASPHALT_GREEN_SOCCER_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Asphalt Green Soccer Club (AGSC)' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ASPHALT_GREEN_SOCCER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ASPHALT_GREEN_SOCCER_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Asphalt Green Soccer Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Training, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: ASPHALT_GREEN_SOCCER_OVERVIEW_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/asphaltGreenSoccerOverview.html');

export const ASPHALT_GREEN_SOCCER_OVERVIEW_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
