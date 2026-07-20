import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const LUMBERJACK_BASEBALL_HOME_URL = 'https://lumberjackbaseballclub.com/';
export const LUMBERJACK_BASEBALL_CONTACT_URL = 'https://lumberjackbaseballclub.com/contact-us/';
export const LUMBERJACK_BASEBALL_ROBOTS_URL = 'https://lumberjackbaseballclub.com/robots.txt';
export const LUMBERJACK_BASEBALL_LOGO_SOURCE_URL =
  'https://lumberjackbaseballclub.com/wp-content/uploads/2021/09/EMU031029-Lumberjacks-logo.png';
export const LUMBERJACK_BASEBALL_ORG_DESCRIPTION =
  'Lumberjack Baseball Club is a Lake Oswego youth baseball club serving the Portland metro area. Its public site describes player development, positive coaching, competitive club tournament play, and optional Pacific Northwest travel.';

const ORGANIZER_NAME = 'Lumberjack Baseball Club';

export const LUMBERJACK_BASEBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: LUMBERJACK_BASEBALL_CONTACT_URL,
    sourceUrl: LUMBERJACK_BASEBALL_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Baseball',
    formatLabel: 'Youth competitive baseball club',
    city: 'Lake Oswego, OR',
    venueName: null,
    address: null,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Competitive baseball programs by season',
    scheduleText: 'Lumberjack Baseball Club describes player development, positive coaching, competitive tournament play, and optional travel for youth baseball players.',
    participantOptionsText: 'Use the official Lumberjack Baseball Club contact page for current team, program, and registration information.',
    statusText: 'The reviewed public site publishes a club profile and contact path but no current dated tryout, camp, or roster-level registration action.',
    description: LUMBERJACK_BASEBALL_ORG_DESCRIPTION,
    warnings: [
      'The public source identifies Lake Oswego and the Portland metro area but does not publish a fixed street address, so no venue address is inferred.',
      'The official transparent Lumberjack wordmark is downloaded and normalized by the idempotent setup before the public organization is upserted.',
      'No EVENT candidates are created because no current public page provides a complete future date, time, venue, price, and official action.',
      'No TEAM candidates are created because the public source does not publish stable roster-level registration targets.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const LUMBERJACK_BASEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: LUMBERJACK_BASEBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: { selector: 'body', mode: 'literal', value: LUMBERJACK_BASEBALL_CONTACT_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: LUMBERJACK_BASEBALL_MANUAL_CANDIDATES,
};

// The public club profile is reviewed as a source-controlled summary. It does
// not expose current dated program rows, so the mapping emits only the club.
export const LUMBERJACK_BASEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Lumberjack Baseball Club reviewed public source.</main></body></html>',
    };
  },
};
