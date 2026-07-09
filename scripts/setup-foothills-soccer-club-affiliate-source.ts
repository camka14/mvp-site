/**
 * Foothills Soccer Club affiliate club setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_foothills_soccer_club`.
 * Official URLs:
 * - Club: https://foothillssoccer.org/
 * - Tryouts: https://foothillssoccer.org/tryouts-may-2026/
 * - Camps: https://foothillssoccer.org/activities/soccer-camps/
 *
 * Creates/repairs the public club org and official logo. It does not create
 * event candidates because current tryout rows are past and camp pages do not
 * expose current future-year source dates. Safe for local or live DB; use
 * `--live` for live.
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_foothills_soccer_club';
const BASE_URL = 'https://foothillssoccer.org/';
const LOGO_SOURCE_URL = 'https://foothillssoccer.org/wp-content/uploads/2022/02/FSC-Logo-Bug.png';
const CLUB_DESCRIPTION = 'Foothills Soccer Club is a Southwest Portland nonprofit youth soccer club offering recreational soccer, academy soccer, developmental academy programs, Pre-K and Kinder soccer, scholarships, and community-based player development.';

const normalizeLogo = async (source: Buffer): Promise<Buffer> => {
  const background = '#ffffff';
  const base = await sharp(source, { animated: false }).rotate().png().toBuffer();
  const trimmed = await sharp(base)
    .trim({ threshold: 12 })
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(base).flatten({ background }).png().toBuffer());
  const logo = await sharp(trimmed)
    .resize({ width: 820, height: 820, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 820;
  const height = metadata.height ?? 820;
  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .png()
    .toBuffer();
};

const fetchLogo = async (): Promise<Buffer> => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Foothills Soccer Club logo: HTTP ${response.status}`);
  }
  return normalizeLogo(Buffer.from(await response.arrayBuffer()));
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

const upsertLogo = async (ownerId: string) => {
  const data = await fetchLogo();
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
  const fileId = `${ORG_ID}_logo_square_${hash}`;
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'foothills-soccer-club-logo-square.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  await (prisma as any).file.upsert({
    where: { id: fileId },
    create: {
      id: fileId,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'foothills-soccer-club-logo-square.png',
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
      originalName: 'foothills-soccer-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Portland, OR');
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Foothills Soccer Club',
      location: 'Portland, OR',
      address: null,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: 'foothills-soccer-club',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Foothills Soccer Club programs',
      publicIntroText: 'Explore Foothills Soccer Club recreational soccer, academy soccer, camps, tryouts, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Foothills Soccer Club',
      location: 'Portland, OR',
      address: null,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'foothills-soccer-club',
      publicPageEnabled: true,
      publicHeadline: 'Foothills Soccer Club programs',
      publicIntroText: 'Explore Foothills Soccer Club recreational soccer, academy soccer, camps, tryouts, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const markDirectoryCandidatePublished = async () => {
  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      listingKind: 'CLUB',
      title: 'Foothills Soccer Club',
      publishedOrganizationId: ORG_ID,
    },
    data: {
      status: 'PUBLISHED',
      officialActionUrl: BASE_URL,
      sourceUrl: BASE_URL,
      warnings: [
        'Foothills public tryout pages list May 11-12, 2026 and are past as of July 2026.',
        'Foothills soccer camp page lists date ranges without a current future year, so no camp candidate is created.',
        'The club publishes a P.O. box, not a fixed public facility address; org discovery uses Portland, OR.',
      ],
      updatedAt: new Date(),
    },
  });
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await markDirectoryCandidatePublished();
  console.log('Foothills Soccer Club public org ready: foothills-soccer-club');
  console.log('No event candidates were created; current tryout dates are past and camp dates lack a current future year.');
};

main()
  .catch((error) => {
    console.error('[setup-foothills-soccer-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
