/**
 * CYO / Camp Howard Sports affiliate source setup.
 *
 * Owns public organization `affiliate_org_cyo_camp_howard_sports`, source
 * `affiliate_source_cyo_camp_howard_sports`, mapping
 * `affiliate_mapping_cyo_camp_howard_sports_v1`, and one ongoing CLUB
 * candidate. Official pages: https://www.cyocamphoward.org/ and the public
 * CYO Sports registration hub. Owner: samuel.r@razumly.com.
 *
 * This script is local-only. It never creates an undated season event or a
 * school-team candidate. Pass `--scrape` to save or update the CLUB candidate.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  CYO_CAMP_HOWARD_ADDRESS,
  CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL,
  CYO_CAMP_HOWARD_HOME_URL,
  CYO_CAMP_HOWARD_LOGO_SOURCE_URL,
  CYO_CAMP_HOWARD_MANUAL_CANDIDATES,
  CYO_CAMP_HOWARD_MAPPING,
  CYO_CAMP_HOWARD_ORG_DESCRIPTION,
  CYO_CAMP_HOWARD_ROBOTS_URL,
  CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
  CYO_CAMP_HOWARD_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/cyoCampHowardSportsSource';

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
const ORG_ID = 'affiliate_org_cyo_camp_howard_sports';
const SOURCE_ID = 'affiliate_source_cyo_camp_howard_sports';
const SOURCE_KEY = 'cyo-camp-howard-sports';
const MAPPING_ID = 'affiliate_mapping_cyo_camp_howard_sports_v1';
const PUBLIC_SLUG = 'cyo-camp-howard-sports';
const ORGANIZATION_NAME = 'CYO / Camp Howard Sports';
const LOGO_FILE_ID = 'affiliate_file_cyo_camp_howard_sports_logo';
const LOGO_FILE_NAME = 'cyo-camp-howard-sports-logo-square.png';
const LOGO_BACKGROUND = '#008a3e';
const LOGO_SAFE_MARK_SIZE = 720;

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: CYO_CAMP_HOWARD_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote:
    'The reviewed robots.txt allows normal public crawling and specifically blocks only MJ12bot, AhrefsBot, SemrushBot, and PetalBot.',
  reviewedUrls: [
    CYO_CAMP_HOWARD_HOME_URL,
    CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
    CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL,
  ],
  officialLogoSourceUrl: CYO_CAMP_HOWARD_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official CYO site header/icon asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official CYO mark is centered inside a safe 720px area on one full CYO-green canvas, flattened to PNG, and contains no alpha or inset background rectangle.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'CYO Boys Volleyball 2026-27',
      sourceUrl: CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL,
      reason:
        'The official page states an August-November season and open grade-specific applications, but it does not publish one event start date, time, or venue. It remains linked from the public CYO organization rather than becoming an undated event.',
    },
    {
      title: 'CYO school-club basketball, volleyball, cross country, swimming, and track rows',
      sourceUrl: CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
      reason:
        'The source routes families through participating schools and sport-specific pages. It does not expose stable roster-level registration targets, so TEAM candidates are not created.',
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
  const logo = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: LOGO_SAFE_MARK_SIZE, height: LOGO_SAFE_MARK_SIZE, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 900;
  const height = metadata.height ?? 900;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{ input: logo, left: Math.round((1024 - width) / 2), top: Math.round((1024 - height) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(CYO_CAMP_HOWARD_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch CYO / Camp Howard Sports logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('CYO / Camp Howard Sports logo normalization did not produce an opaque 1024x1024 PNG.');
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
  const coordinates = await geocodeAddressToCoordinates(CYO_CAMP_HOWARD_ADDRESS);
  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Portland, OR',
    address: CYO_CAMP_HOWARD_ADDRESS,
    description: CYO_CAMP_HOWARD_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: CYO_CAMP_HOWARD_HOME_URL,
    sports: ['Basketball', 'Indoor Volleyball', 'Cross Country', 'Swimming', 'Track & Field'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'CYO / Camp Howard youth sports',
    publicIntroText: 'Explore CYO / Camp Howard school-based youth sports programs and official registration information.',
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
    baseUrl: CYO_CAMP_HOWARD_HOME_URL,
    listUrl: CYO_CAMP_HOWARD_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes:
      'Public CYO / Camp Howard Sports source. It creates one ongoing organization listing. School-based programs remain withheld until the source publishes dated, venue-specific event rows or stable roster-level actions.',
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
      mapping: CYO_CAMP_HOWARD_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual CYO / Camp Howard public organization mapping reviewed on July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: CYO_CAMP_HOWARD_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual CYO / Camp Howard public organization mapping reviewed on July 15, 2026.',
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
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME, publishedOrganizationId: { not: null } },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    rows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME },
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
      console.warn(`Preserved generated CYO / Camp Howard duplicate because dependencies exist: ${duplicateOrgId}`);
      continue;
    }
    await (prisma as any).organizations.deleteMany({
      where: { id: duplicateOrgId, name: ORGANIZATION_NAME, website: CYO_CAMP_HOWARD_HOME_URL },
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

  console.log(`CYO / Camp Howard Sports affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${CYO_CAMP_HOWARD_MANUAL_CANDIDATES.length} ongoing club candidate configured.`);
  console.log(`${sourceMetadata.withheldRows.length} source row(s) withheld.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: CYO_CAMP_HOWARD_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed CYO / Camp Howard organization listing.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-cyo-camp-howard-sports-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
