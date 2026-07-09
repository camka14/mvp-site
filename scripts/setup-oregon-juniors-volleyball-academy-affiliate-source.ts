/**
 * Oregon Juniors Volleyball Academy affiliate source setup.
 *
 * Owns public club org `affiliate_org_oregon_juniors_volleyball_academy`,
 * source `affiliate_source_oregon_juniors_volleyball_academy`, and mapping
 * `affiliate_mapping_oregon_juniors_volleyball_academy_v1`.
 *
 * Official URLs:
 * - Legacy home: https://www.oregonjuniorsvbacad.com/
 * - Current site/programs:
 *   https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9275602-programs
 *
 * Creates/repairs the public club org, official OJVA logo, source row,
 * mapping row, and one club candidate. It does not create event candidates
 * because current public event/program rows either started in the past or omit
 * a source event year. Safe for local or live DB; use `--live` for live and
 * `--scrape` to create/update the club candidate.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_juniors_volleyball_academy';
const LOGO_FILE_ID = 'affiliate_file_oregon_juniors_volleyball_academy_logo';
const SOURCE_ID = 'affiliate_source_oregon_juniors_volleyball_academy';
const SOURCE_KEY = 'oregon-juniors-volleyball-academy';
const MAPPING_ID = 'affiliate_mapping_oregon_juniors_volleyball_academy_v1';
const LEGACY_URL = 'https://www.oregonjuniorsvbacad.com/';
const BASE_URL = 'https://oregonjuniorsvolleyballacademy.sportngin.com/';
const LIST_URL = 'https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9275602-programs';
const VOLLEYBALL_101_URL = 'https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9478554-volleyball-101';
const MIDDLE_SCHOOL_LEAGUE_URL = 'https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9539466-middle-school-league';
const TOURNAMENTS_URL = 'https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9290588-tournaments';
const LOGO_SOURCE_URL = 'https://cdn1.sportngin.com/attachments/logo_graphic/cd06-213956813/logo_large.png';
const VENUE_NAME = 'The Courts in Beaverton';
const VENUE_ADDRESS = '14523 SW Millikan Way #110, Beaverton, OR 97005';
const PUBLIC_SLUG = 'oregon-juniors-volleyball-academy';
const ORG_DESCRIPTION =
  'Oregon Juniors Volleyball Academy is a junior volleyball academy in Beaverton offering club volleyball, tournaments, developmental academy programming, Volleyball 101, camps, private lessons, and middle-school league opportunities.';

const withheldRows = [
  {
    title: 'Rising Champions Tournament Series',
    reason: 'The tournaments page lists January-April 2026 event dates, which are past as of 2026-07-09.',
    sourceUrl: TOURNAMENTS_URL,
  },
  {
    title: 'Volleyball 101',
    reason: 'The public page lists July 25 and August 22 clinic dates, but does not include a source event year.',
    sourceUrl: VOLLEYBALL_101_URL,
  },
  {
    title: 'OJVA Middle School Fall League',
    reason: 'The public page lists September 8-October 29 but does not include a source event year.',
    sourceUrl: MIDDLE_SCHOOL_LEAGUE_URL,
  },
  {
    title: 'Nike Camps',
    reason: 'The public page links to the official Nike registration portal for dates, but the OJVA page itself does not expose specific event dates or prices.',
    sourceUrl: 'https://oregonjuniorsvolleyballacademy.sportngin.com/page/show/9493303-nike-camps',
  },
  {
    title: 'Private group lessons',
    reason: 'The public programs page describes parent-organized group lessons by available weekday but not source-provided specific dates.',
    sourceUrl: LIST_URL,
  },
];

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Oregon Juniors Volleyball Academy manual club source.</main></body></html>',
    };
  },
};

const manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']> = [
  {
    listingKind: 'CLUB',
    title: 'Oregon Juniors Volleyball Academy',
    officialActionUrl: BASE_URL,
    sourceUrl: LIST_URL,
    organizerName: 'Oregon Juniors Volleyball Academy',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Junior volleyball academy',
    city: 'Beaverton, OR',
    venueName: VENUE_NAME,
    address: VENUE_ADDRESS,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Club programs by season',
    scheduleText: 'OJVA publishes current club, tournament, academy, camp, clinic, lesson, and league information on its official website.',
    participantOptionsText: 'Use the official OJVA website for current club, tournament, camp, clinic, lesson, league, and registration information.',
    description: `${ORG_DESCRIPTION} Use the official OJVA website for current program details and registration links.`,
    warnings: withheldRows.map((row) => `${row.title}: ${row.reason}`),
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Oregon Juniors Volleyball Academy',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: BASE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates,
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const normalizeLogo = async (input: Buffer) => {
  const background = '#ffffff';
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 8 })
    .png()
    .toBuffer();

  const logo = await sharp(trimmed)
    .resize({ width: 900, height: 640, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 900;
  const height = metadata.height ?? 640;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download OJVA logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'oregon-juniors-volleyball-academy-logo-square.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'oregon-juniors-volleyball-academy-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'oregon-juniors-volleyball-academy-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(VENUE_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Oregon Juniors Volleyball Academy',
      location: 'Beaverton, OR',
      address: VENUE_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Oregon Juniors Volleyball Academy programs',
      publicIntroText: 'Review OJVA club volleyball, tournaments, academy programs, camps, clinics, lessons, middle-school league opportunities, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Oregon Juniors Volleyball Academy',
      location: 'Beaverton, OR',
      address: VENUE_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Oregon Juniors Volleyball Academy programs',
      publicIntroText: 'Review OJVA club volleyball, tournaments, academy programs, camps, clinics, lessons, middle-school league opportunities, and official registration links.',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const metadata = {
    inspectedAt: '2026-07-09',
    robotsAllowed: true,
    robotsNote:
      'oregonjuniorsvbacad.com and oregonjuniorsvolleyballacademy.sportngin.com robots.txt allow public pages for normal user agents while disallowing private user and event-calendar paths.',
    legacyUrl: LEGACY_URL,
    logoSourceUrl: LOGO_SOURCE_URL,
    withheldRows,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Oregon Juniors Volleyball Academy',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public OJVA club source. Current program/event pages are documented but event candidates are withheld when dates are past or omit a source event year.',
      metadata,
    },
    update: {
      name: 'Oregon Juniors Volleyball Academy',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public OJVA club source. Current program/event pages are documented but event candidates are withheld when dates are past or omit a source event year.',
      metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes:
        'Manual OJVA club mapping. Produces one public club candidate and records withheld event/program rows for future review.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        'Manual OJVA club mapping. Produces one public club candidate and records withheld event/program rows for future review.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Oregon Juniors Volleyball Academy affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${manualCandidates.length} manual club candidate configured.`);
  console.log(`${withheldRows.length} event/program row(s) withheld: past dates, missing source event year, or missing specific dates.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update the club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-oregon-juniors-volleyball-academy-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
