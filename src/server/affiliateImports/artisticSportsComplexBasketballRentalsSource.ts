import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const ARTISTIC_SPORTS_COMPLEX_RENTALS_URL = 'https://www.artisticsportscomplex.com/basketball_court_rentals';
export const ARTISTIC_SPORTS_COMPLEX_HOME_URL = 'https://www.artisticsportscomplex.com/';
export const ARTISTIC_SPORTS_COMPLEX_ADDRESS = '79-08 Cooper Ave, Glendale NY 11385';
export const ARTISTIC_SPORTS_COMPLEX_CITY = 'Glendale, NY';
export const ARTISTIC_SPORTS_COMPLEX_VENUE = 'Artistic Sports Complex';
export const ARTISTIC_SPORTS_COMPLEX_ORG_DESCRIPTION = 'Artistic Sports Complex offers online indoor basketball court rentals in Glendale, NY, including full court, half court, and open court options with booking hours from 7 AM through 2 AM.';

export const ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '549892ee-bb1e-4c7e-9736-22ce8881e3e5',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-indoor-basketball-court-rentals-queens-ny-artisticsportscomplex',
  intakeName: 'Indoor Basketball Court Rentals Queens NY',
  baseUrl: 'https://www.artisticsportscomplex.com',
  complianceStatus: 'ALLOWED',
  runId: 'c7f051bb-9976-46aa-b716-6a7b4ef8e8e6',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:28:25.930Z',
  pages: [
    { url: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL, role: 'RENTAL', robotsStatus: 'ALLOWED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_full_court_booking.php', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_half_court_booking.php', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_half_court_reduced_booking.php', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_open_court_booking.php', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_terms_and_conditions.php', role: 'POLICY', robotsStatus: 'UNCHECKED' },
    { url: 'https://www.artisticsportscomplex.com/basketball_christmas_clinic.php', role: 'LISTING', robotsStatus: 'UNCHECKED' },
  ],
  artifactKinds: [
    { kind: 'DISCOVERED_URLS', count: 1 },
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

const rentalCandidate = (params: { title: string; officialActionUrl: string; formatLabel: string; priceText: string; description: string }) => ({
  listingKind: 'RENTAL' as const,
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL,
  organizerName: 'Artistic Sports Complex',
  sportName: 'Basketball',
  formatLabel: params.formatLabel,
  city: ARTISTIC_SPORTS_COMPLEX_CITY,
  venueName: ARTISTIC_SPORTS_COMPLEX_VENUE,
  address: ARTISTIC_SPORTS_COMPLEX_ADDRESS,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Online booking; 7 AM through 2 AM',
  scheduleText: 'Online booking only; the stored rental page states availability from 7 AM through 2 AM.',
  priceText: params.priceText,
  statusText: 'Booking is directed to the official Artistic Sports Complex rental page.',
  description: params.description,
  tags: ['Rental', 'Basketball', 'Indoor Facility'],
  warnings: ['The stored rental page supplies a public rate and booking path; real-time availability and checkout remain on the official booking page.'],
});

export const ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES = [
  rentalCandidate({ title: 'Artistic Sports Complex Full Basketball Court Rental', officialActionUrl: 'https://www.artisticsportscomplex.com/basketball_full_court_booking.php', formatLabel: 'Full indoor basketball court rental, 30 by 66 feet', priceText: '$220 per hour (credit card fee and tax included)', description: 'Full indoor basketball court rental at Artistic Sports Complex with hardwood flooring, two professional NBA-grade rims, and a stored dimension of 30 by 66 feet.' }),
  rentalCandidate({ title: 'Artistic Sports Complex Half Basketball Court Rental - Full 3-Point Line', officialActionUrl: 'https://www.artisticsportscomplex.com/basketball_half_court_booking.php', formatLabel: 'Half indoor basketball court rental with full 3-point line, 31 by 46 feet', priceText: '$130 per hour (credit card fee and tax included)', description: 'Half indoor basketball court rental with a full 3-point line at Artistic Sports Complex; the stored page gives dimensions of 31 by 46 feet and a professional NBA-grade rim.' }),
  rentalCandidate({ title: 'Artistic Sports Complex Half Basketball Court Rental - Reduced 3-Point Line', officialActionUrl: 'https://www.artisticsportscomplex.com/basketball_half_court_reduced_booking.php', formatLabel: 'Half indoor basketball court rental with reduced 3-point line, 30 by 30 feet', priceText: '$130 per hour (credit card fee and tax included)', description: 'Half indoor basketball court rental with a reduced 3-point line at Artistic Sports Complex; the stored page gives dimensions of 30 by 30 feet and a professional NBA-grade rim.' }),
  rentalCandidate({ title: 'Artistic Sports Complex Open Basketball Court', officialActionUrl: 'https://www.artisticsportscomplex.com/basketball_open_court_booking.php', formatLabel: 'Open basketball court rental/play based on availability', priceText: '$20 per person per hour (based on availability)', description: 'Open basketball court access at Artistic Sports Complex, with the stored page listing a $20 per-person hourly rate based on availability.' }),
  rentalCandidate({ title: 'Artistic Sports Complex Friday Open Basketball Court', officialActionUrl: 'https://www.artisticsportscomplex.com/basketball_open_court_booking.php', formatLabel: 'Friday open basketball court play', priceText: '$20 per person for all-day play', description: 'Friday open basketball court play at Artistic Sports Complex, with the stored page listing $20 per person for all-day play.' }),
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const ARTISTIC_SPORTS_COMPLEX_MAPPING: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Artistic Sports Complex Full Basketball Court Rental' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'Artistic Sports Complex' },
    sportName: { selector: 'body', mode: 'literal', value: 'Basketball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Indoor basketball court rentals' },
    city: { selector: 'body', mode: 'literal', value: ARTISTIC_SPORTS_COMPLEX_CITY },
    venueName: { selector: 'body', mode: 'literal', value: ARTISTIC_SPORTS_COMPLEX_VENUE },
    address: { selector: 'body', mode: 'literal', value: ARTISTIC_SPORTS_COMPLEX_ADDRESS },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'ONGOING' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'Online booking; 7 AM through 2 AM' },
    tagText: { selector: 'body', mode: 'literal', value: 'Rental, Basketball, Indoor Facility' },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/artisticSportsComplexBasketballRentals.html');

export const ARTISTIC_SPORTS_COMPLEX_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return { url: params.url, finalUrl: params.url, statusCode: 200, fetchedAt: ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE.capturedAt, body: await readFile(FIXTURE_PATH, 'utf8') };
  },
};
