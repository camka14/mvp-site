/** Local-only setup for the Socceroof New York stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { SOCCEROOF_LOGO_SOURCE_URL, SOCCEROOF_NEW_YORK_HOME_URL, SOCCEROOF_NEW_YORK_MAPPING, SOCCEROOF_NEW_YORK_ORG_DESCRIPTION, SOCCEROOF_NEW_YORK_RENTAL_URL, SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE, SOCCEROOF_NEW_YORK_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/socceroofNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_socceroof_new_york';
const SOURCE_ID = 'affiliate_source_socceroof_new_york';
const SOURCE_KEY = 'socceroof-new-york-indoor-soccer';
const MAPPING_ID = 'affiliate_mapping_socceroof_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_socceroof_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/socceroofLogo.png');

const sourceMetadata = {
  sourceEvidence: SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: SOCCEROOF_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.socceroof.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Socceroof homepage is ALLOWED; rental, directory, program, and event pages marked UNCHECKED remain evidence-scoped.',
  reviewedUrls: [SOCCEROOF_NEW_YORK_HOME_URL],
  officialActionUrls: [SOCCEROOF_NEW_YORK_HOME_URL, SOCCEROOF_NEW_YORK_RENTAL_URL],
  officialLogoSourceUrl: SOCCEROOF_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Socceroof page-branding SVG logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Socceroof SVG was rendered and normalized to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York club locations', reason: 'The homepage lists five New York clubs but the individual directory pages were not captured with complete addresses and current program rows.' },
    { title: 'Globe Cup and other events', reason: 'The captured Globe Cup text is past or incomplete as of 2026-07-31; other event/program detail pages were UNCHECKED and are not imported.' },
    { title: 'Rental details', reason: 'The official rental path is preserved as an ongoing link-out candidate, but current price, availability, and specific facility details were not captured.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Socceroof logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'socceroof-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'socceroof-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'socceroof-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Socceroof New York', location: 'New York', address: null, description: SOCCEROOF_NEW_YORK_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: SOCCEROOF_NEW_YORK_HOME_URL, sports: ['Soccer'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Socceroof New York Indoor Soccer', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://www.socceroof.com', listUrl: SOCCEROOF_NEW_YORK_HOME_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Socceroof club and rental package; unverified detail rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: SOCCEROOF_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored Socceroof New York evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: SOCCEROOF_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored Socceroof New York evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: SOCCEROOF_NEW_YORK_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-socceroof-new-york-affiliate-source] failed', error); process.exitCode = 1; });
