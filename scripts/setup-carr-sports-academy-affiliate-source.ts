/**
 * Carr Sports Academy affiliate source setup.
 *
 * Owns public organization `affiliate_org_carr_sports_academy`, source
 * `affiliate_source_carr_sports_academy`, and mapping
 * `affiliate_mapping_carr_sports_academy_camps_v1`. The source is reviewed
 * from the public Wix booking page and only writes its five dated, addressed
 * future camp candidates. This local-only script refuses --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import {
  CARR_SPORTS_ACADEMY_ADDRESS,
  CARR_SPORTS_ACADEMY_BOOKING_URL,
  CARR_SPORTS_ACADEMY_HOME_URL,
  CARR_SPORTS_ACADEMY_LOGO_SOURCE_URL,
  CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES,
  CARR_SPORTS_ACADEMY_MAPPING,
  CARR_SPORTS_ACADEMY_ORG_DESCRIPTION,
  CARR_SPORTS_ACADEMY_ROBOTS_URL,
  CARR_SPORTS_ACADEMY_STATIC_PAGE_CLIENT,
  CARR_SPORTS_ACADEMY_TEAMS_URL,
  CARR_SPORTS_ACADEMY_WITHHELD_ROWS,
} from '../src/server/affiliateImports/carrSportsAcademySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_carr_sports_academy';
const SOURCE_ID = 'affiliate_source_carr_sports_academy';
const SOURCE_KEY = 'carr-sports-academy';
const MAPPING_ID = 'affiliate_mapping_carr_sports_academy_camps_v1';
const PUBLIC_SLUG = 'carr-sports-academy';
const LOGO_FILE_ID = 'affiliate_file_carr_sports_academy_logo';
const LOGO_FILE_NAME = 'carr-sports-academy-logo-square.png';
const LOGO_BACKGROUND = '#050b10';

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: CARR_SPORTS_ACADEMY_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'The reviewed Wix robots.txt allows public pages and excludes only the lightbox query pattern for normal user agents.',
  reviewedUrls: [CARR_SPORTS_ACADEMY_HOME_URL, CARR_SPORTS_ACADEMY_BOOKING_URL, CARR_SPORTS_ACADEMY_TEAMS_URL],
  renderingRequired: true,
  renderingNote: 'The public Wix booking response exposes each reviewed course title, description, fixed price, capacity, location, and first/last session timestamps.',
  officialLogoSourceUrl: CARR_SPORTS_ACADEMY_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official Wix Open Graph site image',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote: 'The official transparent circular mark is trimmed, centered on one full navy canvas, and flattened so no inset background rectangle remains.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: CARR_SPORTS_ACADEMY_WITHHELD_ROWS,
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
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({ width: 920, height: 920, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 920;
  const height = metadata.height ?? 920;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{ input: logo, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(CARR_SPORTS_ACADEMY_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Carr Sports Academy logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Carr Sports Academy logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate a local object when its row outlives local storage.
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
  const coordinates = await geocodeAddressToCoordinates(CARR_SPORTS_ACADEMY_ADDRESS);
  const organization = {
    updatedAt: new Date(),
    name: 'Carr Sports Academy',
    location: 'Portland, OR',
    address: CARR_SPORTS_ACADEMY_ADDRESS,
    description: CARR_SPORTS_ACADEMY_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: CARR_SPORTS_ACADEMY_HOME_URL,
    sports: ['Basketball'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'Carr Sports Academy camps and basketball programs',
    publicIntroText: 'Explore Carr Sports Academy basketball camps and official registration information.',
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
    name: 'Carr Sports Academy',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: CARR_SPORTS_ACADEMY_HOME_URL,
    listUrl: CARR_SPORTS_ACADEMY_BOOKING_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Public Carr Sports Academy booking source. Creates only reviewed future camp event candidates with a complete source-stated address.',
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
      mapping: CARR_SPORTS_ACADEMY_MAPPING,
      createdByUserId: null,
      notes: 'Manual Carr Sports Academy camp mapping reviewed from the public Wix booking response on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: CARR_SPORTS_ACADEMY_MAPPING,
      notes: 'Manual Carr Sports Academy camp mapping reviewed from the public Wix booking response on July 15, 2026.',
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
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`Carr Sports Academy affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES.length} future camp candidate(s) configured.`);
  console.log(`${CARR_SPORTS_ACADEMY_WITHHELD_ROWS.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: CARR_SPORTS_ACADEMY_STATIC_PAGE_CLIENT });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed camp candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-carr-sports-academy-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
