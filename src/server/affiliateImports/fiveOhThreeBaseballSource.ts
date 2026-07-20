import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FIVE_OH_THREE_BASEBALL_HOME_URL = 'https://503baseball.com/';
export const FIVE_OH_THREE_BASEBALL_TRYOUTS_URL = 'https://503baseball.com/camps-clinics/team-tryouts/';
export const FIVE_OH_THREE_BASEBALL_ROBOTS_URL = 'https://503baseball.com/robots.txt';
export const FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL =
  'https://503baseball.com/wp-content/uploads/2024/04/503-logo-RWB-Transparent.png';
export const FIVE_OH_THREE_BASEBALL_TRYOUT_ADDRESS = '5464 W A St, West Linn, OR 97068';
export const FIVE_OH_THREE_BASEBALL_ORG_DESCRIPTION =
  '503 Baseball is a West Linn-area youth baseball training and travel-team program. Its public site provides player-development instruction, camps, clinics, fall baseball, travel-team information, and official tryout registration.';

const ORGANIZER_NAME = '503 Baseball';

const tryoutCandidate = ({
  ageLabel,
  startsAt,
  endsAt,
  officialActionUrl,
}: {
  ageLabel: '12U' | '13U' | '14U';
  startsAt: string;
  endsAt: string;
  officialActionUrl: string;
}) => ({
  listingKind: 'EVENT' as const,
  title: `503 Baseball ${ageLabel} Travel Team Tryout`,
  officialActionUrl,
  sourceUrl: FIVE_OH_THREE_BASEBALL_TRYOUTS_URL,
  organizerName: ORGANIZER_NAME,
  sportName: 'Baseball',
  formatLabel: 'Youth travel-team tryout',
  city: 'West Linn, OR',
  venueName: 'West Linn High School',
  address: FIVE_OH_THREE_BASEBALL_TRYOUT_ADDRESS,
  startsAt,
  endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `Tuesday, August 4, 2026, ${ageLabel === '12U' ? '12:00 PM-1:30 PM' : '10:00 AM-12:00 PM'}.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'August 4, 2026',
  skillLevel: null,
  ageGroup: ageLabel,
  divisionText: ageLabel,
  participantOptionsText: 'Individual player registration through the official 503 Baseball Upper Hand page.',
  priceText: '$20',
  statusText: 'The official tryout page publishes an active registration link. No capacity or deadline is stated.',
  description:
    `503 Baseball is holding a ${ageLabel} youth travel-team tryout at West Linn High School. `
    + 'The official source lists player-development coaching and asks families to register for the age group for which their player is eligible.',
  tags: ['Tryouts'],
  tagText: 'Tryouts',
  divisions: [{
    name: ageLabel,
    key: `age_${ageLabel.toLowerCase()}`,
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    skillDivisionTypeId: 'open',
    ageDivisionTypeId: 'youth',
    priceCents: 2000,
    maxParticipants: null,
    ageCutoffLabel: ageLabel,
    ageCutoffSource: FIVE_OH_THREE_BASEBALL_TRYOUTS_URL,
  }],
  warnings: [
    'The public source does not state a maximum participant count or registration deadline.',
    'The public page heading and action URLs refer to 2027 tryouts while its body describes 2026 travel teams. The source-stated August 4, 2026 date and official age-specific registration URL are used.',
  ],
});

export const FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: FIVE_OH_THREE_BASEBALL_HOME_URL,
    sourceUrl: FIVE_OH_THREE_BASEBALL_HOME_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Baseball',
    formatLabel: 'Youth baseball training and travel-team program',
    city: 'West Linn, OR',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Baseball programs by season',
    scheduleText: '503 Baseball publishes youth training, camps, clinics, travel-team information, fall baseball, and official tryout registration.',
    participantOptionsText: 'Use the official 503 Baseball website for current training, camp, clinic, and travel-team information.',
    description: FIVE_OH_THREE_BASEBALL_ORG_DESCRIPTION,
    warnings: [
      'The public source does not identify one fixed organization headquarters address, so the club is listed by its reviewed West Linn program area.',
      'The official transparent 503 Baseball header logo is downloaded and normalized by the idempotent setup before the public organization is upserted.',
      'No TEAM candidates are created because the source does not publish stable roster-level team registration targets.',
    ],
  },
  tryoutCandidate({
    ageLabel: '12U',
    startsAt: '2026-08-04T12:00:00-07:00',
    endsAt: '2026-08-04T13:30:00-07:00',
    officialActionUrl: 'https://app.upperhand.io/customers/1251-503-baseball/events/200260-2027-12u-tryouts',
  }),
  tryoutCandidate({
    ageLabel: '13U',
    startsAt: '2026-08-04T10:00:00-07:00',
    endsAt: '2026-08-04T12:00:00-07:00',
    officialActionUrl: 'https://app.upperhand.io/customers/1251-503-baseball/events/200252-2027-13u-tryouts',
  }),
  tryoutCandidate({
    ageLabel: '14U',
    startsAt: '2026-08-04T10:00:00-07:00',
    endsAt: '2026-08-04T12:00:00-07:00',
    officialActionUrl: 'https://app.upperhand.io/customers/1251-503-baseball/events/200253-2027-14u-tryouts',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FIVE_OH_THREE_BASEBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FIVE_OH_THREE_BASEBALL_TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: ORGANIZER_NAME },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FIVE_OH_THREE_BASEBALL_HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES,
};

// The public WordPress page is reviewed as a source-controlled summary. The
// mapping stores only the verified current club and age-specific tryout rows.
export const FIVE_OH_THREE_BASEBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>503 Baseball reviewed public tryout source.</main></body></html>',
    };
  },
};
