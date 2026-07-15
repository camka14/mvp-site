/**
 * Pro Skills Basketball Portland Teams affiliate source setup.
 *
 * Owns the public club organization, source, mapping, one CLUB candidate, and
 * six dated tryout EVENT candidates for the official Portland teams page.
 * Official URLs: https://proskillsbasketball.com/portland/teams/ and the
 * linked proskillsportland.leagueapps.com registration detail pages.
 * Owner: samuel.r@razumly.com. Local DB only; --scrape creates/updates
 * candidates, while automation remains disabled and --live is refused.
 * The setup downloads the official logo, normalizes it into an opaque square,
 * and assigns it to the public organization.
 */
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PSB_PORTLAND_HOME_URL,
  PSB_PORTLAND_LOGO_SOURCE_URL,
  PSB_PORTLAND_MAPPING,
  PSB_PORTLAND_MANUAL_CANDIDATES,
  PSB_PORTLAND_ORG_DESCRIPTION,
  PSB_PORTLAND_STATIC_PAGE_CLIENT,
  PSB_PORTLAND_TEAMS_URL,
} from '../src/server/affiliateImports/proSkillsBasketballPortlandSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Pro Skills Basketball Portland setup is local-only and refuses --live.');
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
const ORG_ID = 'affiliate_org_pro_skills_basketball_portland';
const SOURCE_ID = 'affiliate_source_pro_skills_basketball_portland_teams';
const SOURCE_KEY = 'pro-skills-basketball-portland-teams';
const MAPPING_ID = 'affiliate_mapping_pro_skills_basketball_portland_teams_v1';
const PUBLIC_SLUG = 'pro-skills-basketball-portland';
const LOGO_FILE_ID = 'affiliate_file_pro_skills_basketball_portland_logo';
const LOGO_FILE_NAME = 'pro-skills-basketball-portland-logo-square.png';
// The official asset contains a black rectangular backing around the crest.
// Match it across the full canvas so no source-backed rectangle is visible.
const LOGO_BACKGROUND = '#000000';

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

const cityCoordinates = async () => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });

  try {
    return await geocodeAddressToCoordinates('Portland, OR') ?? existing?.coordinates ?? null;
  } catch {
    return existing?.coordinates ?? null;
  }
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png()
    .toBuffer();
  const logo = await sharp(trimmed)
    .resize({ width: 820, height: 900, fit: 'inside', withoutEnlargement: false })
    .removeAlpha()
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 820;
  const height = metadata.height ?? 900;

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
  const response = await fetch(PSB_PORTLAND_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Pro Skills Basketball Portland logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
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

  console.log(`Normalized official logo: ${LOGO_FILE_ID} (${hash})`);
  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await cityCoordinates();
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Pro Skills Basketball Portland',
      location: 'Portland, OR',
      address: null,
      description: PSB_PORTLAND_ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: PSB_PORTLAND_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Pro Skills Basketball Portland teams and tryouts',
      publicIntroText: 'Review PSB Portland youth basketball club information and current official tryout registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Pro Skills Basketball Portland',
      location: 'Portland, OR',
      address: null,
      description: PSB_PORTLAND_ORG_DESCRIPTION,
      logoId,
      ownerId,
      website: PSB_PORTLAND_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Pro Skills Basketball Portland teams and tryouts',
      publicIntroText: 'Review PSB Portland youth basketball club information and current official tryout registration links.',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsAllowed: true,
  robotsNote: 'proskillsbasketball.com/robots.txt allows the target page and only disallows /wp-admin/. proskillsportland.leagueapps.com/robots.txt has an empty Disallow rule and allows public detail pages.',
  termsNote: 'No visible anti-bot or no-scraping statement was found on the inspected public pages.',
  renderingRequired: true,
  renderingNote: 'The WordPress source page renders the listing cards, while the LeagueApps action pages require JavaScript; the mapping stores reviewed manual candidates using the detail-page payloads.',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceUrl: PSB_PORTLAND_LOGO_SOURCE_URL,
  logoSourceType: 'Official rendered Pro Skills Basketball header logo asset.',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote: 'Official transparent shield mark trimmed to its visible bounds and centered on a full opaque dark background. No transparency or inset background is retained.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  inspectedPages: [
    PSB_PORTLAND_TEAMS_URL,
    'https://proskillsportland.leagueapps.com/events/4813734-2026-season----portland-club-team-interest-form',
    ...PSB_PORTLAND_MANUAL_CANDIDATES
      .filter((candidate) => candidate.listingKind === 'EVENT')
      .map((candidate) => candidate.officialActionUrl),
  ],
  skippedRows: [
    {
      title: '2026 Season - Portland Club Team Interest Form',
      officialActionUrl: 'https://proskillsportland.leagueapps.com/events/4813734-2026-season----portland-club-team-interest-form',
      reason: 'The source card displays Nov. 1-Dec. 31 without a year, so it is not converted into a scheduled event. No separate TEAM candidate is created in this pass.',
    },
    {
      title: 'Portland club team registrations',
      reason: 'The page describes club teams and links to tryout/evaluation registrations, but this pass does not create separate TEAM records.',
    },
  ],
  sourceAnomalies: [
    'The list page has stale 2024-25 copy above the current rows; linked detail pages explicitly identify the 2026-2027 grade cycle and are authoritative for current candidates.',
    'The list page displays 10:30 AM to 11:45 PM for Grades 7th-8th; the linked detail page says 10:30 AM to 11:45 AM, which is mapped.',
  ],
};

const upsertSourceAndMapping = async () => {
  const sourceNotes =
    'Manual public club source for Pro Skills Basketball Portland. Produces one CLUB candidate and six future 2026 tryout/evaluation EVENT candidates; excludes the undated interest-form row and separate TEAM records. Auto scrape remains disabled pending review.';

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Pro Skills Basketball Portland Teams',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: PSB_PORTLAND_HOME_URL,
      listUrl: PSB_PORTLAND_TEAMS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: sourceMetadata,
    },
    update: {
      name: 'Pro Skills Basketball Portland Teams',
      organizationId: ORG_ID,
      baseUrl: PSB_PORTLAND_HOME_URL,
      listUrl: PSB_PORTLAND_TEAMS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata: sourceMetadata,
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
      mapping: PSB_PORTLAND_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual PSB Portland club and future tryout mapping from rendered WordPress and LeagueApps detail pages. No TEAM candidates or inferred interest-form dates.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: PSB_PORTLAND_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual PSB Portland club and future tryout mapping from rendered WordPress and LeagueApps detail pages. No TEAM candidates or inferred interest-form dates.',
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
      title: 'Pro Skills Basketball Portland',
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
      title: 'Pro Skills Basketball Portland',
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  for (const duplicateOrgId of duplicateOrgIds) {
    const [eventCount, facilityCount, teamCount] = await Promise.all([
      (prisma as any).events.count({ where: { organizationId: duplicateOrgId } }),
      (prisma as any).facilities.count({ where: { organizationId: duplicateOrgId } }),
      (prisma as any).canonicalTeams.count({ where: { organizationId: duplicateOrgId } }),
    ]);

    if (eventCount || facilityCount || teamCount) {
      console.warn(
        `Withheld duplicate org cleanup for ${duplicateOrgId}: ${eventCount} event(s), ${facilityCount} facilit${facilityCount === 1 ? 'y' : 'ies'}, ${teamCount} team(s) depend on it.`,
      );
      continue;
    }

    await (prisma as any).organizations.deleteMany({
      where: {
        id: duplicateOrgId,
        name: 'Pro Skills Basketball Portland',
        website: PSB_PORTLAND_HOME_URL,
      },
    });
  }

  // Club candidate ingestion defaults its target to UNLISTED and uses the
  // candidate action URL as the website. Restore the deliberate public source
  // organization after every local scrape, including its official logo.
  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      name: 'Pro Skills Basketball Portland',
      location: 'Portland, OR',
      address: null,
      description: PSB_PORTLAND_ORG_DESCRIPTION,
      ownerId: (await requireOwner()).id,
      website: PSB_PORTLAND_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Pro Skills Basketball Portland teams and tryouts',
      publicIntroText: 'Review PSB Portland youth basketball club information and current official tryout registration links.',
      operatesAthleticFacility: false,
    },
  });
};

const printSavedCandidateCounts = async () => {
  const rows = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID },
    select: { listingKind: true, status: true },
  });
  const counts = rows.reduce((summary: Record<string, number>, row: { listingKind: string; status: string }) => {
    const key = `${row.listingKind}:${row.status}`;
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
  console.log(`Saved candidate counts: ${JSON.stringify(counts)}`);
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`Pro Skills Basketball Portland affiliate source ready: ${SOURCE_KEY}`);
  console.log(`Mapping: ${MAPPING_ID}`);
  console.log(`Official logo: ${logoId} from ${PSB_PORTLAND_LOGO_SOURCE_URL}`);
  console.log(`${PSB_PORTLAND_MANUAL_CANDIDATES.length} manual candidates configured (1 CLUB, 6 EVENT, 0 TEAM).`);

  if (!shouldScrape) {
    console.log('No candidates changed. Re-run with --scrape to create/update local review candidates.');
    return;
  }

  const result = await runAffiliateSourceScrape(SOURCE_ID, { client: PSB_PORTLAND_STATIC_PAGE_CLIENT });
  await relinkClubCandidateToSourceOrganization();
  const logs = result.run.logs as any;
  console.log(
    `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) returned `
    + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
  );
  await printSavedCandidateCounts();
};

main()
  .catch((error) => {
    console.error('[setup-pro-skills-basketball-portland-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
