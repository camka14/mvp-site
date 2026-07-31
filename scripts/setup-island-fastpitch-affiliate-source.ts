/** Local-only setup for the Island Fastpitch stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ISLAND_FASTPITCH_HOME_URL,
  ISLAND_FASTPITCH_LOGO_SOURCE_URL,
  ISLAND_FASTPITCH_MAPPING,
  ISLAND_FASTPITCH_OFFICIAL_URLS,
  ISLAND_FASTPITCH_ORG_DESCRIPTION,
  ISLAND_FASTPITCH_SOURCE_EVIDENCE,
  ISLAND_FASTPITCH_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/islandFastpitchSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_island_fastpitch';
const SOURCE_ID = 'affiliate_source_island_fastpitch';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-home-islandfastpitch-com';
const MAPPING_ID = 'affiliate_mapping_island_fastpitch_v1';
const LOGO_FILE_ID = 'affiliate_file_island_fastpitch_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/islandFastpitchLogo.png');

const sourceMetadata = {
  sourceEvidence: ISLAND_FASTPITCH_SOURCE_EVIDENCE,
  inspectedAt: ISLAND_FASTPITCH_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.islandfastpitch.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Island Fastpitch homepage is ALLOWED. League, tournament, event, clinic, field, registration, roster, and policy pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [ISLAND_FASTPITCH_HOME_URL],
  officialActionUrls: ISLAND_FASTPITCH_OFFICIAL_URLS,
  officialLogoSourceUrl: ISLAND_FASTPITCH_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-home-islandfastpitch-com/cfdb3d9b-a9df-4677-b9ba-10477396e61b/002-logo_candidate-cdf9dc53-58c1-455e-8420-779968b543d8.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Island Fastpitch homepage logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#141e2d',
  logoNote: 'The stored first-party white Island Fastpitch logo was normalized locally to an opaque 1024px square PNG on a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Island Fastpitch league, tournament, event, and clinic rows', reason: 'The corresponding official pages are UNCHECKED and the allowed homepage has no complete current dated rows.' },
    { title: 'Island Fastpitch fields and registration inventory', reason: 'Fields and registration URLs are UNCHECKED; no venue, address, price, or availability is stored.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Island Fastpitch logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'island-fastpitch-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'island-fastpitch-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'island-fastpitch-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Island Fastpitch', location: null, address: null, description: ISLAND_FASTPITCH_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ISLAND_FASTPITCH_HOME_URL, sports: ['Softball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Island Fastpitch Home', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ISLAND_FASTPITCH_HOME_URL, listUrl: ISLAND_FASTPITCH_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Island Fastpitch CLUB package; unchecked league, tournament, event, clinic, field, and registration inventory remains withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ISLAND_FASTPITCH_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Island Fastpitch homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ISLAND_FASTPITCH_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Island Fastpitch homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ISLAND_FASTPITCH_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-island-fastpitch-affiliate-source] failed', error); process.exitCode = 1; });
