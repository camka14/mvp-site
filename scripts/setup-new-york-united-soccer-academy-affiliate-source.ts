/** Operator-approved setup for the New York United Soccer Academy stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { NYUSA_HOME_URL, NYUSA_LOGO_SOURCE_URL, NYUSA_MAPPING, NYUSA_ORG_DESCRIPTION, NYUSA_SOURCE_EVIDENCE, NYUSA_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/newYorkUnitedSoccerAcademySource';

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
const ORG_ID = 'affiliate_org_new_york_united_soccer_academy';
const SOURCE_ID = 'affiliate_source_new_york_united_soccer_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-new-york-united-soccer-academy-nyusa-nyunitedsoccer-com';
const MAPPING_ID = 'affiliate_mapping_new_york_united_soccer_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_new_york_united_soccer_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkUnitedSoccerAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: NYUSA_SOURCE_EVIDENCE,
  inspectedAt: NYUSA_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nyunitedsoccer.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYUSA homepage is ALLOWED. Program, camp, tryout, registration, team, and rental detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NYUSA_HOME_URL],
  officialActionUrls: [NYUSA_HOME_URL, 'https://www.nyunitedsoccer.com/summer', 'https://www.nyunitedsoccer.com/preksoccer', 'https://www.nyunitedsoccer.com/seasonal-soccer', 'https://www.nyunitedsoccer.com/development-academy', 'https://www.nyunitedsoccer.com/travel', 'https://www.nyunitedsoccer.com/personalized-training', 'https://www.nyunitedsoccer.com/summer-camp', 'https://www.nyunitedsoccer.com/tryouts'],
  officialLogoSourceUrl: NYUSA_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-new-york-united-soccer-academy-nyusa-nyunitedsoccer-com/08c97a93-75e3-4030-aed0-9a9af7958b2a/002-logo_candidate-15aa1681-f843-427d-b58e-f0e4db27e03d.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYUSA crest from page branding Open Graph candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party NYUSA crest was normalized locally to an opaque 1024px square PNG on a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'NYUSA program and summer-camp rows', reason: 'The stored homepage describes programs and Summer Camp 2026, but linked detail pages are UNCHECKED and do not provide a complete current date, venue, price, and registration row.' },
    { title: 'NYUSA tryout, registration, team, and rental rows', reason: 'Tryout, registration, team, and rental paths are UNCHECKED; no EVENT, TEAM, or RENTAL candidate is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYUSA logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: any = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch {}
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-united-soccer-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-united-soccer-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-united-soccer-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'New York United Soccer Academy', location: 'Queens, NY', address: null, description: NYUSA_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NYUSA_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'New York United Soccer Academy', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NYUSA_HOME_URL, listUrl: NYUSA_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYUSA club package with one ongoing CLUB profile; unchecked program, camp, tryout, registration, team, and rental rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYUSA_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored NYUSA homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYUSA_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored NYUSA homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYUSA_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-united-soccer-academy-affiliate-source] failed', error); process.exitCode = 1; });
