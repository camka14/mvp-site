/** Operator-approved setup for the East Coast Mavericks stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  EAST_COAST_MAVERICKS_ABOUT_URL,
  EAST_COAST_MAVERICKS_CLINICS_URL,
  EAST_COAST_MAVERICKS_CONTACT_URL,
  EAST_COAST_MAVERICKS_FACEBOOK_URL,
  EAST_COAST_MAVERICKS_HOME_URL,
  EAST_COAST_MAVERICKS_INSTAGRAM_URL,
  EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
  EAST_COAST_MAVERICKS_MAPPING,
  EAST_COAST_MAVERICKS_OFFICIAL_URLS,
  EAST_COAST_MAVERICKS_ORG_DESCRIPTION,
  EAST_COAST_MAVERICKS_SOURCE_EVIDENCE,
  EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT,
  EAST_COAST_MAVERICKS_TEAMS_URL,
  EAST_COAST_MAVERICKS_MINI_MAVERICKS_URL,
  EAST_COAST_MAVERICKS_REGISTRATION_URL,
} from '../src/server/affiliateImports/eastCoastMavericksSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_east_coast_mavericks';
const SOURCE_ID = 'affiliate_source_east_coast_mavericks';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-eastcoast-mavericks-ecmavericksbaseball-com';
const MAPPING_ID = 'affiliate_mapping_east_coast_mavericks_v1';
const LOGO_FILE_ID = 'affiliate_file_east_coast_mavericks_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/eastCoastMavericksLogo.png');

const sourceMetadata = {
  sourceEvidence: EAST_COAST_MAVERICKS_SOURCE_EVIDENCE,
  inspectedAt: EAST_COAST_MAVERICKS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://ecmavericksbaseball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored East Coast Mavericks homepage is ALLOWED. Clinics, Mini Mavericks, team, roster, about, coach, and contact pages are UNCHECKED and remain withheld.',
  reviewedUrls: [EAST_COAST_MAVERICKS_HOME_URL],
  officialActionUrls: EAST_COAST_MAVERICKS_OFFICIAL_URLS,
  officialLogoSourceUrl: EAST_COAST_MAVERICKS_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-eastcoast-mavericks-ecmavericksbaseball-com/eb1a6da9-afb3-4696-8102-a55d80e6c54b/002-logo_candidate-6e58a547-cded-49eb-85cb-9acb2cb4d9c8.jpg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Mavericks Baseball homepage logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Mavericks Baseball mark was placed on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Mini Mavericks Summer Clinic', reason: 'The stored August 10-14 dates omit a year, so no dated event is inferred.' },
    { title: 'Mavericks teams, rosters, and linked programs', reason: 'The stored linked pages are UNCHECKED; TEAM rows and additional events are withheld.' },
  ],
  officialOutboundNotes: {
    clinics: EAST_COAST_MAVERICKS_CLINICS_URL,
    miniMavericks: EAST_COAST_MAVERICKS_MINI_MAVERICKS_URL,
    about: EAST_COAST_MAVERICKS_ABOUT_URL,
    teams: EAST_COAST_MAVERICKS_TEAMS_URL,
    contact: EAST_COAST_MAVERICKS_CONTACT_URL,
    registration: EAST_COAST_MAVERICKS_REGISTRATION_URL,
    facebook: EAST_COAST_MAVERICKS_FACEBOOK_URL,
    instagram: EAST_COAST_MAVERICKS_INSTAGRAM_URL,
  },
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks)));
});

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('East Coast Mavericks logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch { /* recreate a missing local object */ }
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'east-coast-mavericks-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'east-coast-mavericks-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'east-coast-mavericks-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
  });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'East Coast Mavericks', location: 'Yorktown Heights, NY', address: null, description: EAST_COAST_MAVERICKS_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: EAST_COAST_MAVERICKS_HOME_URL, sports: ['Baseball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'East Coast Mavericks Baseball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: EAST_COAST_MAVERICKS_HOME_URL, listUrl: EAST_COAST_MAVERICKS_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Mavericks Baseball CLUB plus ongoing Summer Baseball Clinic 2026 Session 4 package; yearless Mini Mavericks dates and unchecked rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: EAST_COAST_MAVERICKS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only mixed CLUB/EVENT mapping from the stored allowed Mavericks Baseball homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: EAST_COAST_MAVERICKS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only mixed CLUB/EVENT mapping from the stored allowed Mavericks Baseball homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-east-coast-mavericks-affiliate-source] failed', error); process.exitCode = 1; });
