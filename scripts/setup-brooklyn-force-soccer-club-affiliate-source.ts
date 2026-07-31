/** Local-only setup for the Brooklyn Force Soccer stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { BROOKLYN_FORCE_HOME_URL, BROOKLYN_FORCE_LOGO_SOURCE_URL, BROOKLYN_FORCE_MAPPING, BROOKLYN_FORCE_ORG_DESCRIPTION, BROOKLYN_FORCE_SOURCE_EVIDENCE, BROOKLYN_FORCE_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/brooklynForceSoccerClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_brooklyn_force_soccer_club';
const SOURCE_ID = 'affiliate_source_brooklyn_force_soccer_club';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-brooklyn-soccer-club-for-kids-adults-brooklynforcesoccer-com';
const MAPPING_ID = 'affiliate_mapping_brooklyn_force_soccer_club_v1';
const LOGO_FILE_ID = 'affiliate_file_brooklyn_force_soccer_club_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/brooklynForceSoccerClubLogo.png');

const sourceMetadata = {
  sourceEvidence: BROOKLYN_FORCE_SOURCE_EVIDENCE,
  inspectedAt: BROOKLYN_FORCE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'http://www.brooklynforcesoccer.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Brooklyn Force home page is ALLOWED. Program, tryout, rental, league, and team detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [BROOKLYN_FORCE_HOME_URL],
  officialActionUrls: [BROOKLYN_FORCE_HOME_URL, 'http://www.brooklynforcesoccer.com/tryouts', 'http://www.brooklynforcesoccer.com/rentals'],
  officialLogoSourceUrl: BROOKLYN_FORCE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-brooklyn-soccer-club-for-kids-adults-brooklynforcesoccer-com/84516571-7fd8-4d57-9ae1-5b4d09995373/002-logo_candidate-5517fe7a-0f92-4f20-b446-df8d7ae63476.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Brooklyn Force lock-up logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Brooklyn Force lock-up logo was normalized locally to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Brooklyn Force programs and tryouts', reason: 'The stored home page describes programs and links to tryouts, but the detail and registration pages are UNCHECKED and do not provide captured complete current rows.' },
    { title: 'Brooklyn Force rentals and teams', reason: 'Rental and team paths are UNCHECKED; no rental or TEAM candidate is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Brooklyn Force logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'brooklyn-force-soccer-club-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'brooklyn-force-soccer-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'brooklyn-force-soccer-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Brooklyn Force Soccer', location: 'Brooklyn, NY', address: null, description: BROOKLYN_FORCE_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: BROOKLYN_FORCE_HOME_URL, sports: ['Soccer'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Brooklyn Force Soccer Club', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: BROOKLYN_FORCE_HOME_URL, listUrl: BROOKLYN_FORCE_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Brooklyn Force club package with one ongoing CLUB profile; unchecked program, tryout, rental, league, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: BROOKLYN_FORCE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Brooklyn Force evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: BROOKLYN_FORCE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Brooklyn Force evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: BROOKLYN_FORCE_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-brooklyn-force-soccer-club-affiliate-source] failed', error); process.exitCode = 1; });
