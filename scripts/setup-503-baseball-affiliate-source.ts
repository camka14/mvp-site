/**
 * 503 Baseball affiliate source setup.
 *
 * Owns the local public organization, manual source/mapping, and one ongoing
 * club candidate plus three source-dated August 4, 2026 tryout candidates.
 * This script is intentionally local-only and rejects --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FIVE_OH_THREE_BASEBALL_HOME_URL,
  FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL,
  FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES,
  FIVE_OH_THREE_BASEBALL_MAPPING,
  FIVE_OH_THREE_BASEBALL_ORG_DESCRIPTION,
  FIVE_OH_THREE_BASEBALL_ROBOTS_URL,
  FIVE_OH_THREE_BASEBALL_STATIC_PAGE_CLIENT,
  FIVE_OH_THREE_BASEBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/fiveOhThreeBaseballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This 503 Baseball source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_503_baseball';
const SOURCE_ID = 'affiliate_source_503_baseball';
const SOURCE_KEY = '503-baseball';
const MAPPING_ID = 'affiliate_mapping_503_baseball_v1';
const PUBLIC_SLUG = '503-baseball';
const ORGANIZATION_NAME = '503 Baseball';
const LOGO_FILE_ID = 'affiliate_file_503_baseball_logo';
const LOGO_FILE_NAME = '503-baseball-logo-square.png';
const LOGO_BACKGROUND = '#102b5c';
const LOGO_SAFE_MARK_WIDTH = 760;
const LOGO_SAFE_MARK_HEIGHT = 680;

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: FIVE_OH_THREE_BASEBALL_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'The reviewed robots.txt allows public pages and only disallows /wp-admin/, with /wp-admin/admin-ajax.php explicitly allowed.',
  reviewedUrls: [FIVE_OH_THREE_BASEBALL_HOME_URL, FIVE_OH_THREE_BASEBALL_TRYOUTS_URL],
  officialLogoSourceUrl: FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official 503 Baseball rendered site-header asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official transparent 503 Baseball mark is trimmed and centered inside a safe 760x680 area on one opaque navy canvas, so no transparent or inset background is retained.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'Summer Camp',
      sourceUrl: 'https://503baseball.com/camps-clinics/summer-camp/',
      reason: 'The page publishes July 13-15 without a year and includes a venue-change notice for the stale 2025 season, so it is not inferred as a current event.',
    },
    {
      title: 'Fall Ball',
      sourceUrl: 'https://503baseball.com/camps-clinics/fall-ball/',
      reason: 'The source explicitly lists August-October 2025 dates and is past.',
    },
    {
      title: 'Drop-In Sessions',
      sourceUrl: 'https://503baseball.com/camps-clinics/drop-in-clinics/',
      reason: 'The public page describes a flash-sale process but does not publish dated sessions, prices, or a complete venue.',
    },
    {
      title: '503 Baseball travel teams',
      reason: 'The public source does not publish stable roster-level team-registration targets, so no TEAM candidates are created.',
    },
  ],
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({ width: LOGO_SAFE_MARK_WIDTH, height: LOGO_SAFE_MARK_HEIGHT, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? LOGO_SAFE_MARK_WIDTH;
  const height = metadata.height ?? LOGO_SAFE_MARK_HEIGHT;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{ input: logo, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(FIVE_OH_THREE_BASEBALL_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch 503 Baseball logo: ${response.status} ${response.statusText}`);

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('503 Baseball logo normalization did not produce an opaque 1024x1024 PNG.');
  }

  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existingFile = await (prisma as any).file.findUnique({
    where: { id: LOGO_FILE_ID },
    select: { path: true, bucket: true },
  });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;

  if (existingFile?.path) {
    try {
      const existing = await storage.getObjectStream({ key: existingFile.path, bucket: existingFile.bucket });
      if ((await streamToBuffer(existing.stream)).equals(data)) {
        stored = { key: existingFile.path, sizeBytes: data.length, bucket: existingFile.bucket ?? undefined };
      }
    } catch {
      // Recreate a missing local object instead of relying on a stale File row.
    }
  }
  if (!stored) {
    stored = await storage.putObject({
      data,
      originalName: LOGO_FILE_NAME,
      contentType: 'image/png',
      organizationId: ORG_ID,
    });
  }

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
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
      originalName: LOGO_FILE_NAME,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });

  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates('West Linn, OR');
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'West Linn, OR',
    address: null,
    description: FIVE_OH_THREE_BASEBALL_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: FIVE_OH_THREE_BASEBALL_HOME_URL,
    sports: ['Baseball'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: '503 Baseball training and travel-team tryouts',
    publicIntroText: 'Explore official 503 Baseball youth training and travel-team tryout registration.',
    operatesAthleticFacility: false,
    defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
    defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
  };

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      ...organization,
    },
    update: organization,
  });
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: ORGANIZATION_NAME,
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: FIVE_OH_THREE_BASEBALL_HOME_URL,
    listUrl: FIVE_OH_THREE_BASEBALL_TRYOUTS_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Public 503 Baseball source. It retains one club listing and only the reviewed August 4, 2026 age-specific tryouts with official registration URLs.',
    metadata: sourceMetadata,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...source },
    update: source,
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
      mapping: FIVE_OH_THREE_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual 503 Baseball club and future tryout mapping reviewed from public source pages on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: FIVE_OH_THREE_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual 503 Baseball club and future tryout mapping reviewed from public source pages on July 15, 2026.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  await (prisma as any).affiliateImportCandidates.updateMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME },
    data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`503 Baseball affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${FIVE_OH_THREE_BASEBALL_MANUAL_CANDIDATES.length} reviewed candidates configured.`);
  console.log(`${sourceMetadata.withheldRows.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: FIVE_OH_THREE_BASEBALL_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed 503 Baseball candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-503-baseball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
