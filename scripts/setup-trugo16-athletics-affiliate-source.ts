/** Local-only setup for the Trugo16 Athletics stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { TRUGO16_ATHLETICS_HOME_URL, TRUGO16_ATHLETICS_LOGO_SOURCE_URL, TRUGO16_ATHLETICS_MAPPING, TRUGO16_ATHLETICS_ORG_DESCRIPTION, TRUGO16_ATHLETICS_SOURCE_EVIDENCE, TRUGO16_ATHLETICS_STATIC_PAGE_CLIENT, TRUGO16_ATHLETICS_TRYOUT_URL } from '../src/server/affiliateImports/trugo16AthleticsSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_trugo16_athletics';
const SOURCE_ID = 'affiliate_source_trugo16_athletics';
const SOURCE_KEY = 'trugo16-athletics-baseball';
const MAPPING_ID = 'affiliate_mapping_trugo16_athletics_v1';
const LOGO_FILE_ID = 'affiliate_file_trugo16_athletics_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/trugo16AthleticsLogo.png');

const sourceMetadata = {
  sourceEvidence: TRUGO16_ATHLETICS_SOURCE_EVIDENCE,
  inspectedAt: TRUGO16_ATHLETICS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://trugo16athletics.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored ZT New York tryout page is ALLOWED; linked Trugo16 detail and registration pages marked UNCHECKED remain evidence-scoped.',
  reviewedUrls: [TRUGO16_ATHLETICS_TRYOUT_URL],
  officialActionUrls: [TRUGO16_ATHLETICS_TRYOUT_URL],
  officialLogoSourceUrl: TRUGO16_ATHLETICS_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Trugo16 Athletics page-branding wordmark',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party Trugo16 Athletics wordmark was normalized to an opaque 1024px square PNG with a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'ZT New York tryout teams', reason: 'Team logos and roster/tryout participation are TEAM-oriented and out of scope.' },
    { title: 'Trugo16 lessons, programs, and cage rentals', reason: 'The stored page gives membership benefits but no complete current date, venue, price, and booking rows.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Trugo16 Athletics logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'trugo16-athletics-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'trugo16-athletics-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'trugo16-athletics-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Trugo16 Athletics', location: null, address: null, description: TRUGO16_ATHLETICS_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: TRUGO16_ATHLETICS_HOME_URL, sports: ['Baseball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Trugo16 Athletics Baseball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: TRUGO16_ATHLETICS_HOME_URL, listUrl: TRUGO16_ATHLETICS_TRYOUT_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake club package; team-only tryout material and incomplete lesson/program/rental rows are withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: TRUGO16_ATHLETICS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Trugo16 Athletics evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: TRUGO16_ATHLETICS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Trugo16 Athletics evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: TRUGO16_ATHLETICS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-trugo16-athletics-affiliate-source] failed', error); process.exitCode = 1; });
