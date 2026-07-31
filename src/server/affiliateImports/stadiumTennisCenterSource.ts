import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const STADIUM_TENNIS_CENTER_URL = 'https://www.stadiumtennisnyc.com/court-rentals';
export const STADIUM_TENNIS_CENTER_BOOKING_URL = 'https://www.catchcorner.com/facility-page/embedded/rental/942';
export const STADIUM_TENNIS_CENTER_HOME_URL = 'https://www.stadiumtennisnyc.com/';
export const STADIUM_TENNIS_CENTER_LOGO_SOURCE_URL = 'https://www.stadiumtennisnyc.com/wp-content/uploads/2021/06/stadium_Logo.png';
export const STADIUM_TENNIS_CENTER_ADDRESS = '725 Gateway Center Boulevard (formerly Exterior Street), at E152nd Street and the Harlem River, Bronx, NY 10451';

export const STADIUM_TENNIS_CENTER_ORG_DESCRIPTION =
  'Stadium Tennis Center at Mill Pond Park is a Bronx tennis facility offering seasonal indoor and outdoor court play, court reservations, and tennis programs.';

export const STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'c75307dc-6227-4da4-9b66-244ca8826b2b',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-court-rentals-stadiumtennisnyc-com',
  intakeName: 'Stadium Tennis Court Rentals',
  baseUrl: 'https://www.stadiumtennisnyc.com',
  complianceStatus: 'ALLOWED',
  runId: '66da27d3-fae2-4c64-ad7f-8ced5ae8aeae',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:57:57.481Z',
  pages: [
    { url: STADIUM_TENNIS_CENTER_URL, role: 'RENTAL', robotsStatus: 'ALLOWED' },
    { url: STADIUM_TENNIS_CENTER_BOOKING_URL, role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: STADIUM_TENNIS_CENTER_HOME_URL, role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.stadiumtennisnyc.com/adult-tennis-programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.stadiumtennisnyc.com/junior-tennis-programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.stadiumtennisnyc.com/private-lessons', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.stadiumtennisnyc.com/calendar', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 2 },
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

const rentalCandidate = (params: {
  title: string;
  officialActionUrl: string;
  formatLabel: string;
  dateDisplayText: string;
  scheduleText: string;
  description: string;
  participantOptionsText: string;
}) => ({
  listingKind: 'RENTAL' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: STADIUM_TENNIS_CENTER_URL,
  organizerName: 'Stadium Tennis Center at Mill Pond Park',
  sportName: 'Tennis',
  formatLabel: params.formatLabel,
  city: 'Bronx, NY',
  venueName: 'Stadium Tennis Center at Mill Pond Park',
  address: STADIUM_TENNIS_CENTER_ADDRESS,
  timeZone: 'America/New_York',
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: params.dateDisplayText,
  scheduleText: params.scheduleText,
  priceText: null,
  participantOptionsText: params.participantOptionsText,
  statusText: 'Review-only rental link-out; public pricing and live availability are not exposed in the stored listing.',
  description: params.description,
  tags: ['Rental', 'Tennis', 'Court', 'Bronx'],
  warnings: [
    'The stored page does not publish a public court price or real-time availability; those details remain in the official booking or reservation process.',
    'Program, calendar, private-lesson, and other detail pages are UNCHECKED and remain withheld.',
  ],
});

export const STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES = [
  rentalCandidate({
    title: 'Stadium Tennis Center Indoor Seasonal Court Rentals',
    officialActionUrl: STADIUM_TENNIS_CENTER_BOOKING_URL,
    formatLabel: 'Seasonal indoor tennis court rental',
    dateDisplayText: 'Indoor season October-April; 2026-27 seasonal reservations',
    scheduleText: 'Indoor hours are 8:00 AM-10:00 PM from October through April. The stored page says 2026-27 seasonal indoor court reservations are open by email and that a seasonal court guarantees a set day and time; indoor availability is limited.',
    participantOptionsText: 'Reserve a seasonal indoor court through the official CatchCorner booking link or contact the facility for 2026-27 seasonal requests.',
    description: 'Stadium Tennis Center lists seasonal indoor court rentals for the 2026-27 indoor season from October through April. The stored page says seasonal courts guarantee a set day and time, with limited availability, and provides an official online booking link for indoor-season court reservations.',
  }),
  rentalCandidate({
    title: 'Stadium Tennis Center Outdoor Walk-On Court Play',
    officialActionUrl: STADIUM_TENNIS_CENTER_URL,
    formatLabel: 'Outdoor tennis court play',
    dateDisplayText: 'Outdoor season May-September',
    scheduleText: 'Outdoor hours are 8:00 AM-8:00 PM from May through September. During the outdoor season, a NYC tennis permit may be used for walk-on outdoor play.',
    participantOptionsText: 'Outdoor day play requires an NYC tennis permit; the stored page does not expose live court availability or a separate booking flow.',
    description: 'Stadium Tennis Center describes outdoor court play during its May-September outdoor season, with 8:00 AM-8:00 PM hours and NYC tennis permit requirements for walk-on outdoor play.',
  }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const STADIUM_TENNIS_CENTER_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: STADIUM_TENNIS_CENTER_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Stadium Tennis Center Court Rentals' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: STADIUM_TENNIS_CENTER_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: STADIUM_TENNIS_CENTER_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Stadium Tennis Center at Mill Pond Park' },
    sportName: { selector: 'body', mode: 'literal', value: 'Tennis' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Seasonal indoor and outdoor tennis court rental' },
    city: { selector: 'body', mode: 'literal', value: 'Bronx, NY' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Seasonal court rentals' },
    description: { selector: 'body', mode: 'literal', value: STADIUM_TENNIS_CENTER_ORG_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Tennis, Court, Bronx' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: STADIUM_TENNIS_CENTER_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/stadiumTennisCenter.html');

export const STADIUM_TENNIS_CENTER_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE.capturedAt,
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
