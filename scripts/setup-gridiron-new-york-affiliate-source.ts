/**
 * Local-only Gridiron New York affiliate source setup from the captured
 * AffiliateSourceIntake run ab3460d8-4524-4ced-9a32-d33d44e8b588.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  GRIDIRON_NEW_YORK_ADDRESS,
  GRIDIRON_NEW_YORK_DESCRIPTION,
  GRIDIRON_NEW_YORK_LOGO_URL,
  GRIDIRON_NEW_YORK_MANUAL_CANDIDATES,
  GRIDIRON_NEW_YORK_MAPPING,
  GRIDIRON_NEW_YORK_REGISTRATION_URL,
  GRIDIRON_NEW_YORK_STATIC_PAGE_CLIENT,
  GRIDIRON_NEW_YORK_TERMS_URL,
  GRIDIRON_NEW_YORK_URL,
} from '../src/server/affiliateImports/gridironNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_gridiron_new_york';
const SOURCE_ID = 'affiliate_source_gridiron_new_york';
const SOURCE_KEY = 'gridiron-new-york-football';
const MAPPING_ID = 'affiliate_mapping_gridiron_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_gridiron_new_york_logo';
const LOGO_FILE_NAME = 'gridiron-new-york-logo-square.png';
const INTAKE_ID = '03dc3ad9-7fc8-4a7e-bd60-ccc40a6ecadf';
const INTAKE_LOGO_ARTIFACT_ID = '886844ae-d5e8-4688-b6ce-d79efb7ad69f';

const sourceEvidence = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'local',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-league-gridironfb-com',
  runId: 'ab3460d8-4524-4ced-9a32-d33d44e8b588',
  runStatus: 'SUCCEEDED',
  provider: 'FIRECRAWL',
  capturedAt: '2026-07-21T21:21:32.053Z',
  pages: [{ url: GRIDIRON_NEW_YORK_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' }],
  artifactKinds: [
    { kind: 'PAGE_HTML', count: 1 },
    { kind: 'PAGE_MARKDOWN', count: 1 },
    { kind: 'PAGE_SCREENSHOT', count: 1 },
    { kind: 'PAGE_LINKS', count: 1 },
    { kind: 'LOGO_CANDIDATE', count: 4 },
    { kind: 'ROBOTS', count: 1 },
  ],
} as const;

const sourceMetadata = {
  sourceEvidence,
  inspectedAt: '2026-07-21',
  robotsUrl: 'https://gridironfb.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'Public page paths are explicitly allowed; account, cart, checkout, orders, services, and internal endpoints remain excluded.',
  termsUrl: GRIDIRON_NEW_YORK_TERMS_URL,
  reviewedUrls: [GRIDIRON_NEW_YORK_URL, GRIDIRON_NEW_YORK_TERMS_URL],
  officialLogoSourceUrl: GRIDIRON_NEW_YORK_LOGO_URL,
  logoArtifactId: INTAKE_LOGO_ARTIFACT_ID,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoNote: 'The official high-resolution Gridiron icon is centered on one full white canvas with no alpha or inset background rectangle.',
  geocodingNote: 'The normal local Google geocoding path returned no coordinates for the official Macombs Dam Park address; the address is retained and coordinates are not fabricated.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Bronx 5v5', schedule: 'September 26-November 21', prices: '$100-$250 per player; $1,500-$2,000 per team', reason: 'The source omits the schedule year.' },
    { title: 'Boogie Down 7v7 Tournament', schedule: 'July 19', prices: '$400 early bird; $500 regular', reason: 'The source omits the event year.' },
    { title: 'Elite 7s Indoor Tournament', schedule: 'January 3', prices: '$500 early bird; $650 regular', reason: 'The source omits the event year.' },
  ],
};

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

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const mark = await sharp(input, { animated: false })
    .rotate()
    .trim({ threshold: 8 })
    .resize({ width: 760, height: 760, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(mark).metadata();
  return sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } })
    .composite([{ input: mark, left: Math.round((1024 - (metadata.width ?? 760)) / 2), top: Math.round((1024 - (metadata.height ?? 760)) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(GRIDIRON_NEW_YORK_LOGO_URL, {
    headers: { accept: 'image/*', 'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com' },
  });
  if (!response.ok) throw new Error(`Failed to fetch official Gridiron logo: HTTP ${response.status}`);
  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('Gridiron logo normalization did not produce an opaque 1024x1024 PNG.');
  }

  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await (prisma as any).file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) {
    try {
      const current = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(current.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch {
      // Replace a stale local File row.
    }
  }
  if (!stored) stored = await storage.putObject({ data, originalName: LOGO_FILE_NAME, contentType: 'image/png', organizationId: ORG_ID });
  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: LOGO_FILE_NAME, mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: LOGO_FILE_NAME, mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
  });
  return LOGO_FILE_ID;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates(GRIDIRON_NEW_YORK_ADDRESS);
  const data = {
    updatedAt: new Date(), name: 'Gridiron New York', location: 'Bronx, NY', address: GRIDIRON_NEW_YORK_ADDRESS,
    description: GRIDIRON_NEW_YORK_DESCRIPTION, logoId, ownerId, website: GRIDIRON_NEW_YORK_URL,
    sports: ['Football'], status: 'LISTED', coordinates, publicSlug: 'gridiron-new-york', publicPageEnabled: true,
    publicHeadline: 'Gridiron New York youth football',
    publicIntroText: 'Explore Gridiron New York youth flag football and 7v7 programs with official registration links.',
    operatesAthleticFacility: false, defaultEventTaxHandling: 'ORGANIZER_COLLECTS', defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
  };
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', publicWidgetsEnabled: false, taxOrganizationType: 'INDIVIDUAL_OR_CLUB', ...data },
    update: data,
  });
};

const upsertSourceAndMapping = async () => {
  const source = {
    name: 'Gridiron New York', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://gridironfb.com',
    listUrl: GRIDIRON_NEW_YORK_URL, targetKind: 'CLUB', status: 'ACTIVE', activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false, scrapeIntervalMinutes: 10080,
    notes: 'Public youth football program source. Scheduled rows are withheld until the official page publishes an explicit year.',
    metadata: sourceMetadata,
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: GRIDIRON_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Local intake-backed Gridiron New York club mapping reviewed July 21, 2026.', validatedAt: new Date() },
    update: { version: 1, isActive: true, mapping: GRIDIRON_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Local intake-backed Gridiron New York club mapping reviewed July 21, 2026.', validatedAt: new Date() },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
  await (prisma as any).affiliateSourceIntakes.update({ where: { id: INTAKE_ID }, data: { organizationId: ORG_ID, affiliateSourceId: SOURCE_ID, selectedLogoArtifactId: INTAKE_LOGO_ARTIFACT_ID } });
};

const relinkClubCandidate = async () => {
  const rows = await (prisma as any).affiliateImportCandidates.findMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: 'Gridiron New York' },
    select: { publishedOrganizationId: true },
  });
  const duplicateIds = Array.from(new Set(rows.map((row: any) => row.publishedOrganizationId).filter((id: string | null) => id && id !== ORG_ID)));
  await (prisma as any).affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: 'Gridiron New York' }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
  for (const duplicateId of duplicateIds) {
    await (prisma as any).organizations.deleteMany({ where: { id: duplicateId, name: 'Gridiron New York', status: 'UNLISTED' } });
  }
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();
  console.log(`Gridiron New York affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${GRIDIRON_NEW_YORK_MANUAL_CANDIDATES.length} ongoing club candidate configured; ${sourceMetadata.withheldRows.length} dated rows withheld.`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: GRIDIRON_NEW_YORK_STATIC_PAGE_CLIENT });
    await relinkClubCandidate();
    await upsertOrganization(owner.id, logoId);
    const logs = result.run.logs as any;
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`);
  }
};

main().catch((error) => {
  console.error('[setup-gridiron-new-york-affiliate-source] failed', error);
  process.exitCode = 1;
}).finally(async () => {
  if (prisma) await prisma.$disconnect();
});
