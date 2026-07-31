/** Operator-approved setup for the Zero Gravity Basketball New York stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { ZERO_GRAVITY_NEW_YORK_HOME_URL, ZERO_GRAVITY_NEW_YORK_LOGO_SOURCE_URL, ZERO_GRAVITY_NEW_YORK_MAPPING, ZERO_GRAVITY_NEW_YORK_ORG_DESCRIPTION, ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL, ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE, ZERO_GRAVITY_NEW_YORK_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/zeroGravityBasketballNewYorkSource';

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
const ORG_ID = 'affiliate_org_zero_gravity_basketball_new_york';
const SOURCE_ID = 'affiliate_source_zero_gravity_basketball_new_york';
const SOURCE_KEY = 'zero-gravity-basketball-new-york';
const MAPPING_ID = 'affiliate_mapping_zero_gravity_basketball_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_zero_gravity_basketball_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/zeroGravityBasketballLogo.png');

const sourceMetadata = {
  sourceEvidence: ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: ZERO_GRAVITY_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.zerogravitybasketball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored New York registration path is ALLOWED; the captured listing/detail context is sparse and discovered detail pages are UNCHECKED.',
  reviewedUrls: [ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL],
  officialActionUrls: [ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL],
  officialLogoSourceUrl: ZERO_GRAVITY_NEW_YORK_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Zero Gravity Basketball page-branding logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party Zero Gravity Basketball mark was normalized to an opaque 1024px square PNG with a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York tournament rows', reason: 'The captured listing has no complete current date, time, venue, price, or registration rows.' },
    { title: 'Discovered event/detail pages', reason: 'All discovered detail pages are UNCHECKED and are not used as mapping evidence.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Zero Gravity Basketball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'zero-gravity-basketball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'zero-gravity-basketball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'zero-gravity-basketball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Zero Gravity Basketball New York', location: null, address: null, description: ZERO_GRAVITY_NEW_YORK_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ZERO_GRAVITY_NEW_YORK_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Zero Gravity Basketball New York', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ZERO_GRAVITY_NEW_YORK_HOME_URL, listUrl: ZERO_GRAVITY_NEW_YORK_REGISTRATION_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Sparse stored-intake club package; uncaptured tournament detail rows are withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ZERO_GRAVITY_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Zero Gravity Basketball New York evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ZERO_GRAVITY_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Zero Gravity Basketball New York evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ZERO_GRAVITY_NEW_YORK_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-zero-gravity-basketball-new-york-affiliate-source] failed', error); process.exitCode = 1; });
