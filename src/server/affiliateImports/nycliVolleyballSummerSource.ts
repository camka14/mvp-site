import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NYCLI_VOLLEYBALL_SUMMER_URL = 'https://www.nyclivolleyball.org/page/show/9422210-summer-2026';
export const NYCLI_VOLLEYBALL_TRYOUTS_URL = 'https://www.nyclivolleyball.org/page/show/9405962-tryouts-2026-27';
export const NYCLI_VOLLEYBALL_REGISTER_URL = 'https://nyclivolleyball.sportngin.com/register/form/727293687';
export const NYCLI_VOLLEYBALL_GRASS_REGISTER_URL = 'https://forms.gle/XTmGVgNb3zj3XaBf8';
export const NYCLI_VOLLEYBALL_LOGO_SOURCE_URL = 'https://cdn2.sportngin.com/attachments/logo_graphic/e341-216253038/NYCLI_New_logo_medium.png';
export const NYCLI_VOLLEYBALL_ORG_DESCRIPTION =
  'NYCLI Volleyball Club offers youth volleyball summer academies for female athletes, position-focused player development, and a summer grass series for junior girls and boys doubles tournaments.';
export const NYCLI_VOLLEYBALL_VENUE = "St. John's Preparatory";
export const NYCLI_VOLLEYBALL_ADDRESS = '21-21 Crescent St, Astoria, NY 11105';

export const NYCLI_VOLLEYBALL_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '991b0f36-5367-4c66-b983-64d86437af6e',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-summer-2026-nyclivolleyball-org',
  intakeName: 'Summer 2026',
  baseUrl: 'https://www.nyclivolleyball.org',
  complianceStatus: 'ALLOWED',
  runId: '3cd10ef2-127a-44a8-be4b-8735ce7183d1',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T20:07:27.966Z',
  pages: [
    { url: NYCLI_VOLLEYBALL_SUMMER_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: NYCLI_VOLLEYBALL_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'NYCLI Volleyball Club',
  officialActionUrl: NYCLI_VOLLEYBALL_SUMMER_URL,
  sourceUrl: NYCLI_VOLLEYBALL_SUMMER_URL,
  organizerName: 'NYCLI Volleyball Club',
  sportName: 'Volleyball',
  formatLabel: 'Youth volleyball summer academies and grass tournaments',
  city: 'Astoria, NY',
  venueName: NYCLI_VOLLEYBALL_VENUE,
  address: NYCLI_VOLLEYBALL_ADDRESS,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Summer 2026 youth volleyball academies and grass series',
  scheduleText: 'The stored official Summer 2026 listing describes five position-focused academies for female athletes at St. John’s Preparatory and a summer grass series for junior girls and boys doubles tournaments.',
  statusText: 'Review-only club profile; the future Pre-Tryout All Skills Academy is listed separately.',
  description: NYCLI_VOLLEYBALL_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Youth', 'Academy', 'Astoria'],
  logoUrl: NYCLI_VOLLEYBALL_LOGO_SOURCE_URL,
  logoSourceUrl: NYCLI_VOLLEYBALL_LOGO_SOURCE_URL,
  warnings: [
    'The allowed Summer 2026 listing supports the ongoing organization profile and supplies the St. John’s Preparatory venue/address for the academies.',
    'Past Future Stars, Libero, Setter & Middle, and Hitter Academy rows are withheld as past as of 2026-07-31; the grass-series row lacks complete date/time/location evidence.',
    'The 2026-27 tryouts page is UNCHECKED; no tryout or TEAM candidate is inferred from it.',
  ],
};

const eventCandidate = {
  listingKind: 'EVENT' as const,
  title: 'Pre-Tryout All Skills Academy',
  officialActionUrl: NYCLI_VOLLEYBALL_REGISTER_URL,
  sourceUrl: NYCLI_VOLLEYBALL_SUMMER_URL,
  organizerName: 'NYCLI Volleyball Club',
  sportName: 'Volleyball',
  formatLabel: 'Pre-tryout youth volleyball skills academy',
  city: 'Astoria, NY',
  venueName: NYCLI_VOLLEYBALL_VENUE,
  address: NYCLI_VOLLEYBALL_ADDRESS,
  startsAt: '2026-08-15T10:00:00-04:00',
  endsAt: '2026-08-16T19:00:00-04:00',
  timeZone: 'America/New_York',
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'August 15-16, 2026',
  scheduleText: 'Saturday and Sunday, August 15-16, 2026: 7th & 8th Grade 10:00 AM-12:00 PM; 9th Grade 12:00-2:00 PM; 10th Grade 3:00-5:00 PM; 11th & 12th Grade 5:00-7:00 PM.',
  priceText: '$150',
  statusText: 'Future event listed on the allowed NYCLI Volleyball Summer 2026 page; registration uses the official Summer Academy 2026 form.',
  description: 'The Pre-Tryout All Skills Academy is designed for athletes preparing for upcoming club and high-school tryouts and improving all aspects of their game.',
  tags: ['Event', 'Volleyball', 'Youth', 'Academy', 'Tryouts', 'Astoria'],
  warnings: [
    'The allowed listing supplies the date, grade-session times, venue, address, price, and official registration URL; capacity is not published.',
    'The linked 2026-27 tryouts page is UNCHECKED and is not used for this event row.',
  ],
};

export const NYCLI_VOLLEYBALL_MANUAL_CANDIDATES = [organizationCandidate, eventCandidate] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NYCLI_VOLLEYBALL_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NYCLI_VOLLEYBALL_SUMMER_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'NYCLI Volleyball Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NYCLI_VOLLEYBALL_SUMMER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NYCLI_VOLLEYBALL_SUMMER_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NYCLI Volleyball Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth volleyball summer academies and grass tournaments' },
    city: { selector: 'body', mode: 'literal', value: 'Astoria, NY' },
    venueName: { selector: 'body', mode: 'literal', value: NYCLI_VOLLEYBALL_VENUE },
    address: { selector: 'body', mode: 'literal', value: NYCLI_VOLLEYBALL_ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Volleyball, Youth, Academy, Astoria' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: NYCLI_VOLLEYBALL_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycliVolleyballSummer.html');

export const NYCLI_VOLLEYBALL_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: NYCLI_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
