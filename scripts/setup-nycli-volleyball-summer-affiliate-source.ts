/** Operator-approved setup for the NYCLI Volleyball Summer 2026 stored-intake EVENT package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NYCLI_VOLLEYBALL_ADDRESS,
  NYCLI_VOLLEYBALL_LOGO_SOURCE_URL,
  NYCLI_VOLLEYBALL_MAPPING,
  NYCLI_VOLLEYBALL_ORG_DESCRIPTION,
  NYCLI_VOLLEYBALL_REGISTER_URL,
  NYCLI_VOLLEYBALL_SOURCE_EVIDENCE,
  NYCLI_VOLLEYBALL_STATIC_PAGE_CLIENT,
  NYCLI_VOLLEYBALL_SUMMER_URL,
  NYCLI_VOLLEYBALL_TRYOUTS_URL,
  NYCLI_VOLLEYBALL_VENUE,
} from '../src/server/affiliateImports/nycliVolleyballSummerSource';

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
const ORG_ID = 'affiliate_org_nycli_volleyball';
const SOURCE_ID = 'affiliate_source_nycli_volleyball_summer';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-summer-2026-nyclivolleyball-org';
const MAPPING_ID = 'affiliate_mapping_nycli_volleyball_summer_v1';
const LOGO_FILE_ID = 'affiliate_file_nycli_volleyball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycliVolleyballLogo.png');

const sourceMetadata = {
  sourceEvidence: NYCLI_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: NYCLI_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nyclivolleyball.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYCLI Volleyball Summer 2026 listing is ALLOWED. The 2026-27 tryouts page is UNCHECKED and remains withheld.',
  reviewedUrls: [NYCLI_VOLLEYBALL_SUMMER_URL],
  officialActionUrls: [NYCLI_VOLLEYBALL_SUMMER_URL, NYCLI_VOLLEYBALL_REGISTER_URL, 'https://forms.gle/XTmGVgNb3zj3XaBf8', NYCLI_VOLLEYBALL_TRYOUTS_URL],
  officialLogoSourceUrl: NYCLI_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-summer-2026-nyclivolleyball-org/3cd10ef2-127a-44a8-be4b-8735ce7183d1/003-logo_candidate-788d54da-d12a-4ff1-a51a-e1536b3eba0a.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYCLI Volleyball skyline wordmark candidate 003',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party NYCLI Volleyball skyline wordmark was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Future Stars, Libero, Setter & Middle, and Hitter Academies', reason: 'The stored dates were past as of 2026-07-31; no stale EVENT candidates are emitted.' },
    { title: 'Summer Grass Volleyball Tournaments', reason: 'The allowed listing gives an official registration link but no complete date/time/venue row.' },
    { title: 'NYCLI Volleyball 2026-27 tryouts', reason: 'The linked registration page is UNCHECKED.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYCLI Volleyball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'nycli-volleyball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nycli-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nycli-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'NYCLI Volleyball Club', location: 'Astoria, NY', address: NYCLI_VOLLEYBALL_ADDRESS, description: NYCLI_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: 'https://www.nyclivolleyball.org', sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NYCLI Volleyball Summer 2026', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://www.nyclivolleyball.org', listUrl: NYCLI_VOLLEYBALL_SUMMER_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYCLI Volleyball EVENT package with one ongoing club profile and one future Pre-Tryout All Skills Academy event. Past academy rows, incomplete grass-series details, and unchecked tryout page remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYCLI_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from the stored allowed NYCLI Volleyball Summer 2026 listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYCLI_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from the stored allowed NYCLI Volleyball Summer 2026 listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYCLI_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, endsAt: candidate.endsAt, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-nycli-volleyball-summer-affiliate-source] failed', error); process.exitCode = 1; });
