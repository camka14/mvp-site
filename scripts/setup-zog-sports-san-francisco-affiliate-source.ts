/** Operator-approved setup for the ZogSports San Francisco stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { ZOG_SPORTS_HOME_URL, ZOG_SPORTS_SF_FOOTBALL_URL, ZOG_SPORTS_SF_LOGO_SOURCE_URL, ZOG_SPORTS_SF_MAPPING, ZOG_SPORTS_SF_ORG_DESCRIPTION, ZOG_SPORTS_SF_SOURCE_EVIDENCE, ZOG_SPORTS_SF_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/zogSportsSanFranciscoSource';

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
const ORG_ID = 'affiliate_org_zogsports_san_francisco';
const SOURCE_ID = 'affiliate_source_zogsports_san_francisco';
const SOURCE_KEY = 'zogsports-san-francisco-adult-flag-football';
const MAPPING_ID = 'affiliate_mapping_zogsports_san_francisco_v1';
const LOGO_FILE_ID = 'affiliate_file_zogsports_san_francisco_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/zogSportsLogo.png');

const sourceMetadata = {
  sourceEvidence: ZOG_SPORTS_SF_SOURCE_EVIDENCE,
  inspectedAt: ZOG_SPORTS_SF_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.zogsports.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored San Francisco football and New York pickleball pages are ALLOWED; other program, rules, and discovery paths marked UNCHECKED remain evidence-scoped.',
  reviewedUrls: [ZOG_SPORTS_SF_FOOTBALL_URL, 'https://www.zogsports.com/ny/pickleball'],
  officialActionUrls: [ZOG_SPORTS_SF_FOOTBALL_URL],
  officialLogoSourceUrl: ZOG_SPORTS_SF_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party ZogSports JSON-LD organization logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#09afe0',
  logoNote: 'The stored first-party ZogSports social-card logo was normalized to an opaque 1024px square PNG without altering the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'San Francisco football league rows', reason: 'The stored page provides league format and geography but no complete current date, venue, price, and registration rows.' },
    { title: 'Other sports and locations', reason: 'Other sport/location pages were not captured with complete current rows or were UNCHECKED; no duplicate or cross-market candidates are created.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('ZogSports logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'zogsports-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'zogsports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'zogsports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'ZogSports San Francisco & East Bay', location: 'San Francisco Bay Area', address: null, description: ZOG_SPORTS_SF_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ZOG_SPORTS_HOME_URL, sports: ['Flag Football'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'ZogSports San Francisco Adult Flag Football', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ZOG_SPORTS_HOME_URL, listUrl: ZOG_SPORTS_SF_FOOTBALL_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake adult flag-football club package; incomplete current league rows are withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ZOG_SPORTS_SF_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored ZogSports San Francisco evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ZOG_SPORTS_SF_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored ZogSports San Francisco evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ZOG_SPORTS_SF_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-zog-sports-san-francisco-affiliate-source] failed', error); process.exitCode = 1; });
