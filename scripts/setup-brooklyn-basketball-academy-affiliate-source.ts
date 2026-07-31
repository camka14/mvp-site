/** Operator-approved setup for the Brooklyn Basketball Academy stored-intake club package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { BBA_HOME_URL, BBA_LOGO_SOURCE_URL, BBA_MAPPING, BBA_ORG_DESCRIPTION, BBA_SOURCE_EVIDENCE, BBA_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/brooklynBasketballAcademySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_brooklyn_basketball_academy';
const SOURCE_ID = 'affiliate_source_brooklyn_basketball_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-bba-bkbasketballacademy-com';
const MAPPING_ID = 'affiliate_mapping_brooklyn_basketball_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_brooklyn_basketball_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/brooklynBasketballAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: BBA_SOURCE_EVIDENCE,
  inspectedAt: BBA_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.bkbasketballacademy.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored BBA homepage is ALLOWED. Program, camp, clinic, AAU/Travel, team, and rental detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [BBA_HOME_URL],
  officialActionUrls: [BBA_HOME_URL, 'https://www.bkbasketballacademy.com/bklynruns', 'https://www.bkbasketballacademy.com/summer', 'https://www.bkbasketballacademy.com/programs', 'https://www.bkbasketballacademy.com/rentals', 'https://www.bkbasketballacademy.com/rentals/sunset-park', 'https://www.bkbasketballacademy.com/rentals/gowanus', 'https://www.bkbasketballacademy.com/rentals/dumbo'],
  officialLogoSourceUrl: BBA_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-bba-bkbasketballacademy-com/85f8ce8b-0fa7-4d2a-a2ac-d440a8b42c34/004-logo_candidate-10d1be12-23a3-4157-b63b-ce7427d8b468.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party BBA basketball-mark logo candidate 004',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#c8ff00',
  logoNote: 'The stored first-party BBA basketball mark was normalized locally to an opaque 1024px square PNG on its neon-lime brand background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'BBA summer competition, camps, and fall season', reason: 'The stored homepage contains date text, but summer ranges do not state a year and linked listing/detail pages are UNCHECKED; no dated EVENT candidate is inferred.' },
    { title: 'BBA gym rentals and private events', reason: 'The stored homepage lists rental callouts and addresses, but rental pages are UNCHECKED and do not provide price, availability, or booking details in the allowed capture; no RENTAL candidate is inferred.' },
    { title: 'BBA AAU/Travel teams and programs', reason: 'AAU/Travel and program pages are UNCHECKED; no TEAM candidate is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('BBA logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'brooklyn-basketball-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'brooklyn-basketball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'brooklyn-basketball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Brooklyn Basketball Academy (BBA)', location: 'Brooklyn, NY', address: null, description: BBA_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: BBA_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Brooklyn Basketball Academy (BBA)', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: BBA_HOME_URL, listUrl: BBA_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake BBA club package with one ongoing CLUB profile; unchecked event, program, team, and rental rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: BBA_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored BBA homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: BBA_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored BBA homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: BBA_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-brooklyn-basketball-academy-affiliate-source] failed', error); process.exitCode = 1; });
