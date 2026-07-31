/** Operator-approved setup for the Cross Court Pickleball stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  CROSS_COURT_PICKLEBALL_BOOKING_URL,
  CROSS_COURT_PICKLEBALL_COMPETITION_URL,
  CROSS_COURT_PICKLEBALL_CORPORATE_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_FACEBOOK_URL,
  CROSS_COURT_PICKLEBALL_HOME_URL,
  CROSS_COURT_PICKLEBALL_LOGO_SOURCE_URL,
  CROSS_COURT_PICKLEBALL_MAPPING,
  CROSS_COURT_PICKLEBALL_ORG_DESCRIPTION,
  CROSS_COURT_PICKLEBALL_OFFICIAL_URLS,
  CROSS_COURT_PICKLEBALL_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_SCHEDULED_PLAY_URL,
  CROSS_COURT_PICKLEBALL_SOURCE_EVIDENCE,
  CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT,
  CROSS_COURT_PICKLEBALL_GROUP_RENTAL_URL,
  CROSS_COURT_PICKLEBALL_INSTAGRAM_URL,
  CROSS_COURT_PICKLEBALL_LEAGUES_URL,
  CROSS_COURT_PICKLEBALL_TOURNAMENTS_URL,
} from '../src/server/affiliateImports/crossCourtPickleballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  const liveDatabaseUrl = process.env.DATABASE_URL_LIVE?.trim();
  if (!liveDatabaseUrl) throw new Error('DATABASE_URL_LIVE is required with --live.');
  process.env.DATABASE_URL = liveDatabaseUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_cross_court_pickleball';
const SOURCE_ID = 'affiliate_source_cross_court_pickleball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-cross-court-pickleball-cc-pickleball-com';
const MAPPING_ID = 'affiliate_mapping_cross_court_pickleball_v1';
const LOGO_FILE_ID = 'affiliate_file_cross_court_pickleball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/crossCourtPickleballLogo.png');

const sourceMetadata = {
  sourceEvidence: CROSS_COURT_PICKLEBALL_SOURCE_EVIDENCE,
  inspectedAt: CROSS_COURT_PICKLEBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://cc-pickleball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Cross Court Pickleball homepage is ALLOWED. Competition, scheduled-play, membership, learning, facility, and rental pages are UNCHECKED and remain withheld.',
  reviewedUrls: [CROSS_COURT_PICKLEBALL_HOME_URL],
  officialActionUrls: CROSS_COURT_PICKLEBALL_OFFICIAL_URLS,
  officialLogoSourceUrl: CROSS_COURT_PICKLEBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-cross-court-pickleball-cc-pickleball-com/f9dbc9b7-945f-4ab3-9dc0-c76c3210829f/002-logo_candidate-a94ef85d-3060-4e7c-9b22-a44717541615.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Cross Court Pickleball homepage logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Cross Court Pickleball wordmark was placed on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Cross Court competition and scheduled-play rows', reason: 'The linked competition, league, tournament, and scheduled-play pages are UNCHECKED; no current dated rows are stored.' },
    { title: 'Cross Court court-rental rows', reason: 'The linked rental pages are UNCHECKED; no rental price, availability, or bookable inventory is stored.' },
  ],
  officialOutboundNotes: {
    booking: CROSS_COURT_PICKLEBALL_BOOKING_URL,
    competition: CROSS_COURT_PICKLEBALL_COMPETITION_URL,
    leagues: CROSS_COURT_PICKLEBALL_LEAGUES_URL,
    tournaments: CROSS_COURT_PICKLEBALL_TOURNAMENTS_URL,
    scheduledPlay: CROSS_COURT_PICKLEBALL_SCHEDULED_PLAY_URL,
    rental: CROSS_COURT_PICKLEBALL_RENTAL_URL,
    groupRental: CROSS_COURT_PICKLEBALL_GROUP_RENTAL_URL,
    corporateRental: CROSS_COURT_PICKLEBALL_CORPORATE_RENTAL_URL,
    facebook: CROSS_COURT_PICKLEBALL_FACEBOOK_URL,
    instagram: CROSS_COURT_PICKLEBALL_INSTAGRAM_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Cross Court Pickleball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'cross-court-pickleball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'cross-court-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'cross-court-pickleball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Cross Court Pickleball', location: 'Westchester County, NY', address: null, description: CROSS_COURT_PICKLEBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: CROSS_COURT_PICKLEBALL_HOME_URL, sports: ['Pickleball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Cross Court Pickleball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://cc-pickleball.com', listUrl: CROSS_COURT_PICKLEBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Cross Court Pickleball CLUB package. The allowed homepage supports an ongoing facility profile; unchecked competition and rental pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: CROSS_COURT_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Cross Court Pickleball homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: CROSS_COURT_PICKLEBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Cross Court Pickleball homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-cross-court-pickleball-affiliate-source] failed', error); process.exitCode = 1; });
