/** Local-only setup for the VBLI stored-intake tournament package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { VBLI_GRASS_TOURNAMENT_MAPPING, VBLI_GRASS_TOURNAMENT_STATIC_PAGE_CLIENT, VBLI_GRASS_TOURNAMENTS_URL, VBLI_HOME_URL, VBLI_LOGO_SOURCE_URL, VBLI_ORG_DESCRIPTION, VBLI_SOURCE_EVIDENCE } from '../src/server/affiliateImports/vbliGrassTournamentsSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_vbli';
const SOURCE_ID = 'affiliate_source_vbli_grass_tournaments';
const SOURCE_KEY = 'vbli-grass-volleyball-tournaments';
const MAPPING_ID = 'affiliate_mapping_vbli_grass_tournaments_v1';
const LOGO_FILE_ID = 'affiliate_file_vbli_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/vbliLogo.png');

const sourceMetadata = {
  sourceEvidence: VBLI_SOURCE_EVIDENCE,
  inspectedAt: VBLI_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.vbli.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored VBLI homepage and grass-tournament listing are ALLOWED; event detail pages are UNCHECKED discovery evidence and are not blindly fetched.',
  reviewedUrls: [VBLI_HOME_URL, VBLI_GRASS_TOURNAMENTS_URL],
  officialActionUrls: [VBLI_HOME_URL, VBLI_GRASS_TOURNAMENTS_URL],
  officialLogoSourceUrl: VBLI_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party VBLI page-branding logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party VBLI logo was normalized to an opaque 1024px square PNG without altering the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Past tournament rows', reason: 'The captured listing includes July 2025 and July 2026 rows that were past on 2026-07-31.' },
    { title: 'Future discovered event detail pages', reason: 'The source map discovered future September and October URLs but did not capture complete detail rows; no dates, times, venues, prices, or actions are inferred from URLs alone.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('VBLI logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'vbli-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'vbli-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'vbli-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'VBLI', location: null, address: null, description: VBLI_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: VBLI_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'VBLI Grass Volleyball Tournaments', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: VBLI_HOME_URL, listUrl: VBLI_GRASS_TOURNAMENTS_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake VBLI tournament package; past and discovered-but-uncaptured rows are withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: VBLI_GRASS_TOURNAMENT_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from stored VBLI grass tournament evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: VBLI_GRASS_TOURNAMENT_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from stored VBLI grass tournament evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: VBLI_GRASS_TOURNAMENT_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-vbli-grass-tournaments-affiliate-source] failed', error); process.exitCode = 1; });
