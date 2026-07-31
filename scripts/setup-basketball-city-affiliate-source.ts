/** Operator-approved setup for the Basketball City stored-intake club and rental package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { BASKETBALL_CITY_DESCRIPTION, BASKETBALL_CITY_HOME_URL, BASKETBALL_CITY_LOGO_SOURCE_URL, BASKETBALL_CITY_MAPPING, BASKETBALL_CITY_SOURCE_EVIDENCE, BASKETBALL_CITY_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/basketballCitySource';

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
const ORG_ID = 'affiliate_org_basketball_city';
const SOURCE_ID = 'affiliate_source_basketball_city';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-youth-development-program-basketballcity-com';
const MAPPING_ID = 'affiliate_mapping_basketball_city_v1';
const LOGO_FILE_ID = 'affiliate_file_basketball_city_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/basketballCityLogo.png');

const sourceMetadata = {
  sourceEvidence: BASKETBALL_CITY_SOURCE_EVIDENCE,
  inspectedAt: BASKETBALL_CITY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://basketballcity.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Basketball City homepage and youth-development listing are ALLOWED. Court-rentals, youth-program detail, special-event, and registration pages remain outside the captured package.',
  reviewedUrls: [BASKETBALL_CITY_HOME_URL, 'https://basketballcity.com/youth-league/youth-development-program'],
  officialActionUrls: [BASKETBALL_CITY_HOME_URL, 'https://basketballcity.com/youth-league/youth-development-program', 'https://basketballcity.com/court-rentals/', 'https://basketballcity.com/special-events/'],
  officialLogoSourceUrl: BASKETBALL_CITY_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-youth-development-program-basketballcity-com/5a1e01d2-e2e9-4d14-8f42-fca712338ae4/001-logo_candidate-dc3b5b7b-ad85-4b3c-90a0-f3abc6d958d6.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Basketball City logo candidate 001',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party Basketball City logo was normalized locally to an opaque 1024px square PNG on a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Basketball City youth programs and special events', reason: 'The stored pages provide links and teasers but no complete current event rows; current detail and registration pages remain outside this captured package.' },
    { title: 'Basketball City court-rental details', reason: 'The allowed homepage supports an ongoing rental link-out with hours and facility features, but price, live availability, booking form, and exact address require the rental detail page.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Basketball City logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'basketball-city-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'basketball-city-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'basketball-city-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Basketball City', location: 'New York, NY', address: null, description: BASKETBALL_CITY_DESCRIPTION, logoId, ownerId: owner.id, website: BASKETBALL_CITY_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Basketball City', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: BASKETBALL_CITY_HOME_URL, listUrl: BASKETBALL_CITY_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Basketball City package with ongoing CLUB and RENTAL link-out candidates; incomplete event and detail rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: BASKETBALL_CITY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB/RENTAL mapping from stored Basketball City homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: BASKETBALL_CITY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB/RENTAL mapping from stored Basketball City homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: BASKETBALL_CITY_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-basketball-city-affiliate-source] failed', error); process.exitCode = 1; });
