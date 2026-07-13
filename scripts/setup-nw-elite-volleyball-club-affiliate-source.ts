/**
 * NW Elite Volleyball Club affiliate source setup.
 *
 * Owns public club org `affiliate_org_nw_elite_volleyball_club`, source
 * `affiliate_source_nw_elite_volleyball_club`, and mapping
 * `affiliate_mapping_nw_elite_volleyball_club_v1`.
 *
 * Official URLs:
 * - Home: https://www.nwelitevbc.com/
 * - Tryouts: https://www.nwelitevbc.com/tryouts
 * - Clinics/open gyms: https://www.nwelitevbc.com/clinicsopengyms
 *
 * Creates/repairs the public club org, official NW Elite logo, source row,
 * mapping row, one club candidate, and high-confidence future tryout event
 * candidates. Safe for local or live DB; use `--live` for live and `--scrape`
 * to create/update discovered candidates.
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
const ORG_ID = 'affiliate_org_nw_elite_volleyball_club';
const LOGO_FILE_ID = 'affiliate_file_nw_elite_volleyball_club_logo';
const SOURCE_ID = 'affiliate_source_nw_elite_volleyball_club';
const SOURCE_KEY = 'nw-elite-volleyball-club';
const MAPPING_ID = 'affiliate_mapping_nw_elite_volleyball_club_v1';
const BASE_URL = 'https://www.nwelitevbc.com/';
const TRYOUTS_URL = 'https://www.nwelitevbc.com/tryouts';
const CLINICS_URL = 'https://www.nwelitevbc.com/clinicsopengyms';
const LOGO_SOURCE_URL = 'https://cdn3.sportngin.com/attachments/logo_graphic/6708/4084/logo_medium.png';
const PUBLIC_SLUG = 'nw-elite-volleyball-club';
const ORG_DESCRIPTION =
  'NW Elite Volleyball Club is a USA Volleyball affiliated club in the Portland metro area focused on competitive youth volleyball development, club teams, clinics, open gyms, and tryouts.';

const TRYOUT_VENUE_NAME = 'Clackamas Community College - Randall Hall';
const TRYOUT_ADDRESS = '19600 Molalla Ave, Oregon City, OR 97045';

const withheldRows = [
  {
    title: 'NW Elite 15U-18U Tryouts',
    reason: 'The source lists November 15, 2026 but the venue is TBD, with Clackamas Community College named only as a target.',
    sourceUrl: TRYOUTS_URL,
  },
  {
    title: 'NW Elite Boys Open Gyms',
    reason: 'The source says Fridays starting July 10 but does not include a source event year.',
    sourceUrl: CLINICS_URL,
  },
  {
    title: 'NW Elite 3 Day Summer Skills Clinic',
    reason: 'The source lists July 6-8 without an event year and those dates are already past if interpreted as 2026.',
    sourceUrl: CLINICS_URL,
  },
  {
    title: 'NW Elite Mini-Clinic Skills Training',
    reason: 'The source lists July/August sessions without a source event year, and many rows are marked full.',
    sourceUrl: CLINICS_URL,
  },
];

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>NW Elite Volleyball Club manual source.</main></body></html>',
    };
  },
};

const manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']> = [
  {
    listingKind: 'CLUB',
    title: 'NW Elite Volleyball Club',
    officialActionUrl: BASE_URL,
    sourceUrl: BASE_URL,
    organizerName: 'NW Elite Volleyball Club',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Junior volleyball club',
    city: 'Oregon City, OR',
    venueName: 'NW Elite Volleyball Club',
    address: 'Oregon City, OR',
    tags: ['Club'],
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Club programs by season',
    scheduleText: 'NW Elite publishes club teams, tryouts, clinics, open gyms, dues, and documents on its official website.',
    participantOptionsText: 'Use the official NW Elite website for current club, tryout, clinic, open gym, and registration information.',
    description: `${ORG_DESCRIPTION} Use the official NW Elite website for current registration details and program links.`,
    warnings: withheldRows.map((row) => `${row.title}: ${row.reason}`),
  },
  {
    listingKind: 'EVENT',
    title: 'NW Elite 12U-14U Tryouts',
    officialActionUrl: 'https://nwelitevbc.sportngin.com/register/form/522480871',
    sourceUrl: TRYOUTS_URL,
    organizerName: 'NW Elite Volleyball Club',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Club volleyball tryouts',
    city: 'Oregon City, OR',
    venueName: TRYOUT_VENUE_NAME,
    address: TRYOUT_ADDRESS,
    startsAt: '2026-11-08T08:00:00-08:00',
    endsAt: '2026-11-08T12:00:00-08:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'Sunday, November 8, 2026, 8:00 AM-12:00 PM.',
    dateDisplayMode: 'SCHEDULED',
    priceText: '$20',
    tags: ['Tryouts'],
    tagText: 'Tryouts',
    divisionText: '12U to 14U',
    participantOptionsText: 'Girls and boys tryout registration through NW Elite SportsEngine.',
    description:
      'NW Elite lists 12U to 14U club volleyball tryouts for the 2026-2027 season at Clackamas Community College Randall Hall. The source lists a $20 tryout fee and instructs players to get a CEVA number, SportsEngine account, and complete the official tryout registration.',
    divisions: [
      {
        name: 'Coed 12U-14U',
        key: 'c_12u_14u',
        gender: 'C',
        ratingType: 'AGE',
        divisionTypeId: 'youth',
        priceCents: 2000,
        maxParticipants: null,
        ageCutoffLabel: '12U-14U',
        ageCutoffSource: 'NW Elite 2026-2027 tryouts page inspected 2026-07-09.',
      },
    ],
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: TRYOUTS_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'NW Elite Volleyball Club',
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
  const logo = await sharp(input, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 8 })
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
    throw new Error(`Failed to download NW Elite logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'nw-elite-volleyball-club-logo-square.png',
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
      originalName: 'nw-elite-volleyball-club-logo-square.png',
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
      originalName: 'nw-elite-volleyball-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Oregon City, OR');
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'NW Elite Volleyball Club',
      location: 'Oregon City, OR',
      address: null,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'NW Elite Volleyball Club programs',
      publicIntroText: 'Review NW Elite Volleyball Club teams, tryouts, clinics, open gyms, dues, documents, beach volleyball, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'NW Elite Volleyball Club',
      location: 'Oregon City, OR',
      address: null,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'NW Elite Volleyball Club programs',
      publicIntroText: 'Review NW Elite Volleyball Club teams, tryouts, clinics, open gyms, dues, documents, beach volleyball, and registration links.',
      operatesAthleticFacility: false,
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
      'nwelitevbc.com robots.txt allows public pages for normal user agents while disallowing private user and event-calendar paths.',
    logoSourceUrl: LOGO_SOURCE_URL,
    withheldRows,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'NW Elite Volleyball Club',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: TRYOUTS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public NW Elite club source. Creates one club candidate and one high-confidence 12U-14U tryout candidate; other rows are withheld when date year or venue is not publish-ready.',
      metadata,
    },
    update: {
      name: 'NW Elite Volleyball Club',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: TRYOUTS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public NW Elite club source. Creates one club candidate and one high-confidence 12U-14U tryout candidate; other rows are withheld when date year or venue is not publish-ready.',
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
        'Manual NW Elite club and tryout mapping generated from the public homepage, tryouts page, clinics/open gyms page, and official SportsEngine logo metadata.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        'Manual NW Elite club and tryout mapping generated from the public homepage, tryouts page, clinics/open gyms page, and official SportsEngine logo metadata.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const duplicateRows = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'NW Elite Volleyball Club',
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    duplicateRows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'NW Elite Volleyball Club',
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  if (duplicateOrgIds.length > 0) {
    await (prisma as any).organizations.deleteMany({
      where: {
        id: { in: duplicateOrgIds },
        name: 'NW Elite Volleyball Club',
        website: BASE_URL,
      },
    });
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`NW Elite Volleyball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${manualCandidates.length} manual candidate(s) configured.`);
  console.log(`${withheldRows.length} row(s) withheld: missing source year, missing specific venue, or past dates.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    await relinkClubCandidateToSourceOrganization();
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update the club and tryout candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-nw-elite-volleyball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
