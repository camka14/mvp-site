import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const DISCNY_HOME_URL = 'https://discny.org/';
export const DISCNY_EVENTS_URL = 'https://discny.org/e';
export const DISCNY_MANHATTAN_BEGINNER_URL = 'https://discny.org/e/manhattan-beginner-ultimate-frisbee-pickup-gansevoort';
export const DISCNY_LOGO_CANDIDATE_ARTIFACT = 'output/affiliate-intakes/new-york-new-york-metropolitan-area-all-events-discny-org/d110bf4a-0b10-427b-b93c-167fcd35aa86/003-logo_candidate-5039f0d7-eceb-4368-8900-e6cf8d3f5242.png';
export const DISCNY_ORG_DESCRIPTION = 'DiscNY organizes adult and youth ultimate programming in the New York area. The stored official events listing shows current and upcoming programming that is open for registration or opening soon.';

export const DISCNY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'a77c7e76-eed4-4050-adbb-83cb5a465f06',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-all-events-discny-org',
  intakeName: 'New York All Events',
  baseUrl: 'https://discny.org',
  complianceStatus: 'ALLOWED',
  runId: 'd110bf4a-0b10-427b-b93c-167fcd35aa86',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:31:50.221Z',
  pages: [
    { url: DISCNY_EVENTS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: DISCNY_MANHATTAN_BEGINNER_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://discny.org/e/2026-rockland-ultimate-sunday-pickup', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/2026-nyc-club-season-player-registration', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/east-fishkill-summer-league-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://liultimate.com/e/summer-beach-league-2026-jones-beach', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://liultimate.com/e/adult-mixed-summer-league-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/mccarren-mondays-summer-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/astoria-park-ultimate-summer-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/brooklyn-summer-casual-mixed-league-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/survival-summer-league-2026-for-she-they-we', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/masters-ultimate-summer-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://discny.org/e/hmdultimate-saturday-lgbtq-pickup-summer-2026', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
    { kind: 'PAGE_BRANDING', count: 2 },
    { kind: 'PAGE_HTML', count: 2 },
    { kind: 'PAGE_IMAGES', count: 2 },
    { kind: 'PAGE_LINKS', count: 2 },
    { kind: 'PAGE_MARKDOWN', count: 2 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 2 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 2 },
    { kind: 'ROBOTS', count: 2 },
  ],
} as const;

const LISTING_WARNING = 'The stored DiscNY listing supplies the title, date range, and official action path, but not a fixed session time or public price for this row.';

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'DiscNY',
  officialActionUrl: DISCNY_EVENTS_URL,
  sourceUrl: DISCNY_EVENTS_URL,
  organizerName: 'DiscNY',
  sportName: 'Ultimate Frisbee',
  formatLabel: 'Ultimate Frisbee events, leagues, and pickup programming',
  city: 'New York, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Current and upcoming DiscNY ultimate programming',
  scheduleText: 'The stored official DiscNY All Events page describes current listings open for registration or opening soon, including adult and youth programming.',
  statusText: 'Review-only club profile; event rows are listed separately.',
  description: DISCNY_ORG_DESCRIPTION,
  tags: ['Club', 'Ultimate Frisbee', 'New York'],
  warnings: [
    'The stored branding artifacts contain no page-branding logo URL; the first-party DiscNY logo candidate was normalized locally from the captured LOGO_CANDIDATE artifact.',
    'The listing reports 14 events but only 12 rows are visible in the captured page; two page-2 rows are withheld rather than inferred.',
  ],
};

type EventCandidateInput = {
  title: string;
  officialActionUrl: string;
  city: string | null;
  dateDisplayText: string;
  formatLabel: string;
  tags: string[];
  description: string;
  venueName?: string | null;
  scheduleText?: string | null;
  priceText?: string | null;
  registrationDeadlineText?: string | null;
};

const eventCandidate = (params: EventCandidateInput) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: DISCNY_EVENTS_URL,
  organizerName: 'DiscNY',
  sportName: 'Ultimate Frisbee',
  formatLabel: params.formatLabel,
  city: params.city,
  venueName: params.venueName ?? null,
  address: null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'NO_FIXED_DATE' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText ?? params.dateDisplayText,
  priceText: params.priceText ?? null,
  registrationDeadlineText: params.registrationDeadlineText ?? null,
  statusText: 'The stored DiscNY listing includes this row in its current future-events view.',
  description: params.description,
  tags: params.tags,
  warnings: [LISTING_WARNING],
});

export const DISCNY_EVENT_CANDIDATES = [
  eventCandidate({
    title: '2026 Rockland Ultimate - Sunday Pickup',
    officialActionUrl: 'https://discny.org/e/2026-rockland-ultimate-sunday-pickup',
    city: 'Nyack, NY',
    dateDisplayText: 'February 22, 2026 – December 27, 2026',
    formatLabel: 'Sunday ultimate pickup',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup'],
    description: '2026 Rockland Ultimate - Sunday Pickup is listed by DiscNY as a Sunday ultimate pickup program in Nyack, NY running February 22 through December 27, 2026.',
  }),
  eventCandidate({
    title: '2026 NYC Club Season - Player Registration',
    officialActionUrl: 'https://discny.org/e/2026-nyc-club-season-player-registration',
    city: 'New York, NY',
    dateDisplayText: 'April 4, 2026 – October 24, 2026',
    formatLabel: 'Ultimate Frisbee club-season player registration',
    tags: ['Event', 'Ultimate Frisbee', 'Club Season', 'Registration'],
    description: '2026 NYC Club Season - Player Registration is listed by DiscNY as a New York ultimate club-season player registration program running April 4 through October 24, 2026.',
  }),
  eventCandidate({
    title: 'East Fishkill Summer League 2026',
    officialActionUrl: 'https://discny.org/e/east-fishkill-summer-league-2026',
    city: 'East Fishkill, NY',
    dateDisplayText: 'May 11, 2026 – August 13, 2026',
    formatLabel: 'Summer ultimate league',
    tags: ['Event', 'Ultimate Frisbee', 'League', 'Summer'],
    description: 'East Fishkill Summer League 2026 is listed by DiscNY as a summer ultimate league in East Fishkill, NY running May 11 through August 13, 2026.',
  }),
  eventCandidate({
    title: 'Summer Beach League 2026 (Jones Beach)',
    officialActionUrl: 'https://liultimate.com/e/summer-beach-league-2026-jones-beach',
    city: 'Wantagh, NY',
    dateDisplayText: 'June 2, 2026 – August 25, 2026',
    formatLabel: 'Summer beach ultimate league',
    tags: ['Event', 'Ultimate Frisbee', 'Beach', 'League', 'Summer'],
    description: 'Summer Beach League 2026 (Jones Beach) is listed by DiscNY as a beach ultimate league at Jones Beach in Wantagh, NY running June 2 through August 25, 2026.',
  }),
  eventCandidate({
    title: 'Adult Mixed Summer League 2026',
    officialActionUrl: 'https://liultimate.com/e/adult-mixed-summer-league-2026',
    city: null,
    dateDisplayText: 'June 4, 2026 – August 20, 2026',
    formatLabel: 'Adult mixed summer ultimate league',
    tags: ['Event', 'Ultimate Frisbee', 'Adult', 'Mixed', 'League', 'Summer'],
    description: 'Adult Mixed Summer League 2026 is listed by DiscNY as an adult mixed summer ultimate league running June 4 through August 20, 2026. The captured listing does not display a city.',
  }),
  eventCandidate({
    title: 'McCarren Mondays Summer 2026',
    officialActionUrl: 'https://discny.org/e/mccarren-mondays-summer-2026',
    city: 'Williamsburg, NY',
    dateDisplayText: 'June 8, 2026 – August 31, 2026',
    formatLabel: 'Monday summer ultimate pickup',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup', 'Summer'],
    description: 'McCarren Mondays Summer 2026 is listed by DiscNY as a Monday ultimate pickup program in Williamsburg, NY running June 8 through August 31, 2026.',
  }),
  eventCandidate({
    title: 'Astoria Park Ultimate - Summer 2026',
    officialActionUrl: 'https://discny.org/e/astoria-park-ultimate-summer-2026',
    city: 'Ditmars Steinway, NY',
    dateDisplayText: 'June 9, 2026 – August 25, 2026',
    formatLabel: 'Summer ultimate pickup',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup', 'Summer'],
    description: 'Astoria Park Ultimate - Summer 2026 is listed by DiscNY as a summer ultimate program in Ditmars Steinway, NY running June 9 through August 25, 2026.',
  }),
  eventCandidate({
    title: 'Brooklyn Summer Casual Mixed League 2026',
    officialActionUrl: 'https://discny.org/e/brooklyn-summer-casual-mixed-league-2026',
    city: 'New York, NY',
    dateDisplayText: 'June 12, 2026 – August 28, 2026',
    formatLabel: 'Casual mixed summer ultimate league',
    tags: ['Event', 'Ultimate Frisbee', 'Casual', 'Mixed', 'League', 'Summer'],
    description: 'Brooklyn Summer Casual Mixed League 2026 is listed by DiscNY as a casual mixed summer ultimate league in New York, NY running June 12 through August 28, 2026.',
  }),
  eventCandidate({
    title: 'Survival Summer Pickup 2026 (For She-They-We*)',
    officialActionUrl: 'https://discny.org/e/survival-summer-league-2026-for-she-they-we',
    city: 'New York, NY',
    dateDisplayText: 'June 18, 2026 – August 27, 2026',
    formatLabel: 'Summer ultimate pickup',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup', 'Summer'],
    description: 'Survival Summer Pickup 2026 (For She-They-We*) is listed by DiscNY as a summer ultimate pickup program in New York, NY running June 18 through August 27, 2026.',
  }),
  eventCandidate({
    title: 'Manhattan Beginner Ultimate Frisbee Pickup (Gansevoort) - Summer 2026',
    officialActionUrl: DISCNY_MANHATTAN_BEGINNER_URL,
    city: 'New York, NY',
    venueName: 'Gansevoort Field',
    dateDisplayText: 'June 19, 2026 – August 28, 2026',
    formatLabel: 'Adult beginner ultimate Frisbee pickup',
    scheduleText: 'Fridays, June 19 through August 28, 2026, 7:00–8:30 PM; no pickup July 3. Arrive by 6:30 PM for check-in.',
    priceText: 'Pay What You Can; full-block tiers listed as $160, $120, and $80; single week $15; free trial week free.',
    registrationDeadlineText: 'Friday, August 28, 2026',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup', 'Beginner', 'Adult'],
    description: 'Manhattan Beginner Ultimate Frisbee Pickup (Gansevoort) - Summer 2026 is an Adult Learning League at Gansevoort Field in New York, NY. The stored detail page describes a 10-week block, week-to-week drop-ins, Pay-What-You-Can pricing, and lighted turf at Gansevoort Peninsula Fields.',
  }),
  eventCandidate({
    title: 'Masters Ultimate - Summer 2026',
    officialActionUrl: 'https://discny.org/e/masters-ultimate-summer-2026',
    city: 'New York, NY',
    dateDisplayText: 'June 19, 2026 – August 28, 2026',
    formatLabel: 'Summer masters ultimate program',
    tags: ['Event', 'Ultimate Frisbee', 'Masters', 'Summer'],
    description: 'Masters Ultimate - Summer 2026 is listed by DiscNY as a summer masters ultimate program in New York, NY running June 19 through August 28, 2026.',
  }),
  eventCandidate({
    title: 'HMDUltimate - Saturday LGBTQ+ Pickup (Summer 2026)',
    officialActionUrl: 'https://discny.org/e/hmdultimate-saturday-lgbtq-pickup-summer-2026',
    city: 'New York, NY',
    dateDisplayText: 'July 4, 2026 – August 29, 2026',
    formatLabel: 'Saturday LGBTQ+ summer ultimate pickup',
    tags: ['Event', 'Ultimate Frisbee', 'Pickup', 'LGBTQ+', 'Summer'],
    description: 'HMDUltimate - Saturday LGBTQ+ Pickup (Summer 2026) is listed by DiscNY as a Saturday LGBTQ+ ultimate pickup program in New York, NY running July 4 through August 29, 2026.',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const DISCNY_MANUAL_CANDIDATES = [organizationCandidate, ...DISCNY_EVENT_CANDIDATES] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const DISCNY_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: DISCNY_EVENTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'DiscNY' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: DISCNY_EVENTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: DISCNY_EVENTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'DiscNY' },
    sportName: { selector: 'body', mode: 'literal', value: 'Ultimate Frisbee' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Ultimate Frisbee events, leagues, and pickup programming' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'NO_FIXED_DATE' },
    tagText: { selector: 'body', mode: 'literal', value: 'Ultimate Frisbee, New York' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: DISCNY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/discnyAllEvents.html');

export const DISCNY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: DISCNY_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
