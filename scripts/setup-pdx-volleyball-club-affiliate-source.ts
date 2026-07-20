/**
 * PDX Volleyball Club affiliate source setup.
 *
 * Owns public organization `affiliate_org_pdx_volleyball_club`, source
 * `affiliate_source_pdx_volleyball_club`, mapping
 * `affiliate_mapping_pdx_volleyball_club_v1`, one CLUB candidate, and two
 * future grass-camp EVENT candidates. The logo workflow below owns the official
 * footer wordmark normalization and organization logo association. Local DB only.
 * Use `--scrape` to create/update discovered candidates after setup.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PDX_VB_BASE_URL,
  PDX_VB_CALENDAR_URL,
  PDX_VB_CAMP_REGISTRATION_URL,
  PDX_VB_CAMP_URL,
  PDX_VB_CLINICS_REGISTRATION_URL,
  PDX_VB_CLINICS_URL,
  PDX_VB_COACHING_URL,
  PDX_VB_MAPPING,
  PDX_VB_ORG_DESCRIPTION,
  PDX_VB_PARKS_VOLLEYBALL_URL,
  PDX_VB_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/pdxVolleyballClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This PDX Volleyball Club setup is local-only and refuses --live.');
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
const ORG_ID = 'affiliate_org_pdx_volleyball_club';
const LOGO_FILE_ID = 'affiliate_file_pdx_volleyball_club_logo';
const SOURCE_ID = 'affiliate_source_pdx_volleyball_club';
const SOURCE_KEY = 'pdx-volleyball-club';
const MAPPING_ID = 'affiliate_mapping_pdx_volleyball_club_v1';
const PUBLIC_SLUG = 'pdx-volleyball-club';
const LOGO_SOURCE_URL = 'https://pdx-vb.com/wp-content/uploads/2013/10/pdxvb_bw-logo.png';
const LOGO_FILE_NAME = 'pdx-volleyball-club-logo-square.png';

const normalizeLogo = async (input: Buffer) => {
  const background = '#ffffff';
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({ width: 840, height: 840, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 840;
  const height = metadata.height ?? 840;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background,
    },
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
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download PDX Volleyball Club logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: LOGO_FILE_NAME,
    contentType: 'image/png',
    organizationId: ORG_ID,
  });

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

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Portland, OR');
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'PDX Volleyball Club',
      location: 'Portland, OR',
      address: null,
      description: PDX_VB_ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: PDX_VB_BASE_URL,
      sports: ['Indoor Volleyball', 'Grass Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'PDX VB volleyball programs and camps',
      publicIntroText: 'Explore PDX VB club volleyball information, skills clinics, summer camps, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'PDX Volleyball Club',
      location: 'Portland, OR',
      address: null,
      description: PDX_VB_ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: PDX_VB_BASE_URL,
      sports: ['Indoor Volleyball', 'Grass Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'PDX VB volleyball programs and camps',
      publicIntroText: 'Explore PDX VB club volleyball information, skills clinics, summer camps, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourceNotes =
    'Public PDX VB club source. The 2026-07-15 review found two future Portland Parks grass-camp rows, past June skills clinics, no current future tryout dates, and a Google Calendar embed without parseable event rows.';
  const metadata = {
    inspectedAt: '2026-07-15',
    robotsAllowed: true,
    robotsNote: 'https://pdx-vb.com/robots.txt allows public paths and disallows only /wp-admin/ except admin-ajax.php.',
    termsNote: 'No public anti-bot or no-scraping statement was found on the inspected public pages.',
    officialActionUrls: {
      campRegistration: PDX_VB_CAMP_REGISTRATION_URL,
      clinicsRegistration: PDX_VB_CLINICS_REGISTRATION_URL,
      parksVolleyball: PDX_VB_PARKS_VOLLEYBALL_URL,
    },
    inspectedPages: [
      PDX_VB_BASE_URL,
      PDX_VB_CAMP_URL,
      PDX_VB_CLINICS_URL,
      PDX_VB_CALENDAR_URL,
      PDX_VB_COACHING_URL,
    ],
    logoStatus: 'VERIFIED_OFFICIAL',
    logoSourceUrl: LOGO_SOURCE_URL,
    logoSourceType: 'Official rendered footer wordmark asset; the header uses the lower-resolution pdxvb-logo_xsmall.png variant.',
    logoSourceDimensions: '4964x2797 RGBA source; normalized to opaque 1024x1024 PNG on #ffffff.',
    logoNote: 'Official PDX VB footer wordmark was normalized onto a full-canvas white background for dark mark contrast and small icon stability.',
    cadence: 'weekly',
    cadenceIntervalMinutes: 10080,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'PDX Volleyball Club',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: PDX_VB_BASE_URL,
      listUrl: PDX_VB_BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata,
    },
    update: {
      name: 'PDX Volleyball Club',
      organizationId: ORG_ID,
      baseUrl: PDX_VB_BASE_URL,
      listUrl: PDX_VB_BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata,
    },
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
      mapping: PDX_VB_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual PDX VB club and future Portland Parks camp mapping. No placeholder logo or inferred tryout dates.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: PDX_VB_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual PDX VB club and future Portland Parks camp mapping. No placeholder logo or inferred tryout dates.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const duplicateRows = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'PDX Volleyball Club',
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    duplicateRows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'PDX Volleyball Club',
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  if (duplicateOrgIds.length > 0) {
    await (prisma as any).organizations.deleteMany({
      where: {
        id: { in: duplicateOrgIds },
        name: 'PDX Volleyball Club',
        website: PDX_VB_BASE_URL,
      },
    });
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`PDX Volleyball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`Mapping: ${MAPPING_ID}`);
  console.log(`Logo: ${LOGO_FILE_ID} from ${LOGO_SOURCE_URL}`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: PDX_VB_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-pdx-volleyball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
