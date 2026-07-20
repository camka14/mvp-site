import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const PDX_VB_BASE_URL = 'https://pdx-vb.com/';
export const PDX_VB_CLINICS_URL = 'https://pdx-vb.com/elementor-4180/';
export const PDX_VB_CLINICS_REGISTRATION_URL = 'https://pci.jotform.com/PDXVB/2026-pdxvb-summer-skills-clinics';
export const PDX_VB_CAMP_URL = 'https://pdx-vb.com/portland-parks-recreation-summer-sessions/';
export const PDX_VB_CAMP_REGISTRATION_URL = 'https://form.jotform.com/PDXVB/ppr-volleyball-camps';
export const PDX_VB_CALENDAR_URL = 'https://pdx-vb.com/pdxvb-calendar/';
export const PDX_VB_COACHING_URL = 'https://pdx-vb.com/coaching-opportunities/';
export const PDX_VB_PARKS_VOLLEYBALL_URL = 'https://www.portland.gov/parks/sports/volleyball';
export const PDX_VB_CAMP_VENUE = 'Wilshire Park';
export const PDX_VB_CAMP_ADDRESS = '4116 NE 33rd Ave, Portland, OR 97212';
export const PDX_VB_ORG_DESCRIPTION =
  'PDX Volleyball Club is a Portland youth volleyball club focused on helping athletes learn, compete, and grow through coaching, seasonal club volleyball, skills clinics, camps, and community opportunities.';

const ageDivision = (name: string, key: string, ageCutoffSource: string) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: key,
  priceCents: 9000,
  maxParticipants: null,
  ageCutoffLabel: name,
  ageCutoffSource,
});

const clubCandidate = {
  listingKind: 'CLUB' as const,
  title: 'PDX Volleyball Club',
  officialActionUrl: PDX_VB_BASE_URL,
  sourceUrl: PDX_VB_BASE_URL,
  organizerName: 'PDX Volleyball Club',
  sportName: 'Indoor Volleyball',
  formatLabel: 'Youth volleyball club',
  city: 'Portland, OR',
  tags: ['Club'],
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Club volleyball programs by season',
  scheduleText: 'PDX VB publishes club volleyball information, skills clinics, summer camps, coaching opportunities, resources, and a calendar on its official website.',
  participantOptionsText: 'Use the official PDX VB website for current club, camp, clinic, and registration information.',
  description: PDX_VB_ORG_DESCRIPTION,
  warnings: [
    'No fixed club facility address is published on the public PDX VB pages; the organization uses Portland, OR for discovery.',
    'No current future tryout dates were published during the 2026-07-15 review.',
    'The public calendar is an embedded Google Calendar and did not expose parseable event rows in the page HTML.',
    'June 2026 skills clinic rows were past as of 2026-07-15 and were not imported as scheduled events.',
  ],
};

const campDescription = (gradeLabel: string, timeLabel: string) => (
  `PDXVB partners with T.E.A.M. Hiki No and Portland Parks & Recreation to offer an outdoor grass volleyball summer camp for players in ${gradeLabel} and all levels of play. The camp runs July 28-30, 2026 at Wilshire Park from ${timeLabel}. Registration is $90 through the official PDX VB form.`
);

const campCandidate = ({
  title,
  gradeLabel,
  timeLabel,
  startsAt,
  endsAt,
  divisionKey,
}: {
  title: string;
  gradeLabel: string;
  timeLabel: string;
  startsAt: string;
  endsAt: string;
  divisionKey: string;
}) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl: PDX_VB_CAMP_REGISTRATION_URL,
  sourceUrl: PDX_VB_CAMP_URL,
  organizerName: 'PDX Volleyball Club',
  sportName: 'Grass Volleyball',
  formatLabel: 'Youth grass volleyball camp',
  city: 'Portland, OR',
  venueName: PDX_VB_CAMP_VENUE,
  address: PDX_VB_CAMP_ADDRESS,
  startsAt,
  endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `July 28-30, 2026, ${timeLabel}. Tuesday, Wednesday, and Thursday at ${PDX_VB_CAMP_VENUE}.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'July 28-30, 2026',
  ageGroup: gradeLabel,
  divisionText: gradeLabel,
  participantOptionsText: `Players entering ${gradeLabel} are eligible. All levels of play are welcome.`,
  priceText: '$90',
  statusText: 'The official PDX VB registration form is public and lists a $90 camp registration price.',
  description: campDescription(gradeLabel, timeLabel),
  tags: ['Camp'],
  tagText: 'Camp',
  divisions: [ageDivision(gradeLabel, divisionKey, 'PDX VB 2026 PPR Summer Camp registration page.')],
  warnings: [
    'The source does not publish a maximum participant count for this camp session.',
  ],
});

export const PDX_VB_MANUAL_CANDIDATES = [
  clubCandidate,
  campCandidate({
    title: 'PDX VB Portland Parks Grass Camp: Grades 3-6',
    gradeLabel: 'Grades 3-6',
    timeLabel: '6:00 PM-7:10 PM',
    startsAt: '2026-07-28T18:00:00-07:00',
    endsAt: '2026-07-30T19:10:00-07:00',
    divisionKey: 'grades_3_6',
  }),
  campCandidate({
    title: 'PDX VB Portland Parks Grass Camp: Grades 7-12',
    gradeLabel: 'Grades 7-12',
    timeLabel: '7:20 PM-8:35 PM',
    startsAt: '2026-07-28T19:20:00-07:00',
    endsAt: '2026-07-30T20:35:00-07:00',
    divisionKey: 'grades_7_12',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const PDX_VB_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: PDX_VB_BASE_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'PDX Volleyball Club',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: PDX_VB_BASE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: PDX_VB_MANUAL_CANDIDATES,
};

export const PDX_VB_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>PDX Volleyball Club manual source snapshot.</main></body></html>',
    };
  },
};
