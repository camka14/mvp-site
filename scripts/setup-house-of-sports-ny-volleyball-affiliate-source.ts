/** Operator-approved setup for the House of Sports NY stored-intake EVENT package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  HOUSE_OF_SPORTS_NY_CLUB_VOLLEYBALL_URL,
  HOUSE_OF_SPORTS_NY_HOME_URL,
  HOUSE_OF_SPORTS_NY_LOGO_SOURCE_URL,
  HOUSE_OF_SPORTS_NY_MAPPING,
  HOUSE_OF_SPORTS_NY_OFFICIAL_URLS,
  HOUSE_OF_SPORTS_NY_ORG_DESCRIPTION,
  HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE,
  HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT,
  HOUSE_OF_SPORTS_NY_SUMMER_CAMPS_URL,
  HOUSE_OF_SPORTS_NY_TRYOUT_URL,
  HOUSE_OF_SPORTS_NY_VOLLEYBALL_URL,
  HOUSE_OF_SPORTS_NY_WINTER_CAMPS_URL,
} from '../src/server/affiliateImports/houseOfSportsNyVolleyballSource';

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
const ORG_ID = 'affiliate_org_house_of_sports_ny';
const SOURCE_ID = 'affiliate_source_house_of_sports_ny_volleyball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-club-volleyball-tryout-registration-houseofsportsny-com';
const MAPPING_ID = 'affiliate_mapping_house_of_sports_ny_volleyball_v1';
const LOGO_FILE_ID = 'affiliate_file_house_of_sports_ny_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/houseOfSportsNyLogo.png');

const sourceMetadata = {
  sourceEvidence: HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE,
  inspectedAt: HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.houseofsportsny.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored House of Sports NY club-volleyball registration page is ALLOWED. Homepage, club, volleyball, camp, and FAQ pages are UNCHECKED and remain withheld or outbound-only.',
  reviewedUrls: [HOUSE_OF_SPORTS_NY_TRYOUT_URL],
  officialActionUrls: HOUSE_OF_SPORTS_NY_OFFICIAL_URLS,
  officialLogoSourceUrl: HOUSE_OF_SPORTS_NY_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-club-volleyball-tryout-registration-houseofsportsny-com/331f8261-d71b-4bb6-80e3-9665f6cd8664/002-logo_candidate-9c051d38-86cb-49e9-8cf9-a68bf7422bb4.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party House of Sports NY white wordmark candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#14213d',
  logoNote: 'The stored first-party white House of Sports NY wordmark was placed on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'House of Sports NY club, camps, and FAQ rows', reason: 'Those pages are UNCHECKED and remain outbound-only.' },
    { title: 'House of Sports NY venue and address', reason: 'The allowed registration page does not publish a venue or street address.' },
    { title: 'House of Sports NY team rows', reason: 'Age-specific registration links are preserved as official actions; TEAM mappings are out of scope.' },
  ],
  officialOutboundNotes: {
    home: HOUSE_OF_SPORTS_NY_HOME_URL,
    tryoutRegistration: HOUSE_OF_SPORTS_NY_TRYOUT_URL,
    clubVolleyball: HOUSE_OF_SPORTS_NY_CLUB_VOLLEYBALL_URL,
    volleyball: HOUSE_OF_SPORTS_NY_VOLLEYBALL_URL,
    summerCamps: HOUSE_OF_SPORTS_NY_SUMMER_CAMPS_URL,
    winterCamps: HOUSE_OF_SPORTS_NY_WINTER_CAMPS_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('House of Sports NY logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'house-of-sports-ny-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'house-of-sports-ny-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'house-of-sports-ny-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'House of Sports NY', location: null, address: null, description: HOUSE_OF_SPORTS_NY_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: HOUSE_OF_SPORTS_NY_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'House of Sports NY Volleyball Tryouts', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: HOUSE_OF_SPORTS_NY_HOME_URL, listUrl: HOUSE_OF_SPORTS_NY_TRYOUT_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake House of Sports NY EVENT package with 22 future 2026 club-volleyball tryout rows; unchecked program pages and location details remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: HOUSE_OF_SPORTS_NY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from the stored allowed House of Sports NY registration page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: HOUSE_OF_SPORTS_NY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from the stored allowed House of Sports NY registration page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.slice(0, 3).map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-house-of-sports-ny-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
