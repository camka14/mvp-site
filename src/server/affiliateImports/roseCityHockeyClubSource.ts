import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ROSE_CITY_HOCKEY_HOME_URL = 'https://www.rosecityhockeyclub.com/';
export const ROSE_CITY_HOCKEY_SEASON_URL =
  'https://www.rosecityhockeyclub.com/2025-2026-season.html';
export const ROSE_CITY_HOCKEY_PLAYER_INTEREST_URL =
  'https://www.rosecityhockeyclub.com/player-interest.html';
export const ROSE_CITY_HOCKEY_ROBOTS_URL =
  'https://www.rosecityhockeyclub.com/robots.txt';
export const ROSE_CITY_HOCKEY_LOGO_SOURCE_URL =
  'https://www.rosecityhockeyclub.com/uploads/2/2/9/1/22918082/rchclogo-transparentwithborder_orig.png';
export const ROSE_CITY_HOCKEY_ORG_DESCRIPTION =
  'Rose City Hockey Club is an all-girls hockey organization serving Portland and Vancouver. The nonprofit club supports girls hockey and empowerment through sport and publishes current club updates on its official website.';

export const ROSE_CITY_HOCKEY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeSourceKey: 'site-rosecityhockeyclub-com',
  runId: '7d004c23-3634-428d-8153-e033e8d3d328',
  runStatus: 'SUCCEEDED',
  provider: 'FIRECRAWL',
  capturedAt: '2026-07-20T00:15:20.976Z',
  pages: [
    {
      url: ROSE_CITY_HOCKEY_HOME_URL,
      role: 'LISTING',
      robotsStatus: 'ALLOWED',
    },
  ],
  artifactKinds: [
    'PAGE_MARKDOWN',
    'PAGE_LINKS',
    'PAGE_SCREENSHOT',
    'LOGO_CANDIDATE',
    'ROBOTS',
  ],
} as const;

export const ROSE_CITY_HOCKEY_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Rose City Hockey Club',
    officialActionUrl: ROSE_CITY_HOCKEY_HOME_URL,
    sourceUrl: ROSE_CITY_HOCKEY_HOME_URL,
    organizerName: 'Rose City Hockey Club',
    sportName: 'Hockey',
    formatLabel: 'All-girls hockey club',
    city: 'Portland, OR',
    venueName: null,
    address: null,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club programs return by season',
    scheduleText:
      'Rose City Hockey Club publishes all-girls hockey program and season updates for families in Portland and Vancouver.',
    participantOptionsText:
      'Use the official Rose City Hockey Club website for current player-interest and seasonal registration information.',
    statusText:
      'The July 2026 source capture says the club will return in the fall, but does not publish a current dated registration occurrence.',
    description: ROSE_CITY_HOCKEY_ORG_DESCRIPTION,
    warnings: [
      'The homepage links to a 2025-2026 season page, so that stale season is not imported as a future event.',
      'The source publishes only a Portland PO box and a Portland/Vancouver service area, not a physical club venue; coordinates are intentionally left unspecified.',
      'No EVENT candidate is created because the captured evidence does not provide a future date, time, venue, price, and official registration action.',
      'No TEAM candidate is created because the captured evidence does not provide a stable roster-level registration action.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ROSE_CITY_HOCKEY_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: ROSE_CITY_HOCKEY_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Rose City Hockey Club' },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: ROSE_CITY_HOCKEY_HOME_URL,
    },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: ROSE_CITY_HOCKEY_MANUAL_CANDIDATES,
};

// The current intake supports a club profile, not reliable dated inventory.
export const ROSE_CITY_HOCKEY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Rose City Hockey Club intake-backed source.</main></body></html>',
    };
  },
};
