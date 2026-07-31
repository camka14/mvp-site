/** Local-only setup for the QBK Sports stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  QBK_SPORTS_ABOUT_URL,
  QBK_SPORTS_ADULT_CLASSES_URL,
  QBK_SPORTS_COURT_BOOKING_URL,
  QBK_SPORTS_HOME_URL,
  QBK_SPORTS_LOGO_SOURCE_URL,
  QBK_SPORTS_MAPPING,
  QBK_SPORTS_ORG_DESCRIPTION,
  QBK_SPORTS_PARTY_URL,
  QBK_SPORTS_RENTAL_URL,
  QBK_SPORTS_SOURCE_EVIDENCE,
  QBK_SPORTS_STATIC_PAGE_CLIENT,
  QBK_SPORTS_YOUTH_CLASSES_URL,
} from '../src/server/affiliateImports/qbkSportsSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_qbk_sports';
const SOURCE_ID = 'affiliate_source_qbk_sports';
const SOURCE_KEY = 'qbk-sports-indoor-beach-volleyball';
const MAPPING_ID = 'affiliate_mapping_qbk_sports_v1';
const ORGANIZATION_NAME = 'QBK Sports';
const LOGO_FILE_ID = 'affiliate_file_qbk_sports_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/qbkSportsLogo.png');

const sourceMetadata = {
  sourceEvidence: QBK_SPORTS_SOURCE_EVIDENCE,
  inspectedAt: QBK_SPORTS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.qbksports.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the captured official detail and listing pages ALLOWED; pages marked UNCHECKED remain evidence-scoped and are not blindly fetched.',
  reviewedUrls: [
    QBK_SPORTS_HOME_URL,
    QBK_SPORTS_ABOUT_URL,
    QBK_SPORTS_ADULT_CLASSES_URL,
    QBK_SPORTS_YOUTH_CLASSES_URL,
    QBK_SPORTS_PARTY_URL,
    QBK_SPORTS_RENTAL_URL,
  ],
  officialActionUrls: [
    QBK_SPORTS_HOME_URL,
    QBK_SPORTS_COURT_BOOKING_URL,
    QBK_SPORTS_ADULT_CLASSES_URL,
    QBK_SPORTS_YOUTH_CLASSES_URL,
    QBK_SPORTS_PARTY_URL,
  ],
  officialLogoSourceUrl: QBK_SPORTS_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official QBK Sports JSON-LD organization logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party QBK Sports logo was flattened onto white and normalized to an opaque 1024px square without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Adult classes and free trials', sourceUrl: QBK_SPORTS_ADULT_CLASSES_URL, reason: 'The stored page supplies recurring weekday schedules and booking links but no complete current date rows.' },
    { title: 'Youth Cubs and Seals programs', sourceUrl: QBK_SPORTS_YOUTH_CLASSES_URL, reason: 'The stored page supplies monthly programs and prices but no complete current date/time/action rows.' },
    { title: 'Adult and youth tournaments, leagues, and drop-ins', reason: 'The stored capture does not provide complete current date, time, venue, and price rows for safe EVENT creation.' },
    { title: 'QBK Beach Lions tryouts', sourceUrl: QBK_SPORTS_YOUTH_CLASSES_URL, reason: 'The captured material is team-oriented and TEAM mappings are out of scope.' },
    { title: 'Party add-on court time price', sourceUrl: QBK_SPORTS_PARTY_URL, reason: 'The stored $300/hour value is an adult-party add-on, not a general court-rental price.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('QBK Sports logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'qbk-sports-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'qbk-sports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'qbk-sports-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = {
      updatedAt: new Date(),
      name: ORGANIZATION_NAME,
      location: 'Queens, NY',
      address: '41-20 39th St, Queens, NY 11104',
      description: QBK_SPORTS_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: QBK_SPORTS_HOME_URL,
      sports: ['Beach Volleyball'],
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: QBK_SPORTS_HOME_URL,
      listUrl: QBK_SPORTS_HOME_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes: 'Stored-intake QBK Sports club and court-rental package; dated program rows and team-oriented tryouts are withheld, automation remains disabled, and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: QBK_SPORTS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB/RENTAL manual mapping from stored QBK Sports evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: QBK_SPORTS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB/RENTAL manual mapping from stored QBK Sports evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: QBK_SPORTS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-qbk-sports-affiliate-source] failed', error); process.exitCode = 1; });
