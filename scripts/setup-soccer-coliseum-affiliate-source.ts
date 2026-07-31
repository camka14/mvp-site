/** Local-only setup for the Soccer Coliseum stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  SOCCER_COLISEUM_ABOUT_URL,
  SOCCER_COLISEUM_ADULT_LEAGUES_URL,
  SOCCER_COLISEUM_CAMPS_URL,
  SOCCER_COLISEUM_CONTACT_URL,
  SOCCER_COLISEUM_HOME_URL,
  SOCCER_COLISEUM_LOGO_SOURCE_URL,
  SOCCER_COLISEUM_MAPPING,
  SOCCER_COLISEUM_ORG_DESCRIPTION,
  SOCCER_COLISEUM_RENTALS_URL,
  SOCCER_COLISEUM_SCHEDULE_URL,
  SOCCER_COLISEUM_SOURCE_EVIDENCE,
  SOCCER_COLISEUM_STATIC_PAGE_CLIENT,
  SOCCER_COLISEUM_TOURNAMENTS_URL,
  SOCCER_COLISEUM_YOUTH_LEAGUES_URL,
  SOCCER_COLISEUM_YOUTH_TRAINING_URL,
} from '../src/server/affiliateImports/soccerColiseumSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_soccer_coliseum';
const SOURCE_ID = 'affiliate_source_soccer_coliseum';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-tournament-schedule-soccercoliseum-com';
const MAPPING_ID = 'affiliate_mapping_soccer_coliseum_v1';
const LOGO_FILE_ID = 'affiliate_file_soccer_coliseum_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/soccerColiseumLogo.png');

const sourceMetadata = {
  sourceEvidence: SOCCER_COLISEUM_SOURCE_EVIDENCE,
  inspectedAt: SOCCER_COLISEUM_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://soccercoliseum.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Soccer Coliseum tournament schedule is ALLOWED. Tournament overview, leagues, camps, training, rental, about, contact, and policy pages are UNCHECKED and remain withheld.',
  reviewedUrls: [SOCCER_COLISEUM_SCHEDULE_URL],
  officialActionUrls: [SOCCER_COLISEUM_HOME_URL, SOCCER_COLISEUM_SCHEDULE_URL, SOCCER_COLISEUM_TOURNAMENTS_URL, SOCCER_COLISEUM_YOUTH_LEAGUES_URL, SOCCER_COLISEUM_ADULT_LEAGUES_URL, SOCCER_COLISEUM_YOUTH_TRAINING_URL, SOCCER_COLISEUM_CAMPS_URL, SOCCER_COLISEUM_RENTALS_URL, SOCCER_COLISEUM_ABOUT_URL, SOCCER_COLISEUM_CONTACT_URL, 'https://www.instagram.com/soccercoliseum/', 'https://www.youtube.com/@soccercoliseum', 'https://www.tiktok.com/@soccercoliseum'],
  officialLogoSourceUrl: SOCCER_COLISEUM_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-tournament-schedule-soccercoliseum-com/446e15cf-0277-4a42-9317-96a06c5f627f/006-logo_candidate-d9b4fc6b-7371-47bf-b689-b4071041b79a.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Soccer Coliseum transparent logo candidate 006',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Soccer Coliseum mark was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Winter 2025-2026 tournament rows', reason: 'The stored listing explicitly says the displayed schedule is the previous Winter season; all listed tournaments are stale.' },
    { title: 'Winter 2026-2027 tournament dates', reason: 'The stored listing says the upcoming schedule is coming soon and publishes no dates yet.' },
    { title: 'Soccer Coliseum rental and league inventory', reason: 'The stored rental, league, camp, training, and other pages are UNCHECKED.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Soccer Coliseum logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'soccer-coliseum-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'soccer-coliseum-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'soccer-coliseum-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'The Soccer Coliseum', location: 'Teaneck, NJ', address: null, description: SOCCER_COLISEUM_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: SOCCER_COLISEUM_HOME_URL, sports: ['Soccer'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'The Soccer Coliseum', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: SOCCER_COLISEUM_HOME_URL, listUrl: SOCCER_COLISEUM_SCHEDULE_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Soccer Coliseum CLUB package with one ongoing tournament-arena profile. The displayed winter schedule is explicitly previous-season reference, Winter 2026-2027 dates are coming soon, and rental/league pages remain unchecked; no EVENT or RENTAL candidate is created.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: SOCCER_COLISEUM_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Soccer Coliseum tournament schedule.', validatedAt: null }, update: { version: 1, isActive: true, mapping: SOCCER_COLISEUM_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Soccer Coliseum tournament schedule.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: SOCCER_COLISEUM_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-soccer-coliseum-affiliate-source] failed', error); process.exitCode = 1; });
