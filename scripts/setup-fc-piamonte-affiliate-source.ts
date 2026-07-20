/**
 * FC Piamonte affiliate source setup.
 *
 * Repairs the legacy no-current-events placeholder into one intake-backed
 * public CLUB listing. The current capture does not support a future event,
 * rental, or roster-level team candidate. This script is local-only.
 */
import dotenv from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FC_PIAMONTE_HOME_URL,
  FC_PIAMONTE_LOGO_SOURCE_URL,
  FC_PIAMONTE_MANUAL_CANDIDATES,
  FC_PIAMONTE_MAPPING,
  FC_PIAMONTE_ORG_DESCRIPTION,
  FC_PIAMONTE_PROGRAM_DIVISIONS,
  FC_PIAMONTE_PROGRAMS_URL,
  FC_PIAMONTE_ROBOTS_URL,
  FC_PIAMONTE_SOURCE_EVIDENCE,
  FC_PIAMONTE_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/fcPiamonteSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This FC Piamonte source setup is local-only and does not accept --live.');
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte';
const SOURCE_ID = 'affiliate_source_fc_piamonte_final_review';
const SOURCE_KEY = 'fc-piamonte-final-review';
const MAPPING_ID = 'affiliate_mapping_fc_piamonte_final_review_v1';
const ORGANIZATION_NAME = 'FC Piamonte';
const PUBLIC_SLUG = 'fc-piamonte';
const LOGO_FILE_ID =
  'affiliate_org_oregon_youth_soccer_find_a_club_fc_piamonte_logo_square_3cbd1a77908d';
const LOGO_FILE_NAME = 'fc-piamonte-logo-square.png';
const LOGO_ARTIFACT_ID = '77e6b908-95ff-46ce-b8e0-904868364b00';
const LOGO_BACKGROUND = '#eef2f6';
const LOGO_SAFE_MARK_SIZE = 820;

const withheldRows = [
  {
    title: 'FC Piamonte Available Programs',
    sourceUrl: FC_PIAMONTE_PROGRAMS_URL,
    reason:
      'The page was discovered but not captured and remains robots-unchecked. Its registration rows, prices, and season details are not mapped from the current intake.',
  },
  {
    title: 'FC Piamonte tryouts or standalone events',
    sourceUrl: FC_PIAMONTE_HOME_URL,
    reason:
      'The captured homepage publishes coach contacts and age groups, but no future standalone date, time, venue, and event registration action.',
  },
  {
    title: 'FC Piamonte team registrations',
    sourceUrl: FC_PIAMONTE_HOME_URL,
    reason:
      'The captured homepage does not expose a stable roster-level team action URL, so no TEAM candidate is created.',
  },
  {
    title: 'FC Piamonte facility rental',
    sourceUrl: FC_PIAMONTE_HOME_URL,
    reason: 'The captured homepage exposes no public facility rental or booking path.',
  },
];

const sourceMetadata = {
  inspectedAt: '2026-07-20',
  sourceEvidence: FC_PIAMONTE_SOURCE_EVIDENCE,
  robotsUrl: FC_PIAMONTE_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote:
    'The stored robots artifact contains only User-agent: * and no Disallow rule. The mapping uses the allowed homepage capture.',
  termsUrl: 'https://stacksports.com/legal-terms',
  termsNote:
    'The captured homepage links to the standard Stack Sports terms and exposes no site-specific anti-automation restriction. Intake compliance is ALLOWED and processing remains limited to the reviewed public homepage artifact.',
  reviewedUrls: [FC_PIAMONTE_HOME_URL],
  discoveredButUncapturedUrls: [FC_PIAMONTE_PROGRAMS_URL],
  officialLogoSourceUrl: FC_PIAMONTE_LOGO_SOURCE_URL,
  officialLogoArtifactId: LOGO_ARTIFACT_ID,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Official homepage crest stored as a live intake LOGO_CANDIDATE artifact',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: LOGO_BACKGROUND,
  logoNote:
    'The official transparent crest is trimmed and centered on one opaque light-gray 1024px canvas with no inset rectangle or alpha.',
  organizationLocationNote:
    'The source states that the club practices in Vancouver and plays in Vancouver and the Portland metro area. It does not publish a fixed public facility address, so club discovery uses Vancouver, WA.',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  publishedProgramGroups: FC_PIAMONTE_PROGRAM_DIVISIONS,
  programGroupNote:
    'The six exact homepage groups are retained in source metadata. They are not emitted as canonical Divisions because the source does not publish a strict skill level and the shared composite division model would otherwise infer one.',
  withheldRows,
  legacyCleanup:
    'The former source was an EVENT placeholder with no candidates. Setup repairs it in place as a CLUB source and removes any unsupported legacy rows if they exist.',
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
    FC_PIAMONTE_SOURCE_EVIDENCE.intakeSourceKey,
    FC_PIAMONTE_SOURCE_EVIDENCE.runId,
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

  const response = await fetch(FC_PIAMONTE_LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch FC Piamonte logo: ${response.status} ${response.statusText}`);
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
    throw new Error('FC Piamonte logo normalization did not produce an opaque 1024x1024 PNG.');
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
      // Recreate a missing local object rather than retaining a stale File row.
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
    coordinates = await geocodeAddressToCoordinates('Vancouver, WA');
  }
  if (!coordinates) {
    throw new Error(
      'FC Piamonte needs Vancouver coordinates from the normal Google geocoding path. Configure a server-capable GOOGLE_MAPS_API_KEY before creating the organization.',
    );
  }

  const organization = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Vancouver, WA / Portland metro',
    address: null,
    description: FC_PIAMONTE_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: FC_PIAMONTE_HOME_URL,
    sports: ['Grass Soccer'],
    enabledFeatures: ['EVENT_MANAGEMENT', 'CLUB_TEAMS'],
    status: 'LISTED',
    coordinates,
    publicSlug: PUBLIC_SLUG,
    publicPageEnabled: true,
    publicHeadline: 'FC Piamonte youth soccer programs',
    publicIntroText:
      'Explore FC Piamonte year-round age-group soccer programs and official club contact information.',
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
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: 'FC Piamonte Club Profile',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: 'https://www.fcpiamonte.org',
    listUrl: FC_PIAMONTE_HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes:
      'Intake-backed FC Piamonte source. It creates one ongoing club listing and withholds uncaptured registration details and unsupported event/team/rental rows.',
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
      mapping: FC_PIAMONTE_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: `Manual club mapping derived from live intake run ${FC_PIAMONTE_SOURCE_EVIDENCE.runId}.`,
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: FC_PIAMONTE_MAPPING satisfies AffiliateScrapeMapping,
      notes: `Manual club mapping derived from live intake run ${FC_PIAMONTE_SOURCE_EVIDENCE.runId}.`,
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

  console.log(`FC Piamonte affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${FC_PIAMONTE_MANUAL_CANDIDATES.length} reviewed CLUB candidate configured.`);
  console.log(`${withheldRows.length} unsupported or uncaptured row(s) withheld.`);
  console.log(`${removedLegacyCandidates} unsupported legacy candidate(s) and backing target(s) removed.`);
  console.log(`Official opaque logo ready: ${logoId}.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: FC_PIAMONTE_STATIC_PAGE_CLIENT });
    await relinkClubCandidateToSourceOrganization();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the reviewed FC Piamonte club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-fc-piamonte-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
