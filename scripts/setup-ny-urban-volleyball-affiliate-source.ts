/** Operator-approved setup for the NY Urban volleyball stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NY_URBAN_ENROLL_URL,
  NY_URBAN_HOME_URL,
  NY_URBAN_LOGO_SOURCE_URL,
  NY_URBAN_MAPPING,
  NY_URBAN_OPEN_PLAY_URL,
  NY_URBAN_ORG_DESCRIPTION,
  NY_URBAN_PLAYER_REGISTRATION_URL,
  NY_URBAN_SOURCE_EVIDENCE,
  NY_URBAN_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/nyUrbanVolleyballSource';

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
const ORG_ID = 'affiliate_org_ny_urban_volleyball';
const SOURCE_ID = 'affiliate_source_ny_urban_volleyball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-ny-urban-professionals-volleyball-league-open-play-nyurban-com';
const MAPPING_ID = 'affiliate_mapping_ny_urban_volleyball_v1';
const LOGO_FILE_ID = 'affiliate_file_ny_urban_volleyball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nyUrbanVolleyballLogo.png');

const sourceMetadata = {
  sourceEvidence: NY_URBAN_SOURCE_EVIDENCE,
  inspectedAt: NY_URBAN_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nyurban.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NY Urban open-play volleyball listing is ALLOWED. Registration, enrollment, program, and clinic detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NY_URBAN_OPEN_PLAY_URL],
  officialActionUrls: [NY_URBAN_OPEN_PLAY_URL, NY_URBAN_ENROLL_URL, NY_URBAN_PLAYER_REGISTRATION_URL],
  officialLogoSourceUrl: NY_URBAN_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-ny-urban-professionals-volleyball-league-open-play-nyurban-com/b450f9ad-2f02-4f92-923a-5a806c49de5f/009-page_screenshot-7e7ae014-6949-401e-964d-6354a128ada3.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NY Urban rendered header screenshot crop',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#0066cb',
  logoNote: 'The white-on-transparent official logo was preserved as a square crop from the captured official blue page header for legibility.',
  logoDisposition: 'OFFICIAL_SCREENSHOT_CROP',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Current NY Urban enrollment dates', sourceUrl: NY_URBAN_ENROLL_URL, reason: 'The allowed listing directs players to verify specific dates on the next page, but the enrollment page is not captured.' },
    { title: 'NY Urban player registration and volleyball details', sourceUrl: NY_URBAN_PLAYER_REGISTRATION_URL, reason: 'The registration and detail pages are UNCHECKED and are not fetched or retried.' },
    { title: 'NY Urban teams', reason: 'TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NY Urban logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'ny-urban-volleyball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'ny-urban-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'ny-urban-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'New York Urban Professionals Volleyball League', location: 'New York, NY', address: null, description: NY_URBAN_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NY_URBAN_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'New York Urban Professionals Volleyball League', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NY_URBAN_HOME_URL, listUrl: NY_URBAN_OPEN_PLAY_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NY Urban package with one CLUB profile and recurring/no-fixed-date open-play and clinic EVENT candidates; unchecked enrollment and detail pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NY_URBAN_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from stored NY Urban volleyball evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NY_URBAN_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from stored NY Urban volleyball evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NY_URBAN_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-ny-urban-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
