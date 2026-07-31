/** Local-only setup for the Soccer Friends USA stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  SOCCER_FRIENDS_USA_ABOUT_URL,
  SOCCER_FRIENDS_USA_HOME_URL,
  SOCCER_FRIENDS_USA_LOGO_SOURCE_URL,
  SOCCER_FRIENDS_USA_MAPPING,
  SOCCER_FRIENDS_USA_MINDBODY_URL,
  SOCCER_FRIENDS_USA_ORG_DESCRIPTION,
  SOCCER_FRIENDS_USA_PROGRAMS_URL,
  SOCCER_FRIENDS_USA_SOURCE_EVIDENCE,
  SOCCER_FRIENDS_USA_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/soccerFriendsUsaSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_soccer_friends_usa';
const SOURCE_ID = 'affiliate_source_soccer_friends_usa';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-soccer-friends-usa-soccerfriendsusa-com';
const MAPPING_ID = 'affiliate_mapping_soccer_friends_usa_v1';
const LOGO_FILE_ID = 'affiliate_file_soccer_friends_usa_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/soccerFriendsUsaLogo.png');

const sourceMetadata = {
  sourceEvidence: SOCCER_FRIENDS_USA_SOURCE_EVIDENCE,
  inspectedAt: SOCCER_FRIENDS_USA_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.soccerfriendsusa.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Soccer Friends USA homepage is ALLOWED. Program, location, about, futsal, camp, travel-team, and Mindbody registration pages are UNCHECKED and remain withheld.',
  reviewedUrls: [SOCCER_FRIENDS_USA_HOME_URL],
  officialActionUrls: [SOCCER_FRIENDS_USA_HOME_URL, SOCCER_FRIENDS_USA_PROGRAMS_URL, SOCCER_FRIENDS_USA_ABOUT_URL, SOCCER_FRIENDS_USA_MINDBODY_URL, 'https://www.soccerfriendsusa.com/futsal-academy-leagues', 'https://www.soccerfriendsusa.com/programs/summer-camps'],
  officialLogoSourceUrl: SOCCER_FRIENDS_USA_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-soccer-friends-usa-soccerfriendsusa-com/4447a805-527d-468b-89cb-4bf8a307b5ad/002-logo_candidate-53ff1c9a-b994-4484-acc8-6327b8220bab.webp',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Soccer Friends USA page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Soccer Friends USA logo was normalized locally to an opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Soccer Friends USA current classes, camps, futsal, and program rows', reason: 'The stored homepage links to these pages, but their detail pages are UNCHECKED and no complete current date, time, venue, price, and registration rows are captured.' },
    { title: 'Soccer Friends USA locations', reason: 'The locations page is UNCHECKED; only Queens, NY context is retained from the allowed homepage.' },
    { title: 'Queensborough United Soccer Club travel teams', reason: 'Travel-team material is TEAM-oriented and TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Soccer Friends USA logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'soccer-friends-usa-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'soccer-friends-usa-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'soccer-friends-usa-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Soccer Friends USA', location: 'Queens, NY', address: null, description: SOCCER_FRIENDS_USA_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: SOCCER_FRIENDS_USA_HOME_URL, sports: ['Soccer'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Soccer Friends USA', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: SOCCER_FRIENDS_USA_HOME_URL, listUrl: SOCCER_FRIENDS_USA_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Soccer Friends USA club package with one ongoing CLUB profile; unchecked program, location, registration, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: SOCCER_FRIENDS_USA_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Soccer Friends USA evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: SOCCER_FRIENDS_USA_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Soccer Friends USA evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: SOCCER_FRIENDS_USA_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-soccer-friends-usa-affiliate-source] failed', error); process.exitCode = 1; });
