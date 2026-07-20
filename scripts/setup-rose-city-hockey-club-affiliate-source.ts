/**
 * Rose City Hockey Club affiliate source setup.
 *
 * Creates one public club organization and one ongoing CLUB candidate from a
 * reviewed live intake. The captured site does not provide current future
 * event or roster-level team inventory. This script is local-only.
 */
import dotenv from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ROSE_CITY_HOCKEY_HOME_URL,
  ROSE_CITY_HOCKEY_LOGO_SOURCE_URL,
  ROSE_CITY_HOCKEY_MANUAL_CANDIDATES,
  ROSE_CITY_HOCKEY_MAPPING,
  ROSE_CITY_HOCKEY_ORG_DESCRIPTION,
  ROSE_CITY_HOCKEY_PLAYER_INTEREST_URL,
  ROSE_CITY_HOCKEY_ROBOTS_URL,
  ROSE_CITY_HOCKEY_SEASON_URL,
  ROSE_CITY_HOCKEY_SOURCE_EVIDENCE,
  ROSE_CITY_HOCKEY_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/roseCityHockeyClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Rose City Hockey Club source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_state_hockey_youth_directory_rose_city_hockey_club';
const SOURCE_ID = 'affiliate_source_rose_city_hockey_final_review';
const SOURCE_KEY = 'rose-city-hockey-final-review';
const MAPPING_ID = 'affiliate_mapping_rose_city_hockey_final_review_v1';
const PUBLIC_SLUG = 'rose-city-hockey-club';
const ORGANIZATION_NAME = 'Rose City Hockey Club';
const LOGO_FILE_ID = 'affiliate_file_rose_city_hockey_club_logo';
const LOGO_FILE_NAME = 'rose-city-hockey-club-logo-square.png';
const LOGO_BACKGROUND = '#111516';
const LOGO_SAFE_MARK_SIZE = 780;

const sourceMetadata = {
  inspectedAt: '2026-07-19',
  sourceEvidence: ROSE_CITY_HOCKEY_SOURCE_EVIDENCE,
  robotsUrl: ROSE_CITY_HOCKEY_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote:
    'The stored robots artifact allows the public home page and disallows selected internal, application, and archived-season paths. The mapping uses only the allowed home page.',
  termsNote:
    'The captured public home page and links expose no site-specific anti-automation terms. Intake compliance is ALLOWED and remains limited to the reviewed public page.',
  reviewedUrls: [
    ROSE_CITY_HOCKEY_HOME_URL,
    ROSE_CITY_HOCKEY_SEASON_URL,
    ROSE_CITY_HOCKEY_PLAYER_INTEREST_URL,
  ],
  officialLogoSourceUrl: ROSE_CITY_HOCKEY_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official Rose City Hockey Club home-page crest stored as the live intake LOGO_CANDIDATE artifact',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official transparent crest is trimmed and centered on one opaque charcoal 1024px canvas with no inset rectangle or alpha.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'Rose City Hockey Club 2025-2026 season',
      sourceUrl: ROSE_CITY_HOCKEY_SEASON_URL,
      reason:
        'The July 2026 capture links to a 2025-2026 season and says the club will return in fall. The evidence does not provide a current future date, time, venue, price, and official registration action.',
    },
    {
      title: 'Rose City Hockey Club teams',
      sourceUrl: ROSE_CITY_HOCKEY_HOME_URL,
      reason:
        'The captured source does not publish a stable roster-level registration action, so no TEAM candidate is created.',
    },
  ],
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
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const readExportedLogo = async (): Promise<Buffer | null> => {
  const exportDir = path.resolve(
    'output',
    'affiliate-intakes',
    ROSE_CITY_HOCKEY_SOURCE_EVIDENCE.intakeSourceKey,
    ROSE_CITY_HOCKEY_SOURCE_EVIDENCE.runId,
  );
  try {
    const files = await readdir(exportDir);
    const logoFile = files.find((file) => file.toLowerCase().includes('logo_candidate'));
    return logoFile ? await readFile(path.join(exportDir, logoFile)) : null;
  } catch {
    return null;
  }
};

const loadOfficialLogo = async (): Promise<Buffer> => {
  const exported = await readExportedLogo();
  if (exported) return exported;

  const response = await fetch(ROSE_CITY_HOCKEY_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Rose City Hockey Club logo: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({
      width: LOGO_SAFE_MARK_SIZE,
      height: LOGO_SAFE_MARK_SIZE,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? LOGO_SAFE_MARK_SIZE;
  const height = metadata.height ?? LOGO_SAFE_MARK_SIZE;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const data = await normalizeLogo(await loadOfficialLogo());
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Rose City Hockey Club logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate a missing local object instead of keeping a stale File row.
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
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Portland, OR and Vancouver, WA',
    address: null,
    description: ROSE_CITY_HOCKEY_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: ROSE_CITY_HOCKEY_HOME_URL,
    sports: ['Hockey'],
    status: 'LISTED',
    coordinates: null,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'All-girls hockey in Portland and Vancouver',
    publicIntroText: 'Explore official Rose City Hockey Club program and seasonal registration information.',
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
    baseUrl: ROSE_CITY_HOCKEY_HOME_URL,
    listUrl: ROSE_CITY_HOCKEY_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes:
      'Intake-backed Rose City Hockey Club source. It creates one ongoing public club listing and withholds stale or incomplete season/team rows.',
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
      mapping: ROSE_CITY_HOCKEY_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual club mapping derived from live intake run 7d004c23-3634-428d-8153-e033e8d3d328.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: ROSE_CITY_HOCKEY_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual club mapping derived from live intake run 7d004c23-3634-428d-8153-e033e8d3d328.',
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

  console.log(`Rose City Hockey Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${ROSE_CITY_HOCKEY_MANUAL_CANDIDATES.length} reviewed candidate configured.`);
  console.log(`${sourceMetadata.withheldRows.length} unsupported row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: ROSE_CITY_HOCKEY_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed Rose City Hockey Club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-rose-city-hockey-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
