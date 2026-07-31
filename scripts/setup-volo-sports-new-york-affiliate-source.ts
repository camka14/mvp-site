/** Local-only setup for the Volo Sports New York stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { VOLO_NEW_YORK_HOME_URL, VOLO_NEW_YORK_LOGO_SOURCE_URL, VOLO_NEW_YORK_MAPPING, VOLO_NEW_YORK_ORG_DESCRIPTION, VOLO_NEW_YORK_SOURCE_EVIDENCE, VOLO_NEW_YORK_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/voloSportsNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_volo_sports_new_york';
const SOURCE_ID = 'affiliate_source_volo_sports_new_york';
const SOURCE_KEY = 'volo-sports-new-york-metro-area';
const MAPPING_ID = 'affiliate_mapping_volo_sports_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_volo_sports_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/voloSportsLogo.png');

const sourceMetadata = {
  sourceEvidence: VOLO_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: VOLO_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.volosports.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored New York Metro Area listing and four sport pages are ALLOWED; discovery, signup, and event paths marked UNCHECKED remain evidence-scoped.',
  reviewedUrls: [VOLO_NEW_YORK_HOME_URL, 'https://www.volosports.com/new-york-metro-area/flag-football', 'https://www.volosports.com/new-york-metro-area/pickleball', 'https://www.volosports.com/new-york-metro-area/softball', 'https://www.volosports.com/new-york-metro-area/volleyball'],
  officialActionUrls: [VOLO_NEW_YORK_HOME_URL, 'https://www.volosports.com/discover/new-york-metro-area?category=leagues'],
  officialLogoSourceUrl: VOLO_NEW_YORK_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Volo Sports JSON-LD organization logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Volo Sports wordmark was normalized to an opaque 1024px square PNG without altering the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York league and pickup rows', reason: 'The stored pages describe formats and signup paths but no complete current date, time, venue, price, and registration rows.' },
    { title: 'Discover and event detail rows', reason: 'Discovery/event paths were UNCHECKED or not captured with complete current rows; no candidate is inferred from URL-only evidence.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Volo Sports logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'volo-sports-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'volo-sports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'volo-sports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Volo Sports New York Metro Area', location: 'New York Metro Area', address: null, description: VOLO_NEW_YORK_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: VOLO_NEW_YORK_HOME_URL, sports: ['Multi-sport'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Volo Sports New York Metro Area', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://www.volosports.com', listUrl: VOLO_NEW_YORK_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake multi-sport club package; incomplete dated registration and event rows are withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: VOLO_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Volo Sports New York evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: VOLO_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Volo Sports New York evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: VOLO_NEW_YORK_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-volo-sports-new-york-affiliate-source] failed', error); process.exitCode = 1; });
