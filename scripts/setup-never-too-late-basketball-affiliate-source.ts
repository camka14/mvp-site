/** Operator-approved setup for the Never Too Late Basketball stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEVER_TOO_LATE_HOME_URL,
  NEVER_TOO_LATE_LOGO_SOURCE_URL,
  NEVER_TOO_LATE_MAPPING,
  NEVER_TOO_LATE_NORTH_ADAMS_URL,
  NEVER_TOO_LATE_NYC_PROGRAM_URL,
  NEVER_TOO_LATE_OFFICIAL_URLS,
  NEVER_TOO_LATE_ORG_DESCRIPTION,
  NEVER_TOO_LATE_SANTA_BARBARA_URL,
  NEVER_TOO_LATE_SOURCE_EVIDENCE,
  NEVER_TOO_LATE_STATIC_PAGE_CLIENT,
  NEVER_TOO_LATE_WEEKEND_CAMPS_URL,
} from '../src/server/affiliateImports/neverTooLateBasketballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_never_too_late_basketball';
const SOURCE_ID = 'affiliate_source_never_too_late_basketball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-never-too-late-basketball-nevertoolate-com';
const MAPPING_ID = 'affiliate_mapping_never_too_late_basketball_v1';
const LOGO_FILE_ID = 'affiliate_file_never_too_late_basketball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/neverTooLateBasketballLogo.png');

const sourceMetadata = {
  sourceEvidence: NEVER_TOO_LATE_SOURCE_EVIDENCE,
  inspectedAt: NEVER_TOO_LATE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://nevertoolate.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Never Too Late homepage is ALLOWED. Weekly-practice, weekend-camp detail, product, event, booking, coaches, and account pages are UNCHECKED; dated camp rows are limited to complete future rows in the stored homepage capture.',
  reviewedUrls: [NEVER_TOO_LATE_HOME_URL],
  officialActionUrls: NEVER_TOO_LATE_OFFICIAL_URLS,
  officialLogoSourceUrl: NEVER_TOO_LATE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-never-too-late-basketball-nevertoolate-com/161a28fb-ecde-4b53-996e-f58b20d289b9/002-logo_candidate-2f9cd4e8-1314-40ea-992e-f6476db7b57d.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Never Too Late Basketball logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Never Too Late Basketball logo was normalized locally to an opaque 1024px square PNG on white.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Portland, OR Weekend Camp July 24-26, 2026', reason: 'The row was already finished by the 2026-07-31 review date and is skipped without retrying.' },
    { title: 'New York City weekly clinics', reason: 'The NYC program page is UNCHECKED and the stored homepage provides no current dated clinic rows, times, prices, or canonical addresses.' },
    { title: 'Older 2019 event URLs and rental booking path', reason: 'These are stale sitemap rows or UNCHECKED booking/detail pages and are not emitted.' },
  ],
  officialOutboundNotes: {
    home: NEVER_TOO_LATE_HOME_URL,
    weekendCamps: NEVER_TOO_LATE_WEEKEND_CAMPS_URL,
    newYorkCityProgram: NEVER_TOO_LATE_NYC_PROGRAM_URL,
    santaBarbaraProduct: NEVER_TOO_LATE_SANTA_BARBARA_URL,
    northAdamsProduct: NEVER_TOO_LATE_NORTH_ADAMS_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Never Too Late Basketball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'never-too-late-basketball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'never-too-late-basketball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'never-too-late-basketball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Never Too Late Basketball', location: 'New York City, NY', address: null, description: NEVER_TOO_LATE_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NEVER_TOO_LATE_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Never Too Late Basketball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NEVER_TOO_LATE_HOME_URL, listUrl: NEVER_TOO_LATE_HOME_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Never Too Late CLUB and future EVENT package; finished Portland, stale 2019, and unchecked NYC clinic rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEVER_TOO_LATE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping with a CLUB profile from the stored Never Too Late homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NEVER_TOO_LATE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping with a CLUB profile from the stored Never Too Late homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEVER_TOO_LATE_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-never-too-late-basketball-affiliate-source] failed', error); process.exitCode = 1; });
