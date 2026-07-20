/**
 * NW Futures Baseball affiliate source setup.
 *
 * Owns the local public organization, manual source/mapping, and one ongoing
 * club candidate plus the future source-dated 2026 summer-camp candidates.
 * This script is intentionally local-only and rejects --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NW_FUTURES_BASEBALL_ADDRESS,
  NW_FUTURES_BASEBALL_FALL_BALL_URL,
  NW_FUTURES_BASEBALL_HOME_URL,
  NW_FUTURES_BASEBALL_LOGO_SOURCE_URL,
  NW_FUTURES_BASEBALL_MANUAL_CANDIDATES,
  NW_FUTURES_BASEBALL_MAPPING,
  NW_FUTURES_BASEBALL_ORG_DESCRIPTION,
  NW_FUTURES_BASEBALL_ROBOTS_URL,
  NW_FUTURES_BASEBALL_STATIC_PAGE_CLIENT,
  NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
  NW_FUTURES_BASEBALL_VENUE_NAME,
} from '../src/server/affiliateImports/nwFuturesBaseballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This NW Futures Baseball source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_nw_futures_baseball';
const SOURCE_ID = 'affiliate_source_nw_futures_baseball';
const SOURCE_KEY = 'nw-futures-baseball';
const MAPPING_ID = 'affiliate_mapping_nw_futures_baseball_v1';
const PUBLIC_SLUG = 'nw-futures-baseball';
const ORGANIZATION_NAME = 'NW Futures Baseball';
const LOGO_FILE_ID = 'affiliate_file_nw_futures_baseball_logo';
const LOGO_FILE_NAME = 'nw-futures-baseball-logo-square.png';
const LOGO_BACKGROUND = '#171717';
const LOGO_SAFE_MARK_WIDTH = 850;
const LOGO_SAFE_MARK_HEIGHT = 430;

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: NW_FUTURES_BASEBALL_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'The reviewed robots.txt allows public pages, excludes only /wp-admin/, and asks crawlers to use a 10-second delay. The setup uses reviewed static source data and does not run unattended.',
  reviewedUrls: [NW_FUTURES_BASEBALL_HOME_URL, NW_FUTURES_BASEBALL_SUMMER_CAMP_URL, NW_FUTURES_BASEBALL_FALL_BALL_URL],
  officialLogoSourceUrl: NW_FUTURES_BASEBALL_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official NW Futures rendered site-header asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official transparent wide NW Futures header mark is trimmed and centered on one opaque charcoal 1024px canvas; no transparent or inset background is retained.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'NW Futures Baseball Summer Camp - June 22-July 17 sessions',
      sourceUrl: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
      reason: 'The listed sessions start before the July 15, 2026 source review date and are not imported as future candidates.',
    },
    {
      title: 'NW Futures Fall Ball 2026',
      sourceUrl: NW_FUTURES_BASEBALL_FALL_BALL_URL,
      reason: 'The page states September-October 2026 but the only action says registration will open soon; it has no current registration URL, price, detailed schedule, or published capacity.',
    },
    {
      title: 'NW Futures travel-team tryouts',
      sourceUrl: NW_FUTURES_BASEBALL_HOME_URL,
      reason: 'The public site links to a TeamSnap tryout form but does not state a current year, date, time, price, or venue, so it is not inferred as a future event.',
    },
    {
      title: 'NW Futures travel teams',
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
  const response = await fetch(NW_FUTURES_BASEBALL_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch NW Futures Baseball logo: ${response.status} ${response.statusText}`);

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('NW Futures Baseball logo normalization did not produce an opaque 1024x1024 PNG.');
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
  const coordinates = await geocodeAddressToCoordinates(NW_FUTURES_BASEBALL_ADDRESS);
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Vancouver, WA',
    address: NW_FUTURES_BASEBALL_ADDRESS,
    description: NW_FUTURES_BASEBALL_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: NW_FUTURES_BASEBALL_HOME_URL,
    sports: ['Baseball'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'NW Futures youth baseball training and programs',
    publicIntroText: 'Explore official NW Futures Baseball camps, player development, and current program information.',
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
    baseUrl: NW_FUTURES_BASEBALL_HOME_URL,
    listUrl: NW_FUTURES_BASEBALL_SUMMER_CAMP_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Public NW Futures Baseball source. It retains the club listing and only remaining future 2026 summer-camp sessions with the source-controlled TeamSnap registration page.',
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
      mapping: NW_FUTURES_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual NW Futures Baseball club and future summer-camp mapping reviewed from public source pages on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: NW_FUTURES_BASEBALL_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual NW Futures Baseball club and future summer-camp mapping reviewed from public source pages on July 15, 2026.',
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

  console.log(`NW Futures Baseball affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${NW_FUTURES_BASEBALL_MANUAL_CANDIDATES.length} reviewed candidates configured.`);
  console.log(`${sourceMetadata.withheldRows.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: NW_FUTURES_BASEBALL_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed NW Futures Baseball candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-nw-futures-baseball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
