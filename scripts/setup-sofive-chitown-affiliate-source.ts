/** Operator-approved setup for the Sofive Chitown stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  SOFIVE_CHITOWN_HOME_URL,
  SOFIVE_CHITOWN_LEAGUES_URL,
  SOFIVE_CHITOWN_LOCATION_URL,
  SOFIVE_CHITOWN_LOGO_SOURCE_URL,
  SOFIVE_CHITOWN_MAPPING,
  SOFIVE_CHITOWN_ORG_DESCRIPTION,
  SOFIVE_CHITOWN_PICKUP_URL,
  SOFIVE_CHITOWN_RENTAL_URL,
  SOFIVE_CHITOWN_SOURCE_EVIDENCE,
  SOFIVE_CHITOWN_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/sofiveChitownSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_sofive_chitown';
const SOURCE_ID = 'affiliate_source_sofive_chitown';
const SOURCE_KEY = 'sofive-chitown-indoor-soccer';
const MAPPING_ID = 'affiliate_mapping_sofive_chitown_v1';
const ORGANIZATION_NAME = 'Sofive Chitown';
const LOGO_FILE_ID = 'affiliate_file_sofive_chitown_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/sofiveChitownLogo.png');

const sourceMetadata = {
  sourceEvidence: SOFIVE_CHITOWN_SOURCE_EVIDENCE,
  inspectedAt: SOFIVE_CHITOWN_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.sofive.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the Chitown location page ALLOWED; linked program and rental pages are retained as UNCHECKED evidence and are not blindly fetched.',
  reviewedUrls: [SOFIVE_CHITOWN_HOME_URL, SOFIVE_CHITOWN_LOCATION_URL, SOFIVE_CHITOWN_RENTAL_URL, SOFIVE_CHITOWN_PICKUP_URL, SOFIVE_CHITOWN_LEAGUES_URL],
  officialActionUrls: [SOFIVE_CHITOWN_LOCATION_URL, SOFIVE_CHITOWN_RENTAL_URL, SOFIVE_CHITOWN_PICKUP_URL, SOFIVE_CHITOWN_LEAGUES_URL],
  officialLogoSourceUrl: SOFIVE_CHITOWN_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official Sofive JSON-LD organization logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Sofive SVG was rendered and normalized to an opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Chitown adult and youth leagues', sourceUrl: SOFIVE_CHITOWN_LEAGUES_URL, reason: 'The stored location page provides links but no complete current date, time, price, and registration rows.' },
    { title: 'Chitown pickup and classes', sourceUrl: SOFIVE_CHITOWN_PICKUP_URL, reason: 'The linked detail pages were not captured with complete current session rows.' },
    { title: 'Chitown tournaments and events', reason: 'The stored location page links to event paths but does not provide complete current rows; dated items shown are not safe to infer as current.' },
    { title: 'Sofive teams', reason: 'TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Sofive logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'sofive-chitown-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'sofive-chitown-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'sofive-chitown-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: ORGANIZATION_NAME, location: 'Chicago, IL', address: '2343 S Throop St, Chicago, IL 60608', description: SOFIVE_CHITOWN_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: SOFIVE_CHITOWN_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: ORGANIZATION_NAME, sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: SOFIVE_CHITOWN_HOME_URL, listUrl: SOFIVE_CHITOWN_LOCATION_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake Sofive Chitown club and rental package; dated program rows are withheld, automation remains disabled, and mapping validation remains human-gated.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: SOFIVE_CHITOWN_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB/RENTAL manual mapping from stored Sofive Chitown evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: SOFIVE_CHITOWN_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB/RENTAL manual mapping from stored Sofive Chitown evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: SOFIVE_CHITOWN_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-sofive-chitown-affiliate-source] failed', error); process.exitCode = 1; });
