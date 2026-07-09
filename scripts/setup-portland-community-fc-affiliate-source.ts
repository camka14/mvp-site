/**
 * Portland Community FC affiliate club setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_portland_community_fc`.
 * Official URLs:
 * - Club: https://www.pcfc.co/
 * - Registration: https://www.pcfc.co/player-register
 * - Camps: https://www.pcfc.co/kick-it-forward
 *
 * Creates/repairs the public club org and official logo. It does not create
 * event candidates because registration is stale and camp rows omit a source
 * year. Safe for local or live DB; use `--live` for live.
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_portland_community_fc';
const BASE_URL = 'https://www.pcfc.co/';
const LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/5c492ab7c258b4ccafc87354/6a4f05b3-69b1-450e-9838-eb957b75ec76/PCFC+NEW+LOGO+BLACK+1450+PX+%281%29.png?format=1000w';
const CLUB_DESCRIPTION = 'Portland Community Football Club is a nonprofit Portland youth soccer club providing access, belonging, and opportunity through affordable club soccer, recreational and competitive pathways, camps, and wraparound family support for historically underserved youth ages 6-18.';

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
    .resize({ width: 880, height: 760, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 880;
  const height = metadata.height ?? 760;
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
    throw new Error(`Failed to fetch Portland Community FC logo: HTTP ${response.status}`);
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
    originalName: 'portland-community-fc-logo-square.png',
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
      originalName: 'portland-community-fc-logo-square.png',
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
      originalName: 'portland-community-fc-logo-square.png',
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
      name: 'Portland Community FC',
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
      publicSlug: 'portland-community-fc',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Portland Community FC programs',
      publicIntroText: 'Explore Portland Community FC recreational and competitive soccer pathways, camps, family support, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Community FC',
      location: 'Portland, OR',
      address: null,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'portland-community-fc',
      publicPageEnabled: true,
      publicHeadline: 'Portland Community FC programs',
      publicIntroText: 'Explore Portland Community FC recreational and competitive soccer pathways, camps, family support, and official registration links.',
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
      title: 'Portland Community FC',
      publishedOrganizationId: ORG_ID,
    },
    data: {
      status: 'PUBLISHED',
      officialActionUrl: BASE_URL,
      sourceUrl: BASE_URL,
      warnings: [
        'Spring Rec Registration is labeled 2025 and is intentionally not imported as current registration.',
        'Kick It Forward camp rows list July/August ranges without a source year, so no camp candidates are created.',
        'The club publishes a mailing address, not a fixed public field address; org discovery uses Portland, OR.',
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
  console.log('Portland Community FC public org ready: portland-community-fc');
  console.log('No event candidates were created; registration is stale and camp dates omit a source year.');
};

main()
  .catch((error) => {
    console.error('[setup-portland-community-fc-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
