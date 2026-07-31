/** Operator-approved setup for the Asphalt Green soccer overview stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { ASPHALT_GREEN_AGSC_DESCRIPTION, ASPHALT_GREEN_AGSC_LOGO_URL, ASPHALT_GREEN_HOME_URL, ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING, ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE, ASPHALT_GREEN_SOCCER_OVERVIEW_STATIC_PAGE_CLIENT, ASPHALT_GREEN_SOCCER_URL } from '../src/server/affiliateImports/asphaltGreenSoccerOverviewSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_asphalt_green_soccer_overview';
const SOURCE_ID = 'affiliate_source_asphalt_green_soccer_overview';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-soccer-overview-asphaltgreen-org';
const MAPPING_ID = 'affiliate_mapping_asphalt_green_soccer_overview_v1';
const LOGO_FILE_ID = 'affiliate_file_asphalt_green_soccer_overview_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/asphaltGreenSoccerOverviewLogo.png');

const sourceMetadata = {
  sourceEvidence: ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE,
  inspectedAt: ASPHALT_GREEN_SOCCER_OVERVIEW_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.asphaltgreen.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored public soccer overview is ALLOWED. AGSC teams, tryout, class, league, rental, and program detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [ASPHALT_GREEN_SOCCER_URL],
  officialActionUrls: [ASPHALT_GREEN_SOCCER_URL, 'https://www.asphaltgreen.org/classes/?p_event_category=1992', 'https://account.asphaltgreen.org/s/tryout/a5zUX00000GXYeZYAX/agsc-202627-tryouts?source=AG%20Website%20Soccer%20Overview'],
  officialLogoSourceUrl: ASPHALT_GREEN_AGSC_LOGO_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-soccer-overview-asphaltgreen-org/e96e90ff-70a6-4271-80e4-33fbb469ee15/004-logo_candidate-2da17ff6-891f-4da8-8c0f-e455ae642c28.svg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party AGSC logo candidate 004',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party AGSC logo was rasterized and normalized locally to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'AGSC tryouts', reason: 'The overview links to a tryout registration URL, but the registration/detail path is UNCHECKED and no current date, venue, or price row is stored.' },
    { title: 'Soccer classes, leagues, lessons, and rentals', reason: 'The overview describes these programs but does not provide complete current date, venue, price, and registration rows; their linked detail pages are UNCHECKED.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Asphalt Green Soccer overview logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'asphalt-green-soccer-overview-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'asphalt-green-soccer-overview-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'asphalt-green-soccer-overview-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Asphalt Green Soccer Club', location: 'New York, NY', address: null, description: ASPHALT_GREEN_AGSC_DESCRIPTION, logoId, ownerId: owner.id, website: ASPHALT_GREEN_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Asphalt Green Soccer Overview', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ASPHALT_GREEN_HOME_URL, listUrl: ASPHALT_GREEN_SOCCER_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake soccer overview package with one ongoing CLUB profile; unchecked dated programs, tryouts, rentals, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Asphalt Green soccer overview evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ASPHALT_GREEN_SOCCER_OVERVIEW_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Asphalt Green soccer overview evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ASPHALT_GREEN_SOCCER_OVERVIEW_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-asphalt-green-soccer-overview-affiliate-source] failed', error); process.exitCode = 1; });
