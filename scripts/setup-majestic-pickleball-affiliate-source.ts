/** Local-only setup for the Majestic Pickleball stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  MAJESTIC_PICKLEBALL_APPOINTMENTS_URL,
  MAJESTIC_PICKLEBALL_BOOK_EVENT_URL,
  MAJESTIC_PICKLEBALL_BOOK_LESSON_URL,
  MAJESTIC_PICKLEBALL_HOME_URL,
  MAJESTIC_PICKLEBALL_INSTAGRAM_URL,
  MAJESTIC_PICKLEBALL_LOGO_SOURCE_URL,
  MAJESTIC_PICKLEBALL_MAPPING,
  MAJESTIC_PICKLEBALL_OFFICIAL_URLS,
  MAJESTIC_PICKLEBALL_ORG_DESCRIPTION,
  MAJESTIC_PICKLEBALL_REGALIA_URL,
  MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE,
  MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT,
  MAJESTIC_PICKLEBALL_STORE_URL,
} from '../src/server/affiliateImports/majesticPickleballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_majestic_pickleball';
const SOURCE_ID = 'affiliate_source_majestic_pickleball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-majestic-pickleball-majesticpickleball-com';
const MAPPING_ID = 'affiliate_mapping_majestic_pickleball_v1';
const LOGO_FILE_ID = 'affiliate_file_majestic_pickleball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/majesticPickleballLogo.png');

const sourceMetadata = {
  sourceEvidence: MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE,
  inspectedAt: MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://majesticpickleball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Majestic Pickleball homepage is ALLOWED. Booking, appointment, store, about, and event pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [MAJESTIC_PICKLEBALL_HOME_URL],
  officialActionUrls: MAJESTIC_PICKLEBALL_OFFICIAL_URLS,
  officialLogoSourceUrl: MAJESTIC_PICKLEBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-majestic-pickleball-majesticpickleball-com/7b3cfe42-f28f-4f18-89ab-911a3f5656a2/002-logo_candidate-7c703e9c-86e8-452b-828a-ac81fede89c0.webp',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Majestic Pickleball homepage logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#000000',
  logoNote: 'The stored first-party Majestic Pickleball logo was normalized to an opaque 1024px square PNG on black without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Majestic Pickleball lesson and appointment rows', reason: 'The booking and appointment pages are UNCHECKED and the allowed homepage has no current dated lesson rows.' },
    { title: 'Majestic Pickleball special-event and rental rows', reason: 'The bookevent and book-lesson paths are UNCHECKED; no current event date, venue, or rental inventory is stored.' },
    { title: 'Majestic Pickleball store products', reason: 'Store pages are UNCHECKED and are not affiliate EVENT, RENTAL, or CLUB inventory.' },
  ],
  officialOutboundNotes: {
    home: MAJESTIC_PICKLEBALL_HOME_URL,
    bookLesson: MAJESTIC_PICKLEBALL_BOOK_LESSON_URL,
    appointments: MAJESTIC_PICKLEBALL_APPOINTMENTS_URL,
    bookEvent: MAJESTIC_PICKLEBALL_BOOK_EVENT_URL,
    store: MAJESTIC_PICKLEBALL_STORE_URL,
    instagram: MAJESTIC_PICKLEBALL_INSTAGRAM_URL,
    equipmentPartner: MAJESTIC_PICKLEBALL_REGALIA_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Majestic Pickleball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'majestic-pickleball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'majestic-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'majestic-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Majestic Pickleball', location: null, address: null, description: MAJESTIC_PICKLEBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: MAJESTIC_PICKLEBALL_HOME_URL, sports: ['Pickleball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Majestic Pickleball Coaching', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: MAJESTIC_PICKLEBALL_HOME_URL, listUrl: MAJESTIC_PICKLEBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Majestic Pickleball CLUB package; unchecked booking pages and undated lesson/event inventory remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: MAJESTIC_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Majestic Pickleball homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: MAJESTIC_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Majestic Pickleball homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-majestic-pickleball-affiliate-source] failed', error); process.exitCode = 1; });
