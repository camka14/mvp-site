/**
 * FC Piamonte affiliate club setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte`.
 * Official URLs:
 * - Club: https://www.fcpiamonte.org/
 * - Available programs: https://www.fcpiamonte.org/Default.aspx?tabid=1069925
 *
 * Creates/repairs the public club org and official logo. It does not create
 * team candidates because team registrations are intentionally out of scope
 * for this pass. Safe for local or live DB; use `--live` for live.
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte';
const BASE_URL = 'https://www.fcpiamonte.org/';
const PROGRAMS_URL = 'https://www.fcpiamonte.org/Default.aspx?tabid=1069925';
const LOGO_SOURCE_URL = 'https://www.fcpiamonte.org/Portals/52932/logo637552295057211448.png';
const CLUB_DESCRIPTION = 'FC Piamonte is an Oregon Youth Soccer Association member club offering year-round soccer for boys and girls, with age-group teams from early elementary through high school and games in the Vancouver and Portland metro area.';

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
    throw new Error(`Failed to fetch FC Piamonte logo: HTTP ${response.status}`);
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
    originalName: 'fc-piamonte-logo-square.png',
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
      originalName: 'fc-piamonte-logo-square.png',
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
      originalName: 'fc-piamonte-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Vancouver, WA');
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'FC Piamonte',
      location: 'Vancouver, WA / Portland metro',
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
      publicSlug: 'fc-piamonte',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'FC Piamonte programs',
      publicIntroText: 'Explore FC Piamonte age-group soccer programs and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'FC Piamonte',
      location: 'Vancouver, WA / Portland metro',
      address: null,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'fc-piamonte',
      publicPageEnabled: true,
      publicHeadline: 'FC Piamonte programs',
      publicIntroText: 'Explore FC Piamonte age-group soccer programs and official registration links.',
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
      title: 'FC Piamonte',
      publishedOrganizationId: ORG_ID,
    },
    data: {
      status: 'PUBLISHED',
      officialActionUrl: BASE_URL,
      sourceUrl: BASE_URL,
      warnings: [
        'Sports Connect available-program rows are active season team/player registrations and are intentionally not imported as teams in this pass.',
        'No source-dated standalone tryout, camp, tournament, or clinic event candidate was found during the 2026-07-09 review.',
        'The official site says FC Piamonte practices in Vancouver, WA and plays in Vancouver and the Portland metro area; no fixed public facility address is published.',
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
  console.log('FC Piamonte public org ready: fc-piamonte');
  console.log(`Team registration rows remain source-only for now: ${PROGRAMS_URL}`);
};

main()
  .catch((error) => {
    console.error('[setup-fc-piamonte-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
