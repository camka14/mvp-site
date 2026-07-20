import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FC_PIAMONTE_HOME_URL = 'https://www.fcpiamonte.org/';
export const FC_PIAMONTE_PROGRAMS_URL =
  'https://www.fcpiamonte.org/Default.aspx?tabid=1069925';
export const FC_PIAMONTE_ROBOTS_URL = 'https://www.fcpiamonte.org/robots.txt';
export const FC_PIAMONTE_LOGO_SOURCE_URL =
  'https://www.fcpiamonte.org/Portals/52932/logo637552295057211448.png';

export const FC_PIAMONTE_ORG_DESCRIPTION =
  'FC Piamonte is a year-round youth soccer club with boys and girls age-group teams. The club practices in Vancouver, Washington and competes in OYSA league play in Vancouver and the Portland metro area.';

export const FC_PIAMONTE_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '3c0e54a9-59e7-41b8-9e65-c17b13b8fcaf',
  intakeSourceKey: 'site-fcpiamonte-org',
  runId: 'b6b48be9-7966-42ae-b8f0-0643390d008a',
  runStatus: 'SUCCEEDED',
  provider: 'FIRECRAWL',
  capturedAt: '2026-07-20T00:12:22.743Z',
  pages: [
    {
      url: FC_PIAMONTE_HOME_URL,
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

export const FC_PIAMONTE_PROGRAM_DIVISIONS = [
  {
    name: 'Boys U6/U7/U8',
    key: 'fc-piamonte-boys-u6-u8',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u8',
    ageDivisionTypeId: 'u8',
    sourceDivisionId: 'boys-u6-u7-u8',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2018 through July 31, 2021',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
  {
    name: 'Girls U6/U7/U8',
    key: 'fc-piamonte-girls-u6-u8',
    gender: 'F' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u8',
    ageDivisionTypeId: 'u8',
    sourceDivisionId: 'girls-u6-u7-u8',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2018 through July 31, 2021',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
  {
    name: 'Boys U9/U10/U11',
    key: 'fc-piamonte-boys-u9-u11',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u11',
    ageDivisionTypeId: 'u11',
    sourceDivisionId: 'boys-u9-u10-u11',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2015 through July 31, 2018',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
  {
    name: 'Boys U12/U13/U14',
    key: 'fc-piamonte-boys-u12-u14',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u14',
    ageDivisionTypeId: 'u14',
    sourceDivisionId: 'boys-u12-u13-u14',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2012 through July 31, 2015',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
  {
    name: 'Boys U15',
    key: 'fc-piamonte-boys-u15',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u15',
    ageDivisionTypeId: 'u15',
    sourceDivisionId: 'boys-u15',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2011 through July 31, 2012',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
  {
    name: 'Boys U16/U17',
    key: 'fc-piamonte-boys-u16-u17',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: 'u17',
    ageDivisionTypeId: 'u17',
    sourceDivisionId: 'boys-u16-u17',
    priceCents: null,
    ageCutoffLabel: 'Born August 1, 2009 through July 31, 2011',
    ageCutoffSource: FC_PIAMONTE_HOME_URL,
  },
];

export const FC_PIAMONTE_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'FC Piamonte',
    officialActionUrl: FC_PIAMONTE_HOME_URL,
    sourceUrl: FC_PIAMONTE_HOME_URL,
    organizerName: 'FC Piamonte',
    sportName: 'Grass Soccer',
    formatLabel: 'Year-round youth soccer club',
    city: 'Vancouver, WA',
    venueName: null,
    address: null,
    tags: ['Club'],
    ageGroup: 'U6-U17',
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Year-round club programs',
    scheduleText:
      'FC Piamonte offers year-round age-group soccer programs and publishes current coach contacts on its official website.',
    participantOptionsText:
      'Published groups: Boys U6/U7/U8, Girls U6/U7/U8, Boys U9/U10/U11, Boys U12/U13/U14, Boys U15, and Boys U16/U17. Use the official site and coach contacts for current placement information.',
    statusText: 'Current 2026-2027 coach and age-group information is published.',
    description: FC_PIAMONTE_ORG_DESCRIPTION,
    warnings: [
      'The captured homepage publishes six age and gender program groups, but no program price or strict skill level; those values remain unspecified.',
      'The Available Programs page was discovered but not captured and remains robots-unchecked, so its registration rows and prices are not mapped in this intake-backed source.',
      'No EVENT candidate is created because the captured public page does not provide a future standalone date, time, venue, and event registration action.',
      'No TEAM candidate is created because the captured public page does not provide a stable roster-level action URL.',
      'No RENTAL candidate is created because the captured public page does not provide a facility rental or booking path.',
      'The source states that the club practices in Vancouver and plays in Vancouver and the Portland metro area, but it does not publish a fixed public facility address.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FC_PIAMONTE_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: FC_PIAMONTE_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'FC Piamonte' },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: FC_PIAMONTE_HOME_URL,
    },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: FC_PIAMONTE_MANUAL_CANDIDATES,
};

// Current stored evidence supports one public club profile, not dated inventory.
export const FC_PIAMONTE_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>FC Piamonte intake-backed source.</main></body></html>',
    };
  },
};
