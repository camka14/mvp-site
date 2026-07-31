/** Operator-approved setup for the DiscNY stored-intake all-events package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { DISCNY_EVENTS_URL, DISCNY_HOME_URL, DISCNY_LOGO_CANDIDATE_ARTIFACT, DISCNY_MANHATTAN_BEGINNER_URL, DISCNY_MAPPING, DISCNY_ORG_DESCRIPTION, DISCNY_SOURCE_EVIDENCE, DISCNY_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/discnyAllEventsSource';

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
const ORG_ID = 'affiliate_org_new_york_new_york_metropolitan_area_all_events_discny_org_discny';
const SOURCE_ID = 'affiliate_source_discny_all_events';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-all-events-discny-org';
const MAPPING_ID = 'affiliate_mapping_discny_all_events_v1';
const LOGO_FILE_ID = 'affiliate_file_discny_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/discnyLogo.png');

const sourceMetadata = {
  sourceEvidence: DISCNY_SOURCE_EVIDENCE,
  inspectedAt: DISCNY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://discny.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored DiscNY All Events listing and Manhattan Beginner detail page are ALLOWED. Other detail, registration, and external Li Ultimate pages were UNCHECKED and are not fetched by this package.',
  reviewedUrls: [DISCNY_EVENTS_URL, 'https://discny.org/e/manhattan-beginner-ultimate-frisbee-pickup-gansevoort'],
  officialActionUrls: [
    DISCNY_EVENTS_URL,
    'https://discny.org/e/2026-rockland-ultimate-sunday-pickup',
    'https://discny.org/e/2026-nyc-club-season-player-registration',
    'https://discny.org/e/east-fishkill-summer-league-2026',
    'https://liultimate.com/e/summer-beach-league-2026-jones-beach',
    'https://liultimate.com/e/adult-mixed-summer-league-2026',
    'https://discny.org/e/mccarren-mondays-summer-2026',
    'https://discny.org/e/astoria-park-ultimate-summer-2026',
    'https://discny.org/e/brooklyn-summer-casual-mixed-league-2026',
    'https://discny.org/e/survival-summer-league-2026-for-she-they-we',
    DISCNY_EVENTS_URL,
    DISCNY_MANHATTAN_BEGINNER_URL,
    'https://discny.org/e/masters-ultimate-summer-2026',
    'https://discny.org/e/hmdultimate-saturday-lgbtq-pickup-summer-2026',
  ],
  officialLogoSourceUrl: null,
  officialLogoCandidateArtifact: DISCNY_LOGO_CANDIDATE_ARTIFACT,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party DiscNY LOGO_CANDIDATE artifact 003',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party DiscNY circular mark was normalized locally to an opaque 1024px square PNG.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Two additional DiscNY events', reason: 'The captured listing reports 14 events but only 12 rows are visible in the stored first page; page 2 was discovered but not captured, so its rows are not inferred.' },
    { title: 'Unchecked DiscNY and Li Ultimate detail pages', reason: 'The stored intake marks these pages UNCHECKED; their dates, venues, prices, and registration details are not used.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('DiscNY logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'discny-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'discny-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'discny-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'DiscNY', location: 'New York, NY', address: null, description: DISCNY_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: DISCNY_HOME_URL, sports: ['Ultimate Frisbee'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'DiscNY All Events', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: DISCNY_HOME_URL, listUrl: DISCNY_EVENTS_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake DiscNY package with one CLUB profile and twelve visible current/future EVENT rows; two uncaptured page-2 rows and unchecked details remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: DISCNY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from stored DiscNY evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: DISCNY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from stored DiscNY evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: DISCNY_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-discny-all-events-affiliate-source] failed', error); process.exitCode = 1; });
