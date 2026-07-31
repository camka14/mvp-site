/** Local-only setup for the Cunningham Tennis stored-intake club and rental package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { CUNNINGHAM_DESCRIPTION, CUNNINGHAM_HOME_URL, CUNNINGHAM_LOGO_SOURCE_URL, CUNNINGHAM_MAPPING, CUNNINGHAM_SOURCE_EVIDENCE, CUNNINGHAM_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/cunninghamTennisSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_cunningham_tennis';
const SOURCE_ID = 'affiliate_source_cunningham_tennis';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-cunningham-tennis-cunninghamtennis-com';
const MAPPING_ID = 'affiliate_mapping_cunningham_tennis_v1';
const LOGO_FILE_ID = 'affiliate_file_cunningham_tennis_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/cunninghamTennisLogo.png');

const sourceMetadata = {
  sourceEvidence: CUNNINGHAM_SOURCE_EVIDENCE,
  inspectedAt: CUNNINGHAM_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://cunninghamtennis.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Cunningham Tennis homepage is ALLOWED. Program, event, rate, location, policy, and booking detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [CUNNINGHAM_HOME_URL],
  officialActionUrls: [CUNNINGHAM_HOME_URL, 'https://cunninghamtennis.com/summerjuniorprograms/', 'https://cunninghamtennis.com/summeradultprograms/', 'https://cunninghamtennis.com/summercamp/', 'https://www.catchcorner.com/facility-page/embedded/rental/1253'],
  officialLogoSourceUrl: CUNNINGHAM_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-cunningham-tennis-cunninghamtennis-com/b626a65c-6199-4481-a89d-d18e296df108/004-logo_candidate-f49edbea-5f7f-472e-b167-ef1810eb1687.jpg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Cunningham Tennis logo candidate 004',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Cunningham Tennis logo was normalized locally to an opaque 1024px square PNG on a white background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Cunningham Tennis programs and events', reason: 'Program, event, camp, rates, and location pages are UNCHECKED; the June 29, 2026 summer-session start is past and no dated event candidate is emitted.' },
    { title: 'Cunningham Tennis court booking', reason: 'The homepage supports an official CatchCorner booking link, but current price, live availability, hours, and address require the unchecked booking/rates pages.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Cunningham logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'cunningham-tennis-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'cunningham-tennis-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'cunningham-tennis-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Cunningham Tennis', location: 'New York, NY', address: null, description: CUNNINGHAM_DESCRIPTION, logoId, ownerId: owner.id, website: CUNNINGHAM_HOME_URL, sports: ['Tennis'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Cunningham Tennis', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: CUNNINGHAM_HOME_URL, listUrl: CUNNINGHAM_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Cunningham Tennis package with ongoing CLUB and RENTAL link-out candidates; past summer session and unchecked detail rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: CUNNINGHAM_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB/RENTAL mapping from stored Cunningham Tennis homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: CUNNINGHAM_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB/RENTAL mapping from stored Cunningham Tennis homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: CUNNINGHAM_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-cunningham-tennis-affiliate-source] failed', error); process.exitCode = 1; });
