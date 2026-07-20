import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const CYO_CAMP_HOWARD_HOME_URL = 'https://www.cyocamphoward.org/';
export const CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL =
  'https://www.cyocamphoward.org/content/24472/Athletic-Director-Info-and-Sport-Registration';
export const CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL =
  'https://www.cyocamphoward.org/sites/cyocamphoward/program/115345/CYO-Boys-Volleyball-Portal-2627';
export const CYO_CAMP_HOWARD_ROBOTS_URL = 'https://www.cyocamphoward.org/robots.txt';
export const CYO_CAMP_HOWARD_ADDRESS = '847 NE 19th Avenue, Suite 385, Portland, OR 97232';
export const CYO_CAMP_HOWARD_LOGO_SOURCE_URL =
  'https://d2jqoimos5um40.cloudfront.net/site_0313/47a89.png';
export const CYO_CAMP_HOWARD_ORG_DESCRIPTION =
  'CYO / Camp Howard Sports organizes school-based Catholic youth sports in the Portland metro area. Its public CYO Sports pages cover basketball, volleyball, cross country, swimming, and track and field programs, with official registration and club-placement information for participating families.';

const ORGANIZER_NAME = 'CYO / Camp Howard Sports';

export const CYO_CAMP_HOWARD_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
    sourceUrl: CYO_CAMP_HOWARD_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Indoor Volleyball',
    formatLabel: 'School-based youth sports organization',
    city: 'Portland, OR',
    venueName: 'Portland CYO Office',
    address: CYO_CAMP_HOWARD_ADDRESS,
    skillLevel: 'Fundamentals through advanced techniques',
    ageGroup: 'Youth school programs',
    divisionText: 'School-based basketball, volleyball, cross country, swimming, and track and field programs',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Youth sports programs by season',
    scheduleText:
      'CYO publishes sport-specific registration portals and school-based schedules. The current public boys volleyball page describes an August-November season but does not publish one event start date, time, or venue.',
    participantOptionsText:
      'Use the official CYO Sports registration hub to find a participating school club, current enrollment options, and CYO placement guidance.',
    statusText:
      'The current boys volleyball portal is open for 2026-27 applications by grade. It does not publish a complete event schedule or one source-stated venue for the season.',
    description:
      'CYO / Camp Howard Sports provides Portland-area school-based youth sports programs. Its public CYO Sports pages direct families to official registration, participating-school information, sport schedules, and club-placement support.',
    warnings: [
      'The official 2026-27 boys volleyball portal has open grade-specific applications but provides no single event start date, time, or venue. No dated event is created.',
      'The portal displays $0 application rows, which are not treated as a season or event price because the public source does not identify them as the total participation fee.',
      'No TEAM candidates are created. The source is organized around school clubs and does not expose stable roster-level registration targets.',
      'The official CYO mark is downloaded and normalized by the idempotent setup before the public organization is upserted.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const CYO_CAMP_HOWARD_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: CYO_CAMP_HOWARD_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
    },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: CYO_CAMP_HOWARD_MANUAL_CANDIDATES,
};

// The reviewed public program pages are a source-controlled summary rather than
// a stable card feed. The setup reuses this approved manual club mapping.
export const CYO_CAMP_HOWARD_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>CYO / Camp Howard reviewed public sports source.</main></body></html>',
    };
  },
};
