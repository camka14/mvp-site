/** Operator-approved setup for the Eastern New York ODP stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ENY_ODP_HOME_URL,
  ENY_ODP_LOGO_SOURCE_URL,
  ENY_ODP_MAPPING,
  ENY_ODP_OFFICIAL_URLS,
  ENY_ODP_ORG_DESCRIPTION,
  ENY_ODP_REGISTRATION_URL,
  ENY_ODP_SOURCE_EVIDENCE,
  ENY_ODP_STATIC_PAGE_CLIENT,
  ENY_ODP_TRYOUTS_URL,
} from '../src/server/affiliateImports/easternNewYorkYouthSoccerSource';

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
const ORG_ID = 'affiliate_org_eastern_new_york_youth_soccer_odp';
const SOURCE_ID = 'affiliate_source_eastern_new_york_youth_soccer_odp';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-tryouts-enysoccer-com';
const MAPPING_ID = 'affiliate_mapping_eastern_new_york_youth_soccer_odp_v1';
const LOGO_FILE_ID = 'affiliate_file_eastern_new_york_youth_soccer_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/easternNewYorkYouthSoccerLogo.png');

const sourceMetadata = {
  sourceEvidence: ENY_ODP_SOURCE_EVIDENCE,
  inspectedAt: ENY_ODP_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.enysoccer.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored ENY ODP tryouts page is ALLOWED. Tryout results, future-round, and linked program pages are UNCHECKED and remain withheld.',
  reviewedUrls: [ENY_ODP_TRYOUTS_URL],
  officialActionUrls: ENY_ODP_OFFICIAL_URLS,
  officialLogoSourceUrl: ENY_ODP_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-tryouts-enysoccer-com/e70f566f-9d10-43ed-9dba-4e4001a56ed3/002-logo_candidate-cda7b9f5-0299-4b7b-b4a2-908f9f88d387.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Eastern New York Youth Soccer logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Eastern New York Youth Soccer logo was normalized locally to an opaque 1024px square PNG on white.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'South Round 2 Long Island tryout', reason: 'The stored July 18 row says a rescheduled date is coming soon; no replacement date is invented.' },
    { title: 'Clifton Commons North Round One', reason: 'The stored July 22 row was already finished at the 2026-07-31 review date.' },
    { title: '2012, 2011, and 2010 age groups', reason: 'The stored page says dates and times will be announced soon; no rows are invented.' },
    { title: 'Tryout results and later ODP rounds', reason: 'The linked results and future-round pages are UNCHECKED.' },
  ],
  officialOutboundNotes: {
    home: ENY_ODP_HOME_URL,
    tryouts: ENY_ODP_TRYOUTS_URL,
    registration: ENY_ODP_REGISTRATION_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Eastern New York Youth Soccer logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'eastern-new-york-youth-soccer-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'eastern-new-york-youth-soccer-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'eastern-new-york-youth-soccer-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Eastern New York Youth Soccer Association ODP', location: 'Eastern New York', address: null, description: ENY_ODP_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ENY_ODP_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Eastern New York ODP Tryouts', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ENY_ODP_HOME_URL, listUrl: ENY_ODP_TRYOUTS_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake ENY ODP CLUB and future EVENT package; past, rescheduled, announced-later, and unchecked rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ENY_ODP_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping with an ODP CLUB profile from the stored ENY tryouts page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ENY_ODP_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping with an ODP CLUB profile from the stored ENY tryouts page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ENY_ODP_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-eastern-new-york-youth-soccer-affiliate-source] failed', error); process.exitCode = 1; });
