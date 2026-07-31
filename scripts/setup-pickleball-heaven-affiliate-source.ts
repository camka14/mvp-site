/** Operator-approved setup for the Pickleball Heaven stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PICKLEBALL_HEAVEN_BOOK_EVENT_URL,
  PICKLEBALL_HEAVEN_CORPORATE_EVENTS_URL,
  PICKLEBALL_HEAVEN_HOME_URL,
  PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  PICKLEBALL_HEAVEN_MAPPING,
  PICKLEBALL_HEAVEN_OFFICIAL_URLS,
  PICKLEBALL_HEAVEN_ORG_DESCRIPTION,
  PICKLEBALL_HEAVEN_SOURCE_EVIDENCE,
  PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT,
  PICKLEBALL_HEAVEN_TOURNAMENTS_URL,
} from '../src/server/affiliateImports/pickleballHeavenSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_pickleball_heaven';
const SOURCE_ID = 'affiliate_source_pickleball_heaven';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-pickleball-tournaments-events-thepickleballheaven-com';
const MAPPING_ID = 'affiliate_mapping_pickleball_heaven_v1';
const LOGO_FILE_ID = 'affiliate_file_pickleball_heaven_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/pickleballHeavenLogo.png');

const sourceMetadata = {
  sourceEvidence: PICKLEBALL_HEAVEN_SOURCE_EVIDENCE,
  inspectedAt: PICKLEBALL_HEAVEN_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.thepickleballheaven.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored tournament listing is ALLOWED. The homepage, corporate-events, book-event, academy, camp, and other detail pages are UNCHECKED; they remain outbound-only except for evidence-backed summaries from the stored page capture.',
  reviewedUrls: [PICKLEBALL_HEAVEN_HOME_URL, PICKLEBALL_HEAVEN_TOURNAMENTS_URL],
  officialActionUrls: PICKLEBALL_HEAVEN_OFFICIAL_URLS,
  officialLogoSourceUrl: PICKLEBALL_HEAVEN_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-pickleball-tournaments-events-thepickleballheaven-com/114af377-7c85-4486-ae91-9ecf4b544224/003-logo_candidate-78c487b5-a25b-41d7-98cf-ab8cd82796a4.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Pickleball Heaven favicon/logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Pickleball Heaven favicon logo was normalized locally to an opaque 1024px square PNG on white.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Pickleball Heaven tournament events', reason: 'The stored ALLOWED tournament listing has no complete dated tournament rows in the captured evidence; no EVENT candidate is inferred.' },
    { title: 'Pickleball Heaven academy, camp, open-play, and membership inventory', reason: 'Those official pages are UNCHECKED and no current dated or priced rows are stored.' },
    { title: 'Pickleball Heaven corporate-event packages and live rental availability', reason: 'The stored homepage supports the private-booking path, but the corporate-events and book-event pages are UNCHECKED; current availability, package details, and price remain unset.' },
  ],
  officialOutboundNotes: {
    home: PICKLEBALL_HEAVEN_HOME_URL,
    tournaments: PICKLEBALL_HEAVEN_TOURNAMENTS_URL,
    corporateEvents: PICKLEBALL_HEAVEN_CORPORATE_EVENTS_URL,
    bookEvent: PICKLEBALL_HEAVEN_BOOK_EVENT_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Pickleball Heaven logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'pickleball-heaven-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'pickleball-heaven-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'pickleball-heaven-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Pickleball Heaven', location: 'Medford, NY', address: '645 National Blvd, Medford, NY 11763', description: PICKLEBALL_HEAVEN_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: PICKLEBALL_HEAVEN_HOME_URL, sports: ['Pickleball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Pickleball Heaven Tournaments & Events', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: PICKLEBALL_HEAVEN_HOME_URL, listUrl: PICKLEBALL_HEAVEN_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Pickleball Heaven CLUB and RENTAL package; dated tournament rows and unchecked detail-page inventory remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: PICKLEBALL_HEAVEN_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping with a manual RENTAL link-out from the stored Pickleball Heaven evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: PICKLEBALL_HEAVEN_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping with a manual RENTAL link-out from the stored Pickleball Heaven evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-pickleball-heaven-affiliate-source] failed', error); process.exitCode = 1; });
