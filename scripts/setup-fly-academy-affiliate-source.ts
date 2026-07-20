/**
 * Fly Academy affiliate club source setup.
 *
 * Owns public organization `affiliate_org_fly_academy`, source
 * `affiliate_source_fly_academy`, mapping `affiliate_mapping_fly_academy_v1`,
 * and one ongoing CLUB candidate. Official pages: https://theflyacademy.org/
 * and https://theflyacademy.org/tryouts. Owner: samuel.r@razumly.com.
 *
 * This script is local-only. It repairs the source org, official opaque logo,
 * source, and mapping. Passing `--scrape` saves the reviewed CLUB candidate;
 * it never creates a TEAM candidate or an undated tryout event.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FLY_ACADEMY_ADDRESS,
  FLY_ACADEMY_HOME_URL,
  FLY_ACADEMY_LADY_FLY_URL,
  FLY_ACADEMY_LOGO_SOURCE_URL,
  FLY_ACADEMY_MANUAL_CANDIDATES,
  FLY_ACADEMY_MAPPING,
  FLY_ACADEMY_ORG_DESCRIPTION,
  FLY_ACADEMY_ROBOTS_URL,
  FLY_ACADEMY_SELECT_URL,
  FLY_ACADEMY_STATIC_PAGE_CLIENT,
  FLY_ACADEMY_TEAM_FLY_URL,
  FLY_ACADEMY_TRYOUTS_URL,
} from '../src/server/affiliateImports/flyAcademySource';

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

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_fly_academy';
const SOURCE_ID = 'affiliate_source_fly_academy';
const SOURCE_KEY = 'fly-academy';
const MAPPING_ID = 'affiliate_mapping_fly_academy_v1';
const PUBLIC_SLUG = 'fly-academy';
const CLUB_NAME = 'Fly Academy';
const LOGO_FILE_ID = 'affiliate_file_fly_academy_logo';
const LOGO_FILE_NAME = 'fly-academy-logo-square.png';
const LOGO_BACKGROUND = '#15243b';

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: FLY_ACADEMY_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote:
    'Squarespace robots.txt allows the reviewed public club, program, and tryout pages. It disallows config, search, account, commerce, API, static, and query-variant paths, none of which are requested.',
  reviewedUrls: [
    FLY_ACADEMY_HOME_URL,
    FLY_ACADEMY_TRYOUTS_URL,
    FLY_ACADEMY_TEAM_FLY_URL,
    FLY_ACADEMY_LADY_FLY_URL,
    FLY_ACADEMY_SELECT_URL,
  ],
  officialLogoSourceUrl: FLY_ACADEMY_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Squarespace website header logo asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official white transparent wordmark is trimmed and centered on one full navy canvas. The final file has no alpha channel, inset background rectangle, or transparent corners.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'Fly Academy boys local, boys travel, girls local, and girls travel tryouts',
      sourceUrl: FLY_ACADEMY_TRYOUTS_URL,
      reason: 'The public tryouts page lists program pathways but not a future tryout date, time, or location.',
    },
    {
      title: 'Team Fly, Lady Fly, and Fly Select teams',
      sourceUrl: FLY_ACADEMY_HOME_URL,
      reason: 'The current public pages describe program-level teams but do not expose a stable roster-level registration target.',
    },
    {
      title: 'Spring 2026 team lists',
      sourceUrl: FLY_ACADEMY_TEAM_FLY_URL,
      reason: 'The visible Spring 2026 team sections are past as of the July 15, 2026 review.',
    },
  ],
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
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const logo = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize({ width: 928, height: 928, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 928;
  const height = metadata.height ?? 928;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: LOGO_BACKGROUND,
    },
  })
    .composite([{ input: logo, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(FLY_ACADEMY_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Fly Academy logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Fly Academy logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate a local object when the database row outlives its stored file.
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
  const coordinates = await geocodeAddressToCoordinates(FLY_ACADEMY_ADDRESS);
  const organization = {
    updatedAt: new Date(),
    name: CLUB_NAME,
    location: 'Portland, OR',
    address: FLY_ACADEMY_ADDRESS,
    description: FLY_ACADEMY_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: FLY_ACADEMY_HOME_URL,
    sports: ['Basketball'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'Fly Academy basketball programs',
    publicIntroText: 'Explore Fly Academy youth basketball programs and official registration information.',
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
    name: CLUB_NAME,
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: FLY_ACADEMY_HOME_URL,
    listUrl: FLY_ACADEMY_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Public Fly Academy club source. It creates one ongoing club candidate. Dated tryouts and team rows stay withheld until the source exposes current dates and stable roster-level actions.',
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
      mapping: FLY_ACADEMY_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual Fly Academy club mapping reviewed from public Squarespace pages on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: FLY_ACADEMY_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual Fly Academy club mapping reviewed from public Squarespace pages on July 15, 2026.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const rows = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: CLUB_NAME, publishedOrganizationId: { not: null } },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    rows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: CLUB_NAME },
    data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() },
  });

  for (const duplicateOrgId of duplicateOrgIds) {
    const [eventCount, facilityCount, teamCount, sourceCount] = await Promise.all([
      (prisma as any).events.count({ where: { organizationId: duplicateOrgId } }),
      (prisma as any).facilities.count({ where: { organizationId: duplicateOrgId } }),
      (prisma as any).canonicalTeams.count({ where: { organizationId: duplicateOrgId } }),
      (prisma as any).affiliateScrapeSources.count({ where: { organizationId: duplicateOrgId } }),
    ]);
    if (eventCount + facilityCount + teamCount + sourceCount > 0) {
      console.warn(`Preserved generated Fly Academy duplicate because dependencies exist: ${duplicateOrgId}`);
      continue;
    }
    await (prisma as any).organizations.deleteMany({
      where: { id: duplicateOrgId, name: CLUB_NAME, website: FLY_ACADEMY_HOME_URL },
    });
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`Fly Academy affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${FLY_ACADEMY_MANUAL_CANDIDATES.length} ongoing club candidate configured.`);
  console.log(`${sourceMetadata.withheldRows.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: FLY_ACADEMY_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-fly-academy-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
