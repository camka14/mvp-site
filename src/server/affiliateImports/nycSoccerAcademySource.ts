import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYCSA_HOME_URL = 'https://www.nycsocceracademy.com/';
export const NYCSA_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/6a843d_bd75da2d8dc0437487867610a4265ff9~mv2.png/v1/fill/w_214,h_240,al_c,usm_0.66_1.00_0.01/6a843d_bd75da2d8dc0437487867610a4265ff9~mv2.png';
export const NYCSA_ORG_DESCRIPTION = 'NYC Soccer Academy trains players in the technical, tactical, and functional aspects of soccer through youth camps, college ID clinics, and academy programming in New York City.';

export const NYCSA_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'ab73ba32-24e1-4c47-a19b-2c7b9381a7ac',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-nyc-soccer-academy-nycsocceracademy-com',
  intakeName: 'NYC Soccer Academy',
  baseUrl: 'https://www.nycsocceracademy.com',
  complianceStatus: 'ALLOWED',
  runId: '022fa65b-fce4-4214-990a-9e4103a2bb15',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:05:39.929Z',
  pages: [
    { url: 'https://www.nycsocceracademy.com/location', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycsocceracademy.com/elite-skills-youth-girls', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycsocceracademy.com/staff', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: NYCSA_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.nycsocceracademy.com/summercamps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycsocceracademy.com/women-s-id-camps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.nycsocceracademy.com/copy-of-elite-college-id-camps-women', role: 'LISTING', robotsStatus: 'UNCHECKED' },
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

export const NYCSA_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'NYC Soccer Academy',
    officialActionUrl: NYCSA_HOME_URL,
    sourceUrl: NYCSA_HOME_URL,
    organizerName: 'NYC Soccer Academy',
    sportName: 'Soccer',
    formatLabel: 'Youth soccer academy, summer camps, and college ID clinics',
    city: 'New York, NY',
    venueName: 'Columbia University facilities',
    address: null,
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Ongoing NYC soccer academy programs',
    scheduleText: 'The stored homepage describes technical, tactical, and functional soccer training, summer youth camps for boys and girls ages 6–17, half-day camps for ages 6–16, and college ID clinics at Columbia University.',
    statusText: 'Review-only club profile; camp, clinic, location, and registration detail pages require separate review.',
    description: NYCSA_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth', 'Academy', 'New York'],
    warnings: [
      'All stored Summer 2026 camp weeks (July 6–9, July 13–16, and July 20–23) were past by 2026-07-31, so no stale EVENT candidate is created.',
      'The stored camp, clinic, location, staff, and registration detail pages are UNCHECKED; those rows are withheld.',
      'The stored first-party NYC Soccer Academy crest was normalized to an opaque 1024px PNG.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYCSA_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: NYCSA_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYC Soccer Academy' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYCSA_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYCSA_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYC Soccer Academy' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Academy, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: NYCSA_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycSoccerAcademy.html');

export const NYCSA_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: NYCSA_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
