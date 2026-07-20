import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PSB_PORTLAND_HOME_URL = 'https://proskillsbasketball.com/';
export const PSB_PORTLAND_TEAMS_URL = 'https://proskillsbasketball.com/portland/teams/';
export const PSB_PORTLAND_LOGO_SOURCE_URL =
  'https://proskillsbasketball.com/wp-content/uploads/2021/10/proskills_logo_web_2x.png';
export const PSB_PORTLAND_VENUE_NAME = 'Lake Oswego High School Field House';
export const PSB_PORTLAND_VENUE_ADDRESS = '2400 Hazel Rd, Lake Oswego, OR 97034';
export const PSB_PORTLAND_ORG_DESCRIPTION =
  'Pro Skills Basketball Portland is a youth basketball club focused on player development, experienced coaching, life skills, team practices and games, camps, clinics, and pathways for players pursuing the next level of their basketball careers.';

const ORGANIZER_NAME = 'Pro Skills Basketball Portland';
const TIME_ZONE = 'America/Los_Angeles';

type TryoutCandidateInput = {
  title: string;
  detailUrl: string;
  gradeLabel: string;
  gender: 'M' | 'F';
  startsAt: string;
  endsAt: string;
  timeLabel: string;
  listPageTimeLabel?: string;
};

const gradeDivision = ({
  gradeLabel,
  gender,
  detailUrl,
}: Pick<TryoutCandidateInput, 'gradeLabel' | 'gender' | 'detailUrl'>) => ({
  name: `${gender === 'M' ? 'Boys' : 'Girls'}, ${gradeLabel}`,
  key: `${gender.toLowerCase()}_age_youth_${gradeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  gender,
  ratingType: 'AGE' as const,
  skillDivisionTypeId: 'open',
  ageDivisionTypeId: 'youth',
  priceCents: 3000,
  maxParticipants: null,
  ageCutoffLabel: gradeLabel,
  ageCutoffSource: detailUrl,
});

const tryoutCandidate = ({
  title,
  detailUrl,
  gradeLabel,
  gender,
  startsAt,
  endsAt,
  timeLabel,
  listPageTimeLabel,
}: TryoutCandidateInput) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl: detailUrl,
  sourceUrl: PSB_PORTLAND_TEAMS_URL,
  organizerName: ORGANIZER_NAME,
  sportName: 'Basketball',
  formatLabel: 'Youth club basketball tryout/evaluation',
  city: 'Lake Oswego, OR',
  venueName: PSB_PORTLAND_VENUE_NAME,
  address: PSB_PORTLAND_VENUE_ADDRESS,
  startsAt,
  endsAt,
  timeZone: TIME_ZONE,
  scheduleText: `Saturday, August 22 and Sunday, August 23, 2026, ${timeLabel} each day.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'August 22-23, 2026',
  skillLevel: null,
  ageGroup: gradeLabel,
  divisionText: `${gender === 'M' ? 'Boys' : 'Girls'}, ${gradeLabel}`,
  participantOptionsText: 'Individual player registration through the official LeagueApps registration page.',
  priceText: '$30',
  statusText: 'The official source displays a public Register link; no registration deadline or capacity is published.',
  description: `Pro Skills Basketball Portland lists ${gender === 'M' ? 'boys' : 'girls'} club team tryouts/evaluations for ${gradeLabel} on August 22-23, 2026 at ${PSB_PORTLAND_VENUE_NAME}. The source lists ${timeLabel} each day and a $30 per-player fee plus transaction fee. The registration page says practices are held throughout the Portland metro area and that not every grade is guaranteed to have a team.`,
  tags: ['Tryouts'],
  tagText: 'Tryouts',
  divisions: [gradeDivision({ gradeLabel, gender, detailUrl })],
  warnings: [
    'The source does not publish a maximum participant count.',
    ...(listPageTimeLabel
      ? [`The list page displayed ${listPageTimeLabel}; the linked detail page displays ${timeLabel}, which is used here.`]
      : []),
  ],
});

export const PSB_PORTLAND_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: ORGANIZER_NAME,
    officialActionUrl: PSB_PORTLAND_TEAMS_URL,
    sourceUrl: PSB_PORTLAND_TEAMS_URL,
    organizerName: ORGANIZER_NAME,
    sportName: 'Basketball',
    formatLabel: 'Youth AAU basketball club',
    city: 'Portland, OR',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club basketball programs by season',
    scheduleText: 'PSB Portland publishes youth club basketball team information, tryouts/evaluations, practices and games, camps, clinics, and membership information.',
    participantOptionsText: 'Use the official PSB Portland website and LeagueApps registration pages for current team, tryout, camp, and clinic opportunities.',
    description: PSB_PORTLAND_ORG_DESCRIPTION,
    warnings: [
      'The public page identifies Portland, OR but does not publish one fixed club facility address; the public organization uses Portland, OR for discovery.',
      'The official Pro Skills Basketball logo is downloaded and normalized by the idempotent source setup script before the organization is upserted.',
      'No separate TEAM candidates are created in this pass.',
    ],
  },
  tryoutCandidate({
    title: '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 2nd- 4th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033390-2026-portland-boys-fall-club-team-tryoutsevaluations--grades-2nd--4th',
    gradeLabel: 'Grades 2nd-4th',
    gender: 'M',
    startsAt: '2026-08-22T09:00:00-07:00',
    endsAt: '2026-08-23T10:15:00-07:00',
    timeLabel: '9:00 AM-10:15 AM',
  }),
  tryoutCandidate({
    title: '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 5th- 6th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033400-2026-portland-boys-fall-club-team-tryoutsevaluations--grades-5th--6th',
    gradeLabel: 'Grades 5th-6th',
    gender: 'M',
    startsAt: '2026-08-22T09:00:00-07:00',
    endsAt: '2026-08-23T10:15:00-07:00',
    timeLabel: '9:00 AM-10:15 AM',
  }),
  tryoutCandidate({
    title: '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 7th- 8th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033403-2026-portland-boys-fall-club-team-tryoutsevaluations--grades-7th--8th',
    gradeLabel: 'Grades 7th-8th',
    gender: 'M',
    startsAt: '2026-08-22T10:30:00-07:00',
    endsAt: '2026-08-23T11:45:00-07:00',
    timeLabel: '10:30 AM-11:45 AM',
    listPageTimeLabel: '10:30 AM-11:45 PM',
  }),
  tryoutCandidate({
    title: '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 9th- 11th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033407-2026-portland-boys-fall-club-team-tryoutsevaluations--grades-9th--11th',
    gradeLabel: 'Grades 9th-11th',
    gender: 'M',
    startsAt: '2026-08-22T12:00:00-07:00',
    endsAt: '2026-08-23T13:30:00-07:00',
    timeLabel: '12:00 PM-1:30 PM',
  }),
  tryoutCandidate({
    title: '2026 Portland Girls Fall Club Team Tryouts/Evaluations- Grades 5th- 8th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033419-2026-portland-girls-fall-club-team-tryoutsevaluations--grades-5th--8th',
    gradeLabel: 'Grades 5th-8th',
    gender: 'F',
    startsAt: '2026-08-22T13:45:00-07:00',
    endsAt: '2026-08-23T15:00:00-07:00',
    timeLabel: '1:45 PM-3:00 PM',
  }),
  tryoutCandidate({
    title: '2026 Portland Girls Fall Club Team Tryouts/Evaluations- Grades 9th- 11th',
    detailUrl: 'https://proskillsportland.leagueapps.com/events/5033429-2026-portland-girls-fall-club-team-tryoutsevaluations--grades-9th--11th',
    gradeLabel: 'Grades 9th-11th',
    gender: 'F',
    startsAt: '2026-08-22T13:45:00-07:00',
    endsAt: '2026-08-23T15:00:00-07:00',
    timeLabel: '1:45 PM-3:00 PM',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PSB_PORTLAND_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: PSB_PORTLAND_TEAMS_URL,
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
      value: PSB_PORTLAND_TEAMS_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: PSB_PORTLAND_MANUAL_CANDIDATES,
};

export const PSB_PORTLAND_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Pro Skills Basketball Portland Teams manual source snapshot.</main></body></html>',
    };
  },
};
