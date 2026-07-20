/**
 * Cascade Athletic Clubs Gresham affiliate source setup.
 *
 * Owns the local public organization, normalized official logo, manual
 * evergreen program/rental mapping, and source-intake provenance. This setup
 * is intentionally local-only and rejects --live.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  CASCADE_GRESHAM_ADDRESS,
  CASCADE_GRESHAM_CLUB_AUTOMATION_URL,
  CASCADE_GRESHAM_HOME_URL,
  CASCADE_GRESHAM_LIST_URL,
  CASCADE_GRESHAM_LOGO_SOURCE_URL,
  CASCADE_GRESHAM_MANUAL_CANDIDATES,
  CASCADE_GRESHAM_MAPPING,
  CASCADE_GRESHAM_ORG_DESCRIPTION,
  CASCADE_GRESHAM_SOURCE_EVIDENCE,
  CASCADE_GRESHAM_STATIC_PAGE_CLIENT,
  CASCADE_GRESHAM_TENNIS_DOUBLES_FORM_URL,
  CASCADE_GRESHAM_WITHHELD_ROWS,
} from '../src/server/affiliateImports/cascadeAthleticClubsGreshamSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('Cascade Athletic Clubs Gresham source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORGANIZATION_NAME = 'Cascade Athletic Clubs Gresham';
const ORG_ID = 'affiliate_org_cascade_athletic_clubs_gresham';
const LOGO_FILE_ID = 'affiliate_file_cascade_athletic_clubs_gresham_logo';
const LOGO_FILE_NAME = 'cascade-athletic-clubs-gresham-logo-square.png';
const SOURCE_ID = 'affiliate_source_cascade_athletic_clubs_gresham_sports_programs';
const SOURCE_KEY = 'cascade-athletic-clubs-gresham-sports-programs';
const MAPPING_ID = 'affiliate_mapping_cascade_athletic_clubs_gresham_sports_programs_v1';
const PUBLIC_SLUG = 'cascade-athletic-clubs-gresham';
const LOGO_BACKGROUND = '#ffffff';
const LOGO_SAFE_MARK_WIDTH = 760;
const LOGO_SAFE_MARK_HEIGHT = 360;
const ORG_SPORTS = ['Basketball', 'Pickleball', 'Racquetball', 'Tennis'];

const sourceMetadata = {
  inspectedAt: '2026-07-20',
  robotsAllowed: true,
  robotsNote: 'The stored cascadeac.com robots policy allows public pages outside /wp-admin/. ClubAutomation disallows / and remains an outbound-only action target.',
  reviewedUrls: CASCADE_GRESHAM_SOURCE_EVIDENCE.pages.map((page) => page.url),
  supplementalDetailReview: {
    reviewedAt: '2026-07-20',
    reason: 'The completed intake captured the home and sports hub but not detail-page artifacts, so the listed official detail pages were reviewed directly only to refresh exact program fields.',
  },
  sourceEvidence: CASCADE_GRESHAM_SOURCE_EVIDENCE,
  officialLogoSourceUrl: CASCADE_GRESHAM_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official Cascade Athletic Clubs rendered header asset selected by stored PAGE_BRANDING evidence',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote: 'The official blue wordmark is trimmed and centered in a safe 760x360 region on one opaque white 1024px canvas.',
  externalSystems: {
    clubAutomationUrl: CASCADE_GRESHAM_CLUB_AUTOMATION_URL,
    tennisDoublesFormUrl: CASCADE_GRESHAM_TENNIS_DOUBLES_FORM_URL,
  },
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: CASCADE_GRESHAM_WITHHELD_ROWS,
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
    .trim({ background: { r: 255, g: 255, b: 255, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const mark = await sharp(trimmed)
    .resize({
      width: LOGO_SAFE_MARK_WIDTH,
      height: LOGO_SAFE_MARK_HEIGHT,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(mark).metadata();
  const width = metadata.width ?? LOGO_SAFE_MARK_WIDTH;
  const height = metadata.height ?? LOGO_SAFE_MARK_HEIGHT;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{ input: mark, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertOrganization = async (ownerId: string, logoId: string | null) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { sports: true, coordinates: true },
  });
  const coordinates = existing?.coordinates ?? await geocodeAddressToCoordinates(CASCADE_GRESHAM_ADDRESS);
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...ORG_SPORTS]));
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Gresham, OR',
    address: CASCADE_GRESHAM_ADDRESS,
    description: CASCADE_GRESHAM_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: CASCADE_GRESHAM_LIST_URL,
    sports,
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicWidgetsEnabled: false,
    publicHeadline: 'Cascade Athletic Clubs Gresham programs',
    publicIntroText: 'Find Cascade Gresham sports programs, court reservations, youth programs, and official club links.',
    taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
    operatesAthleticFacility: true,
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
      ...organization,
    },
    update: organization,
  });
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(CASCADE_GRESHAM_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download Cascade logo: ${response.status} ${response.statusText}`);
  }
  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Cascade logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate missing local storage instead of retaining a stale File row.
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

const upsertSourceAndMapping = async () => {
  const source = {
    name: 'Cascade Athletic Clubs Gresham Sports Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: CASCADE_GRESHAM_HOME_URL,
    listUrl: CASCADE_GRESHAM_LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Reviewed manual Cascade Gresham evergreen source. Public WordPress pages support five program rows and one rental; ClubAutomation and Google Forms remain outbound-only.',
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
      mapping: CASCADE_GRESHAM_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Reviewed Cascade Gresham basketball, pickleball, racquetball, tennis, and court-reservation mapping refreshed July 20, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: CASCADE_GRESHAM_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Reviewed Cascade Gresham basketball, pickleball, racquetball, tennis, and court-reservation mapping refreshed July 20, 2026.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const reconcileCandidateIdentities = async (): Promise<{ migrated: number; removed: number }> => {
  const { buildAffiliateCandidateDedupeKey, deleteAffiliateCandidate } = await import('../src/server/affiliateImports/service');
  const expected = CASCADE_GRESHAM_MANUAL_CANDIDATES.map((candidate, sourceIndex) => ({
    sourceIndex,
    dedupeKey: buildAffiliateCandidateDedupeKey(SOURCE_ID, candidate, CASCADE_GRESHAM_MAPPING),
  }));
  const expectedKeys = new Set(expected.map((candidate) => candidate.dedupeKey));
  let existing = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID, status: { not: 'PUBLISHED' } },
    select: {
      id: true,
      status: true,
      dedupeKey: true,
      rawPayload: true,
    },
  });
  const published = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID, status: 'PUBLISHED' },
    select: { id: true, status: true, dedupeKey: true, rawPayload: true },
  });
  existing = [...existing, ...published];

  let migrated = 0;
  let removed = 0;
  for (const expectedCandidate of expected) {
    const legacyPublished = existing.find((candidate: any) => (
      candidate.status === 'PUBLISHED'
      && candidate.dedupeKey !== expectedCandidate.dedupeKey
      && candidate.rawPayload?.sourceIndex === expectedCandidate.sourceIndex
    ));
    if (!legacyPublished) continue;

    const replacement = existing.find((candidate: any) => (
      candidate.id !== legacyPublished.id && candidate.dedupeKey === expectedCandidate.dedupeKey
    ));
    if (replacement?.status === 'PUBLISHED') {
      throw new Error(`Cannot reconcile Cascade source index ${expectedCandidate.sourceIndex}: two published candidates exist.`);
    }
    if (replacement) {
      await deleteAffiliateCandidate(replacement.id);
      removed += 1;
      existing = existing.filter((candidate: any) => candidate.id !== replacement.id);
    }
    await (prisma as any).affiliateImportCandidates.update({
      where: { id: legacyPublished.id },
      data: { dedupeKey: expectedCandidate.dedupeKey, updatedAt: new Date() },
    });
    legacyPublished.dedupeKey = expectedCandidate.dedupeKey;
    migrated += 1;
  }

  const superseded = existing.filter((candidate: any) => (
    candidate.status !== 'PUBLISHED' && !expectedKeys.has(candidate.dedupeKey)
  ));
  for (const candidate of superseded) {
    await deleteAffiliateCandidate(candidate.id);
    removed += 1;
  }
  return { migrated, removed };
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const existingLogo = await (prisma as any).file.findUnique({ where: { id: LOGO_FILE_ID }, select: { id: true } });
  await upsertOrganization(owner.id, existingLogo?.id ?? null);
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`Cascade Athletic Clubs Gresham affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${CASCADE_GRESHAM_MANUAL_CANDIDATES.length} reviewed candidates configured.`);
  console.log(`${CASCADE_GRESHAM_WITHHELD_ROWS.length} source row group(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const reconciled = await reconcileCandidateIdentities();
    if (reconciled.migrated || reconciled.removed) {
      console.log(`Reconciled ${reconciled.migrated} published identity migration(s) and removed ${reconciled.removed} superseded candidate(s).`);
    }
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: CASCADE_GRESHAM_STATIC_PAGE_CLIENT });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed Cascade candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-cascade-athletic-clubs-gresham-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
