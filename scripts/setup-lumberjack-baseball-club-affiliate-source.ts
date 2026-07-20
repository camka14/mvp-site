/**
 * Lumberjack Baseball Club affiliate source setup.
 *
 * Owns one public club organization and its reviewed ongoing CLUB candidate.
 * The current public site does not publish complete future event or team rows.
 * This script is intentionally local-only and rejects --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  LUMBERJACK_BASEBALL_CONTACT_URL,
  LUMBERJACK_BASEBALL_HOME_URL,
  LUMBERJACK_BASEBALL_LOGO_SOURCE_URL,
  LUMBERJACK_BASEBALL_MANUAL_CANDIDATES,
  LUMBERJACK_BASEBALL_MAPPING,
  LUMBERJACK_BASEBALL_ORG_DESCRIPTION,
  LUMBERJACK_BASEBALL_ROBOTS_URL,
  LUMBERJACK_BASEBALL_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/lumberjackBaseballClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Lumberjack Baseball Club source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_lumberjack_baseball_club';
const SOURCE_ID = 'affiliate_source_lumberjack_baseball_club';
const SOURCE_KEY = 'lumberjack-baseball-club';
const MAPPING_ID = 'affiliate_mapping_lumberjack_baseball_club_v1';
const PUBLIC_SLUG = 'lumberjack-baseball-club';
const ORGANIZATION_NAME = 'Lumberjack Baseball Club';
const LOGO_FILE_ID = 'affiliate_file_lumberjack_baseball_club_logo';
const LOGO_FILE_NAME = 'lumberjack-baseball-club-logo-square.png';
const LOGO_BACKGROUND = '#360914';
const LOGO_SAFE_MARK_WIDTH = 680;
const LOGO_SAFE_MARK_HEIGHT = 420;

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: LUMBERJACK_BASEBALL_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'The reviewed public robots.txt permits crawling and asks crawlers to use a 10-second delay. The setup uses reviewed static source data and does not run unattended.',
  reviewedUrls: [LUMBERJACK_BASEBALL_HOME_URL, LUMBERJACK_BASEBALL_CONTACT_URL],
  officialLogoSourceUrl: LUMBERJACK_BASEBALL_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official Lumberjack Baseball Club rendered home-page wordmark',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote: 'The official transparent Lumberjack wordmark is trimmed and centered on one opaque burgundy 1024px canvas; no transparent or inset background is retained.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'Lumberjack Baseball Club tryouts and camps',
      sourceUrl: LUMBERJACK_BASEBALL_HOME_URL,
      reason: 'The current public site publishes a club profile and contact path only. It does not publish a complete current future date, time, venue, price, and official registration action.',
    },
    {
      title: 'Lumberjack Baseball Club teams',
      sourceUrl: LUMBERJACK_BASEBALL_HOME_URL,
      reason: 'The public source describes competitive teams but does not publish stable roster-level registration targets, so no TEAM candidates are created.',
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
  const response = await fetch(LUMBERJACK_BASEBALL_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch Lumberjack Baseball Club logo: ${response.status} ${response.statusText}`);

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Lumberjack Baseball Club logo normalization did not produce an opaque 1024x1024 PNG.');
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
  const coordinates = await geocodeAddressToCoordinates('Lake Oswego, OR');
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Lake Oswego, OR',
    address: null,
    description: LUMBERJACK_BASEBALL_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: LUMBERJACK_BASEBALL_HOME_URL,
    sports: ['Baseball'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'Lumberjack Baseball Club programs',
    publicIntroText: 'Explore official Lumberjack Baseball Club youth baseball program information.',
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
    baseUrl: LUMBERJACK_BASEBALL_HOME_URL,
    listUrl: LUMBERJACK_BASEBALL_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Public Lumberjack Baseball Club source. Its reviewed site supports one ongoing club listing; no future event or roster-level registration rows are inferred.',
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
      mapping: LUMBERJACK_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual Lumberjack Baseball Club mapping reviewed from the current public site on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: LUMBERJACK_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual Lumberjack Baseball Club mapping reviewed from the current public site on July 15, 2026.',
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

  console.log(`Lumberjack Baseball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${LUMBERJACK_BASEBALL_MANUAL_CANDIDATES.length} reviewed candidate configured.`);
  console.log(`${sourceMetadata.withheldRows.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: LUMBERJACK_BASEBALL_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed Lumberjack Baseball Club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-lumberjack-baseball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
