import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL = 'https://www.sepdx-girlsbasketballclub.com/';
export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL = 'https://www.sepdx-girlsbasketballclub.com/hoop-with-us/';
export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ROBOTS_URL = 'https://www.sepdx-girlsbasketballclub.com/robots.txt';
export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_LOGO_SOURCE_URL =
  'https://www.sepdx-girlsbasketballclub.com/wp-content/uploads/sites/866/2022/06/cropped-SE-girls-basketball-Logo-1.png';
export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ORG_DESCRIPTION =
  'Southeast Portland Girls Basketball Club is a Portland youth basketball club for girls in grades 1-8. The club describes a year-round program with games, tournaments, camps, clinics, skills development, and a competitive environment that accepts players at every skill level without tryouts.';

const ORGANIZER_NAME = 'Southeast Portland Girls Basketball Club';

export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL,
    sourceUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Basketball',
    formatLabel: 'Girls youth basketball club',
    city: 'Portland, OR',
    skillLevel: 'All skill levels',
    ageGroup: 'Girls grades 1-8',
    divisionText: 'Girls grades 1-8',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round basketball program',
    scheduleText: 'The official club page describes year-round games, tournaments, camps, clinics, and skills development but does not publish a current dated program calendar.',
    participantOptionsText: 'Use the official Hoop With Us page for current club registration information.',
    statusText: 'The public club page states that it accepts players at any skill level without tryouts; no current season price or dated program occurrence is published.',
    description: 'Southeast Portland Girls Basketball Club provides girls youth basketball programs for grades 1-8, including games, tournaments, camps, clinics, and skills development.',
    warnings: [
      'The homepage links to a 2025 winter clinic and says 2025-26 player registration is closed. No past or closed clinic event is created.',
      'The public source does not publish a current season price, street address, or dated future program calendar.',
      'No TEAM candidates are created because the public pages describe the club program rather than stable roster-level registration targets.',
      'The official transparent club mark is downloaded and normalized by the idempotent setup before the public organization is upserted.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: { selector: 'body', mode: 'literal', value: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES,
};

export const SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Southeast Portland Girls Basketball reviewed club source snapshot.</main></body></html>',
    };
  },
};
