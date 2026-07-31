/** Local-only setup for the NYC VolleyVerse stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NYC_VOLLEYVERSE_CLASSES_BROOKLYN_URL,
  NYC_VOLLEYVERSE_CLASSES_STATEN_ISLAND_URL,
  NYC_VOLLEYVERSE_HOME_URL,
  NYC_VOLLEYVERSE_LOGO_SOURCE_URL,
  NYC_VOLLEYVERSE_MAPPING,
  NYC_VOLLEYVERSE_ORG_DESCRIPTION,
  NYC_VOLLEYVERSE_PROGRAMMING_URL,
  NYC_VOLLEYVERSE_RISING_STARS_URL,
  NYC_VOLLEYVERSE_SOURCE_EVIDENCE,
  NYC_VOLLEYVERSE_STATIC_PAGE_CLIENT,
  NYC_VOLLEYVERSE_TRYOUT_FAQ_URL,
} from '../src/server/affiliateImports/nycVolleyVerseSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_nyc_volleyverse';
const SOURCE_ID = 'affiliate_source_nyc_volleyverse';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-nyc-volleyverse-nycvolleyverse-com';
const MAPPING_ID = 'affiliate_mapping_nyc_volleyverse_v1';
const LOGO_FILE_ID = 'affiliate_file_nyc_volleyverse_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycVolleyVerseLogo.png');

const sourceMetadata = {
  sourceEvidence: NYC_VOLLEYVERSE_SOURCE_EVIDENCE,
  inspectedAt: NYC_VOLLEYVERSE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nycvolleyverse.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYC VolleyVerse homepage is ALLOWED. Programming, Rising Stars, classes, locations, tryout, registration, and team pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NYC_VOLLEYVERSE_HOME_URL],
  officialActionUrls: [NYC_VOLLEYVERSE_HOME_URL, NYC_VOLLEYVERSE_TRYOUT_FAQ_URL, NYC_VOLLEYVERSE_PROGRAMMING_URL, NYC_VOLLEYVERSE_RISING_STARS_URL, NYC_VOLLEYVERSE_CLASSES_BROOKLYN_URL, NYC_VOLLEYVERSE_CLASSES_STATEN_ISLAND_URL],
  officialLogoSourceUrl: NYC_VOLLEYVERSE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-nyc-volleyverse-nycvolleyverse-com/a7ad0949-2883-47a3-84df-cda6521bc74a/002-logo_candidate-d4cb5ac5-42dd-46cb-9c06-d02107da37ea.svg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYC VolleyVerse page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party NYC VolleyVerse horizontal logo was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'NYC VolleyVerse programs, classes, and camps', reason: 'The stored homepage links to program, class, and camp pages, but those detail pages are UNCHECKED and no complete current date, time, venue, price, or registration rows are captured.' },
    { title: 'NYC VolleyVerse tryouts', reason: 'The homepage says 2026-2027 tryouts are open, but the FAQ and borough registration pages are UNCHECKED and do not provide captured complete date/time/venue rows.' },
    { title: 'NYC VolleyVerse locations', reason: 'The locations page is UNCHECKED; only New York City plus Brooklyn and Staten Island program context is retained.' },
    { title: 'NYC VolleyVerse teams', reason: 'The homepage states 13 travel teams, but TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYC VolleyVerse logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'nyc-volleyverse-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-volleyverse-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-volleyverse-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'NYC VolleyVerse', location: 'New York, NY', address: null, description: NYC_VOLLEYVERSE_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NYC_VOLLEYVERSE_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NYC VolleyVerse', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NYC_VOLLEYVERSE_HOME_URL, listUrl: NYC_VOLLEYVERSE_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYC VolleyVerse club package with one ongoing CLUB profile; unchecked program, location, registration, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYC_VOLLEYVERSE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored NYC VolleyVerse evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYC_VOLLEYVERSE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored NYC VolleyVerse evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYC_VOLLEYVERSE_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-nyc-volleyverse-affiliate-source] failed', error); process.exitCode = 1; });
