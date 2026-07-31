/** Local-only setup for the Next Level Sports Center stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEXT_LEVEL_COURT_RENTALS_URL,
  NEXT_LEVEL_HOME_URL,
  NEXT_LEVEL_LOGO_SOURCE_URL,
  NEXT_LEVEL_MAPPING,
  NEXT_LEVEL_OFFICIAL_URLS,
  NEXT_LEVEL_ORG_DESCRIPTION,
  NEXT_LEVEL_SOURCE_EVIDENCE,
  NEXT_LEVEL_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/nextLevelSportsCenterSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_next_level_sports_center';
const SOURCE_ID = 'affiliate_source_next_level_sports_center';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-indoor-basketball-court-huntington-long-island-new-york-nextleve';
const MAPPING_ID = 'affiliate_mapping_next_level_sports_center_v1';
const LOGO_FILE_ID = 'affiliate_file_next_level_sports_center_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nextLevelSportsCenterLogo.png');

const sourceMetadata = {
  sourceEvidence: NEXT_LEVEL_SOURCE_EVIDENCE,
  inspectedAt: NEXT_LEVEL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://nextlevelsportscenter.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Next Level homepage is ALLOWED. Court rentals, clinics, birthday events, contact, and other detail pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [NEXT_LEVEL_HOME_URL],
  officialActionUrls: NEXT_LEVEL_OFFICIAL_URLS,
  officialLogoSourceUrl: NEXT_LEVEL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-indoor-basketball-court-huntington-long-island-new-york-nextleve/378d3b66-da72-4f5c-b5a7-c06c4618db41/002-logo_candidate-a2a163e2-f260-460d-8ce9-cda236e8d4b4.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Next Level Sports Center logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Next Level Sports Center logo was normalized locally to an opaque 1024px square PNG on white.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Current court rental availability and prices', reason: 'The court-rentals page is UNCHECKED; no current availability, price, or reservation date is inferred.' },
    { title: 'Clinics, birthday events, and additional programs', reason: 'Those official listing and detail pages are UNCHECKED.' },
  ],
  officialOutboundNotes: {
    home: NEXT_LEVEL_HOME_URL,
    courtRentals: NEXT_LEVEL_COURT_RENTALS_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Next Level Sports Center logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'next-level-sports-center-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'next-level-sports-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'next-level-sports-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
      name: 'Next Level Sports Center',
      location: 'Huntington, NY',
      address: '156 Railroad Street, Huntington NY',
      description: NEXT_LEVEL_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: NEXT_LEVEL_HOME_URL,
      sports: ['Basketball'],
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({
      where: { id: ORG_ID },
      create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization },
      update: organization,
    });

    const source = {
      name: 'Next Level Sports Center Indoor Basketball Court Rentals',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: NEXT_LEVEL_HOME_URL,
      listUrl: NEXT_LEVEL_COURT_RENTALS_URL,
      targetKind: 'RENTAL',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake Next Level Sports Center CLUB and RENTAL package; current availability and unchecked clinic/event inventory remain withheld.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEXT_LEVEL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping with a Next Level Sports Center facility CLUB profile from the stored homepage.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NEXT_LEVEL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping with a Next Level Sports Center facility CLUB profile from the stored homepage.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEXT_LEVEL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({
        runId: result.run.id,
        candidateCount: result.candidates.length,
        normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })),
        createdCandidateCount: logs?.createdCandidateCount ?? null,
        updatedCandidateCount: logs?.updatedCandidateCount ?? null,
        rejectedCount: logs?.rejectedCount ?? null,
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-next-level-sports-center-affiliate-source] failed', error); process.exitCode = 1; });
