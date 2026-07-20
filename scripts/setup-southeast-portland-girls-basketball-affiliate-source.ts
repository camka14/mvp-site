/**
 * Southeast Portland Girls Basketball Club affiliate source setup.
 *
 * Owns public organization `affiliate_org_southeast_portland_girls_basketball`,
 * source `affiliate_source_southeast_portland_girls_basketball`, and mapping
 * `affiliate_mapping_southeast_portland_girls_basketball_v1`. It creates one
 * ongoing CLUB candidate only; closed 2025-26 registration and undated rows
 * remain withheld. This script is local-only and refuses --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import {
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_LOGO_SOURCE_URL,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ORG_DESCRIPTION,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ROBOTS_URL,
  SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/southeastPortlandGirlsBasketballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_southeast_portland_girls_basketball';
const SOURCE_ID = 'affiliate_source_southeast_portland_girls_basketball';
const SOURCE_KEY = 'southeast-portland-girls-basketball';
const MAPPING_ID = 'affiliate_mapping_southeast_portland_girls_basketball_v1';
const PUBLIC_SLUG = 'southeast-portland-girls-basketball';
const CLUB_NAME = 'Southeast Portland Girls Basketball Club';
const LOGO_FILE_ID = 'affiliate_file_southeast_portland_girls_basketball_logo';
const LOGO_FILE_NAME = 'southeast-portland-girls-basketball-logo-square.png';
const LOGO_BACKGROUND = '#f1f4f6';

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'The reviewed WordPress robots.txt allows public pages with a 10-second crawl delay and excludes only wp-admin except admin-ajax.',
  reviewedUrls: [SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL, SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_REGISTER_URL],
  officialLogoSourceUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official WordPress organization logo asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote: 'The official transparent mark is trimmed, centered on one full light canvas, and flattened so black lettering remains readable across cards, detail headers, list icons, and map markers.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES[0].warnings,
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
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
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const logo = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize({ width: 920, height: 920, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 920;
  const height = metadata.height ?? 920;
  return sharp({ create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND } })
    .composite([{ input: logo, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const existingFile = await (prisma as any).file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let response: Response;
  try {
    response = await fetch(SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_LOGO_SOURCE_URL, {
      headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com' },
    });
  } catch (error) {
    if (existingFile?.path) return LOGO_FILE_ID;
    throw error;
  }
  if (!response.ok) {
    if (existingFile?.path) return LOGO_FILE_ID;
    throw new Error(`Failed to fetch Southeast Portland Girls Basketball logo: ${response.status} ${response.statusText}`);
  }
  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Southeast Portland Girls Basketball logo normalization did not produce an opaque 1024x1024 PNG.');
  }
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existingFile?.path) {
    try {
      const existing = await storage.getObjectStream({ key: existingFile.path, bucket: existingFile.bucket });
      if ((await streamToBuffer(existing.stream)).equals(data)) {
        stored = { key: existingFile.path, sizeBytes: data.length, bucket: existingFile.bucket ?? undefined };
      }
    } catch {
      // Recreate the local object when its database row remains after cleanup.
    }
  }
  if (!stored) {
    stored = await storage.putObject({ data, originalName: LOGO_FILE_NAME, contentType: 'image/png', organizationId: ORG_ID });
  }
  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: LOGO_FILE_NAME, mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: LOGO_FILE_NAME, mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
  });
  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const organization = {
    updatedAt: new Date(), name: CLUB_NAME, location: 'Portland, OR', address: null,
    description: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_ORG_DESCRIPTION, logoId, ownerId,
    website: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL, sports: ['Basketball'], status: 'LISTED', coordinates: null,
    publicSlug: PUBLIC_SLUG, publicPageEnabled: true,
    publicHeadline: 'Southeast Portland girls basketball programs',
    publicIntroText: 'Explore Southeast Portland Girls Basketball Club and official current registration information.',
    operatesAthleticFacility: false, defaultEventTaxHandling: 'ORGANIZER_COLLECTS', defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
  };
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', publicWidgetsEnabled: false, taxOrganizationType: 'INDIVIDUAL_OR_CLUB', ...organization },
    update: organization,
  });
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: CLUB_NAME, sourceKey: SOURCE_KEY, organizationId: ORG_ID,
    baseUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL, listUrl: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_HOME_URL,
    targetKind: 'CLUB', status: 'ACTIVE', activeMappingId: MAPPING_ID, autoScrapeEnabled: false, scrapeIntervalMinutes: 10080,
    notes: 'Public Southeast Portland Girls Basketball Club source. Creates one reviewed ongoing club candidate and withholds stale or undated program rows.', metadata: sourceMetadata,
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING, createdByUserId: null, notes: 'Manual Southeast Portland Girls Basketball Club mapping reviewed from public WordPress pages on July 15, 2026.', validatedAt: new Date() },
    update: { version: 1, isActive: true, mapping: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MAPPING, notes: 'Manual Southeast Portland Girls Basketball Club mapping reviewed from public WordPress pages on July 15, 2026.', validatedAt: new Date() },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const relinkClubCandidateToSourceOrganization = async () => {
  await (prisma as any).affiliateImportCandidates.updateMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: CLUB_NAME },
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
  console.log(`Southeast Portland Girls Basketball affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_MANUAL_CANDIDATES.length} ongoing club candidate configured.`);
  console.log(`Official opaque logo ready: ${logoId}.`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: SOUTHEAST_PORTLAND_GIRLS_BASKETBALL_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    // The generic CLUB candidate importer can initialize its linked org with
    // private defaults. Reapply the reviewed public profile on every run.
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`);
  } else console.log('Re-run with --scrape to create or update the reviewed club candidate.');
};

main()
  .catch((error) => { console.error('[setup-southeast-portland-girls-basketball-affiliate-source] failed', error); process.exitCode = 1; })
  .finally(async () => { if (prisma) await prisma.$disconnect(); });
