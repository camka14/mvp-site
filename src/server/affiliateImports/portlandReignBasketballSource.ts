import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PORTLAND_REIGN_HOME_URL = 'https://www.pdxreignbasketball.com/';
export const PORTLAND_REIGN_CAMPS_URL = 'https://www.pdxreignbasketball.com/camps';
export const PORTLAND_REIGN_AAU_URL = 'https://www.pdxreignbasketball.com/portland-aau-basketball';
export const PORTLAND_REIGN_AFTER_SCHOOL_URL = 'https://www.pdxreignbasketball.com/after-school-programs';
export const PORTLAND_REIGN_VENUE_NAME = 'Portland Reign Facility';
export const PORTLAND_REIGN_VENUE_ADDRESS = '3520 SE Yamhill St, Portland, OR 97214';
export const PORTLAND_REIGN_ORG_DESCRIPTION =
  'Portland Reign Basketball Academy is a year-round Portland youth basketball club offering AAU teams, camps, after-school programs, skills academy sessions, and training.';

const ORGANIZER_NAME = 'Portland Reign Basketball';
const TIME_ZONE = 'America/Los_Angeles';
const AGE_LABEL = 'Grades 2nd-8th';

type CampCandidateInput = {
  campNumber: number;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
};

const campDivisions = () => [
  {
    name: 'Full Day (9 AM-3 PM)',
    key: 'c_youth_grades_2nd_8th_full_day',
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'youth',
    priceCents: 21500,
    maxParticipants: null,
    ageCutoffLabel: AGE_LABEL,
    ageCutoffSource: PORTLAND_REIGN_CAMPS_URL,
  },
  {
    name: 'Half Day (9 AM-Noon)',
    key: 'c_youth_grades_2nd_8th_half_day_morning',
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'youth',
    priceCents: 12500,
    maxParticipants: null,
    ageCutoffLabel: AGE_LABEL,
    ageCutoffSource: PORTLAND_REIGN_CAMPS_URL,
  },
  {
    name: 'Half Day (Noon-3 PM)',
    key: 'c_youth_grades_2nd_8th_half_day_afternoon',
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'youth',
    priceCents: 12500,
    maxParticipants: null,
    ageCutoffLabel: AGE_LABEL,
    ageCutoffSource: PORTLAND_REIGN_CAMPS_URL,
  },
];

const campCandidate = ({ campNumber, startsAt, endsAt, dateDisplayText }: CampCandidateInput) => ({
  listingKind: 'EVENT' as const,
  title: `Portland Reign Summer Camp ${campNumber}`,
  officialActionUrl: PORTLAND_REIGN_CAMPS_URL,
  sourceUrl: PORTLAND_REIGN_CAMPS_URL,
  organizerName: ORGANIZER_NAME,
  sportName: 'Basketball',
  formatLabel: 'Youth basketball camp',
  city: 'Portland, OR',
  venueName: PORTLAND_REIGN_VENUE_NAME,
  address: PORTLAND_REIGN_VENUE_ADDRESS,
  startsAt,
  endsAt,
  timeZone: TIME_ZONE,
  scheduleText: `${dateDisplayText}. Full-day session 9:00 AM-3:00 PM; half-day sessions 9:00 AM-Noon or Noon-3:00 PM.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText,
  skillLevel: null,
  ageGroup: AGE_LABEL,
  divisionText: AGE_LABEL,
  participantOptionsText: 'Individual player registration through the official Portland Reign camp form.',
  priceText: '$125-$215',
  statusText: 'The public camp form lists registration options but does not publish capacity or a registration deadline.',
  description: `Portland Reign lists Summer Camp ${campNumber} for competitive hoopers in ${AGE_LABEL} at ${PORTLAND_REIGN_VENUE_NAME}. The official form lists full-day and half-day registration options.`,
  tags: ['Camp'],
  tagText: 'Camp',
  divisions: campDivisions(),
  warnings: ['The source does not publish a maximum participant count or registration deadline.'],
});

export const PORTLAND_REIGN_WITHHELD_ROWS = [
  {
    title: 'Summer Camp 3',
    reason: 'The June 29-July 3, 2026 camp is past as of the July 15, 2026 source review.',
    sourceUrl: PORTLAND_REIGN_CAMPS_URL,
  },
  {
    title: 'Summer Camp 4',
    reason: 'The July 6-10, 2026 camp is past as of the July 15, 2026 source review.',
    sourceUrl: PORTLAND_REIGN_CAMPS_URL,
  },
  {
    title: 'Summer Camp 5',
    reason: 'The July 13-17, 2026 camp had already started by the July 15, 2026 source review.',
    sourceUrl: PORTLAND_REIGN_CAMPS_URL,
  },
  {
    title: 'Reign Fall 2026 Tryouts',
    reason: 'The official AAU form lists a $15 fee but does not publish a tryout date, time, or location.',
    sourceUrl: PORTLAND_REIGN_AAU_URL,
  },
  {
    title: 'AAU team pages',
    reason: 'The public team pages describe age groups and seasonal programs, but do not provide a stable roster-level registration target.',
    sourceUrl: PORTLAND_REIGN_AAU_URL,
  },
  {
    title: 'Spring 2026 Skills Academy and after-school programs',
    reason: 'The listed program dates run from March through June 2026 and are past as of the source review.',
    sourceUrl: PORTLAND_REIGN_AFTER_SCHOOL_URL,
  },
];

export const PORTLAND_REIGN_MANUAL_CANDIDATES = [
  campCandidate({
    campNumber: 6,
    startsAt: '2026-07-20T09:00:00-07:00',
    endsAt: '2026-07-24T15:00:00-07:00',
    dateDisplayText: 'July 20-24, 2026',
  }),
  campCandidate({
    campNumber: 7,
    startsAt: '2026-07-27T09:00:00-07:00',
    endsAt: '2026-07-31T15:00:00-07:00',
    dateDisplayText: 'July 27-31, 2026',
  }),
  campCandidate({
    campNumber: 8,
    startsAt: '2026-08-03T09:00:00-07:00',
    endsAt: '2026-08-07T15:00:00-07:00',
    dateDisplayText: 'August 3-7, 2026',
  }),
  campCandidate({
    campNumber: 9,
    startsAt: '2026-08-10T09:00:00-07:00',
    endsAt: '2026-08-14T15:00:00-07:00',
    dateDisplayText: 'August 10-14, 2026',
  }),
  campCandidate({
    campNumber: 10,
    startsAt: '2026-08-17T09:00:00-07:00',
    endsAt: '2026-08-21T15:00:00-07:00',
    dateDisplayText: 'August 17-21, 2026',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PORTLAND_REIGN_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: PORTLAND_REIGN_CAMPS_URL,
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
      value: PORTLAND_REIGN_CAMPS_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: PORTLAND_REIGN_MANUAL_CANDIDATES,
};

export const PORTLAND_REIGN_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Portland Reign Basketball manual camp source snapshot.</main></body></html>',
    };
  },
};
