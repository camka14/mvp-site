/** Operator-approved setup for the Stadium Tennis Center stored-intake rental package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  STADIUM_TENNIS_CENTER_ADDRESS,
  STADIUM_TENNIS_CENTER_BOOKING_URL,
  STADIUM_TENNIS_CENTER_HOME_URL,
  STADIUM_TENNIS_CENTER_LOGO_SOURCE_URL,
  STADIUM_TENNIS_CENTER_MAPPING,
  STADIUM_TENNIS_CENTER_ORG_DESCRIPTION,
  STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE,
  STADIUM_TENNIS_CENTER_STATIC_PAGE_CLIENT,
  STADIUM_TENNIS_CENTER_URL,
} from '../src/server/affiliateImports/stadiumTennisCenterSource';

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
const ORG_ID = 'affiliate_org_stadium_tennis_center';
const SOURCE_ID = 'affiliate_source_stadium_tennis_center';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-court-rentals-stadiumtennisnyc-com';
const MAPPING_ID = 'affiliate_mapping_stadium_tennis_center_v1';
const LOGO_FILE_ID = 'affiliate_file_stadium_tennis_center_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/stadiumTennisCenterLogo.png');

const sourceMetadata = {
  sourceEvidence: STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE,
  inspectedAt: STADIUM_TENNIS_CENTER_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.stadiumtennisnyc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Stadium Tennis Center court-rentals page is ALLOWED. CatchCorner booking, program, calendar, lesson, and coach pages are UNCHECKED and remain withheld.',
  reviewedUrls: [STADIUM_TENNIS_CENTER_URL],
  officialActionUrls: [STADIUM_TENNIS_CENTER_URL, STADIUM_TENNIS_CENTER_BOOKING_URL, STADIUM_TENNIS_CENTER_HOME_URL, 'https://www.stadiumtennisnyc.com/adult-tennis-programs', 'https://www.stadiumtennisnyc.com/junior-tennis-programs'],
  officialLogoSourceUrl: STADIUM_TENNIS_CENTER_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-court-rentals-stadiumtennisnyc-com/66da27d3-fae2-4c64-ad7f-8ced5ae8aeae/002-logo_candidate-9e769940-2a56-4241-9a54-fd32531115f7.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Stadium Tennis Center page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Stadium Tennis Center mark was normalized locally to an opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Live CatchCorner availability and pricing', sourceUrl: STADIUM_TENNIS_CENTER_BOOKING_URL, reason: 'The booking page is UNCHECKED; the stored court-rentals page does not expose public prices or live availability.' },
    { title: 'Adult, junior, camp, lesson, and calendar rows', reason: 'The linked program, calendar, and lesson pages are UNCHECKED and no current event rows are inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Stadium Tennis Center logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'stadium-tennis-center-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'stadium-tennis-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'stadium-tennis-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Stadium Tennis Center at Mill Pond Park', location: 'Bronx, NY', address: STADIUM_TENNIS_CENTER_ADDRESS, description: STADIUM_TENNIS_CENTER_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: STADIUM_TENNIS_CENTER_HOME_URL, sports: ['Tennis'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Stadium Tennis Center Court Rentals', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: STADIUM_TENNIS_CENTER_HOME_URL, listUrl: STADIUM_TENNIS_CENTER_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake Stadium Tennis Center rental package with indoor seasonal and outdoor permit-based RENTAL candidates; unchecked booking and program details remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: STADIUM_TENNIS_CENTER_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored Stadium Tennis Center evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: STADIUM_TENNIS_CENTER_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored Stadium Tennis Center evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: STADIUM_TENNIS_CENTER_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-stadium-tennis-center-affiliate-source] failed', error); process.exitCode = 1; });
