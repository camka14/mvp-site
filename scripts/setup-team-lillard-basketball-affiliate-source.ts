/**
 * Team Lillard Basketball policy-blocked affiliate source setup.
 *
 * Owns public organization `affiliate_org_team_lillard_basketball` and source
 * `affiliate_source_team_lillard_basketball`. Team Lillard's robots.txt
 * explicitly disallows GPTBot, so this script never writes a scrape mapping,
 * runs a scrape, or enables a schedule. It only repairs the manually reviewed
 * public organization profile and its official logo.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import {
  TEAM_LILLARD_AUTOMATION_POLICY,
  TEAM_LILLARD_HOME_URL,
  TEAM_LILLARD_LOGO_SOURCE_URL,
  TEAM_LILLARD_ORG_DESCRIPTION,
  TEAM_LILLARD_ROBOTS_URL,
} from '../src/server/affiliateImports/teamLillardBasketballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
}
if (process.argv.includes('--scrape')) {
  throw new Error('Team Lillard disallows automated scraping through robots.txt; --scrape is unavailable.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
let prisma: PrismaClientInstance;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_team_lillard_basketball';
const SOURCE_ID = 'affiliate_source_team_lillard_basketball';
const SOURCE_KEY = 'team-lillard-basketball';
const CLUB_NAME = 'Team Lillard Basketball';
const LOGO_FILE_ID = 'affiliate_file_team_lillard_basketball_logo';
const LOGO_FILE_NAME = 'team-lillard-basketball-logo-square.png';
const LOGO_BACKGROUND = '#050505';

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: TEAM_LILLARD_ROBOTS_URL,
  robotsAllowed: false,
  robotsNote: TEAM_LILLARD_AUTOMATION_POLICY.reason,
  reviewedUrls: TEAM_LILLARD_AUTOMATION_POLICY.reviewedPublicPages,
  officialLogoSourceUrl: TEAM_LILLARD_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'SportsEngine site logo asset',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  cadence: 'disabled',
  withheldRows: TEAM_LILLARD_AUTOMATION_POLICY.withheldRows,
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
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

const normalizeLogo = async (input: Buffer): Promise<Buffer> => (
  sharp(input, { animated: false })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'cover' })
    .flatten({ background: LOGO_BACKGROUND })
    .removeAlpha()
    .png()
    .toBuffer()
);

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(TEAM_LILLARD_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Team Lillard logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Team Lillard logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate the local object when the database row outlives its stored file.
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
    name: CLUB_NAME,
    location: null,
    address: null,
    description: TEAM_LILLARD_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: TEAM_LILLARD_HOME_URL,
    sports: ['Basketball'],
    status: 'LISTED',
    coordinates: null,
    publicSlug: 'team-lillard-basketball',
    publicPageEnabled: true,
    publicHeadline: 'Team Lillard Basketball',
    publicIntroText: 'Explore Team Lillard Basketball and follow its official site for current program information.',
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

const upsertPolicyBlockedSource = async () => {
  const source = {
    name: CLUB_NAME,
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: TEAM_LILLARD_HOME_URL,
    listUrl: TEAM_LILLARD_HOME_URL,
    targetKind: 'CLUB',
    status: 'POLICY_BLOCKED',
    activeMappingId: null,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Robots.txt explicitly disallows GPTBot. No automated scrape mapping, run, or schedule is permitted. The public club profile is maintained only from the manually reviewed source material.',
    metadata: sourceMetadata,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...source },
    update: source,
  });
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertPolicyBlockedSource();

  console.log(`Team Lillard policy-blocked source ready: ${SOURCE_KEY}`);
  console.log(`Official opaque logo ready: ${logoId}.`);
  console.log('No mapping, scrape, schedule, event, or team candidate was created because the source disallows GPTBot.');
};

main()
  .catch((error) => {
    console.error('[setup-team-lillard-basketball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
