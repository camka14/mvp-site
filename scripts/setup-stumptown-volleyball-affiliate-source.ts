/**
 * Stumptown Volleyball Club affiliate source setup.
 *
 * Owns public club org `affiliate_org_stumptown_volleyball_club`, source
 * `affiliate_source_stumptown_volleyball_club`, and mapping
 * `affiliate_mapping_stumptown_volleyball_club_v1`.
 *
 * Official pages: https://www.stumptownvb.com/, /tryouts, /schedule, /training.
 * Creates/repairs the public club source and manual club/program candidates.
 * This source setup is local-only; use `--scrape` to create/update candidates.
 * This setup fetches and normalizes the official logo into the organization
 * logo file used by cards, detail views, list icons, and map markers.
 */
import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ABOUT_URL,
  LOGO_SOURCE_URL,
  MAPPING_ID,
  ORG_DESCRIPTION,
  ORG_ID,
  ORG_NAME,
  OWNER_EMAIL,
  PUBLIC_SLUG,
  SCHEDULE_URL,
  SOURCE_ID,
  SOURCE_KEY,
  SOURCE_URL,
  TRAINING_URL,
  TRYOUTS_URL,
  WITHHELD_ROWS,
  mapping,
  staticManualPageClient,
} from '../src/server/affiliateImports/stumptownVolleyballSource';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(process.cwd(), '.env.local'), override: false });

if (process.argv.includes('--live')) {
  throw new Error('This source-agent setup is local-only. Do not pass --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const LOGO_FILE_ID = 'affiliate_file_stumptown_volleyball_club_logo';
const LOGO_BACKGROUND = '#ffffff';

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
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

const normalizeLogo = async (source: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(source, { animated: false })
    .rotate()
    .trim({ threshold: 8 })
    .flatten({ background: LOGO_BACKGROUND })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({ width: 900, height: 620, fit: 'inside', withoutEnlargement: false })
    .removeAlpha()
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 900;
  const height = metadata.height ?? 620;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: LOGO_BACKGROUND,
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
    throw new Error(`Failed to fetch Stumptown Volleyball Club logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'stumptown-volleyball-club-logo-square.png',
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
      originalName: 'stumptown-volleyball-club-logo-square.png',
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
      originalName: 'stumptown-volleyball-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });

  console.log(`Normalized official logo: ${LOGO_FILE_ID} (${hash})`);
  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Portland, OR');
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORG_NAME,
      location: 'Portland, OR',
      address: null,
      description: ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: SOURCE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Stumptown Volleyball Club programs',
      publicIntroText:
        'Review Stumptown Volleyball Club teams, tryouts, training, sand sessions, tournament opportunities, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORG_NAME,
      location: 'Portland, OR',
      address: null,
      description: ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: SOURCE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Stumptown Volleyball Club programs',
      publicIntroText:
        'Review Stumptown Volleyball Club teams, tryouts, training, sand sessions, tournament opportunities, and registration links.',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const metadata = {
    inspectedAt: '2026-07-15',
    robotsAllowed: true,
    robotsNote:
      'stumptownvb.com robots.txt allows public pages and disallows only lightbox query URLs for normal agents; PetalBot is blocked and selected crawlers have a delay.',
    logoSourceUrl: LOGO_SOURCE_URL,
    logoStatus: 'VERIFIED_OFFICIAL',
    logoNormalizedFormat: 'opaque-1024-square-png',
    logoNote:
      'Official transparent 1200x457 Stumptown wordmark flattened onto a full opaque white canvas; no inner background box is retained.',
    officialPages: [SOURCE_URL, ABOUT_URL, TRYOUTS_URL, SCHEDULE_URL, TRAINING_URL],
    withheldRows: WITHHELD_ROWS,
    limitations: [
      'Tryouts and schedule pages remain labeled 2025-26 and omit years from dates.',
      'The public calendar is an embedded link without crawlable event rows in the rendered page.',
      'Training program locations and times are TBD; no rental inventory is published.',
    ],
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: ORG_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: SOURCE_URL,
      listUrl: SOURCE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public Stumptown club source. Creates a public club candidate and evergreen training summaries; dated 2025-26 tryouts and tournament schedule rows are withheld until the source publishes current year/date/location data.',
      metadata,
    },
    update: {
      name: ORG_NAME,
      organizationId: ORG_ID,
      baseUrl: SOURCE_URL,
      listUrl: SOURCE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public Stumptown club source. Creates a public club candidate and evergreen training summaries; dated 2025-26 tryouts and tournament schedule rows are withheld until the source publishes current year/date/location data.',
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
      mapping: mapping as AffiliateScrapeMapping,
      createdByUserId: null,
      notes:
        'Manual Stumptown club and evergreen training mapping generated from the public homepage, about, tryouts, schedule, calendar, and training pages inspected 2026-07-15.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: mapping as AffiliateScrapeMapping,
      notes:
        'Manual Stumptown club and evergreen training mapping generated from the public homepage, about, tryouts, schedule, calendar, and training pages inspected 2026-07-15.',
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
      title: ORG_NAME,
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
      title: ORG_NAME,
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
        name: ORG_NAME,
        website: SOURCE_URL,
      },
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

  console.log(`Stumptown Volleyball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`Mapping: ${MAPPING_ID}`);
  console.log(`Manual candidates: ${mapping.manualCandidates?.length ?? 0}`);
  console.log(`Official logo: ${logoId} from ${LOGO_SOURCE_URL}`);
  console.log(`${WITHHELD_ROWS.length} row(s) withheld: stale dates, embedded calendar, or no public rental inventory.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    await relinkClubCandidateToSourceOrganization();
    // The generic scrape path creates an unpublished organization for a CLUB
    // candidate. Re-apply the canonical public source organization after the
    // scrape so reruns cannot regress its public status or description.
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update the club and evergreen training candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-stumptown-volleyball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
