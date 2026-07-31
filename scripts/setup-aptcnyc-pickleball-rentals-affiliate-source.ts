/** Operator-approved setup for the APTC at Queens College stored-intake rental package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { APTC_HOME_URL, APTC_LOGO_SOURCE_URL, APTC_ORG_DESCRIPTION, APTC_PICKLEBALL_RENTALS_MAPPING, APTC_PICKLEBALL_RENTALS_STATIC_PAGE_CLIENT, APTC_PICKLEBALL_RENTALS_URL, APTC_SOURCE_EVIDENCE, APTC_WAIVER_URL } from '../src/server/affiliateImports/aptcnycPickleballRentalsSource';

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
const ORG_ID = 'affiliate_org_aptcnyc_queens_college';
const SOURCE_ID = 'affiliate_source_aptcnyc_pickleball_rentals';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-pickleball-court-rentals-aptcnyc-com';
const MAPPING_ID = 'affiliate_mapping_aptcnyc_pickleball_rentals_v1';
const LOGO_FILE_ID = 'affiliate_file_aptcnyc_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/aptcnycLogo.png');

const sourceMetadata = {
  sourceEvidence: APTC_SOURCE_EVIDENCE,
  inspectedAt: APTC_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.aptcnyc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored pickleball rental page is ALLOWED. Home, directions, program, tennis-rental, and generic court-rental pages are UNCHECKED and are not used.',
  reviewedUrls: [APTC_PICKLEBALL_RENTALS_URL],
  officialActionUrls: [APTC_PICKLEBALL_RENTALS_URL, APTC_WAIVER_URL],
  officialLogoSourceUrl: APTC_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-pickleball-court-rentals-aptcnyc-com/e6b41f48-309c-4483-96c0-2aac422858b6/004-logo_candidate-482b5018-792c-4a3c-8921-0c9ce59fbe35.webp',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party APTC at Queens College logo candidate 004',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party APTC at Queens College logo was normalized locally to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Tennis court rentals', reason: 'The tennis-rental page was discovered but UNCHECKED; no tennis rental candidate is inferred.' },
    { title: 'Other pickleball programs and court pages', reason: 'The discovered program and generic court-rental pages were UNCHECKED; no event or additional rental rows are inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('APTC logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'aptcnyc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'aptcnyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'aptcnyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'APTC at Queens College', location: 'APTC at Queens College', address: null, description: APTC_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: APTC_HOME_URL, sports: ['Pickleball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'APTC at Queens College Pickleball Court Rentals', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: APTC_HOME_URL, listUrl: APTC_PICKLEBALL_RENTALS_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake pickleball rental package with current summer 2026 rate bands and official waiver link; address and live availability remain unset.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: APTC_PICKLEBALL_RENTALS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored APTC pickleball rental evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: APTC_PICKLEBALL_RENTALS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored APTC pickleball rental evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: APTC_PICKLEBALL_RENTALS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode, priceText: candidate.priceText })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-aptcnyc-pickleball-rentals-affiliate-source] failed', error); process.exitCode = 1; });
