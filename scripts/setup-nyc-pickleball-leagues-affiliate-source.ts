/** Operator-approved setup for the NYC Pickleball leagues stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NYC_PICKLEBALL_BOOK_A_LESSON_URL,
  NYC_PICKLEBALL_HOME_URL,
  NYC_PICKLEBALL_LEAGUES_URL,
  NYC_PICKLEBALL_LOGO_SOURCE_URL,
  NYC_PICKLEBALL_MAPPING,
  NYC_PICKLEBALL_ORG_DESCRIPTION,
  NYC_PICKLEBALL_SOURCE_EVIDENCE,
  NYC_PICKLEBALL_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/nycPickleballLeaguesSource';

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
const ORG_ID = 'affiliate_org_nyc_pickleball';
const SOURCE_ID = 'affiliate_source_nyc_pickleball_leagues';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-nyc-pickleball-leagues-nycpickleball-com';
const MAPPING_ID = 'affiliate_mapping_nyc_pickleball_leagues_v1';
const LOGO_FILE_ID = 'affiliate_file_nyc_pickleball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycPickleballLogo.png');

const sourceMetadata = {
  sourceEvidence: NYC_PICKLEBALL_SOURCE_EVIDENCE,
  inspectedAt: NYC_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nycpickleball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYC Pickleball leagues page is ALLOWED. Events, lesson, contact, and other detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NYC_PICKLEBALL_LEAGUES_URL],
  officialActionUrls: [
    NYC_PICKLEBALL_LEAGUES_URL,
    'https://nycpickleball.podplay.app/community/series/019d8908-447c-7fff-9029-5032eeddd621',
    'https://nycpickleball.podplay.app/community/series/019d60b4-ef82-7dda-a795-7725592aa891',
    'https://nycpickleball.podplay.app/community/series/019d8906-f34b-7992-8082-99471e55ec8f',
    'https://nycpickleball.podplay.app/community/series/019d6ae7-7649-7880-b4a0-c526a4c8e3e0',
    'https://nycpickleball.podplay.app/community/series/019d6aeb-a7ea-7880-b4a5-d1c13cfd7f3e',
    NYC_PICKLEBALL_BOOK_A_LESSON_URL,
  ],
  officialLogoSourceUrl: NYC_PICKLEBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-nyc-pickleball-leagues-nycpickleball-com/f7c39f1a-a8fc-44ee-9e37-ccd71e01abc9/002-logo_candidate-ea7dc277-2dd5-4d77-b91c-446e05f814b2.webp',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYC Pickleball page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party NYC Pickleball stacked logo was normalized locally to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Current NYC Pickleball league seasons', reason: 'The captured Spring/Summer 2026 rows have past starts as of 2026-07-31; no new season date is inferred.' },
    { title: 'NYC Pickleball events', reason: 'The events page is UNCHECKED and was not used.' },
    { title: 'NYC Pickleball lessons', sourceUrl: NYC_PICKLEBALL_BOOK_A_LESSON_URL, reason: 'The lesson booking page is UNCHECKED; no RENTAL candidate is created.' },
    { title: 'NYC Pickleball teams', reason: 'TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYC Pickleball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'nyc-pickleball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'NYC Pickleball', location: 'New York City', address: null, description: NYC_PICKLEBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NYC_PICKLEBALL_HOME_URL, sports: ['Pickleball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NYC Pickleball Leagues', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NYC_PICKLEBALL_HOME_URL, listUrl: NYC_PICKLEBALL_LEAGUES_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYC Pickleball package with one CLUB profile and five no-fixed-date EVENT league summaries; stale 2026 dates and unchecked event/lesson pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYC_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from stored NYC Pickleball leagues evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYC_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from stored NYC Pickleball leagues evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYC_PICKLEBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-nyc-pickleball-leagues-affiliate-source] failed', error); process.exitCode = 1; });
