/** Local-only setup for the Fort Greene Tennis Association stored-intake EVENT package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FORT_GREENE_TENNIS_EVENTS_URL,
  FORT_GREENE_TENNIS_HOME_URL,
  FORT_GREENE_TENNIS_LOGO_SOURCE_URL,
  FORT_GREENE_TENNIS_MAPPING,
  FORT_GREENE_TENNIS_ORG_DESCRIPTION,
  FORT_GREENE_TENNIS_SOURCE_EVIDENCE,
  FORT_GREENE_TENNIS_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/fortGreeneTennisSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_fort_greene_tennis_association';
const SOURCE_ID = 'affiliate_source_fort_greene_tennis_association';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-events-fortgreenetennis-org';
const MAPPING_ID = 'affiliate_mapping_fort_greene_tennis_association_v1';
const LOGO_FILE_ID = 'affiliate_file_fort_greene_tennis_association_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fortGreeneTennisLogo.png');

const sourceMetadata = {
  sourceEvidence: FORT_GREENE_TENNIS_SOURCE_EVIDENCE,
  inspectedAt: FORT_GREENE_TENNIS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.fortgreenetennis.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Fort Greene Tennis Association events listing is ALLOWED. Current and future event detail pages and the Singles registration page are UNCHECKED and remain withheld from extraction.',
  reviewedUrls: [FORT_GREENE_TENNIS_EVENTS_URL],
  officialActionUrls: [
    'https://www.fortgreenetennis.org/events/2025/singles-tournament-hga8c',
    'https://www.fortgreenetennis.org/events/2025/doubles-tournament-5ndw2',
    'https://www.fortgreenetennis.org/events/2025/ladder-tournament-3l99w',
    'https://www.fortgreenetennis.org/payments/singles-tournament-2026-ypfyk',
  ],
  officialLogoSourceUrl: FORT_GREENE_TENNIS_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-events-fortgreenetennis-org/23be8f6e-13a9-4b72-8152-86dca3cf168f/002-logo_candidate-66a52ae4-3727-41f0-858e-b90a3abd5e0c.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Fort Greene Tennis Association page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party FGTA mark was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Past Fort Greene Tennis Association events', reason: 'Women\'s Day, Dingles, Kickoff, and older rows were past as of 2026-07-31 and are not emitted.' },
    { title: 'Fort Greene Tennis Association event details', reason: 'The current and future detail URLs are UNCHECKED; only complete rows from the allowed events listing are emitted.' },
    { title: 'Singles Tournament 2026 registration', reason: 'The official registration URL is retained as an outbound action URL, but the registration page is UNCHECKED and no deadline or price is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Fort Greene Tennis Association logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'fort-greene-tennis-association-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'fort-greene-tennis-association-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'fort-greene-tennis-association-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Fort Greene Tennis Association', location: 'Brooklyn, NY', address: '136 Dekalb Ave NY, 11217 United States', description: FORT_GREENE_TENNIS_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: FORT_GREENE_TENNIS_HOME_URL, sports: ['Tennis'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Fort Greene Tennis Association Events', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: FORT_GREENE_TENNIS_HOME_URL, listUrl: FORT_GREENE_TENNIS_EVENTS_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Fort Greene Tennis Association EVENT package with three complete current or future tournament rows; past rows and unchecked detail/registration pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: FORT_GREENE_TENNIS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from the stored allowed Fort Greene Tennis Association events listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: FORT_GREENE_TENNIS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from the stored allowed Fort Greene Tennis Association events listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: FORT_GREENE_TENNIS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, endsAt: candidate.endsAt, timeZone: candidate.timeZone })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-fort-greene-tennis-affiliate-source] failed', error); process.exitCode = 1; });
