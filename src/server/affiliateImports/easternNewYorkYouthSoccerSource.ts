import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ENY_ODP_TRYOUTS_URL = 'https://www.enysoccer.com/odp/tryouts';
export const ENY_ODP_HOME_URL = 'https://www.enysoccer.com/';
export const ENY_ODP_REGISTRATION_URL = 'https://system.gotsport.com/programs/8762525Z7?reg_role=player';
export const ENY_ODP_LOGO_SOURCE_URL = 'https://www.enysoccer.com/wp-content/uploads/sites/223/2023/10/enyysa_rgb_logo.png';
export const ENY_ODP_ORG_DESCRIPTION =
  'Eastern New York Youth Soccer Association ODP provides youth soccer Olympic Development Program tryouts, evaluation, and player-development pathways for age groups including 2010 through 2015.';

export const ENY_ODP_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '17cbcda0-9c14-432e-9db4-900dd0b58e01',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-tryouts-enysoccer-com',
  intakeName: 'Tryouts',
  baseUrl: ENY_ODP_HOME_URL,
  complianceStatus: 'ALLOWED',
  runId: 'e70f566f-9d10-43ed-9dba-4e4001a56ed3',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:10:23.211Z',
  pages: [
    { url: ENY_ODP_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'ALLOWED' },
    { url: 'https://www.enysoccer.com/odp/tryout-results/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: ENY_ODP_REGISTRATION_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.enysoccer.com/why-join-odp/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

export const ENY_ODP_OFFICIAL_URLS = [
  ENY_ODP_HOME_URL,
  ENY_ODP_TRYOUTS_URL,
  ENY_ODP_REGISTRATION_URL,
  'https://www.enysoccer.com/odp/tryout-results/',
  'https://www.enysoccer.com/why-join-odp/',
] as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Eastern New York Youth Soccer Association ODP',
  officialActionUrl: ENY_ODP_TRYOUTS_URL,
  sourceUrl: ENY_ODP_TRYOUTS_URL,
  organizerName: 'Eastern New York Youth Soccer Association',
  sportName: 'Soccer',
  formatLabel: 'Youth soccer ODP tryouts, evaluation, and player development',
  city: 'Eastern New York',
  venueName: null,
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: '2026 Eastern New York ODP tryout program',
  scheduleText: 'The stored tryout page describes ODP tryouts for 2015, 2014, and 2013 age groups, additional future rounds, a $50 registration fee, GotSport registration, evaluation criteria, and advancement to later rounds. Age groups 2012, 2011, and 2010 are listed as to be announced.',
  statusText: 'Review-only ODP club/program profile; current tryout results, future-round dates, and program details require the official linked pages.',
  description: ENY_ODP_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Youth', 'ODP', 'Eastern New York'],
  logoUrl: ENY_ODP_LOGO_SOURCE_URL,
  logoSourceUrl: ENY_ODP_LOGO_SOURCE_URL,
  warnings: [
    'The stored ALLOWED tryout page supports an ongoing Eastern New York ODP program profile and publishes specific future 2026 tryout rows below.',
    'Tryout results, future-round dates, and the linked program pages are UNCHECKED; no TEAM candidate is inferred.',
    'The stored first-party Eastern New York Youth Soccer logo was normalized to an opaque 1024px square PNG.',
  ],
};

const tryoutCandidate = (params: {
  title: string;
  officialActionUrl?: string;
  startsAt: string;
  dateDisplayText: string;
  venueName: string;
  city: string;
  scheduleText: string;
  divisionText: string;
  tags: string[];
}) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl ?? ENY_ODP_REGISTRATION_URL,
  sourceUrl: ENY_ODP_TRYOUTS_URL,
  organizerName: 'Eastern New York Youth Soccer Association ODP',
  sportName: 'Soccer',
  formatLabel: 'ODP soccer tryout',
  city: params.city,
  venueName: params.venueName,
  address: null,
  startsAt: params.startsAt,
  timeZone: 'America/New_York',
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  divisionText: params.divisionText,
  priceText: '$50 registration fee',
  statusText: 'Future dated row from the stored ALLOWED ENY ODP tryout page; registration is directed to the official GotSport URL.',
  description: 'Eastern New York ODP 2026 soccer tryout for the listed boys and girls age groups.',
  tags: params.tags,
  logoUrl: ENY_ODP_LOGO_SOURCE_URL,
  logoSourceUrl: ENY_ODP_LOGO_SOURCE_URL,
  warnings: [
    'The stored page publishes the date, time, location, and $50 fee but does not publish a street address for this venue; address remains unset.',
    'The official GotSport registration URL is retained as an outbound action URL; no live availability or registration state is inferred.',
  ],
});

export const ENY_ODP_MANUAL_CANDIDATES = [
  organizationCandidate,
  tryoutCandidate({
    title: 'Eastern New York ODP North Round One Tryout — Capelli Sports Complex',
    startsAt: '2026-08-12T18:00:00-04:00',
    dateDisplayText: 'August 12, 2026',
    venueName: 'Capelli Sports Complex',
    city: 'Chester, NY',
    scheduleText: 'Wednesday, August 12, 2026, 6:00 PM-7:30 PM. Boys and girls for the 2015, 2014, and 2013 age groups.',
    divisionText: '2015, 2014, and 2013; boys and girls',
    tags: ['Event', 'Soccer', 'ODP', 'Tryout', 'Chester'],
  }),
  tryoutCandidate({
    title: 'Eastern New York ODP North Round One Tryout — Saxon Wood Fields',
    startsAt: '2026-08-13T18:00:00-04:00',
    dateDisplayText: 'August 13, 2026',
    venueName: 'Saxon Wood Fields',
    city: 'White Plains, NY',
    scheduleText: 'Thursday, August 13, 2026, 6:00 PM-7:30 PM. Boys and girls for the 2015, 2014, and 2013 age groups.',
    divisionText: '2015, 2014, and 2013; boys and girls',
    tags: ['Event', 'Soccer', 'ODP', 'Tryout', 'White Plains'],
  }),
  tryoutCandidate({
    title: 'Eastern New York ODP North Round One Tryout — Accelerate Sports Complex',
    startsAt: '2026-08-23T09:00:00-04:00',
    dateDisplayText: 'August 23, 2026',
    venueName: 'Accelerate Sports Complex',
    city: 'Whitestown, NY',
    scheduleText: 'Sunday, August 23, 2026. Boys 9:00 AM-10:30 PM and girls 10:30 AM-12:00 PM as written in the stored page.',
    divisionText: '2015, 2014, and 2013; boys and girls',
    tags: ['Event', 'Soccer', 'ODP', 'Tryout', 'Whitestown'],
  }),
  tryoutCandidate({
    title: 'Eastern New York ODP North Round One Tryout — Wright National Soccer Campus',
    startsAt: '2026-08-23T16:00:00-04:00',
    dateDisplayText: 'August 23, 2026',
    venueName: 'Wright National Soccer Campus',
    city: 'Oneonta, NY',
    scheduleText: 'Sunday, August 23, 2026. Boys 4:00 PM-5:30 PM and girls 5:30 PM-7:00 PM.',
    divisionText: '2015, 2014, and 2013; boys and girls',
    tags: ['Event', 'Soccer', 'ODP', 'Tryout', 'Oneonta'],
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ENY_ODP_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: ENY_ODP_TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Eastern New York ODP Tryouts - 2026' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ENY_ODP_TRYOUTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ENY_ODP_TRYOUTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Eastern New York Youth Soccer Association ODP' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Soccer, ODP, Tryout' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: ENY_ODP_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/easternNewYorkYouthSoccer.html');

export const ENY_ODP_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: ENY_ODP_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
