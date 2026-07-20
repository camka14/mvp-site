import type { AffiliateScrapeMapping } from './types';

export const OBC_HOME_URL = 'https://obc.work/';
export const OBC_TEAMS_URL = 'https://obc.work/teams/';
export const OBC_REGISTRATION_URL = 'https://obc.work/registration/';
export const OBC_CAMPS_URL = 'https://obc.work/camps/';
export const OBC_CALENDAR_URL = 'https://oregonbasketballclub.tandem.co/index.php?action=month&type=view';
export const OBC_ROBOTS_URL = 'https://obc.work/robots.txt';
export const OBC_LOGO_SOURCE_URL =
  'https://oregonbasketballclub.teamsnapsites.com/wp-content/uploads/sites/1999/2019/10/N1-e1571951855652.png';
export const OBC_ORG_DESCRIPTION =
  'Oregon Basketball Club is a youth basketball club offering boys and girls competitive team options from travel teams to beginning youth basketball, with teams for grades 3rd-12th, seasonal practices, skill clinics, games, and tournament play.';

const ORGANIZER_NAME = 'Oregon Basketball Club';

export const OBC_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: OBC_HOME_URL,
    sourceUrl: OBC_TEAMS_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Basketball',
    formatLabel: 'Youth competitive basketball club',
    city: 'Beaverton, OR',
    venueName: 'The Courts in Beaverton',
    address: null,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club basketball programs by season',
    scheduleText:
      'OBC describes spring and summer programming from mid-March through the end of July, including practices, weekly skill clinics, games, and tournament play. Current dates and locations vary by season and grade.',
    ageGroup: 'Grades 3rd-12th',
    participantOptionsText:
      'Use the official OBC teams page and TeamSnap registration link for current player evaluations and seasonal program registration.',
    statusText:
      'The public OBC teams page provides club and evaluation information; current dated evaluation and camp rows are reviewed separately before creating event candidates.',
    description: OBC_ORG_DESCRIPTION,
    warnings: [
      'The teams page lists March 16 and 18 evaluation dates without a source year; the linked TeamSnap form identifies the season as Spring & Summer 2026, so those dates are past as of July 15, 2026 and are not emitted as an event.',
      'The camps page identifies Spring Break Camp 2026 and contains conflicting March 23-25 versus March 24-26 date text; it is past and is not emitted as an event.',
      'The club publishes Beaverton as the evaluation location and says practices take place at The Courts in Beaverton, but it does not publish a fixed street address on the reviewed pages. The organization uses Beaverton, OR for discovery and retains the venue name as source context.',
      'The TeamSnap registration page requires JavaScript and an account to continue; the official OBC teams page remains the public club action URL.',
      `The separate logo workflow should use the official OBC asset recorded at ${OBC_LOGO_SOURCE_URL}; this source setup does not download or assign the logo.`,
      'No TEAM candidates are created in this pass. The source describes teams, but the current request is to add the club and future-dated events only when dates are published.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const OBC_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: OBC_TEAMS_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: ORGANIZER_NAME,
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: OBC_HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: OBC_MANUAL_CANDIDATES,
};
