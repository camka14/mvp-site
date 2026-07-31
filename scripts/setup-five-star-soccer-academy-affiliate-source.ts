/** Operator-approved setup for the 5 Star Soccer Academy stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FIVE_STAR_SOCCER_CAMPS_URL,
  FIVE_STAR_SOCCER_HOME_URL,
  FIVE_STAR_SOCCER_LOGO_SOURCE_URL,
  FIVE_STAR_SOCCER_MAPPING,
  FIVE_STAR_SOCCER_ORG_DESCRIPTION,
  FIVE_STAR_SOCCER_SOURCE_EVIDENCE,
  FIVE_STAR_SOCCER_STATIC_PAGE_CLIENT,
  FIVE_STAR_SOCCER_SUMMER_URL,
  FIVE_STAR_SOCCER_TRAINING_URL,
  FIVE_STAR_SOCCER_TRIAL_URL,
} from '../src/server/affiliateImports/fiveStarSoccerAcademySource';

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
const ORG_ID = 'affiliate_org_five_star_soccer_academy';
const SOURCE_ID = 'affiliate_source_five_star_soccer_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-youth-soccer-training-astoria-queens-5starsocceracademy-com';
const MAPPING_ID = 'affiliate_mapping_five_star_soccer_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_five_star_soccer_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveStarSoccerAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: FIVE_STAR_SOCCER_SOURCE_EVIDENCE,
  inspectedAt: FIVE_STAR_SOCCER_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.5starsocceracademy.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored 5 Star Soccer Academy homepage is ALLOWED. Event-detail and tryout pages are UNCHECKED and remain withheld.',
  reviewedUrls: [FIVE_STAR_SOCCER_HOME_URL],
  officialActionUrls: [FIVE_STAR_SOCCER_HOME_URL, FIVE_STAR_SOCCER_TRAINING_URL, FIVE_STAR_SOCCER_SUMMER_URL, FIVE_STAR_SOCCER_CAMPS_URL, FIVE_STAR_SOCCER_TRIAL_URL],
  officialLogoSourceUrl: FIVE_STAR_SOCCER_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-youth-soccer-training-astoria-queens-5starsocceracademy-com/0a516731-e735-4940-a511-ab58a6b9caf9/003-logo_candidate-df5f6245-0e52-4402-8d26-f0c58589da06.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party 5 Star Soccer Academy crest candidate 003',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party 5 Star Soccer Academy crest was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '5 Star Soccer Academy camps, training, and tryout dates', reason: 'The current action/detail pages are not captured as allowed rows; no complete current date, time, venue, and registration candidate is emitted.' },
    { title: 'Historical matches, camps, and tryouts', reason: 'The stored detail links are UNCHECKED and historical 2025 rows are not current output.' },
    { title: '5 Star Soccer Academy teams', reason: 'The Advanced Travel Program is described as player development; TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('5 Star Soccer Academy logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'five-star-soccer-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-star-soccer-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-star-soccer-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: '5 Star Soccer Academy', location: 'New York City, NY', address: null, description: FIVE_STAR_SOCCER_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: FIVE_STAR_SOCCER_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: '5 Star Soccer Academy', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: FIVE_STAR_SOCCER_HOME_URL, listUrl: FIVE_STAR_SOCCER_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake 5 Star Soccer Academy CLUB package with one ongoing NYC youth-soccer profile. Current training/camp/tryout pages are not captured as complete allowed rows, historical detail pages are unchecked, and no EVENT or TEAM candidate is created.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: FIVE_STAR_SOCCER_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed 5 Star Soccer Academy homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: FIVE_STAR_SOCCER_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed 5 Star Soccer Academy homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: FIVE_STAR_SOCCER_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-five-star-soccer-academy-affiliate-source] failed', error); process.exitCode = 1; });
