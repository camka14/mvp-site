import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ASPHALT_GREEN_HOME_URL = 'https://www.agsoccerclub.com/';
export const ASPHALT_GREEN_TRYOUTS_URL = 'https://www.agsoccerclub.com/tryouts';
export const ASPHALT_GREEN_ORG_DESCRIPTION =
  'Asphalt Green Soccer Club is a New York City soccer club whose public homepage describes a high-performance community of coaches, players, and families, with competitive teams, developmental classes, recreational leagues, camps, and clinics.';

export const ASPHALT_GREEN_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'edab1d0f-a6c6-44ae-afd7-8e841c6417da',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-asphalt-green-soccer-club-agsoccerclub-com',
  runId: '073d1ff4-18d4-4c5d-b015-d1c8f619bb75',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:07:40.156Z',
  pages: [
    {
      url: ASPHALT_GREEN_HOME_URL,
      role: 'HOME',
      robotsStatus: 'ALLOWED',
      artifactKinds: ['PAGE_HTML', 'PAGE_MARKDOWN', 'PAGE_SCREENSHOT', 'PAGE_LINKS', 'PAGE_IMAGES', 'PAGE_BRANDING', 'LOGO_CANDIDATE', 'ROBOTS'],
    },
  ],
  artifacts: [
    { kind: 'PAGE_HTML', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['club identity', 'program summary'] },
    { kind: 'PAGE_MARKDOWN', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['club identity', 'program summary', 'age range'] },
    { kind: 'PAGE_LINKS', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['official homepage', 'official tryouts URL'] },
    { kind: 'PAGE_SCREENSHOT', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['rendered brand context'] },
    { kind: 'PAGE_BRANDING', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['logo review'] },
    { kind: 'LOGO_CANDIDATE', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['logo review'] },
    { kind: 'ROBOTS', sha256: 'stored-export-artifact', pageUrl: ASPHALT_GREEN_HOME_URL, supports: ['public homepage policy'] },
  ],
} as const;

export const ASPHALT_GREEN_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Asphalt Green Soccer Club',
    officialActionUrl: ASPHALT_GREEN_HOME_URL,
    sourceUrl: ASPHALT_GREEN_HOME_URL,
    organizerName: 'Asphalt Green Soccer Club',
    sportName: 'Soccer',
    formatLabel: 'New York City soccer club',
    city: 'New York City, NY',
    venueName: null,
    address: null,
    ageGroup: 'U6-U18/19',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club programs and soccer development',
    scheduleText: 'The captured homepage describes competitive teams, developmental classes, recreational leagues, camps, and clinics. Current dates and registration details require review of the official linked program pages.',
    statusText: 'Review-only club profile; no current dated event is emitted from the homepage capture.',
    description: ASPHALT_GREEN_ORG_DESCRIPTION,
    tags: ['Club', 'Soccer', 'Youth'],
    warnings: [
      'Only the official homepage has stored rendered content; discovered program and tryout pages were not captured in this intake run.',
      'The homepage identifies New York City but does not publish a fixed street address, so no address or coordinates are inferred.',
      'The stored logo candidates are Adidas, EDP, USYS, NAL, and WPSL marks rather than an identifiable Asphalt Green Soccer Club mark; logo disposition is MANUAL_REVIEW.',
      'No EVENT candidate is created because the stored homepage has no source-provided future date, time, venue, price, and registration row.',
      'No TEAM candidate is created because the stored evidence does not expose a stable roster-level registration target.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ASPHALT_GREEN_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ASPHALT_GREEN_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Asphalt Green Soccer Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ASPHALT_GREEN_HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: ASPHALT_GREEN_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(
  process.cwd(),
  'src/server/affiliateImports/fixtures/asphaltGreenSoccerClub.html',
);

export const ASPHALT_GREEN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:07:40.156Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
