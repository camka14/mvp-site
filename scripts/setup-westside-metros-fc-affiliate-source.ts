/**
 * Westside Metros FC affiliate source setup.
 *
 * Repairs the legacy event-discovery source into one intake-backed public CLUB
 * listing. The current capture does not support a future event, rental, or
 * roster-level team candidate. This script is local-only.
 */
import dotenv from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  WESTSIDE_METROS_HOME_URL,
  WESTSIDE_METROS_LOGO_SOURCE_URL,
  WESTSIDE_METROS_MANUAL_CANDIDATES,
  WESTSIDE_METROS_MAPPING,
  WESTSIDE_METROS_OFFICE_ADDRESS,
  WESTSIDE_METROS_ORG_DESCRIPTION,
  WESTSIDE_METROS_ROBOTS_URL,
  WESTSIDE_METROS_SOURCE_EVIDENCE,
  WESTSIDE_METROS_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/westsideMetrosFcSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Westside Metros FC source setup is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type DeleteAffiliateCandidate = typeof import('../src/server/affiliateImports/service').deleteAffiliateCandidate;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let deleteAffiliateCandidate: DeleteAffiliateCandidate;
let syncOrganizationTags: SyncOrganizationTags;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_westside_metros_fc';
const SOURCE_ID = 'affiliate_source_westside-metros-fc_club_events';
const SOURCE_KEY = 'westside-metros-fc-club-events';
const MAPPING_ID = 'affiliate_source_westside-metros-fc_club_events_mapping_v1';
const ORGANIZATION_NAME = 'Westside Metros FC';
const PUBLIC_SLUG = 'westside-metros-fc';
const LOGO_FILE_ID =
  'affiliate_org_oregon_youth_soccer_find_a_club_westside_metros_fc_logo_square_d1b0bcb9b12d';
const LOGO_FILE_NAME = 'westside-metros-fc-logo-square.png';
const LOGO_ARTIFACT_ID = '7d9f3331-59cf-48ed-accc-687c574c5717';
const LOGO_BACKGROUND = '#eef2f6';
const LOGO_SAFE_MARK_SIZE = 820;

const withheldRows = [
  {
    title: '2026 adidas Beaverton Cup',
    sourceUrl: 'https://www.westsidemetros.org/adidas-beaverton-cup-tournament',
    reason:
      'The source dates the tournament July 17-19, 2026. It started before the July 20 intake capture and is not a future candidate.',
  },
  {
    title: 'Supplemental Tryout Registration',
    sourceUrl: 'https://www.westsidemetros.org/2026-2027-season-information',
    reason:
      'The captured homepage says registration is open but publishes no future tryout date or time. Annual tryouts are held in May.',
  },
  {
    title: 'Metros Academy Summer 2026',
    sourceUrl: 'https://www.westsidemetros.org/metros-academy-summer-2026',
    reason:
      'The captured homepage exposes registration but no dated session. The discovered detail page was not captured and remains robots-unchecked.',
  },
  {
    title: 'WPSL and UPSL team programs',
    sourceUrl: WESTSIDE_METROS_HOME_URL,
    reason:
      'The homepage does not expose a stable roster-level team action; the UPSL spring season is complete. TEAM candidates remain out of scope.',
  },
  {
    title: 'Westside Metros FC facility rental',
    sourceUrl: WESTSIDE_METROS_HOME_URL,
    reason: 'The captured source exposes no public facility rental or booking path.',
  },
];

const sourceMetadata = {
  inspectedAt: '2026-07-20',
  sourceEvidence: WESTSIDE_METROS_SOURCE_EVIDENCE,
  robotsUrl: WESTSIDE_METROS_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote:
    'The stored robots artifact allows public pages and disallows /scripts/, /scripts/runisa.dll, /_sin/, and /_widgets/. This mapping uses only the allowed homepage.',
  termsNote:
    'The stored public homepage and policy evidence do not expose a site-specific anti-automation restriction. Processing remains limited to the reviewed allowed capture.',
  reviewedUrls: [WESTSIDE_METROS_HOME_URL],
  discoveredButUncapturedUrls: [
    'https://www.westsidemetros.org/tryouts/2026-2027-season-information',
    'https://www.westsidemetros.org/metros-academy-summer-2026',
    'https://www.westsidemetros.org/events/camps',
    'https://www.westsidemetros.org/events/tournaments',
  ],
  officialLogoSourceUrl: WESTSIDE_METROS_LOGO_SOURCE_URL,
  officialLogoArtifactId: LOGO_ARTIFACT_ID,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official header crest stored as a live intake LOGO_CANDIDATE artifact',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The captured transparent crest is trimmed and centered on one opaque light-gray 1024px canvas with no inset rectangle or alpha.',
  organizationOfficeAddress: WESTSIDE_METROS_OFFICE_ADDRESS,
  organizationLocationNote:
    'The published Cirrus Drive address is an office, not a practice/event venue. Public discovery remains centered on Beaverton.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows,
  legacyCleanup:
    'The source previously held a July 17 event created by generic club discovery. Setup removes that stale candidate and its backing local event before creating the supported CLUB row.',
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape, deleteAffiliateCandidate } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
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

const readExportedLogo = async (): Promise<Buffer | null> => {
  const exportDir = path.resolve(
    'output',
    'affiliate-intakes',
    WESTSIDE_METROS_SOURCE_EVIDENCE.intakeSourceKey,
    WESTSIDE_METROS_SOURCE_EVIDENCE.runId,
  );
  try {
    const files = await readdir(exportDir);
    const logoFile = files.find((file) => file.includes(LOGO_ARTIFACT_ID));
    return logoFile ? await readFile(path.join(exportDir, logoFile)) : null;
  } catch {
    return null;
  }
};

const loadOfficialLogo = async (): Promise<Buffer> => {
  const exported = await readExportedLogo();
  if (exported) return exported;

  const response = await fetch(WESTSIDE_METROS_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Westside Metros FC logo: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const mark = await sharp(trimmed)
    .resize({
      width: LOGO_SAFE_MARK_SIZE,
      height: LOGO_SAFE_MARK_SIZE,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(mark).metadata();
  const width = metadata.width ?? LOGO_SAFE_MARK_SIZE;
  const height = metadata.height ?? LOGO_SAFE_MARK_SIZE;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{
      input: mark,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string): Promise<string> => {
  const data = await normalizeLogo(await loadOfficialLogo());
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Westside Metros FC logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate a missing local object instead of retaining a stale File row.
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

const normalizedCoordinates = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude === 0 && latitude === 0) return null;
  return [longitude, latitude];
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });
  let coordinates = normalizedCoordinates(existing?.coordinates);
  if (!coordinates) {
    const { geocodeAddressToCoordinates } = await import('../src/server/geocoding');
    coordinates = await geocodeAddressToCoordinates('Beaverton, OR');
  }
  if (!coordinates) {
    throw new Error(
      'Westside Metros FC needs Beaverton coordinates from the normal Google geocoding path. Configure a server-capable GOOGLE_MAPS_API_KEY before creating the organization.',
    );
  }

  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Beaverton, OR',
    address: 'Beaverton, OR',
    description: WESTSIDE_METROS_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: WESTSIDE_METROS_HOME_URL,
    sports: ['Grass Soccer'],
    enabledFeatures: ['EVENT_MANAGEMENT', 'CLUB_TEAMS'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'Westside Metros FC soccer programs',
    publicIntroText:
      'Explore Westside Metros FC development, competitive, academy, team, tournament, camp, and registration information.',
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

  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: ORG_ID },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    ORG_ID,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      'Club',
      'Event Manager',
      'League Operator',
      'Training Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: 'Westside Metros FC Club Profile',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.westsidemetros.org',
    listUrl: WESTSIDE_METROS_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes:
      'Intake-backed Westside Metros FC source. It creates one ongoing club listing and withholds incomplete or no-longer-future event/team/rental rows.',
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
      mapping: WESTSIDE_METROS_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: `Manual club mapping derived from live intake run ${WESTSIDE_METROS_SOURCE_EVIDENCE.runId}.`,
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: WESTSIDE_METROS_MAPPING satisfies AffiliateScrapeMapping,
      notes: `Manual club mapping derived from live intake run ${WESTSIDE_METROS_SOURCE_EVIDENCE.runId}.`,
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const removeUnsupportedLegacyCandidates = async (): Promise<number> => {
  const unsupported = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      NOT: { listingKind: 'CLUB', title: ORGANIZATION_NAME },
    },
    select: { id: true },
  });
  for (const candidate of unsupported) {
    await deleteAffiliateCandidate(candidate.id);
  }
  return unsupported.length;
};

const relinkClubCandidateToSourceOrganization = async () => {
  const clubCandidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME },
    select: { id: true, publishedOrganizationId: true },
  });
  for (const candidate of clubCandidates) {
    if (candidate.publishedOrganizationId && candidate.publishedOrganizationId !== ORG_ID) {
      await (prisma as any).organizations.deleteMany({ where: { id: candidate.publishedOrganizationId } });
    }
    await (prisma as any).affiliateImportCandidates.update({
      where: { id: candidate.id },
      data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() },
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
  const removedLegacyCandidates = await removeUnsupportedLegacyCandidates();

  console.log(`Westside Metros FC affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${WESTSIDE_METROS_MANUAL_CANDIDATES.length} reviewed CLUB candidate configured.`);
  console.log(`${withheldRows.length} unsupported row(s) withheld.`);
  console.log(`${removedLegacyCandidates} unsupported legacy candidate(s) and backing target(s) removed.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: WESTSIDE_METROS_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed Westside Metros FC club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-westside-metros-fc-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
