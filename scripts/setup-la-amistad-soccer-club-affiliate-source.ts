/**
 * La Amistad Soccer Club affiliate club setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_la_amistad_soccer_club`.
 * Official URLs:
 * - Club: https://clubs.bluesombrero.com/laamsoc
 *
 * Creates/repairs the public club org and official logo. It does not create
 * event candidates because visible tryout and league rows are stale. Safe for
 * local or live DB; use `--live` for live.
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_la_amistad_soccer_club';
const BASE_URL = 'https://clubs.bluesombrero.com/laamsoc';
const LOGO_SOURCE_URL = 'https://clubs.bluesombrero.com/Portals/2740/logo636887231863545618.png';
const ADDRESS = '4737 SE 136th Ave, Portland, OR 97236';
const CLUB_DESCRIPTION = 'La Amistad Soccer Club is a Southeast Portland youth soccer club that provides competitive training and lower-cost league opportunities for youth players, with programs historically serving outdoor, indoor, winter, spring, and summer soccer.';

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
    throw new Error(`Failed to fetch La Amistad Soccer Club logo: HTTP ${response.status}`);
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
    originalName: 'la-amistad-soccer-club-logo-square.png',
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
      originalName: 'la-amistad-soccer-club-logo-square.png',
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
      originalName: 'la-amistad-soccer-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates(ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'La Amistad Soccer Club',
      location: 'Portland, OR',
      address: ADDRESS,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: 'la-amistad-soccer-club',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'La Amistad Soccer Club programs',
      publicIntroText: 'Explore La Amistad Soccer Club programs, field locations, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'La Amistad Soccer Club',
      location: 'Portland, OR',
      address: ADDRESS,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'la-amistad-soccer-club',
      publicPageEnabled: true,
      publicHeadline: 'La Amistad Soccer Club programs',
      publicIntroText: 'Explore La Amistad Soccer Club programs, field locations, and official registration links.',
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
      title: 'La Amistad Soccer Club',
      publishedOrganizationId: ORG_ID,
    },
    data: {
      status: 'PUBLISHED',
      officialActionUrl: BASE_URL,
      sourceUrl: BASE_URL,
      warnings: [
        'The older laamistadsoccerclub.com domain did not respond during review; the Sports Connect page is the reachable official source.',
        'Visible tryout and league registration news is from 2019-2020 and is intentionally not imported as current event candidates.',
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
  console.log('La Amistad Soccer Club public org ready: la-amistad-soccer-club');
  console.log('No event candidates were created; visible tryout and league rows are stale.');
};

main()
  .catch((error) => {
    console.error('[setup-la-amistad-soccer-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
