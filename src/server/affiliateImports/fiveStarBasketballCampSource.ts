import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const FIVE_STAR_BASKETBALL_CAMP_HOME_URL = 'https://www.fivestarbasketball.com/';
export const FIVE_STAR_BASKETBALL_CAMP_NBPA_URL = 'https://nbpa.leagueapps.com/camps/4820588-2026-nbpa-x-five-star-basketball-camp';
export const FIVE_STAR_BASKETBALL_CAMP_AOG_URL = 'https://aoghighacademic.leagueapps.com/camps/4968373-2026-new-york-high-academic-with-slam-magazine-and-five-star';
export const FIVE_STAR_BASKETBALL_CAMP_LOGO_SOURCE_URL = 'https://cdn.prod.website-files.com/5f6d2c69173db49a024d89c6/6008d138221386b30576b29b_5f73df76b0cb15624a70e9b9_5-star-basketball.svg';
export const FIVE_STAR_BASKETBALL_CAMP_ORG_DESCRIPTION =
  'Five-Star offers high intensity camps, clinics, and development leagues for boys and girls. Each Five-Star session features an age-appropriate curriculum, world-class teaching stations, and competitive gameplay designed to foster fundamental skill development and help players maximize their potential.';

export const FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '7a60c22d-04bf-401e-a64f-83aaaa32483c',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-five-star-basketball-camp-fivestarbasketball-com',
  intakeName: 'Five-Star Basketball Camp',
  baseUrl: 'https://www.fivestarbasketball.com',
  complianceStatus: 'ALLOWED',
  runId: 'b3784110-38ee-4089-b543-992e23ad2ab7',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:06:35.265Z',
  pages: [
    { url: FIVE_STAR_BASKETBALL_CAMP_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: 'https://www.fivestarbasketball.com/post/nbpa-x-five-star-basketball-camp-nyc-2023', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.fivestarbasketball.com/share-your-camp-story', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 5 },
    { kind: 'PAGE_BRANDING', count: 1 },
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_IMAGES', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PROVIDER_MAP_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_MAP_RESPONSE_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_REQUEST_JSON', count: 1 },
    { kind: 'PROVIDER_SCRAPE_RESPONSE_JSON', count: 1 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

const DATE_ONLY_WARNING = 'The allowed homepage publishes dates but no event times; startsAt uses local midnight as a date-boundary representation and no start time is inferred.';
const LISTING_WARNING = 'The allowed homepage supplies the current/future date, location, description, and official signup URL; price, capacity, and event times are not captured.';

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'Five-Star Basketball Camp',
  officialActionUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL,
  sourceUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL,
  organizerName: 'Five-Star Basketball Camp',
  sportName: 'Basketball',
  formatLabel: 'Basketball camps, clinics, and development leagues',
  city: 'New York City, NY',
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Basketball camps, clinics, and development leagues',
  scheduleText: 'The stored official homepage describes high intensity camps, clinics, and development leagues for boys and girls, with age-appropriate curriculum, teaching stations, and competitive gameplay.',
  statusText: 'Review-only organization profile; current event rows are listed separately and official detail pages remain unchecked.',
  description: FIVE_STAR_BASKETBALL_CAMP_ORG_DESCRIPTION,
  tags: ['Club', 'Basketball', 'Camps', 'Clinics', 'Youth'],
  logoUrl: FIVE_STAR_BASKETBALL_CAMP_LOGO_SOURCE_URL,
  logoSourceUrl: FIVE_STAR_BASKETBALL_CAMP_LOGO_SOURCE_URL,
  warnings: [
    'The stored homepage identifies New York City programming but does not publish a canonical organization street address, so no address is assigned.',
    'The stored first-party Five-Star Basketball logo candidate was normalized locally to an opaque 1024px square PNG without changing the mark.',
    'The older July 22-25 block and 2024 NBPA signup are not emitted because the block is not paired with a clear year in the allowed evidence.',
    'The linked article and camp-story pages are UNCHECKED; no detail-page facts are inferred and no TEAM candidate is created.',
  ],
};

const eventCandidate = (params: {
  title: string;
  officialActionUrl: string;
  startsAt: string;
  endsAt?: string | null;
  dateDisplayText: string;
  scheduleText: string;
  venueName: string;
  address: string;
  formatLabel: string;
  description: string;
  tags: string[];
}) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL,
  organizerName: 'Five-Star Basketball Camp',
  sportName: 'Basketball',
  formatLabel: params.formatLabel,
  city: params.address.includes('Brooklyn') ? 'Brooklyn, NY' : 'New York City, NY',
  venueName: params.venueName,
  address: params.address,
  startsAt: params.startsAt,
  endsAt: params.endsAt ?? null,
  timeZone: 'America/New_York',
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  statusText: 'Future dated row from the allowed Five-Star homepage; registration is directed to the official outbound signup URL.',
  description: params.description,
  tags: params.tags,
  warnings: [LISTING_WARNING, DATE_ONLY_WARNING, 'The linked official detail/signup page is retained as an outbound action URL but was not captured and remains UNCHECKED.'],
});

export const FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES = [
  eventCandidate({
    title: 'Five-Star Basketball Camp x AOG High Academic Showcase',
    officialActionUrl: FIVE_STAR_BASKETBALL_CAMP_AOG_URL,
    startsAt: '2026-08-18T00:00:00-04:00',
    dateDisplayText: 'August 18-19, 2026',
    scheduleText: 'August 18-19, 2026. The stored homepage lists the High Academic Showcase at Major Owens Center.',
    venueName: 'Major Owens Center',
    address: '1561 Bedford Ave, Brooklyn, NY 11225',
    formatLabel: 'High academic basketball showcase',
    description: 'The High Academic Showcase – New York is designed for student-athletes pursuing top academic basketball programs. The stored homepage says players compete in front of 100+ college coaches and lists Ivy League, Patriot League, NESCAC, Centennial Conference, UAA, Liberty League, and NEWMAC targets.',
    tags: ['Event', 'Basketball', 'Showcase', 'Youth', 'Brooklyn'],
  }),
  eventCandidate({
    title: 'NBPA x Five-Star Summer Basketball Camp',
    officialActionUrl: FIVE_STAR_BASKETBALL_CAMP_NBPA_URL,
    startsAt: '2026-08-24T00:00:00-04:00',
    dateDisplayText: 'August 24-27, 2026',
    scheduleText: 'August 24-27, 2026. The stored homepage lists Basketball City Pier 36, New York City, NY.',
    venueName: 'Basketball City Pier 36',
    address: 'Basketball City Pier 36, New York City, NY',
    formatLabel: 'Summer basketball camp',
    description: 'NBPA x Five-Star Camp provides basketball instruction and training, life-skills and financial-literacy education, mentorship workshops, full-court games, station drills, contests, player evaluation and feedback, lunch, and an on-site medical trainer according to the stored homepage.',
    tags: ['Event', 'Basketball', 'Camp', 'Youth', 'New York City'],
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES = [
  organizationCandidate,
  ...FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES,
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const FIVE_STAR_BASKETBALL_CAMP_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Five-Star Basketball Camp' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: FIVE_STAR_BASKETBALL_CAMP_HOME_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: FIVE_STAR_BASKETBALL_CAMP_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Five-Star Basketball Camp' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Basketball camps, clinics, and development leagues' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Basketball, Camps, Clinics, Youth' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveStarBasketballCamp.html');

export const FIVE_STAR_BASKETBALL_CAMP_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
