import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const VBLI_HOME_URL = 'https://www.vbli.com/';
export const VBLI_GRASS_TOURNAMENTS_URL = 'https://www.vbli.com/grass-tournaments';
export const VBLI_LOGO_SOURCE_URL = 'https://static.wixstatic.com/media/e82216_8603ced9facb49fdba26a0f277cb5511~mv2.png/v1/fill/w_68,h_48,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/VBLI_logo.png';
export const VBLI_ADDRESS = '880 Lido Blvd, Lido Beach, NY 11561, USA';
export const VBLI_VENUE = 'Nickerson Beach Park';
export const VBLI_TIME_ZONE = 'America/New_York';
export const VBLI_ORG_DESCRIPTION = 'VBLI organizes grass volleyball tournaments with junior, adult, co-ed, gender-neutral, and cash-prize divisions through its official tournament listing.';

export const VBLI_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '71c2e72d-e078-41b6-a8c4-ae5eb2719c33',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-grass-volleyball-tournaments-vbli-com',
  intakeName: 'New York Grass Volleyball Tournaments',
  baseUrl: 'https://www.vbli.com',
  complianceStatus: 'ALLOWED',
  runId: 'a9470d9c-22e5-4b99-8bd1-7469c95324a3',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:26:13.658Z',
  pages: [
    { url: VBLI_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
    { url: VBLI_GRASS_TOURNAMENTS_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-boys-juniors-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-rev-co-ed-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-mens-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-girls-juniors-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-mens-cash-prize-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-gender-neutral-grass-fours-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-womens-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-rev-co-ed-doubles-cash-prize-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/christmas-in-july-womens-cash-prize-grass-doubles-08082026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/vbli-con-boys-juniors-grass-doubles-08222026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/vbli-con-rev-co-ed-doubles-cash-prize-08222026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.vbli.com/event-details/vbli-con-girls-juniors-grass-doubles-08222026', role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 3 },
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
    { kind: 'ROBOTS', count: 2 },
  ],
} as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'VBLI',
  officialActionUrl: VBLI_HOME_URL,
  sourceUrl: VBLI_GRASS_TOURNAMENTS_URL,
  organizerName: 'VBLI',
  sportName: 'Volleyball',
  formatLabel: 'Grass volleyball tournaments and doubles/fours divisions',
  city: null,
  venueName: null,
  address: null,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Grass volleyball tournament organization',
  scheduleText: 'The stored official tournament listing contains multiple grass volleyball divisions and official registration links; future rows are represented individually when their date, time, venue, and action are captured.',
  statusText: 'Review-only club profile; current tournament rows are listed separately.',
  description: VBLI_ORG_DESCRIPTION,
  tags: ['Club', 'Volleyball', 'Grass', 'Tournament'],
  logoUrl: VBLI_LOGO_SOURCE_URL,
  logoSourceUrl: VBLI_LOGO_SOURCE_URL,
  warnings: [
    'No physical VBLI organization address is assigned because the stored homepage/listing evidence does not publish one.',
    'Only the 12 complete future rows in the captured listing are emitted; older rows and discovered-but-uncaptured detail pages are withheld.',
  ],
};

const eventCandidate = (params: {
  title: string;
  officialActionUrl: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  scheduleText: string;
  formatLabel: string;
  tags: string[];
  description: string;
}) => ({
  listingKind: 'EVENT' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: params.officialActionUrl,
  organizerName: 'VBLI',
  sportName: 'Volleyball',
  formatLabel: params.formatLabel,
  city: 'Lido Beach, NY',
  venueName: VBLI_VENUE,
  address: VBLI_ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: VBLI_TIME_ZONE,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  statusText: 'Registration is directed to the official VBLI event page.',
  description: params.description,
  tags: params.tags,
  warnings: ['The stored listing supplies the date, time, venue, and official registration URL but no public price or capacity; those fields remain unset.'],
});

export const VBLI_GRASS_TOURNAMENT_EVENT_CANDIDATES = [
  eventCandidate({ title: 'VBLI-Con Boys Juniors Grass Doubles', officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-boys-juniors-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Boys juniors grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Juniors', 'Doubles'], description: 'VBLI-Con Boys Juniors Grass Doubles is a boys juniors grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026.' }),
  eventCandidate({ title: 'VBLI-Con Rev Co-ed Grass Doubles', officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-rev-co-ed-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Reverse co-ed grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Reverse Co-ed', 'Doubles'], description: 'VBLI-Con Rev Co-ed Grass Doubles is a reverse co-ed grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026.' }),
  eventCandidate({ title: "VBLI-Con Men's Grass Doubles", officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-mens-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: "Men's grass volleyball doubles tournament", tags: ['Event', 'Volleyball', 'Grass', "Men's", 'Doubles'], description: "VBLI-Con Men's Grass Doubles is a men's grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026." }),
  eventCandidate({ title: 'VBLI-Con Girls Juniors Grass Doubles', officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-girls-juniors-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Girls juniors grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Juniors', 'Doubles'], description: 'VBLI-Con Girls Juniors Grass Doubles is a girls juniors grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026.' }),
  eventCandidate({ title: "VBLI-Con Men's Cash Prize Grass Doubles", officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-mens-cash-prize-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: "Men's cash-prize grass volleyball doubles tournament", tags: ['Event', 'Volleyball', 'Grass', "Men's", 'Cash Prize', 'Doubles'], description: "VBLI-Con Men's Cash Prize Grass Doubles is a men's cash-prize grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026." }),
  eventCandidate({ title: 'VBLI-Con Gender Neutral Grass Fours', officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-gender-neutral-grass-fours-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Gender-neutral grass volleyball fours tournament', tags: ['Event', 'Volleyball', 'Grass', 'Gender Neutral', 'Fours'], description: 'VBLI-Con Gender Neutral Grass Fours is a gender-neutral grass volleyball fours tournament at Nickerson Beach Park on August 8, 2026.' }),
  eventCandidate({ title: "VBLI-Con Women's Grass Doubles", officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-womens-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: "Women's grass volleyball doubles tournament", tags: ['Event', 'Volleyball', 'Grass', "Women's", 'Doubles'], description: "VBLI-Con Women's Grass Doubles is a women's grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026." }),
  eventCandidate({ title: 'VBLI-Con Rev Co-ed Doubles Cash Prize', officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-rev-co-ed-doubles-cash-prize-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T18:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-6:00 PM.', formatLabel: 'Reverse co-ed cash-prize grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Reverse Co-ed', 'Cash Prize', 'Doubles'], description: 'VBLI-Con Rev Co-ed Doubles Cash Prize is a reverse co-ed cash-prize grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026.' }),
  eventCandidate({ title: "VBLI-Con Women's Cash Prize Grass Doubles", officialActionUrl: 'https://www.vbli.com/event-details/christmas-in-july-womens-cash-prize-grass-doubles-08082026', startsAt: '2026-08-08T09:00:00-04:00', endsAt: '2026-08-08T17:00:00-04:00', dateDisplayText: 'August 8, 2026', scheduleText: 'Saturday, August 8, 2026, 9:00 AM-5:00 PM.', formatLabel: "Women's cash-prize grass volleyball doubles tournament", tags: ['Event', 'Volleyball', 'Grass', "Women's", 'Cash Prize', 'Doubles'], description: "VBLI-Con Women's Cash Prize Grass Doubles is a women's cash-prize grass volleyball doubles tournament at Nickerson Beach Park on August 8, 2026." }),
  eventCandidate({ title: 'Sparkles in the Parkles Boys Juniors Grass Doubles', officialActionUrl: 'https://www.vbli.com/event-details/vbli-con-boys-juniors-grass-doubles-08222026', startsAt: '2026-08-22T09:00:00-04:00', endsAt: '2026-08-22T17:00:00-04:00', dateDisplayText: 'August 22, 2026', scheduleText: 'Saturday, August 22, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Boys juniors grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Juniors', 'Doubles'], description: 'Sparkles in the Parkles Boys Juniors Grass Doubles is a boys juniors grass volleyball doubles tournament at Nickerson Beach Park on August 22, 2026.' }),
  eventCandidate({ title: 'Sparkles in the Parkles Rev Co-ed Doubles Cash Prize', officialActionUrl: 'https://www.vbli.com/event-details/vbli-con-rev-co-ed-doubles-cash-prize-08222026', startsAt: '2026-08-22T09:00:00-04:00', endsAt: '2026-08-22T18:00:00-04:00', dateDisplayText: 'August 22, 2026', scheduleText: 'Saturday, August 22, 2026, 9:00 AM-6:00 PM.', formatLabel: 'Reverse co-ed cash-prize grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Reverse Co-ed', 'Cash Prize', 'Doubles'], description: 'Sparkles in the Parkles Rev Co-ed Doubles Cash Prize is a reverse co-ed cash-prize grass volleyball doubles tournament at Nickerson Beach Park on August 22, 2026.' }),
  eventCandidate({ title: 'Sparkles in the Parkles Girls Juniors Grass Doubles', officialActionUrl: 'https://www.vbli.com/event-details/vbli-con-girls-juniors-grass-doubles-08222026', startsAt: '2026-08-22T09:00:00-04:00', endsAt: '2026-08-22T17:00:00-04:00', dateDisplayText: 'August 22, 2026', scheduleText: 'Saturday, August 22, 2026, 9:00 AM-5:00 PM.', formatLabel: 'Girls juniors grass volleyball doubles tournament', tags: ['Event', 'Volleyball', 'Grass', 'Juniors', 'Doubles'], description: 'Sparkles in the Parkles Girls Juniors Grass Doubles is a girls juniors grass volleyball doubles tournament at Nickerson Beach Park on August 22, 2026.' }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const VBLI_GRASS_TOURNAMENT_MANUAL_CANDIDATES = [organizationCandidate, ...VBLI_GRASS_TOURNAMENT_EVENT_CANDIDATES] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const VBLI_GRASS_TOURNAMENT_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: VBLI_GRASS_TOURNAMENTS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'VBLI' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: VBLI_GRASS_TOURNAMENTS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: VBLI_GRASS_TOURNAMENTS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'VBLI' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Grass volleyball tournaments and doubles/fours divisions' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Volleyball, Grass, Tournament' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: VBLI_GRASS_TOURNAMENT_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/vbliGrassTournaments.html');

export const VBLI_GRASS_TOURNAMENT_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: VBLI_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
