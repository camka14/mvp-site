/** Operator-approved setup for the Five-Star Basketball Camp stored-intake EVENT package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FIVE_STAR_BASKETBALL_CAMP_AOG_URL,
  FIVE_STAR_BASKETBALL_CAMP_HOME_URL,
  FIVE_STAR_BASKETBALL_CAMP_LOGO_SOURCE_URL,
  FIVE_STAR_BASKETBALL_CAMP_MAPPING,
  FIVE_STAR_BASKETBALL_CAMP_NBPA_URL,
  FIVE_STAR_BASKETBALL_CAMP_ORG_DESCRIPTION,
  FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE,
  FIVE_STAR_BASKETBALL_CAMP_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/fiveStarBasketballCampSource';

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
const ORG_ID = 'affiliate_org_five_star_basketball_camp';
const SOURCE_ID = 'affiliate_source_five_star_basketball_camp';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-five-star-basketball-camp-fivestarbasketball-com';
const MAPPING_ID = 'affiliate_mapping_five_star_basketball_camp_v1';
const LOGO_FILE_ID = 'affiliate_file_five_star_basketball_camp_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveStarBasketballCampLogo.png');

const sourceMetadata = {
  sourceEvidence: FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE,
  inspectedAt: FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.fivestarbasketball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Five-Star Basketball homepage is ALLOWED. The linked article and camp-story pages are UNCHECKED and remain withheld.',
  reviewedUrls: [FIVE_STAR_BASKETBALL_CAMP_HOME_URL],
  officialActionUrls: [FIVE_STAR_BASKETBALL_CAMP_HOME_URL, FIVE_STAR_BASKETBALL_CAMP_NBPA_URL, FIVE_STAR_BASKETBALL_CAMP_AOG_URL, 'https://nbpa.leagueapps.com/camps/4163775-nbpa-x-five-star-basketball-camp---nyc-2024?mc_cid=ab099de971&mc_eid=7659b2b628'],
  officialLogoSourceUrl: FIVE_STAR_BASKETBALL_CAMP_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-five-star-basketball-camp-fivestarbasketball-com/b3784110-38ee-4089-b543-992e23ad2ab7/002-logo_candidate-4e8995bc-3007-4ad5-8948-50d9e1a77648.svg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Five-Star Basketball logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Five-Star Basketball SVG was rendered and centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'July 22-25 camp block', reason: 'The allowed homepage includes this date text without a clear year and pairs one visible signup with an older 2024 URL; no date is inferred.' },
    { title: 'Five-Star linked article and camp-story pages', reason: 'The stored pages are UNCHECKED.' },
    { title: 'Five-Star teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Five-Star Basketball Camp logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'five-star-basketball-camp-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-star-basketball-camp-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-star-basketball-camp-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Five-Star Basketball Camp', location: 'New York City, NY', address: null, description: FIVE_STAR_BASKETBALL_CAMP_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: FIVE_STAR_BASKETBALL_CAMP_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Five-Star Basketball Camp Events', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL, listUrl: FIVE_STAR_BASKETBALL_CAMP_HOME_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Five-Star Basketball Camp EVENT package with one ongoing organization profile and two future 2026 event rows. The date-only events use local-midnight boundaries without inferred times; the older July block and unchecked pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: FIVE_STAR_BASKETBALL_CAMP_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from the stored allowed Five-Star Basketball homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: FIVE_STAR_BASKETBALL_CAMP_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from the stored allowed Five-Star Basketball homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: FIVE_STAR_BASKETBALL_CAMP_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-five-star-basketball-camp-affiliate-source] failed', error); process.exitCode = 1; });
