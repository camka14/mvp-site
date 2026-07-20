import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const WESTSIDE_METROS_HOME_URL = 'https://www.westsidemetros.org/';
export const WESTSIDE_METROS_ROBOTS_URL = 'https://www.westsidemetros.org/robots.txt';
export const WESTSIDE_METROS_LOGO_SOURCE_URL =
  'https://www.westsidemetros.org/_templates/Home-2022/images/logo.png';
export const WESTSIDE_METROS_OFFICE_ADDRESS =
  '8231 SW Cirrus Dr, Building 16, Beaverton, OR 97008';

export const WESTSIDE_METROS_ORG_DESCRIPTION =
  'Westside Metros FC is a Beaverton soccer club offering Mighty Metros and Metros Academy development programs, competitive pathways through U19, Girls Academy and MLS NEXT programs, and WPSL and UPSL teams.';

export const WESTSIDE_METROS_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '497c527f-dda4-425d-87b0-06e79b04eee7',
  intakeSourceKey: 'site-westsidemetros-org',
  runId: 'f7143726-814c-49d2-a480-e755bdc2ba31',
  runStatus: 'SUCCEEDED',
  provider: 'FIRECRAWL',
  capturedAt: '2026-07-20T00:07:13.152Z',
  pages: [
    {
      url: WESTSIDE_METROS_HOME_URL,
      role: 'LISTING',
      robotsStatus: 'ALLOWED',
    },
  ],
  artifactKinds: [
    'PAGE_HTML',
    'PAGE_MARKDOWN',
    'PAGE_LINKS',
    'PAGE_IMAGES',
    'PAGE_BRANDING',
    'PAGE_SCREENSHOT',
    'LOGO_CANDIDATE',
    'ROBOTS',
  ],
} as const;

export const WESTSIDE_METROS_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Westside Metros FC',
    officialActionUrl: WESTSIDE_METROS_HOME_URL,
    sourceUrl: WESTSIDE_METROS_HOME_URL,
    organizerName: 'Westside Metros FC',
    sportName: 'Grass Soccer',
    formatLabel: 'Youth and adult soccer club',
    city: 'Beaverton, OR',
    venueName: null,
    address: null,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Programs offered by season',
    scheduleText:
      'Westside Metros FC publishes current development, competitive, academy, WPSL, UPSL, camp, tournament, and registration information on its official website.',
    participantOptionsText:
      'Use the official Westside Metros FC website for current program and registration actions.',
    statusText:
      'Supplemental tryout registration is open, but the captured public page does not publish a dated tryout session.',
    description: WESTSIDE_METROS_ORG_DESCRIPTION,
    warnings: [
      'The July 17-19, 2026 adidas Beaverton Cup started before the July 20 intake capture and is not imported as a future event.',
      'Annual tryouts are held in May; supplemental registration has no source-provided future date or time, so no tryout event is created.',
      'The Metros Academy Summer 2026 card does not expose a dated session on the captured page, so it is withheld pending a detail-page intake.',
      'The 2026 WPSL registration is a club-team program, not a stable roster-level team action, and the UPSL spring season is complete; no TEAM candidate is created.',
      'No public facility rental or booking path is exposed, so no RENTAL candidate is created.',
      `The source publishes ${WESTSIDE_METROS_OFFICE_ADDRESS} as its office, not as a practice or event venue; club discovery remains centered on Beaverton.`,
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const WESTSIDE_METROS_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: WESTSIDE_METROS_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Westside Metros FC' },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: WESTSIDE_METROS_HOME_URL,
    },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: WESTSIDE_METROS_MANUAL_CANDIDATES,
};

// Current stored evidence supports the club profile, not dated event inventory.
export const WESTSIDE_METROS_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Westside Metros FC intake-backed source.</main></body></html>',
    };
  },
};
