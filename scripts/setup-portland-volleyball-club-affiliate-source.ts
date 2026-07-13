/**
 * Portland Volleyball Club affiliate source setup.
 *
 * Owns public club org `affiliate_org_portland_volleyball_club`, source
 * `affiliate_source_portland_volleyball_club`, and mapping
 * `affiliate_mapping_portland_volleyball_club_v1`.
 *
 * Official URLs:
 * - Home and tryout page: https://portlandvolleyballclub.com/
 * - Club dues: https://portlandvolleyballclub.com/dues/
 *
 * Creates/repairs the public club org, official PVC logo, source, and manual
 * club/tryout candidates. Safe for local or live DB; use `--live` for live and
 * `--scrape` to create/update discovered candidates.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

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
const ORG_ID = 'affiliate_org_portland_volleyball_club';
const LOGO_FILE_ID = 'affiliate_file_portland_volleyball_club_logo';
const SOURCE_ID = 'affiliate_source_portland_volleyball_club';
const SOURCE_KEY = 'portland-volleyball-club';
const MAPPING_ID = 'affiliate_mapping_portland_volleyball_club_v1';
const BASE_URL = 'https://portlandvolleyballclub.com/';
const LIST_URL = 'https://portlandvolleyballclub.com/';
const DUES_URL = 'https://portlandvolleyballclub.com/dues/';
const LOGO_SOURCE_URL = 'https://portlandvolleyballclub.com/wp-content/uploads/2022/09/PVC-LOGO-WHITE.png';
const TRYOUT_LOCATION = 'Riverside High School';
const TRYOUT_ADDRESS = '2900 SW Borland Rd, Tualatin, OR 97062';
const PUBLIC_SLUG = 'portland-volleyball-club';
const ORG_DESCRIPTION =
  'Portland Volleyball Club is a technical-oriented junior volleyball club serving the Portland metro area. PVC focuses on quality coaching, game IQ, body positioning, footwork, and personalized player development for a small number of club teams.';

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Portland Volleyball Club manual source snapshot.</main></body></html>',
    };
  },
};

const ageDivision = (name: string, key: string, divisionTypeId: string) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  priceCents: null,
  maxParticipants: null,
  ageCutoffLabel: name,
  ageCutoffSource: 'Portland Volleyball Club tryout page inspected 2026-07-09.',
});

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Volleyball Club',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      listingKind: 'CLUB',
      title: 'Portland Volleyball Club',
      officialActionUrl: LIST_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Volleyball Club',
      sportName: 'Indoor Volleyball',
      formatLabel: 'Junior volleyball club',
      city: 'Portland metro area',
      venueName: 'Portland Volleyball Club',
      address: TRYOUT_ADDRESS,
      tags: ['Club'],
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Club volleyball programs by season',
      scheduleText: 'PVC publishes club teams, dues, tryouts, lessons, clinics, and camps on its official website.',
      participantOptionsText: 'Use the official PVC website for team, tryout, dues, and camp information.',
      description: ORG_DESCRIPTION,
      logoUrl: LOGO_SOURCE_URL,
      logoSourceUrl: LOGO_SOURCE_URL,
      logoOriginalName: 'PVC-LOGO-WHITE.png',
    },
    {
      listingKind: 'EVENT',
      title: 'Portland Volleyball Club 12U/11U and 14U Tryouts',
      officialActionUrl: LIST_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Volleyball Club',
      sportName: 'Indoor Volleyball',
      formatLabel: 'Club volleyball tryouts',
      city: 'Tualatin, OR',
      venueName: TRYOUT_LOCATION,
      address: TRYOUT_ADDRESS,
      startsAt: '2026-11-09T08:00:00-08:00',
      endsAt: '2026-11-09T12:00:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sunday, November 9, 2026. 12U/11U tryouts run 8:00-10:00 AM; 14U tryouts run 10:00 AM-12:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      skillLevel: 'Club volleyball tryout',
      ageGroup: '11U, 12U, and 14U',
      divisionText: '12U/11U and 14U',
      participantOptionsText: 'Athletes or parents submit the official PVC interest form on the club website.',
      priceText: null,
      statusText: 'PVC lists 2025-2026 season tryouts on its home page. No tryout fee is posted publicly.',
      description:
        'Portland Volleyball Club lists 12U/11U and 14U tryouts for the 2025-2026 season at Riverside High School in Tualatin. The official page asks interested athletes or parents to sign up through the embedded club form.',
      tags: ['Tryouts'],
      divisions: [
        ageDivision('11U', 'c_u11', 'u11'),
        ageDivision('12U', 'c_u12', 'u12'),
        ageDivision('14U', 'c_u14', 'u14'),
      ],
      warnings: [
        'PVC does not list a public tryout fee; price should remain unspecified unless the official page adds one.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Portland Volleyball Club 16U and 18U Tryouts',
      officialActionUrl: LIST_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Volleyball Club',
      sportName: 'Indoor Volleyball',
      formatLabel: 'Club volleyball tryouts',
      city: 'Tualatin, OR',
      venueName: TRYOUT_LOCATION,
      address: TRYOUT_ADDRESS,
      startsAt: '2026-11-16T08:00:00-08:00',
      endsAt: '2026-11-16T12:00:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sunday, November 16, 2026. 18U tryouts run 8:00-10:00 AM; 16U tryouts run 10:00 AM-12:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      skillLevel: 'Club volleyball tryout',
      ageGroup: '16U and 18U',
      divisionText: '16U and 18U',
      participantOptionsText: 'Athletes or parents submit the official PVC interest form on the club website.',
      priceText: null,
      statusText: 'PVC lists 2025-2026 season tryouts on its home page. No tryout fee is posted publicly.',
      description:
        'Portland Volleyball Club lists 16U and 18U tryouts for the 2025-2026 season at Riverside High School in Tualatin. The official page asks interested athletes or parents to sign up through the embedded club form.',
      tags: ['Tryouts'],
      divisions: [
        ageDivision('16U', 'c_u16', 'u16'),
        ageDivision('18U', 'c_u18', 'u18'),
      ],
      warnings: [
        'PVC does not list a public tryout fee; price should remain unspecified unless the official page adds one.',
      ],
    },
  ],
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
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ threshold: 4 })
    .png()
    .toBuffer()
    .catch(async () => sharp(input, { animated: false }).rotate().png().toBuffer());

  const logo = await sharp(trimmed, { animated: false })
    .resize({ width: 900, height: 640, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: '#0f2238',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
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
    throw new Error(`Failed to download PVC logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-volleyball-club-logo-square.png',
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
      originalName: 'portland-volleyball-club-logo-square.png',
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
      originalName: 'portland-volleyball-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(TRYOUT_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Volleyball Club',
      location: 'Portland metro area',
      address: TRYOUT_ADDRESS,
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
      publicHeadline: 'Portland Volleyball Club teams and tryouts',
      publicIntroText: 'Review Portland Volleyball Club teams, dues, tryout dates, lessons, clinics, and camps from the official PVC website.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Volleyball Club',
      location: 'Portland metro area',
      address: TRYOUT_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Portland Volleyball Club teams and tryouts',
      publicIntroText: 'Review Portland Volleyball Club teams, dues, tryout dates, lessons, clinics, and camps from the official PVC website.',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourceNotes =
    'Manual public club source for Portland Volleyball Club. Creates one CLUB candidate and two future tryout EVENT candidates from the 2025-2026 season tryout schedule.';

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Portland Volleyball Club',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'portlandvolleyballclub.com robots.txt allows public pages and disallows only WooCommerce upload/log/admin paths.',
        logoSourceUrl: LOGO_SOURCE_URL,
        duesUrl: DUES_URL,
        scrapeFetchNote: 'ScrapingDog returned HTTP 500 during local setup even though direct public fetches succeeded, so this manual source setup uses a static snapshot client for local candidate validation. Official source/action URLs remain the PVC public pages.',
      },
    },
    update: {
      name: 'Portland Volleyball Club',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'portlandvolleyballclub.com robots.txt allows public pages and disallows only WooCommerce upload/log/admin paths.',
        logoSourceUrl: LOGO_SOURCE_URL,
        duesUrl: DUES_URL,
        scrapeFetchNote: 'ScrapingDog returned HTTP 500 during local setup even though direct public fetches succeeded, so this manual source setup uses a static snapshot client for local candidate validation. Official source/action URLs remain the PVC public pages.',
      },
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
      notes: 'Manual PVC club and tryout mapping with official logo, website, tryout location, age divisions, and no inferred tryout fee.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes: 'Manual PVC club and tryout mapping with official logo, website, tryout location, age divisions, and no inferred tryout fee.',
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
      title: 'Portland Volleyball Club',
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
      title: 'Portland Volleyball Club',
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
        name: 'Portland Volleyball Club',
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

  console.log(`Portland Volleyball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${mapping.manualCandidates?.length ?? 0} manual candidates configured.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    await relinkClubCandidateToSourceOrganization();
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-portland-volleyball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
