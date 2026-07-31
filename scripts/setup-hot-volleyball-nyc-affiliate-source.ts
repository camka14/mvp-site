/** Operator-approved setup for the HOT Volleyball NYC stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  HOT_VOLLEYBALL_NYC_HOME_URL,
  HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
  HOT_VOLLEYBALL_NYC_MAPPING,
  HOT_VOLLEYBALL_NYC_ORG_DESCRIPTION,
  HOT_VOLLEYBALL_NYC_PROGRAMS_URL,
  HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE,
  HOT_VOLLEYBALL_NYC_STATIC_PAGE_CLIENT,
  HOT_VOLLEYBALL_NYC_SUMMER_CAMPS_URL,
  HOT_VOLLEYBALL_NYC_SUMMER_REGISTRATION_URL,
  HOT_VOLLEYBALL_NYC_TRYOUTS_URL,
} from '../src/server/affiliateImports/hotVolleyballNycSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  const liveDatabaseUrl = process.env.DATABASE_URL_LIVE?.trim();
  if (!liveDatabaseUrl) throw new Error('DATABASE_URL_LIVE is required with --live.');
  process.env.DATABASE_URL = liveDatabaseUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_hot_volleyball_nyc';
const SOURCE_ID = 'affiliate_source_hot_volleyball_nyc';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-high-octane-training-volleyball-nyc-hotvolleyballnyc-com';
const MAPPING_ID = 'affiliate_mapping_hot_volleyball_nyc_v1';
const LOGO_FILE_ID = 'affiliate_file_hot_volleyball_nyc_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/hotVolleyballNycLogo.png');

const sourceMetadata = {
  sourceEvidence: HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE,
  inspectedAt: HOT_VOLLEYBALL_NYC_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.hotvolleyballnyc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored HOT Volleyball homepage is ALLOWED. Program, location, registration, and club detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [HOT_VOLLEYBALL_NYC_HOME_URL],
  officialActionUrls: [HOT_VOLLEYBALL_NYC_HOME_URL, HOT_VOLLEYBALL_NYC_PROGRAMS_URL, HOT_VOLLEYBALL_NYC_SUMMER_CAMPS_URL, HOT_VOLLEYBALL_NYC_TRYOUTS_URL, HOT_VOLLEYBALL_NYC_SUMMER_REGISTRATION_URL],
  officialLogoSourceUrl: HOT_VOLLEYBALL_NYC_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-high-octane-training-volleyball-nyc-hotvolleyballnyc-com/ea19cf81-24ac-464a-8979-55e7bcd74ddc/002-logo_candidate-8408f270-04d3-4cbe-924d-60f806adda52.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party HOT Volleyball page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party HOT Volleyball mark was normalized locally to an opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Summer Camps 2026', sourceUrl: HOT_VOLLEYBALL_NYC_SUMMER_CAMPS_URL, reason: 'The stored homepage links to the camp page and registration action, but the camp detail page is UNCHECKED and no complete current date, time, venue, price, and row details are captured.' },
    { title: 'HOT NYC programs', sourceUrl: HOT_VOLLEYBALL_NYC_PROGRAMS_URL, reason: 'The stored homepage describes NYC programs but the linked program page is UNCHECKED; no dated event row is emitted.' },
    { title: 'HOT club tryouts', sourceUrl: HOT_VOLLEYBALL_NYC_TRYOUTS_URL, reason: 'The stored homepage links to club tryouts, but the registration detail page is UNCHECKED and no complete current dated row is captured.' },
    { title: 'HOT locations', reason: 'The captured homepage links to locations, but the locations detail page is UNCHECKED and no canonical NYC address is assigned.' },
    { title: 'HOT Volleyball teams', reason: 'TEAM mappings are out of scope.' },
  ],
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('HOT Volleyball NYC logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'hot-volleyball-nyc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'hot-volleyball-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'hot-volleyball-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'High Octane Training Volleyball NYC', location: 'New York City', address: null, description: HOT_VOLLEYBALL_NYC_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: HOT_VOLLEYBALL_NYC_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'High Octane Training Volleyball NYC', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: HOT_VOLLEYBALL_NYC_HOME_URL, listUrl: HOT_VOLLEYBALL_NYC_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake HOT Volleyball NYC club package with one ongoing CLUB profile; unchecked program, registration, location, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: HOT_VOLLEYBALL_NYC_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored HOT Volleyball NYC evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: HOT_VOLLEYBALL_NYC_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored HOT Volleyball NYC evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: HOT_VOLLEYBALL_NYC_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-hot-volleyball-nyc-affiliate-source] failed', error); process.exitCode = 1; });
